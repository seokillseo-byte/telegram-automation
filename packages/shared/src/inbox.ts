import type {Failure,Identity} from './protocol';
export const INBOX_PAGE_SIZE=30;
export const INBOX_CACHE_LIMIT=300;
export type InboxDialog=Identity&{key:string;unread:number;lastAt?:string;lastMessageId?:number;preview:string};
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
export type InboxUpdate=
 |{type:'message';key:string;message:InboxMessage;edited:boolean}
 |{type:'delete';key?:string;ids:number[]}
 |{type:'changed';key?:string}
 |{type:'resync'}
 |{type:'connection';connected:boolean};
export type InboxView={dialogs:InboxDialog[];cursor?:string;selectedKey?:string;messages:InboxMessage[];before?:number;loaded:boolean;messagesLoaded:boolean;changedKeys:string[];unloadedChanged:boolean;needsRefresh:boolean};
export const EMPTY_INBOX:InboxView={dialogs:[],messages:[],loaded:false,messagesLoaded:false,changedKeys:[],unloadedChanged:false,needsRefresh:false};
export function filterInboxDialogs(dialogs:InboxDialog[],query:string):InboxDialog[]{const needle=query.trim().replace(/^@/,'').toLocaleLowerCase('vi');return dialogs.filter(row=>(row.name+' '+(row.username??'')).toLocaleLowerCase('vi').includes(needle));}
export function applyInboxUpdate(state:InboxView,update:InboxUpdate):InboxView{
 if(update.type==='connection')return state;
 if(update.type==='resync')return {...state,needsRefresh:true};
 if(update.type==='changed')return update.key&&state.dialogs.some(d=>d.key===update.key)?{...state,changedKeys:[...new Set([...state.changedKeys,update.key])].slice(0,INBOX_CACHE_LIMIT)}:{...state,unloadedChanged:true};
 if(update.type==='message'){
  const known=state.dialogs.some(d=>d.key===update.key);if(!known)return {...state,unloadedChanged:true};
  const dialogs=state.dialogs.map(dialog=>{
   if(dialog.key!==update.key)return dialog;
   const latest=dialog.lastMessageId===undefined||update.message.id>=dialog.lastMessageId;
   return latest?{...dialog,lastMessageId:update.message.id,lastAt:update.message.at,preview:update.message.text||update.message.media||''}:dialog;
  });
  const messages=state.selectedKey===update.key&&(!update.edited||state.messages.some(message=>message.id===update.message.id))?mergeInboxMessages(state.messages,[update.message]):state.messages;
  return {...state,dialogs,messages,changedKeys:[...new Set([...state.changedKeys,update.key])].slice(0,INBOX_CACHE_LIMIT)};
 }
 const matches=(key:string)=>update.key?key===update.key:!key.startsWith('channel:');
 return {...state,messages:state.selectedKey&&matches(state.selectedKey)?state.messages.filter(m=>!update.ids.includes(m.id)):state.messages,dialogs:state.dialogs.map(d=>matches(d.key)&&d.lastMessageId!==undefined&&update.ids.includes(d.lastMessageId)?{...d,preview:'Tin cuối đã thay đổi — tải lại hội thoại'}:d)};
}
