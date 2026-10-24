import type {Failure,Identity} from './protocol';
export const INBOX_PAGE_SIZE=30;
export const INBOX_CACHE_LIMIT=300;
export type InboxDialog=Identity&{key:string;unread:number;lastAt?:string;preview:string};
export type InboxMessage={id:number;at?:string;text:string;outgoing:boolean;kind:'text'|'media'|'service';media?:string};
export type InboxAction={type:'dialogs';cursor?:string}|{type:'messages';key:string;before?:number};
export type InboxReply={ok:true;type:'dialogs';dialogs:InboxDialog[];next?:string}|{ok:true;type:'messages';key:string;messages:InboxMessage[];next?:number}|{ok:false;error:Failure};
export function parseInboxAction(value:unknown):InboxAction{
 if(!value||typeof value!=='object')throw Error('INPUT_INVALID');const v=value as Record<string,unknown>;
 if(v.type==='dialogs'){
  if(Object.keys(v).some(k=>!['type','cursor'].includes(k))||v.cursor!==undefined&&(typeof v.cursor!=='string'||!/^[0-9a-f-]{36}$/i.test(v.cursor)))throw Error('INPUT_INVALID');
  return {type:'dialogs',cursor:v.cursor as string|undefined};
 }
 if(v.type==='messages'){
  if(Object.keys(v).some(k=>!['type','key','before'].includes(k))||typeof v.key!=='string'||!/^(user|chat|channel):[1-9][0-9]{0,19}$/.test(v.key)||v.before!==undefined&&(!Number.isSafeInteger(v.before)||Number(v.before)<=0||Number(v.before)>2147483647))throw Error('INPUT_INVALID');
  return {type:'messages',key:v.key,before:v.before as number|undefined};
 }
 throw Error('INPUT_INVALID');
}
export function mergeInboxMessages(previous:InboxMessage[],next:InboxMessage[]):InboxMessage[]{return [...new Map([...previous,...next].map(message=>[message.id,message])).values()].sort((a,b)=>b.id-a.id).slice(0,INBOX_CACHE_LIMIT);}
