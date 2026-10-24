import {sendPurpose,type SendPurpose} from './send-policy';
import {scheduleTime} from './queue';
import type {Failure,Identity} from './protocol';
export const DOCUMENT_MAX=20*1024*1024,PHOTO_MAX=10*1024*1024;
export type AttachmentInfo={id:string;name:string;size:number;kind:'photo'|'document'};
export type AttachmentData=AttachmentInfo&{bytes:Uint8Array};
export type SendTarget={kind:'self'}|{kind:'dialog';key:string}|{kind:'username';username:string};
export type SendCapability={state:'allowed'|'blocked'|'unknown';reason:string;code?:string};
export type SendCapabilities={recipient:Identity;checkedAt:string;text:SendCapability;photo:SendCapability;document:SendCapability;notes:string[]};
export type ReplyInfo={id:number;text:string;media?:string};
export type ComposerReply={key:string;id:number;text:string;available:boolean;token:number};
export type SendPreview={id:string;recipient:Identity;text:string;attachment?:AttachmentInfo;reply?:ReplyInfo;capabilities?:SendCapabilities;expiresAt:string;purpose?:SendPurpose};
export type ManualAction={type:'schedule';id:string;dueAt:string;zone:string}|{type:'capabilities';target:SendTarget}|{type:'pickFile';kind:'photo'|'document'}|{type:'clearFile'}|{type:'preview';purpose?:SendPurpose;target:SendTarget;text:string;fileId?:string;replyTo?:number}|{type:'confirm';id:string};
export type ManualReply={ok:true;scheduled?:{id:string;dueAt:string;zone:string};capabilities?:SendCapabilities;attachment?:AttachmentInfo;preview?:SendPreview;sent?:{id:number;recipient:Identity;replyTo?:number};cancelled?:boolean}|{ok:false;error:Failure;uncertain?:boolean;capabilities?:SendCapabilities};
export function sendId(value:unknown):string{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw Error('INPUT_INVALID');return value;}
export function parseSendTarget(value:unknown):SendTarget{
 if(!value||typeof value!=='object')throw Error('INPUT_INVALID');
 const target=value as Record<string,unknown>;let parsed:SendTarget;
 if(target.kind==='self'&&Object.keys(target).length===1)parsed={kind:'self'};
 else if(target.kind==='dialog'&&Object.keys(target).length===2&&typeof target.key==='string'&&/^(user|chat|channel):[1-9][0-9]{0,19}$/.test(target.key))parsed={kind:'dialog',key:target.key};
 else if(target.kind==='username'&&Object.keys(target).length===2&&typeof target.username==='string'&&/^@?[a-zA-Z0-9_]{3,64}$/.test(target.username))parsed={kind:'username',username:target.username.replace(/^@/,'')};else throw Error('INPUT_INVALID');
 return parsed;
}
export function parseManualAction(value:unknown):ManualAction{
 if(!value||typeof value!=='object')throw Error('INPUT_INVALID');const v=value as Record<string,unknown>;
 const only=(keys:string[])=>{if(Object.keys(v).some(k=>!keys.includes(k)))throw Error('INPUT_INVALID');};
 if(v.type==='schedule'){only(['type','id','dueAt','zone']);return {type:v.type,id:sendId(v.id),...scheduleTime(v.dueAt,v.zone)};}
 if(v.type==='capabilities'){only(['type','target']);return {type:v.type,target:parseSendTarget(v.target)};}
 if(v.type==='pickFile'){only(['type','kind']);if(v.kind!=='photo'&&v.kind!=='document')throw Error('INPUT_INVALID');return {type:v.type,kind:v.kind};}
 if(v.type==='clearFile'){only(['type']);return {type:v.type};}
 if(v.type==='confirm'){only(['type','id']);return {type:v.type,id:sendId(v.id)};}
 if(v.type!=='preview')throw Error('INPUT_INVALID');only(['type','target','text','fileId','replyTo','purpose']);
 if(typeof v.text!=='string'||v.text.length>4096||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v.text)||!v.target||typeof v.target!=='object')throw Error('INPUT_INVALID');
 const parsed=parseSendTarget(v.target);
 const replyTo=v.replyTo===undefined?undefined:Number(v.replyTo);
 if(v.replyTo!==undefined&&(typeof v.replyTo!=='number'||!Number.isSafeInteger(v.replyTo)||v.replyTo<=0||v.replyTo>2147483647||parsed.kind!=='dialog'))throw Error('INPUT_INVALID');
 const fileId=v.fileId===undefined?undefined:sendId(v.fileId);
 if(!fileId&&!v.text.trim()||fileId&&v.text.length>1024)throw Error('INPUT_INVALID');
 return {type:'preview',target:parsed,text:v.text,fileId,replyTo,purpose:sendPurpose(v.purpose??'personal')};
}

