import {Composer} from './Composer';
import {useEffect,useRef,useState} from 'react';
import {EMPTY_INBOX,INBOX_CACHE_LIMIT,applyInboxUpdate,filterInboxDialogs,mergeInboxMessages,type InboxView,type InboxUpdate,type InboxDialog,type InboxAction,type InboxReply} from '../../../../packages/shared/src/inbox';
import type {Status} from '../../../../packages/shared/src/protocol';
import {useDateFormatter} from './preferences';
export function Inbox({status,busy,request,subscribe}:{status:Status;busy:boolean;request:(action:InboxAction)=>Promise<InboxReply>;subscribe:(callback:(update:InboxUpdate)=>void)=>()=>void}){
 const [view,setView]=useState<InboxView>(EMPTY_INBOX),[loading,setLoading]=useState(false),[notice,setNotice]=useState(''),[query,setQuery]=useState('');
 const model=useRef(view),epoch=useRef(0),locked=useRef(false),buffer=useRef<InboxUpdate[]>([]),lastOnline=useRef(true),autoAfter=useRef(0),wish=useRef<{account?:string;loaded:boolean;selectedKey?:string}>({loaded:false}),context=useRef({connected:status.userConnected,busy,online:status.inboxOnline});const date=useDateFormatter();
 context.current={connected:status.userConnected,busy,online:status.inboxOnline};
 function change(update:(previous:InboxView)=>InboxView){model.current=update(model.current);setView(model.current);}
 useEffect(()=>{
  epoch.current++;locked.current=false;buffer.current=[];autoAfter.current=0;lastOnline.current=true;change(()=>EMPTY_INBOX);setLoading(false);setNotice('');setQuery('');
  if(status.userConnected&&status.userIdentity){
   if(wish.current.account===status.userIdentity.id&&wish.current.loaded)change(state=>({...state,needsRefresh:true}));
   else wish.current={account:status.userIdentity.id,loaded:false};
  }
 },[status.userConnected,status.userIdentity?.id]);
 useEffect(()=>subscribe(update=>{
  if(!context.current.connected)return;
  if(update.type==='connection'){
   const recovered=!lastOnline.current&&update.connected;lastOnline.current=update.connected;
   if(!update.connected)setNotice('Kết nối gián đoạn. Cập nhật mới đang tạm dừng; nếu chưa kết nối lại, hãy Khôi phục phiên đã lưu.');
   else if(recovered&&model.current.loaded)change(state=>({...state,needsRefresh:true}));return;
  }
  if(locked.current){if(buffer.current.length>=INBOX_CACHE_LIMIT)buffer.current=[{type:'resync'}];else buffer.current.push(update);}
  if(model.current.loaded)change(state=>applyInboxUpdate(state,update));
 }),[subscribe]);
 function failed(reply:Extract<InboxReply,{ok:false}>){if(reply.error.retryAfter)autoAfter.current=Date.now()+reply.error.retryAfter*1000;setNotice(reply.error.message+(reply.error.retryAfter?` Chờ ít nhất ${reply.error.retryAfter} giây.`:''));}
 async function loadDialogs(more=false,reopenKey?:string):Promise<InboxDialog|undefined>{
  if(locked.current||!context.current.connected)return;locked.current=true;buffer.current=[];setLoading(true);setNotice('');const current=epoch.current;
  try{const reply=await request({type:'dialogs',cursor:more?model.current.cursor:undefined});if(current!==epoch.current)return;
   if(!reply.ok){failed(reply);return;}if(reply.type!=='dialogs')throw Error('Unexpected reply');
   const dialogs=[...new Map([...(more?model.current.dialogs:[]),...reply.dialogs].map(row=>[row.key,row])).values()].slice(0,INBOX_CACHE_LIMIT);
   let next:InboxView=more?{...model.current,dialogs,cursor:reply.next}:{...EMPTY_INBOX,dialogs,cursor:reply.next,loaded:true};
   for(const update of buffer.current)next=applyInboxUpdate(next,update);change(()=>next);
   wish.current={...wish.current,loaded:true,selectedKey:more?model.current.selectedKey:reopenKey};
   return reopenKey?dialogs.find(row=>row.key===reopenKey):undefined;
  }catch{if(current===epoch.current)setNotice('Không tải được hội thoại. Hãy thử lại khi kết nối sẵn sàng.');}finally{if(current===epoch.current){buffer.current=[];locked.current=false;setLoading(false);}}
 }
 async function loadMessages(row:InboxDialog,older=false){
  if(locked.current||!context.current.connected)return;locked.current=true;buffer.current=[];setLoading(true);setNotice('');const current=epoch.current;
  wish.current.selectedKey=row.key;
  if(model.current.selectedKey!==row.key)change(state=>({...state,selectedKey:row.key,messages:[],before:undefined,messagesLoaded:false}));
  try{const reply=await request({type:'messages',key:row.key,before:older?model.current.before:undefined});if(current!==epoch.current)return;
   if(!reply.ok){failed(reply);return;}if(reply.type!=='messages'||reply.key!==row.key)throw Error('Unexpected reply');
   let next:InboxView={...model.current,messages:mergeInboxMessages(older?model.current.messages:[],reply.messages),before:reply.next,messagesLoaded:true};
   for(const update of buffer.current)next=applyInboxUpdate(next,update);change(()=>next);
  }catch{if(current===epoch.current)setNotice('Không tải được lịch sử. Hãy thử tải lại hội thoại.');}finally{if(current===epoch.current){buffer.current=[];locked.current=false;setLoading(false);}}
 }
 async function refresh(key?:string){const current=epoch.current;const row=await loadDialogs(false,key);if(row&&current===epoch.current)await loadMessages(row);}
 useEffect(()=>{
  if(!view.needsRefresh||!status.userConnected||status.inboxOnline===false||busy||loading||locked.current||Date.now()<autoAfter.current)return;
  autoAfter.current=Date.now()+10000;change(state=>({...state,needsRefresh:false}));void refresh(model.current.selectedKey??wish.current.selectedKey);
 },[view.needsRefresh,status.userConnected,status.inboxOnline,busy,loading]);
 const disabled=busy||loading||!status.userConnected||status.inboxOnline===false;
 const filtered=filterInboxDialogs(view.dialogs,query),selected=view.dialogs.find(row=>row.key===view.selectedKey);
 return <><section><h2>Hộp thư</h2><p>Đọc hội thoại của tài khoản đang kết nối. Tải 30 mục mỗi lần bấm; giữ tối đa 300 hội thoại và 300 mục lịch sử của hội thoại đang mở trong bộ nhớ.</p><p>Nội dung tệp chỉ hiện nhãn, chưa tải tệp. Không đánh dấu đã đọc. Gửi tin thủ công ở biểu mẫu bên dưới. Số chưa đọc là ảnh chụp lúc tải danh sách.</p><p data-testid="inbox-live">{status.userConnected?(status.inboxOnline===false?'Cập nhật trực tiếp: tạm dừng do mất kết nối.':'Cập nhật trực tiếp: bật cho hội thoại đã tải.'):'Cập nhật trực tiếp: chờ kết nối.'}</p>{!status.userConnected&&<p className="notice" data-testid="inbox-disconnected">Vào Tài khoản để đăng nhập hoặc khôi phục phiên người dùng trước.</p>}<div className="toolbar"><button data-testid="inbox-refresh" disabled={disabled} onClick={()=>void refresh(view.selectedKey)}>Tải lại hội thoại</button><label>Lọc hội thoại đã tải<input data-testid="inbox-filter" maxLength={100} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tên hoặc @username"/></label><span>{view.dialogs.length} hội thoại đã tải</span></div>{view.unloadedChanged&&<p className="notice">Có cập nhật ngoài danh sách đã tải. Bấm Tải lại hội thoại để xem danh sách gần nhất.</p>}{view.needsRefresh&&<p className="notice">Cần tải lại ảnh chụp gần nhất để đối chiếu cập nhật. Nếu tự tải chưa thực hiện được, bấm Tải lại hội thoại.</p>}{notice&&<p role="alert" className="error">{notice}</p>}{loading&&<p role="status">Đang tải từ Telegram…</p>}</section>
 <Composer status={status} busy={busy||loading} selected={selected} request={window.spike.manual}/>
 <div className="inbox-grid"><section><h3>Hội thoại</h3>{filtered.map(row=><button className={'dialog-row '+(selected?.key===row.key?'selected':'')} key={row.key} disabled={disabled} aria-pressed={selected?.key===row.key} onClick={()=>void loadMessages(row)}><strong>{row.name||'Không có tên'}</strong><span>{row.kind==='group'?'Nhóm':row.kind==='channel'?'Kênh':row.kind==='bot'?'Bot':'Cá nhân'}{row.username?' · @'+row.username:''} · Chưa đọc lúc tải: {row.unread}</span>{view.changedKeys.includes(row.key)&&<small>Có cập nhật · tải lại danh sách để đối chiếu số chưa đọc</small>}<span>{row.preview.slice(0,140)||'Không có nội dung xem trước'}</span>{row.lastAt&&<small>{date(row.lastAt)}</small>}</button>)}{view.loaded&&!filtered.length&&<p>Không có hội thoại phù hợp trong dữ liệu đã tải.</p>}{!view.loaded&&<p>Bấm Tải lại hội thoại để bắt đầu.</p>}{view.cursor&&<button disabled={disabled} onClick={()=>void loadDialogs(true)}>Tải thêm hội thoại</button>}{view.dialogs.length>=INBOX_CACHE_LIMIT&&<p>Đã đạt giới hạn giữ tạm 300 hội thoại.</p>}</section>
 <section><h3>{selected?.name||'Lịch sử tin nhắn'}</h3>{selected?<><button disabled={disabled} onClick={()=>void loadMessages(selected)}>Tải lại tin mới nhất</button><p>{view.messages.length} mục đã tải · Mới nhất trước</p>{view.messages.map(message=><article className={'inbox-message '+(message.outgoing?'outgoing':'')} key={message.id}><small>{message.kind==='service'?'Sự kiện':message.outgoing?'Tin gửi':'Tin nhận/bài đăng'} · #{message.id}{message.at?' · '+date(message.at):''}</small>{message.media&&<p className="badge">{message.media}</p>}<p className="message-text">{message.text||'Không có văn bản'}</p></article>)}{view.messagesLoaded&&!view.messages.length&&<p>Telegram không trả về lịch sử có thể hiển thị.</p>}{view.before&&view.messages.length<INBOX_CACHE_LIMIT&&<button disabled={disabled} onClick={()=>void loadMessages(selected,true)}>Tải tin cũ hơn</button>}{view.messages.length>=INBOX_CACHE_LIMIT&&<p>Đã giữ đủ 300 mục. Bấm Tải lại tin mới nhất để bắt đầu lại.</p>}</>:<p>Chọn một hội thoại đã tải để đọc lịch sử.</p>}</section></div></>;
}
