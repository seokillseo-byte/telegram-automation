import {returnBigInt} from 'telegram/Helpers';
import {randomUUID} from 'node:crypto';
import {Api,type TelegramClient} from 'telegram';
import {identity} from './index';
import {INBOX_PAGE_SIZE,INBOX_CACHE_LIMIT,parseInboxAction,type InboxAction,type InboxReply,type InboxMessage,type InboxDialog,type InboxUpdate} from '../../shared/src/inbox';
function key(peer:Api.TypePeer):string{return peer instanceof Api.PeerUser?'user:'+peer.userId:peer instanceof Api.PeerChannel?'channel:'+peer.channelId:'chat:'+peer.chatId;}
function timestamp(seconds:number|undefined):string|undefined{return seconds&&Number.isFinite(seconds)?new Date(seconds*1000).toISOString():undefined;}
function mediaLabel(media:Api.TypeMessageMedia|undefined):string|undefined{
 if(!media||media instanceof Api.MessageMediaEmpty)return;
 if(media instanceof Api.MessageMediaPhoto)return 'Ảnh';
 if(media instanceof Api.MessageMediaDocument)return 'Tệp/âm thanh/video';
 if(media instanceof Api.MessageMediaWebPage)return 'Liên kết';
 return 'Nội dung đính kèm';
}
function messageView(message:Api.Message|Api.MessageService):InboxMessage{
 if(message instanceof Api.MessageService)return {id:message.id,at:timestamp(message.date),text:'Sự kiện trong hội thoại',outgoing:Boolean(message.out),kind:'service'};
 const media=mediaLabel(message.media);return {id:message.id,at:timestamp(message.date),text:message.message??'',outgoing:Boolean(message.out),kind:media?'media':'text',media};
}
// Peer access hashes and pagination cursors remain inside the connected worker.
export class InboxReader{
 private peers=new Map<string,Api.TypeInputPeer>();
 private replyKey="";
 private replyIds=new Set<number>();
 private points=new Map<string,number>();
 private cursors=new Map<string,{offsetDate:number;offsetId:number;offsetPeer:Api.TypeInputPeer}>();
 canReply(key:string,id:number){return this.replyKey===key&&this.replyIds.has(id);}
 private rememberReply(key:string,id:number){if(this.replyKey!==key)return;this.replyIds.add(id);this.replyIds=new Set([...this.replyIds].sort((a,b)=>b-a).slice(0,INBOX_CACHE_LIMIT));}
 inputPeer(key:string){return this.peers.get(key);}
 reset(){this.replyKey="";this.replyIds.clear();this.peers.clear();this.cursors.clear();this.points.clear();}
 update(raw:unknown):InboxUpdate|undefined{
  if(raw instanceof Api.UpdatesTooLong)return {type:'resync'};
  if(raw instanceof Api.UpdateChannelTooLong)return this.peers.has('channel:'+raw.channelId)?{type:'resync'}:{type:'changed'};
  if(raw&&typeof raw==='object'&&'pts' in raw&&'ptsCount' in raw&&typeof raw.pts==='number'&&typeof raw.ptsCount==='number'){
   let scope='global';
   if('channelId' in raw)scope='channel:'+String(raw.channelId);
   else if((raw instanceof Api.UpdateNewChannelMessage||raw instanceof Api.UpdateEditChannelMessage)&&(raw.message instanceof Api.Message||raw.message instanceof Api.MessageService))scope=key(raw.message.peerId);
   if(scope==='global'||this.peers.has(scope)){const before=this.points.get(scope);this.points.set(scope,Math.max(before??0,raw.pts));if(before!==undefined&&raw.pts>before+raw.ptsCount)return {type:'resync'};}
  }
  if(raw instanceof Api.UpdateNewMessage||raw instanceof Api.UpdateNewChannelMessage||raw instanceof Api.UpdateEditMessage||raw instanceof Api.UpdateEditChannelMessage){
   const message=raw.message;if(!(message instanceof Api.Message||message instanceof Api.MessageService))return;
   const ref=key(message.peerId);if(!this.peers.has(ref))return {type:'changed'};
   if(message instanceof Api.Message)this.rememberReply(ref,message.id);
   return {type:'message',key:ref,message:messageView(message),edited:raw instanceof Api.UpdateEditMessage||raw instanceof Api.UpdateEditChannelMessage};
  }
  if(raw instanceof Api.UpdateShortMessage||raw instanceof Api.UpdateShortChatMessage){
   const ref=raw instanceof Api.UpdateShortMessage?'user:'+raw.userId:'chat:'+raw.chatId;
   if(!this.peers.has(ref))return {type:'changed'};
   this.rememberReply(ref,raw.id);return {type:'message',key:ref,edited:false,message:{id:raw.id,at:timestamp(raw.date),text:raw.message,outgoing:Boolean(raw.out),kind:'text'}};
  }
  if(raw instanceof Api.UpdateDeleteChannelMessages){if(raw.messages.length>INBOX_CACHE_LIMIT)return {type:'resync'};const ref='channel:'+raw.channelId;if(this.replyKey===ref)for(const id of raw.messages)this.replyIds.delete(id);return this.peers.has(ref)?{type:'delete',key:ref,ids:raw.messages.slice(0,INBOX_CACHE_LIMIT)}:undefined;}
  if(raw instanceof Api.UpdateDeleteMessages&&raw.messages.length>INBOX_CACHE_LIMIT)return {type:'resync'};
  if(raw instanceof Api.UpdateDeleteMessages){if(!this.replyKey.startsWith('channel:'))for(const id of raw.messages)this.replyIds.delete(id);return {type:'delete',ids:raw.messages.slice(0,INBOX_CACHE_LIMIT)};}
  if(raw instanceof Api.UpdateReadHistoryInbox)return {type:'changed',key:key(raw.peer)};
  if(raw instanceof Api.UpdateReadChannelInbox)return {type:'changed',key:'channel:'+raw.channelId};
 }
 async read(client:Pick<TelegramClient,'invoke'>,input:InboxAction):Promise<InboxReply>{
  const action=parseInboxAction(input);
  if(action.type==='messages'){
   const peer=this.peers.get(action.key);if(!peer)throw Error('INBOX_DIALOG_REQUIRED');
   const result=await client.invoke(new Api.messages.GetHistory({peer,offsetId:action.before??0,offsetDate:0,addOffset:0,limit:INBOX_PAGE_SIZE,maxId:0,minId:0,hash:returnBigInt(0)}));
   if(result instanceof Api.messages.MessagesNotModified)throw Error('INBOX_RESPONSE_INVALID');
   const raw=result.messages.filter(m=>m.id>0&&(!action.before||m.id<action.before));
   const messages=raw.filter((m):m is Api.Message|Api.MessageService=>m instanceof Api.Message||m instanceof Api.MessageService).map(messageView);
   if(this.replyKey!==action.key){this.replyKey=action.key;this.replyIds.clear();}
   for(const message of raw)if(message instanceof Api.Message)this.rememberReply(action.key,message.id);
   const next=raw.length>=INBOX_PAGE_SIZE?Math.min(...raw.map(m=>m.id)):undefined;
   return {ok:true,type:'messages',key:action.key,messages,next};
  }
  const offset=action.cursor?this.cursors.get(action.cursor):undefined;
  if(action.cursor&&!offset)throw Error('INBOX_CURSOR_EXPIRED');
  if(action.cursor&&this.peers.size>=INBOX_CACHE_LIMIT)throw Error('INBOX_CACHE_LIMIT');
  const result=await client.invoke(new Api.messages.GetDialogs({offsetDate:offset?.offsetDate??0,offsetId:offset?.offsetId??0,offsetPeer:offset?.offsetPeer??new Api.InputPeerEmpty(),limit:INBOX_PAGE_SIZE,hash:returnBigInt(0),excludePinned:Boolean(offset)}));
  if(result instanceof Api.messages.DialogsNotModified)throw Error('INBOX_RESPONSE_INVALID');
  if(!action.cursor)this.reset();else this.cursors.delete(action.cursor);
  const entities=new Map<string,{view:ReturnType<typeof identity>;input:Api.TypeInputPeer}>();
  for(const entity of [...result.users,...result.chats]){
   if(!(entity instanceof Api.User||entity instanceof Api.Chat||entity instanceof Api.Channel))continue;
   const view=identity(entity);let peer:Api.TypeInputPeer;
   if(entity instanceof Api.User){if(entity.self)peer=new Api.InputPeerSelf();else if(entity.accessHash)peer=new Api.InputPeerUser({userId:entity.id,accessHash:entity.accessHash});else continue;}
   else if(entity instanceof Api.Channel){if(!entity.accessHash)continue;peer=new Api.InputPeerChannel({channelId:entity.id,accessHash:entity.accessHash});}
   else peer=new Api.InputPeerChat({chatId:entity.id});
   entities.set(view.peerType+':'+view.id,{view,input:peer});
  }
  const messages=new Map<string,Api.Message|Api.MessageService>();
  for(const message of result.messages)if(message instanceof Api.Message||message instanceof Api.MessageService)messages.set(key(message.peerId)+':'+message.id,message);
  const dialogs:InboxDialog[]=[];
  for(const dialog of result.dialogs){
   if(!(dialog instanceof Api.Dialog))continue;
   const ref=key(dialog.peer),entity=entities.get(ref);if(!entity)continue;
   if(!this.peers.has(ref)&&this.peers.size>=INBOX_CACHE_LIMIT)break;
   this.peers.set(ref,entity.input);const message=messages.get(ref+':'+dialog.topMessage),view=message?messageView(message):undefined;
   dialogs.push({...entity.view,key:ref,unread:dialog.unreadCount,lastAt:view?.at,lastMessageId:dialog.topMessage,preview:view?.text||view?.media||''});
  }
  let next:string|undefined;
  if(result instanceof Api.messages.DialogsSlice&&result.dialogs.length>=INBOX_PAGE_SIZE&&this.peers.size<INBOX_CACHE_LIMIT){
   const last=[...result.dialogs].reverse().find((d):d is Api.Dialog=>d instanceof Api.Dialog&&!d.pinned&&this.peers.has(key(d.peer))&&messages.has(key(d.peer)+':'+d.topMessage));
   if(last){const message=messages.get(key(last.peer)+':'+last.topMessage)!;next=randomUUID();this.cursors.set(next,{offsetDate:message.date,offsetId:last.topMessage,offsetPeer:this.peers.get(key(last.peer))!});}
   else if(!offset&&result.dialogs.every(d=>d instanceof Api.Dialog&&d.pinned)){next=randomUUID();this.cursors.set(next,{offsetDate:0,offsetId:0,offsetPeer:new Api.InputPeerEmpty()});}
  }
  return {ok:true,type:'dialogs',dialogs,next};
 }
}