export function sendTargetKey(target:SendTarget):string{return target.kind==='self'?'self':target.kind==='dialog'?target.key:'username:'+target.username.trim().replace(/^@/,'').toLowerCase();}
export function sendErrorHelp(code:string):string{
 if(['SEND_FILE_READ','SEND_FILE_CHANGED','SEND_FILE_EXPIRED','SEND_FILE_SIZE','SEND_PHOTO_FORMAT','MEDIA_INVALID','PHOTO_INVALID','PHOTO_EXT_INVALID','PHOTO_INVALID_DIMENSIONS','PHOTO_SAVE_FILE_INVALID'].includes(code))return 'Kiểm tra tệp, định dạng và kích thước rồi chủ động chọn lại; không có gửi lại tự động.';
 if(code==='TOPIC_CLOSED')return 'Chọn lại tin hoặc chủ đề còn mở trong Telegram, rồi xem trước lại.';
 if(code==='RATE_LIMIT')return 'Chờ hết thời gian Telegram yêu cầu rồi chủ động xem trước lại. Tool không tự gửi lại.';
 if(['PEER_FLOOD','USER_RESTRICTED','CHAT_RESTRICTED'].includes(code))return 'Dừng thử gửi liên tục và kiểm tra hạn chế tài khoản bằng Telegram chính thức.';
 if(['CHAT_WRITE_FORBIDDEN','CHAT_ADMIN_REQUIRED','USER_BANNED_IN_CHANNEL','CHAT_SEND_PLAIN_FORBIDDEN','CHAT_SEND_MEDIA_FORBIDDEN','CHAT_SEND_PHOTOS_FORBIDDEN','CHAT_SEND_DOCS_FORBIDDEN','SEND_JOIN_REQUIRED','CHAT_GUEST_SEND_FORBIDDEN'].includes(code))return 'Kiểm tra quyền gửi với quản trị nhóm/kênh. Tool không tự tham gia hoặc nâng quyền.';
 if(['USER_PRIVACY_RESTRICTED','USER_NOT_MUTUAL_CONTACT','USER_IS_BLOCKED','YOU_BLOCKED_USER','PRIVACY_PREMIUM_REQUIRED','PREMIUM_ACCOUNT_REQUIRED','ALLOW_PAYMENT_REQUIRED'].includes(code))return 'Kiểm tra điều kiện liên hệ/riêng tư trong Telegram. Tool không bỏ chặn hoặc tự thanh toán.';
 if(['SEND_REPLY_UNAVAILABLE','SEND_REPLY_CHANGED','REPLY_MESSAGE_ID_INVALID','MESSAGE_ID_INVALID'].includes(code))return 'Tải lại hội thoại, chọn lại tin gốc rồi xem trước lại.';
 if(['SESSION_REVOKED','SESSION_EXPIRED','AUTH_KEY_UNREGISTERED','NOT_CONNECTED'].includes(code))return 'Khôi phục phiên hoặc đăng nhập lại trước khi tiếp tục.';
 return 'Giữ bản soạn, kiểm tra thông tin và chỉ chủ động thử lại khi nguyên nhân đã được xử lý.';
}
