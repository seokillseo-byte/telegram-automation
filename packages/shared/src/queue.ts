import type {Identity} from './protocol';
export type JobState='pending'|'retry_wait'|'paused'|'running'|'sent'|'failed'|'uncertain'|'needs_review'|'cancelled';
export type ScheduledPeer={type:'self'}|{type:'user'|'channel';id:string;accessHash:string}|{type:'chat';id:string};
export type ScheduledPayload={accountId:string;recipient:Identity;peer:ScheduledPeer;text:string;randomId:string;purpose:'personal'};
export type QueueJob={id:string;accountId:string;recipient:Identity;dueAt:string;zone:string;createdAt:string;state:JobState;attempts:number;nextAttemptAt?:string;remoteId?:number;errorCode?:string};
export type QueueEvent={at:string;state:JobState;code?:string};
export type QueueAction={type:'list';reviewOnly?:boolean}|{type:'detail';id:string}|{type:'pause'|'resume'|'cancel';id:string}|{type:'reschedule';id:string;dueAt:string;zone:string};
export type QueueReply={ok:true;jobs?:QueueJob[];summary?:{needsReview:number;uncertain:number};detail?:{job:QueueJob;text:string;events:QueueEvent[]}}|{ok:false;error:string};
export const QUEUE_GRACE_MS=5000;
export function queueId(value:unknown):string{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw Error('INPUT_INVALID');return value;}
export function scheduleTime(dueAt:unknown,zone:unknown,now=Date.now()):{dueAt:string;zone:string}{
 if(typeof dueAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(dueAt)||!Number.isFinite(Date.parse(dueAt))||new Date(dueAt).toISOString()!==dueAt||Date.parse(dueAt)<now+30000||Date.parse(dueAt)>now+365*86400000||typeof zone!=='string'||zone.length>80)throw Error('SCHEDULE_TIME_INVALID');
 try{new Intl.DateTimeFormat('en-GB',{timeZone:zone}).format();}catch{throw Error('SCHEDULE_TIME_INVALID');}return {dueAt,zone};
}
function zoneParts(at:number,zone:string){return Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));}
export function localScheduleToUtc(value:string,zone:string,now=Date.now()):string{
 const match=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);if(!match)throw Error('SCHEDULE_TIME_INVALID');const [year,month,day,hour,minute]=match.slice(1).map(Number),raw=Date.UTC(year,month-1,day,hour,minute);if(!Number.isFinite(raw))throw Error('SCHEDULE_TIME_INVALID');
 const candidates=new Set<number>();
 try{for(const shift of [-48,-24,0,24,48]){const ref=raw+shift*3600000,p=zoneParts(ref,zone),offset=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute)-ref,candidate=raw-offset,q=zoneParts(candidate,zone);if(q.year===year&&q.month===month&&q.day===day&&q.hour===hour&&q.minute===minute)candidates.add(candidate);}}catch{throw Error('SCHEDULE_TIME_INVALID');}
 if(candidates.size!==1)throw Error('SCHEDULE_TIME_INVALID');return scheduleTime(new Date([...candidates][0]).toISOString(),zone,now).dueAt;
}
export function parseQueueAction(value:unknown):QueueAction{
 if(!value||typeof value!=='object')throw Error('INPUT_INVALID');const v=value as Record<string,unknown>;
 if(v.type==='list'&&Object.keys(v).every(k=>['type','reviewOnly'].includes(k))&&(v.reviewOnly===undefined||typeof v.reviewOnly==='boolean'))return {type:'list',reviewOnly:v.reviewOnly as boolean|undefined};
 if(v.type==='reschedule'&&Object.keys(v).length===4)return {type:v.type,id:queueId(v.id),...scheduleTime(v.dueAt,v.zone)};
 if(['detail','pause','resume','cancel'].includes(String(v.type))&&Object.keys(v).length===2)return {type:v.type as 'detail'|'pause'|'resume'|'cancel',id:queueId(v.id)};throw Error('INPUT_INVALID');
}
export function parseScheduledPayload(value:unknown):ScheduledPayload{
 if(!value||typeof value!=='object')throw Error('QUEUE_PAYLOAD_INVALID');const v=value as ScheduledPayload;
 if(v.purpose!=='personal'||typeof v.accountId!=='string'||!/^\d+$/.test(v.accountId)||!v.recipient||typeof v.recipient.id!=='string'||typeof v.recipient.name!=='string'||!/^\d+$/.test(v.recipient.id)||!['user','bot','group','channel'].includes(v.recipient.kind)||typeof v.text!=='string'||!v.text.trim()||v.text.length>4096||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v.text)||typeof v.randomId!=='string'||!/^[-]?\d{1,20}$/.test(v.randomId)||!v.peer)throw Error('QUEUE_PAYLOAD_INVALID');
 if(v.peer.type==='self'){if(v.recipient.peerType!=='user'||v.recipient.id!==v.accountId)throw Error('QUEUE_PAYLOAD_INVALID');}
 else{if(!['user','chat','channel'].includes(v.peer.type)||!/^\d+$/.test(v.peer.id)||v.peer.id!==v.recipient.id||v.peer.type!==v.recipient.peerType||v.peer.type!=='chat'&&!/^[-]?\d{1,20}$/.test(v.peer.accessHash))throw Error('QUEUE_PAYLOAD_INVALID');}return v;
}

