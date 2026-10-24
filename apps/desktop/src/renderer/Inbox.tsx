import {useEffect,useRef,useState} from 'react';
import {INBOX_CACHE_LIMIT,mergeInboxMessages,type InboxDialog,type InboxMessage,type InboxAction,type InboxReply} from '../../../../packages/shared/src/inbox';
import type {Status} from '../../../../packages/shared/src/protocol';
import {useDateFormatter} from './preferences';
export function Inbox({status,busy,request}:{status:Status;busy:boolean;request:(action:InboxAction)=>Promise<InboxReply>}){
 const [dialogs,setDialogs]=useState<InboxDialog[]>([]),[cursor,setCursor]=useState<string>(),[selected,setSelected]=useState<InboxDialog>(),[messages,setMessages]=useState<InboxMessage[]>([]),[before,setBefore]=useState<number>(),[loading,setLoading]=useState(false),[notice,setNotice]=useState(''),[query,setQuery]=useState(''),[loaded,setLoaded]=useState(false),[messagesLoaded,setMessagesLoaded]=useState(false);
 const epoch=useRef(0),locked=useRef(false),date=useDateFormatter();
 useEffect(()=>{epoch.current++;locked.current=false;setDialogs([]);setCursor(undefined);setSelected(undefined);setMessages([]);setBefore(undefined);setLoading(false);setNotice('');setQuery('');setLoaded(false);setMessagesLoaded(false);},[status.userConnected,status.userIdentity?.id]);
 async function loadDialogs(more=false){
  if(locked.current)return;locked.current=true;setLoading(true);setNotice('');const current=epoch.current;
  try{const reply=await request({type:'dialogs',cursor:more?cursor:undefined});if(current!==epoch.current)return;
   if(!reply.ok){setNotice(reply.error.message+(reply.error.retryAfter?` Chờ ít nhất ${reply.error.retryAfter} giây.`:''));return;}
   if(reply.type!=='dialogs')throw Error('Unexpected reply');
   setDialogs(previous=>[...new Map([...(more?previous:[]),...reply.dialogs].map(row=>[row.key,row])).values()].slice(0,INBOX_CACHE_LIMIT));setCursor(reply.next);setLoaded(true);
   if(!more){setSelected(undefined);setMessages([]);setBefore(undefined);setMessagesLoaded(false);}
  }catch{if(current===epoch.current)setNotice('Không tải được hội thoại. Hãy thử lại khi kết nối sẵn sàng.');}finally{if(current===epoch.current){locked.current=false;setLoading(false);}}
 }
 async function loadMessages(row:InboxDialog,older=false){
  if(locked.current)return;locked.current=true;setLoading(true);setNotice('');const current=epoch.current;
  if(selected?.key!==row.key){setSelected(row);setMessages([]);setBefore(undefined);setMessagesLoaded(false);}
  try{const reply=await request({type:'messages',key:row.key,before:older?before:undefined});if(current!==epoch.current)return;
   if(!reply.ok){setNotice(reply.error.message+(reply.error.retryAfter?` Chờ ít nhất ${reply.error.retryAfter} giây.`:''));return;}
   if(reply.type!=='messages'||reply.key!==row.key)throw Error('Unexpected reply');
   setMessages(previous=>mergeInboxMessages(older?previous:[],reply.messages));setBefore(reply.next);setMessagesLoaded(true);
  }catch{if(current===epoch.current)setNotice('Không tải được lịch sử. Hãy thử tải lại hội thoại.');}finally{if(current===epoch.current){locked.current=false;setLoading(false);}}
 }
 const disabled=busy||loading||!status.userConnected;
 const filtered=dialogs.filter(row=>(row.name+' '+(row.username??'')).toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
 return <><section><h2>Hộp thư</h2><p>Đọc hội thoại của tài khoản đang kết nối. Tải 30 mục mỗi lần bấm; giữ tối đa 300 hội thoại và 300 mục lịch sử của hội thoại đang mở trong bộ nhớ.</p><p>Nội dung tệp chỉ hiện nhãn, chưa tải tệp. Không đánh dấu đã đọc, chưa gửi tin hoặc tự cập nhật thời gian thực.</p>{!status.userConnected&&<p className="notice" data-testid="inbox-disconnected">Vào Tài khoản để đăng nhập hoặc khôi phục phiên người dùng trước.</p>}<div className="toolbar"><button data-testid="inbox-refresh" disabled={disabled} onClick={()=>void loadDialogs()}>Tải lại hội thoại</button><label>Lọc hội thoại đã tải<input maxLength={100} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tên hoặc username"/></label><span>{dialogs.length} hội thoại đã tải</span></div>{notice&&<p role="alert" className="error">{notice}</p>}{loading&&<p role="status">Đang tải từ Telegram…</p>}</section>
 <div className="inbox-grid"><section><h3>Hội thoại</h3>{filtered.map(row=><button className={'dialog-row '+(selected?.key===row.key?'selected':'')} key={row.key} disabled={disabled} aria-pressed={selected?.key===row.key} onClick={()=>void loadMessages(row)}><strong>{row.name||'Không có tên'}</strong><span>{row.kind==='group'?'Nhóm':row.kind==='channel'?'Kênh':row.kind==='bot'?'Bot':'Cá nhân'}{row.username?' · @'+row.username:''} · Chưa đọc: {row.unread}</span><span>{row.preview.slice(0,140)||'Không có nội dung xem trước'}</span>{row.lastAt&&<small>{date(row.lastAt)}</small>}</button>)}{loaded&&!filtered.length&&<p>Không có hội thoại phù hợp trong dữ liệu đã tải.</p>}{!loaded&&<p>Bấm Tải lại hội thoại để bắt đầu.</p>}{cursor&&<button disabled={disabled} onClick={()=>void loadDialogs(true)}>Tải thêm hội thoại</button>}{dialogs.length>=INBOX_CACHE_LIMIT&&<p>Đã đạt giới hạn giữ tạm 300 hội thoại.</p>}</section>
 <section><h3>{selected?.name||'Lịch sử tin nhắn'}</h3>{selected?<><button disabled={disabled} onClick={()=>void loadMessages(selected)}>Tải lại tin mới nhất</button><p>{messages.length} mục đã tải · Mới nhất trước</p>{messages.map(message=><article className={'inbox-message '+(message.outgoing?'outgoing':'')} key={message.id}><small>{message.kind==='service'?'Sự kiện':message.outgoing?'Tin gửi':'Tin nhận/bài đăng'} · #{message.id}{message.at?' · '+date(message.at):''}</small>{message.media&&<p className="badge">{message.media}</p>}<p className="message-text">{message.text||'Không có văn bản'}</p></article>)}{messagesLoaded&&!messages.length&&<p>Telegram không trả về lịch sử có thể hiển thị.</p>}{before&&messages.length<INBOX_CACHE_LIMIT&&<button disabled={disabled} onClick={()=>void loadMessages(selected,true)}>Tải tin cũ hơn</button>}{messages.length>=INBOX_CACHE_LIMIT&&<p>Đã giữ đủ 300 mục. Bấm Tải lại tin mới nhất để bắt đầu lại.</p>}</>:<p>Chọn một hội thoại đã tải để đọc lịch sử.</p>}</section></div></>;
}
