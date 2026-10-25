import type {MessageTemplate} from '../../../../packages/shared/src/templates';
import type {ComposerReply} from '../../../../packages/shared/src/manual-send';
import {Composer} from './Composer';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {EMPTY_INBOX,INBOX_CACHE_LIMIT,applyInboxUpdate,filterInboxDialogs,mergeInboxMessages,type InboxView,type InboxUpdate,type InboxDialog,type InboxAction,type InboxReply} from '../../../../packages/shared/src/inbox';
import type {Status} from '../../../../packages/shared/src/protocol';
import {useDateFormatter} from './preferences';
export function Inbox({active,onOpenAccount,onOpenAutomation,status,busy,request,subscribe,templates}:{active:boolean;onOpenAccount:()=>void;onOpenAutomation:()=>void;templates:MessageTemplate[];status:Status;busy:boolean;request:(action:InboxAction)=>Promise<InboxReply>;subscribe:(callback:(update:InboxUpdate)=>void)=>()=>void}){
 const initialRequested=useRef(false),scrollRef=useRef<HTMLDivElement>(null),followLatest=useRef(true);
 const [reply,setReply]=useState<ComposerReply>();
 const [view,setView]=useState<InboxView>(EMPTY_INBOX),[loading,setLoading]=useState(false),[notice,setNotice]=useState(''),[query,setQuery]=useState('');
 const model=useRef(view),epoch=useRef(0),locked=useRef(false),buffer=useRef<InboxUpdate[]>([]),lastOnline=useRef(true),autoAfter=useRef(0),wish=useRef<{account?:string;loaded:boolean;selectedKey?:string}>({loaded:false}),context=useRef({connected:status.userConnected,busy,online:status.inboxOnline});const date=useDateFormatter();
 context.current={connected:status.userConnected,busy,online:status.inboxOnline};
 useEffect(()=>{setReply(previous=>previous&&previous.key!==view.selectedKey?undefined:previous);},[view.selectedKey]);
 function change(update:(previous:InboxView)=>InboxView){model.current=update(model.current);setView(model.current);}
 useEffect(()=>{
  epoch.current++;initialRequested.current=false;setReply(undefined);locked.current=false;buffer.current=[];autoAfter.current=0;lastOnline.current=true;change(()=>EMPTY_INBOX);setLoading(false);setNotice('');setQuery('');
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
  if(model.current.selectedKey!==row.key)followLatest.current=true;else if(older)followLatest.current=false;
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
 useEffect(()=>{
  if(!active||!status.userConnected||status.inboxOnline===false||busy||loading||locked.current||view.loaded||view.needsRefresh||wish.current.loaded||initialRequested.current)return;
  initialRequested.current=true;void refresh();
 },[active,status.userConnected,status.inboxOnline,busy,loading,view.loaded,view.needsRefresh]);
 useLayoutEffect(()=>{if(followLatest.current&&scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;},[view.messages,active]);
 const disabled=busy||loading||!status.userConnected||status.inboxOnline===false;
 const filtered=filterInboxDialogs(view.dialogs,query),selected=view.dialogs.find(row=>row.key===view.selectedKey);
 return <div className="telegram-chat" data-testid="telegram-chat-layout">
 <aside className="chat-dialogs"><div className="dialogs-heading"><div><h2>Tin nhắn</h2><small data-testid="inbox-live">{status.userConnected?(status.inboxOnline===false?'Đang mất kết nối':'Đã kết nối Telegram'):'Chưa đăng nhập'}</small></div><button className="icon-button" title="Tài khoản Telegram" aria-label="Mở tài khoản Telegram" onClick={onOpenAccount}>☰</button></div>
 <div className="dialog-search"><input aria-label="Tìm hội thoại đã tải" data-testid="inbox-filter" maxLength={100} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm tên hoặc @username…"/></div>
 <div className="dialog-tools"><button data-testid="inbox-refresh" disabled={disabled} onClick={()=>void refresh(view.selectedKey)}>Làm mới</button><span>{view.dialogs.length} hội thoại</span></div>
 {!status.userConnected&&<div className="chat-signin" data-testid="inbox-disconnected"><strong>Kết nối Telegram của bạn</strong><p>Đăng nhập hoặc khôi phục phiên để tải hội thoại và gửi tin.</p><button onClick={onOpenAccount}>Mở tài khoản</button></div>}
 <div className="dialog-list">{filtered.map(row=><button className={'dialog-row '+(selected?.key===row.key?'selected':'')} key={row.key} disabled={disabled} aria-pressed={selected?.key===row.key} onClick={()=>void loadMessages(row)}>
 <span className={'chat-avatar avatar-'+row.kind} aria-hidden="true">{row.name?.trim().slice(0,2).toLocaleUpperCase('vi')||'TG'}</span><span className="dialog-copy"><span className="dialog-line"><strong>{row.name||'Không có tên'}</strong>{row.lastAt&&<time>{date(row.lastAt).split(' ')[0]}</time>}</span><span className="dialog-preview">{row.preview.slice(0,140)||'Không có nội dung xem trước'}</span><span className="dialog-meta">{row.kind==='group'?'Nhóm':row.kind==='channel'?'Kênh':row.kind==='bot'?'Bot':'Cá nhân'}{row.username?' · @'+row.username:''}{view.changedKeys.includes(row.key)?' · Có cập nhật':''}</span></span>{row.unread>0&&<span className="unread-count" title="Số chưa đọc lúc tải">{row.unread}</span>}</button>)}
 {view.loaded&&!filtered.length&&<p className="chat-empty-list">Không có hội thoại phù hợp trong danh sách đã tải.</p>}{!view.loaded&&status.userConnected&&!loading&&<p className="chat-empty-list">Bấm Làm mới để tải hội thoại.</p>}{view.cursor&&<button className="load-more" disabled={disabled} onClick={()=>void loadDialogs(true)}>Tải thêm hội thoại</button>}{view.dialogs.length>=INBOX_CACHE_LIMIT&&<p className="hint">Đã tải 300 hội thoại.</p>}</div>
 <div className="dialogs-footer"><button className="secondary" onClick={onOpenAutomation}>Quản lý Automation →</button></div></aside>
 <div className="chat-conversation"><div className="conversation-heading"><span className="chat-avatar" aria-hidden="true">{selected?.name?.slice(0,2).toLocaleUpperCase('vi')||'TA'}</span><div><h2>{selected?.name||'Telegram Automation'}</h2><small>{selected?(selected.username?'@'+selected.username:'Hội thoại đang mở'):'Tin nhắn và lịch gửi trong một nơi'}</small></div>{selected&&<button className="secondary" disabled={disabled} onClick={()=>void loadMessages(selected)}>Tải tin mới</button>}</div>
 <div className="chat-notices" aria-live="polite">{loading&&<p role="status">Đang tải từ Telegram…</p>}{notice&&<p role="alert" className="error">{notice}</p>}{view.unloadedChanged&&<p>Có cập nhật ngoài danh sách đã tải. Bấm Làm mới để xem.</p>}{view.needsRefresh&&<p>Đang chờ tải lại hội thoại để đối chiếu cập nhật.</p>}</div>
 <div className="conversation-history" ref={scrollRef} onScroll={()=>{const el=scrollRef.current;if(el)followLatest.current=el.scrollHeight-el.scrollTop-el.clientHeight<100;}}>
 {selected?<>{view.before&&view.messages.length<INBOX_CACHE_LIMIT&&<button className="history-more" disabled={disabled} onClick={()=>void loadMessages(selected,true)}>Tải tin cũ hơn</button>}{[...view.messages].reverse().map(message=><article className={'inbox-message '+(message.outgoing?'outgoing':'')} key={message.id}><small>{message.kind==='service'?'Sự kiện':message.outgoing?'Bạn':'Tin nhận / bài đăng'}{message.at?' · '+date(message.at):''}</small>{message.media&&<div className="media-placeholder"><span aria-hidden="true">▧</span><strong>{message.media}</strong><small>Nội dung đính kèm chưa được tải trong ứng dụng</small></div>}<p className="message-text">{message.text||'Không có văn bản'}</p>{message.kind!=='service'&&<button data-testid="message-reply" className="message-reply secondary" disabled={disabled} onClick={()=>setReply(previous=>({key:selected.key,id:message.id,text:message.text.slice(0,200),available:true,token:(previous?.token??0)+1}))}>Trả lời</button>}</article>)}{view.messagesLoaded&&!view.messages.length&&<p className="empty-history">Telegram không trả về lịch sử có thể hiển thị.</p>}{view.messages.length>=INBOX_CACHE_LIMIT&&<p className="hint">Đang giữ 300 mục. Tải tin mới để làm mới lịch sử.</p>}</>:<div className="chat-welcome"><span className="welcome-mark">TA</span><h2>Không gian trò chuyện của bạn</h2><p>Chọn hội thoại ở bên trái để đọc và trả lời.<br/>Soạn tin bên dưới để gửi tới Saved Messages hoặc một username chính xác.</p><button onClick={onOpenAutomation}>Mở Automation</button></div>}</div>
 <Composer status={status} busy={busy||loading} selected={selected} request={window.spike.manual} templates={templates} reply={reply?{...reply,available:view.messages.some(message=>message.id===reply.id&&message.kind!=='service'),text:view.messages.find(message=>message.id===reply.id)?.text.slice(0,200)??reply.text}:undefined} onClearReply={()=>setReply(undefined)}/>
 </div></div>;
}