export function utcToScheduleLocal(at:number,zone:string):string{const p=zoneParts(at,zone),pad=(n:number)=>String(n).padStart(2,'0');return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;}
export const JOB_LABELS:Record<JobState,string>={pending:'Chờ đến giờ',retry_wait:'Chờ thử lại',paused:'Tạm dừng',running:'Đang thực thi',sent:'Telegram đã xác nhận',failed:'Thất bại',uncertain:'Chưa rõ kết quả',needs_review:'Cần kiểm tra',cancelled:'Đã hủy'};

export const QUEUE_MAX_ATTEMPTS=3;
// Only explicit rejection or failure before SendMessage may be retried.
export function queueRetry(error:{code:string;retryAfter?:number},uncertain:boolean,attempts:number,now=Date.now()):string|undefined{
 if(uncertain||attempts>=QUEUE_MAX_ATTEMPTS)return;
 const wait=error.retryAfter;
 if(error.code==='RATE_LIMIT'&&typeof wait==='number'&&Number.isFinite(wait)&&wait>0&&wait<=86400)return new Date(now+Math.ceil(wait)*1000+1000).toISOString();
 if(['TIMEOUT','NETWORK_TIMEOUT','ETIMEDOUT','ESOCKETTIMEDOUT','ECONNRESET','ECONNREFUSED','ENETUNREACH','EHOSTUNREACH','EAI_AGAIN','ENOTFOUND','CONNECTION_FAILED'].includes(error.code))return new Date(now+(attempts===1?30000:120000)).toISOString();
}

export function queueRecoveryHelp(job:QueueJob):string{
 const reasons:Record<string,string>={QUEUE_APP_RESTART:'Ứng dụng mở lại sau giờ hẹn.',QUEUE_INTERRUPTED:'Ứng dụng dừng khi lượt gửi đang thực thi.',QUEUE_APP_CLOSED:'Ứng dụng đóng khi lượt gửi đang thực thi.',QUEUE_SLEEP:'Máy chuyển sang sleep khi lượt gửi đang thực thi.',QUEUE_RESUMED:'Giờ hẹn đã qua khi máy sleep.',QUEUE_CONNECTION_LOST:'Kết nối bị gián đoạn.',QUEUE_RECONNECTED:'Giờ hẹn đã qua trong lúc mất kết nối.',QUEUE_TIMER_GAP:'Bộ hẹn giờ bị gián đoạn hoặc máy tạm ngừng hoạt động.',QUEUE_CLOCK_CHANGED:'Đồng hồ hệ thống thay đổi; cần kiểm tra lại giờ hẹn.',QUEUE_DISPATCH_EXPIRED:'Lượt gửi hết hạn trước khi gọi lệnh gửi.',QUEUE_OVERDUE:'Lịch đã quá giờ thực thi.'};
 const reason=reasons[job.errorCode??'']??'';
 if(job.state==='uncertain')return reason+' Chưa biết Telegram đã nhận tin hay chưa. Kiểm tra hội thoại trên Telegram; lịch này sẽ không tự gửi lại.';
 if(job.state==='needs_review')return reason+(job.attempts===0?' Lượt này chưa được gửi. Chọn giờ mới và xác nhận, hoặc hủy lịch.':' Các lần trước đã được thử. Kiểm tra Telegram và hủy lịch này trước khi chủ động tạo lịch khác.');
 return reason;
}
