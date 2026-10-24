import {useContext,useEffect,useRef,useState} from 'react';
import {PreferencesContext,useDateFormatter} from './preferences';
import {JOB_LABELS,localScheduleToUtc,queueRecoveryHelp,utcToScheduleLocal,type QueueAction,type QueueJob,type QueueReply} from '../../../../packages/shared/src/queue';
type Success=Extract<QueueReply,{ok:true}>;
export function Schedule({request,accountId}:{accountId?:string;request:(action:QueueAction)=>Promise<QueueReply>}){
 const [jobs,setJobs]=useState<QueueJob[]>([]),[summary,setSummary]=useState({needsReview:0,uncertain:0});
 const [notice,setNotice]=useState(''),[working,setWorking]=useState(false),[reviewOnly,setReviewOnly]=useState(false);
 const [detail,setDetail]=useState<Success['detail']>(),[selected,setSelected]=useState<QueueJob>(),[when,setWhen]=useState('');
 const epoch=useRef(0),sequence=useRef(0),locked=useRef(false),settings=useContext(PreferencesContext),date=useDateFormatter();
 const attention=(job:QueueJob)=>job.state==='needs_review'||job.state==='uncertain';
 function apply(reply:Success){if(reply.jobs)setJobs(reviewOnly?reply.jobs.filter(attention):reply.jobs);if(reply.summary)setSummary(reply.summary);if(reply.detail)setDetail(reply.detail);}
 async function act(action:QueueAction){
  if(locked.current)return;const owner=epoch.current,version=++sequence.current;locked.current=true;setWorking(true);
  try{const reply=await request(action);if(owner!==epoch.current||version!==sequence.current)return;if(!reply.ok){setNotice(reply.error);return;}apply(reply);if(action.type!=='list'&&action.type!=='detail'){setNotice('Đã cập nhật lịch.');setSelected(undefined);setDetail(undefined);}}
  catch{if(owner===epoch.current)setNotice('Không đọc/cập nhật được lịch.');}
  finally{if(owner===epoch.current){locked.current=false;setWorking(false);}}
 }
 useEffect(()=>{
  const owner=++epoch.current;locked.current=false;setWorking(false);setJobs([]);setSummary({needsReview:0,uncertain:0});setDetail(undefined);setSelected(undefined);setNotice('');
  const refresh=async()=>{if(locked.current)return;const version=sequence.current;try{const reply=await request({type:'list',reviewOnly});if(owner===epoch.current&&version===sequence.current&&reply.ok)apply(reply);}catch{/* manual refresh gives an actionable error */}};
  void refresh();const timer=setInterval(()=>void refresh(),3000);return ()=>{epoch.current++;clearInterval(timer);};
 },[request,accountId,reviewOnly]);
 return <><section><h2>Lịch gửi văn bản một lần</h2>
  <p>Lịch chạy khi app mở, có mạng và đúng tài khoản đã kết nối. Nếu kết nối bị dừng trong lúc thực thi lịch, hãy Khôi phục phiên trong Tài khoản trước khi tiếp tục.</p>
  <p>Lịch lỡ giờ cần kiểm tra, không tự gửi bù. “Chưa rõ kết quả” không tự gửi lại; kiểm tra hội thoại Telegram trước khi tạo lịch khác. Chưa có lịch marketing, tệp hoặc reply.</p>
  <div data-testid="queue-recovery-summary" role="status"><strong>Cần kiểm tra: {summary.needsReview} lịch quá hạn/gián đoạn · {summary.uncertain} lịch chưa rõ kết quả.</strong><p>Các số đếm thuộc tài khoản đang xem, bao gồm bản ghi ngoài 200 dòng hiện tại.</p></div>
  <div className="actions"><button data-testid="queue-review-filter" className={reviewOnly?'':'secondary'} disabled={working} aria-pressed={reviewOnly} onClick={()=>setReviewOnly(value=>!value)}>{reviewOnly?'Hiện tất cả lịch':'Chỉ hiện lịch cần kiểm tra'}</button><button data-testid="queue-refresh" disabled={working} onClick={()=>void act({type:'list',reviewOnly})}>Làm mới lịch</button></div>
  {notice&&<p role="status">{notice}</p>}
  <div className="table-wrap"><table><thead><tr><th>Người nhận</th><th>Giờ hẹn · {settings.timeZone}</th><th>Trạng thái</th><th>Kết quả / phục hồi</th><th>Thao tác</th></tr></thead><tbody>{jobs.filter(job=>!accountId||job.accountId===accountId).map(job=><tr key={job.id} data-job-state={job.state} data-job-id={job.id}>
   <td>{job.recipient.name}<br/>ID {job.recipient.id}</td><td>{date(job.dueAt)}<br/><small>Múi giờ khi tạo: {job.zone}</small></td>
   <td>{JOB_LABELS[job.state]}<br/><small>Lần thử: {job.attempts}/3{job.nextAttemptAt?' · Mốc thử lại: '+date(job.nextAttemptAt):''}</small></td>
   <td>{job.remoteId?'Tin #'+job.remoteId:job.errorCode??'—'}{attention(job)&&<p data-testid="queue-recovery-help">{queueRecoveryHelp(job)}</p>}</td>
   <td><button className="secondary" disabled={working} onClick={()=>void act({type:'detail',id:job.id})}>Xem nội dung</button>
    {['pending','retry_wait'].includes(job.state)&&<button disabled={working} onClick={()=>void act({type:'pause',id:job.id})}>Tạm dừng</button>}
    {job.state==='paused'&&<button disabled={working} onClick={()=>void act({type:'resume',id:job.id})}>Tiếp tục</button>}
    {['pending','retry_wait','paused','needs_review'].includes(job.state)&&job.attempts<3&&<>
     {job.attempts===0&&<button className="secondary" disabled={working} onClick={()=>{setSelected(job);setWhen(utcToScheduleLocal(Date.now()+300000,settings.timeZone));}}>Chọn giờ mới</button>}
     <button className="secondary" disabled={working} onClick={()=>{if(confirm('Hủy các lần thử tiếp theo của lịch này?'))void act({type:'cancel',id:job.id});}}>Hủy lịch</button>
    </>}
   </td></tr>)}</tbody></table></div>
  {!jobs.length&&<p>{reviewOnly?'Không có lịch cần kiểm tra trong tài khoản đang xem.':'Chưa có lịch trong tài khoản nghiên cứu/kết nối gần nhất trên máy.'}</p>}
  <p className="hint">Tối đa 200 dòng, ưu tiên lịch cần kiểm tra; tối đa 100 lịch chưa hoàn tất/tài khoản. Tối đa 3 lần thử. Chỉ lỗi mạng trước khi gửi hoặc Telegram yêu cầu chờ mới được tự thử lại. Tạm dừng/Hủy để dừng các lần thử tiếp theo.</p>
 </section>
 {selected&&<section><h3>Chọn lại giờ cho {selected.recipient.name}</h3><label>Thời gian theo {settings.timeZone}<input data-testid="queue-reschedule-time" type="datetime-local" value={when} onChange={e=>setWhen(e.target.value)}/></label><button data-testid="queue-reschedule-confirm" disabled={working} onClick={()=>{try{const dueAt=localScheduleToUtc(when,settings.timeZone);if(confirm('Xác nhận lịch mới: '+date(dueAt)+' ('+settings.timeZone+')?'))void act({type:'reschedule',id:selected.id,dueAt,zone:settings.timeZone});}catch{setNotice('Giờ không hợp lệ, quá gần hoặc trùng/không tồn tại do đổi giờ mùa hè.');}}}>Xác nhận giờ mới</button></section>}
 {detail&&(!accountId||detail.job.accountId===accountId)&&<section><h3>Nội dung lịch · {detail.job.recipient.name}</h3>
  {attention(detail.job)&&<p>{queueRecoveryHelp(detail.job)}</p>}
  <pre className="template-preview">{detail.text}</pre><p>ID lịch: {detail.job.id}</p>
  <ul>{detail.events.map((event,i)=><li key={i}>{date(event.at)} · {JOB_LABELS[event.state]}{event.code?' · '+event.code:''}</li>)}</ul><button className="secondary" onClick={()=>setDetail(undefined)}>Đóng nội dung</button>
 </section>}</>;
}
