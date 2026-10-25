import {NavIcon} from './NavIcon';
import {BotIntro} from './BotIntro';
import type {BotIntroAction,BotIntroReply} from '../../../../packages/shared/src/bot-intro';
import {SendPolicy} from './SendPolicy';
import type {PolicyAction,PolicyReply} from '../../../../packages/shared/src/send-policy';
import {Schedule} from './Schedule';
import type {QueueAction,QueueReply} from '../../../../packages/shared/src/queue';
import type {ManualAction,ManualReply} from '../../../../packages/shared/src/manual-send';
import {Inbox} from './Inbox';
import type {InboxAction,InboxReply,InboxUpdate} from '../../../../packages/shared/src/inbox';
import {Templates} from './Templates';
import {Foundation,NAVIGATION,type Page} from './Foundation';
import {PreferencesContext} from './preferences';
import {DEFAULT_PREFERENCES,type AppAction,type AppReply,type AppSnapshot} from '../../../../packages/shared/src/app-state';
import {useEffect,useState} from 'react';
import {GroupAnalysis} from './GroupAnalysis';
import type {AnalysisAction,AnalysisResponse} from '../../../../packages/shared/src/group-analysis';
import {Research} from './Research';
import type {ResearchAction,ResearchResponse} from '../../../../packages/shared/src/research';
import {createRoot} from 'react-dom/client';
import type {Action,Status,Failure} from '../../../../packages/shared/src/protocol';
declare global {interface Window{spike:{botIntro:(action:BotIntroAction)=>Promise<BotIntroReply>;policy:(action:PolicyAction)=>Promise<PolicyReply>;queue:(action:QueueAction)=>Promise<QueueReply>;manual:(action:ManualAction)=>Promise<ManualReply>;inboxUpdates:(callback:(update:InboxUpdate)=>void)=>()=>void;inbox:(action:InboxAction)=>Promise<InboxReply>;action:(action:Action)=>Promise<Failure|undefined>;status:()=>Promise<Status>;app:(action:AppAction)=>Promise<AppReply>;analysis:(action:AnalysisAction)=>Promise<AnalysisResponse>;research:(action:ResearchAction)=>Promise<ResearchResponse>;subscribe:(callback:(status:Status)=>void)=>()=>void}}}
function App(){
 const [page,setPage]=useState<Page>('inbox');
 const [snapshot,setSnapshot]=useState<AppSnapshot>({preferences:DEFAULT_PREFERENCES,events:[],templates:[],counts:{saved:0,searches:0,reports:0}});
 const [viewRequest,setViewRequest]=useState({tab:'results' as 'results'|'saved',token:0});
 async function appAction(action:AppAction){const reply=await window.spike.app(action);if(reply.ok&&reply.snapshot)setSnapshot(reply.snapshot);return reply;}
 const openSaved=()=>{setViewRequest(previous=>({tab:'saved',token:previous.token+1}));setPage('research');};
 useEffect(()=>{void window.spike.app({type:'get'}).then(reply=>{if(reply.ok&&reply.snapshot){setSnapshot(reply.snapshot);setPage(reply.snapshot.preferences.startPage);}}).catch(()=>setLocalError('Không đọc được cài đặt.'));},[]);
 const [groupTarget,setGroupTarget]=useState('');
 const [status,setStatus]=useState<Status>({state:'disconnected'});
 const [apiId,setApiId]=useState(''),[apiHash,setApiHash]=useState(''),[phone,setPhone]=useState(''),[answer,setAnswer]=useState(''),[localError,setLocalError]=useState('');
 useEffect(()=>{const off=window.spike.subscribe(setStatus);void window.spike.status().then(setStatus);return off;},[]);
 useEffect(()=>{void appAction({type:'get'}).catch(()=>{});},[status]);
 const busy=['connecting','awaiting_code','awaiting_password','searching','checking_bot','analyzing_group','inbox_loading','manual_preparing','manual_sending','queue_sending'].includes(status.state);
 const labels:Record<string,string>={queue_sending:'Đang gửi lịch đã xác nhận',queue_ready:'Đã cập nhật lịch gửi',manual_preparing:'Đang chuẩn bị xem trước',manual_sending:'Đang gửi thủ công',manual_ready:'Thao tác gửi thủ công hoàn tất',inbox_loading:'Đang đọc hộp thư',inbox_ready:'Hộp thư đã cập nhật',disconnected:'Chưa kết nối',connecting:'Đang kết nối',awaiting_code:'Nhập mã xác minh',awaiting_password:'Nhập mật khẩu hai bước',connected:'Tài khoản đã kết nối và phiên đã lưu mã hóa',checking_bot:'Đang kiểm tra bot',bot_verified:'Bot đã xác minh',searching:'Đang tìm kiếm',search_complete:'Tìm kiếm hoàn tất',error:'Có lỗi',analyzing_group:'Đang phân tích nhóm/kênh',group_analysis_complete:'Đã lưu báo cáo phân tích'};
 async function act(action:Action){setLocalError('');try{const error=await window.spike.action(action);if(error)setLocalError(error.message);}catch{setLocalError('Không thực hiện được thao tác. Hãy mở lại ứng dụng.');}}
 return <PreferencesContext.Provider value={snapshot.preferences}><main className={'app-shell '+(page==='inbox'?'chat-mode ':'')+(snapshot.preferences.compact?'compact':'')}><aside className="sidebar"><div className="brand" title="Telegram Automation 0.17.1"><span className="brand-mark">TA</span><small>0.17.1</small></div><nav aria-label="Menu chính">{NAVIGATION.map(([key,label])=><button key={key} data-page={key} title={label} className={page===key?'active':''} aria-current={page===key?'page':undefined} onClick={()=>setPage(key)}><NavIcon name={key}/><span>{label}</span></button>)}</nav><small className="rail-status">{status.userConnected?'● Online':'○ Offline'}</small></aside><div className="workspace" data-page={page}><header className="workspace-heading" hidden={page==='inbox'}><span className="badge">KHÔNG GIAN LÀM VIỆC</span><h1>Telegram Automation</h1><p>{NAVIGATION.find(([key])=>key===page)?.[1]}</p></header>
 <section className="connection-panel" hidden={page==='inbox'} aria-live="polite"><strong>{labels[status.state]??status.state}</strong><p>Phiên bản 0.17.1 · Bước: {({initializing:'Khởi tạo',starting_worker:'Mở bộ phận kết nối',creating_client:'Khởi tạo Telegram client',connecting_transport:'Kết nối máy chủ Telegram',requesting_code:'Yêu cầu mã đăng nhập',checking_session:'Kiểm tra phiên',loading_identity:'Đọc thông tin tài khoản',awaiting_code:'Chờ nhập mã',awaiting_password:'Chờ mật khẩu 2FA',searching_public:'Tìm kiếm theo từ khóa',resolving_username:'Tra username chính xác',search_complete:'Đã nhận kết quả',saving_research:'Lưu quan sát nghiên cứu',resolving_group:'Xác định nhóm/kênh',reading_group_info:'Đọc thông tin công khai',sampling_group_posts:'Đọc mẫu bài/tin nhắn',group_analysis_complete:'Hoàn tất báo cáo',saving_group_report:'Lưu báo cáo'} as Record<string,string>)[status.stage??'']??status.stage??'Sẵn sàng'}</p><p>Mã hóa Windows: {status.encryption?'Sẵn sàng':'Không khả dụng — không lưu phiên'}</p>{status.userIdentity&&<p>Phiên người dùng: {status.userIdentity.name} · @{status.userIdentity.username??'không có username'}</p>}{status.identity&&<p>{status.identity.name} · @{status.identity.username??'không có username'} · ID {status.identity.id}</p>}{status.error&&<p className="error">{status.error.message} ({status.error.code}) {status.error.retryAfter?`Chờ ít nhất ${status.error.retryAfter} giây.`:''}</p>}{localError&&<p className="error">{localError}</p>}</section>
 <div hidden={page!=='account'}><div className="grid"><section><h2>1. Tài khoản người dùng</h2><p>Nhập API ID/API Hash của bạn từ my.telegram.org. OTP và mật khẩu chỉ dùng trong bộ nhớ.</p>
 <form onSubmit={e=>{e.preventDefault();void act({type:'login',apiId:Number(apiId),apiHash,phone});setApiHash('');}}>
 <label>API ID<input required inputMode="numeric" value={apiId} onChange={e=>setApiId(e.target.value)}/></label><label>API Hash<input required type="password" autoComplete="off" value={apiHash} onChange={e=>setApiHash(e.target.value)}/></label><label>Số điện thoại (+84…)<input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></label><button disabled={busy||!status.encryption}>Bắt đầu đăng nhập</button></form>
 {['awaiting_code','awaiting_password'].includes(status.state)&&<form onSubmit={e=>{e.preventDefault();void act({type:'answer',value:answer});setAnswer('');}}><label>{status.state==='awaiting_code'?'Mã Telegram yêu cầu':'Mật khẩu 2FA'}<input autoFocus required type="password" autoComplete="off" value={answer} onChange={e=>setAnswer(e.target.value)}/></label><button>Xác nhận</button></form>}
 <div className="actions"><button disabled={busy||!status.encryption} onClick={()=>void act({type:'resume'})}>Khôi phục phiên đã lưu</button><button disabled={busy} onClick={()=>{if(confirm('Thu hồi phiên Telegram hiện tại?'))void act({type:'logout'});}}>Đăng xuất Telegram</button><button onClick={()=>{if(confirm('Hủy kết nối và xóa phiên trên máy? Phiên từ xa chưa được thu hồi.'))void act({type:'forget'});}}>Hủy / Xóa phiên trên máy</button></div></section>
 <BotIntro request={window.spike.botIntro} encryption={Boolean(status.encryption)}/></div></div>
 <div className="chat-page" hidden={page!=='inbox'}>{(status.error||localError)&&<p role="alert" className="chat-error">{status.error?.message??localError}</p>}<Inbox active={page==='inbox'} onOpenAccount={()=>setPage('account')} onOpenAutomation={()=>setPage('schedule')} templates={snapshot.templates} status={status} busy={busy} request={window.spike.inbox} subscribe={window.spike.inboxUpdates}/></div>
 <div hidden={page!=='templates'}><Templates templates={snapshot.templates} onAction={appAction}/></div>
 <div hidden={page!=='research'}><Research requestedView={viewRequest} status={status} busy={busy} onOpenAnalysis={target=>{setGroupTarget(target);setPage('analytics');}} onSearch={(query,exact,mode)=>void act({type:'search',query,exact,mode})}/></div>
 <div hidden={page!=='analytics'}><GroupAnalysis status={status} busy={busy} initialTarget={groupTarget} onAnalyze={target=>void act({type:'analyzeGroup',target})}/></div>
 {page==='contacts'&&<SendPolicy request={window.spike.policy} accountId={status.userIdentity?.id} onOpenSaved={openSaved}/>}
 {page==='schedule'&&<Schedule request={window.spike.queue} accountId={status.userIdentity?.id} onCompose={()=>setPage('inbox')}/>}
 {!['account','research','analytics','templates','inbox','schedule','contacts'].includes(page)&&<Foundation page={page} snapshot={snapshot} onAction={appAction} onNavigate={setPage} onOpenSaved={openSaved}/>}
 <footer hidden={page==='inbox'}>Bản thử nghiệm có lịch gửi văn bản một lần khi app mở và đã kết nối. Dữ liệu nghiên cứu và ghi chú lưu local trong SQLite, không mã hóa như phiên Telegram. Chỉ lưu thông tin cần thiết. Sau khi mở lại, bấm “Khôi phục phiên đã lưu” để kiểm tra. Không chia sẻ token, API Hash, OTP hoặc file phiên.</footer></div></main></PreferencesContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<App/>);
