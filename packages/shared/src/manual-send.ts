import type {Failure,Identity} from './protocol';
export const DOCUMENT_MAX=20*1024*1024,PHOTO_MAX=10*1024*1024;
export type AttachmentInfo={id:string;name:string;size:number;kind:'photo'|'document'};
export type AttachmentData=AttachmentInfo&{bytes:Uint8Array};
export type SendTarget={kind:'self'}|{kind:'dialog';key:string}|{kind:'username';username:string};
export type ReplyInfo={id:number;text:string;media?:string};
export type ComposerReply={key:string;id:number;text:string;available:boolean;token:number};
export type SendPreview={id:string;recipient:Identity;text:string;attachment?:AttachmentInfo;reply?:ReplyInfo;expiresAt:string};
export type ManualAction={type:'pickFile';kind:'photo'|'document'}|{type:'clearFile'}|{type:'preview';target:SendTarget;text:string;fileId?:string;replyTo?:number}|{type:'confirm';id:string};
export type ManualReply={ok:true;attachment?:AttachmentInfo;preview?:SendPreview;sent?:{id:number;recipient:Identity;replyTo?:number};cancelled?:boolean}|{ok:false;error:Failure;uncertain?:boolean};
export function sendId(value:unknown):string{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw Error('INPUT_INVALID');return value;}
export function parseManualAction(value:unknown):ManualAction{
 if(!value||typeof value!=='object')throw Error('INPUT_INVALID');const v=value as Record<string,unknown>;
 const only=(keys:string[])=>{if(Object.keys(v).some(k=>!keys.includes(k)))throw Error('INPUT_INVALID');};
 if(v.type==='pickFile'){only(['type','kind']);if(v.kind!=='photo'&&v.kind!=='document')throw Error('INPUT_INVALID');return {type:v.type,kind:v.kind};}
 if(v.type==='clearFile'){only(['type']);return {type:v.type};}
 if(v.type==='confirm'){only(['type','id']);return {type:v.type,id:sendId(v.id)};}
 if(v.type!=='preview')throw Error('INPUT_INVALID');only(['type','target','text','fileId','replyTo']);
 if(typeof v.text!=='string'||v.text.length>4096||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v.text)||!v.target||typeof v.target!=='object')throw Error('INPUT_INVALID');
 const target=v.target as Record<string,unknown>;let parsed:SendTarget;
 if(target.kind==='self'&&Object.keys(target).length===1)parsed={kind:'self'};
 else if(target.kind==='dialog'&&Object.keys(target).length===2&&typeof target.key==='string'&&/^(user|chat|channel):[1-9][0-9]{0,19}$/.test(target.key))parsed={kind:'dialog',key:target.key};
 else if(target.kind==='username'&&Object.keys(target).length===2&&typeof target.username==='string'&&/^@?[a-zA-Z0-9_]{3,64}$/.test(target.username))parsed={kind:'username',username:target.username.replace(/^@/,'')};else throw Error('INPUT_INVALID');
 const replyTo=v.replyTo===undefined?undefined:Number(v.replyTo);
 if(v.replyTo!==undefined&&(typeof v.replyTo!=='number'||!Number.isSafeInteger(v.replyTo)||v.replyTo<=0||v.replyTo>2147483647||parsed.kind!=='dialog'))throw Error('INPUT_INVALID');
 const fileId=v.fileId===undefined?undefined:sendId(v.fileId);
 if(!fileId&&!v.text.trim()||fileId&&v.text.length>1024)throw Error('INPUT_INVALID');
 return {type:'preview',target:parsed,text:v.text,fileId,replyTo};
}
