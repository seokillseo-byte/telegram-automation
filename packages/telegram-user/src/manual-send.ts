import {sendCapabilities} from './send-capabilities';
import {randomUUID,createHash} from 'node:crypto';
import {generateRandomLong} from 'telegram/Helpers';
import {Api,type TelegramClient} from 'telegram';
import {identity} from './index';
import {classifyError,type Identity} from '../../shared/src/protocol';
import {parseManualAction,sendId,type AttachmentData,type ManualReply,type SendPreview,type ReplyInfo,type SendTarget,type SendCapabilities} from '../../shared/src/manual-send';
import type {InboxReader} from './inbox';
type Draft={preview:SendPreview;peer:Api.TypeInputPeer;attachment?:AttachmentData;replyFingerprint?:string};
function allowed(entity:Api.User|Api.Chat|Api.Channel,hasFile:boolean,photo:boolean){
 const report=sendCapabilities(entity),capability=report[hasFile?(photo?'photo':'document'):'text'];if(capability.state==='blocked')throw Error(capability.code??'SEND_FORBIDDEN');
 return report;
}
function supported(entity:unknown):entity is Api.User|Api.Chat|Api.Channel{return entity instanceof Api.User||entity instanceof Api.Chat||entity instanceof Api.Channel;}
export async function uploadSendAttachment(client:Pick<TelegramClient,'invoke'>,attachment:AttachmentData):Promise<Api.TypeInputMedia>{
 const data=Buffer.from(attachment.bytes),id=generateRandomLong(),chunkSize=512*1024,parts=Math.ceil(data.length/chunkSize),big=data.length>10*1024*1024;
 if(!data.length||data.length!==attachment.size)throw Error('SEND_FILE_SIZE');
 // Avoid GramJS uploadFile's separate unbounded FloodWait sleep/retry loop.
 for(let part=0;part<parts;part++){
  const bytes=data.subarray(part*chunkSize,Math.min(data.length,(part+1)*chunkSize));
  const request=big?new Api.upload.SaveBigFilePart({fileId:id,filePart:part,fileTotalParts:parts,bytes}):new Api.upload.SaveFilePart({fileId:id,filePart:part,bytes});
  if(!await client.invoke(request))throw Error('SEND_UPLOAD_FAILED');
 }
 const file=big?new Api.InputFileBig({id,parts,name:attachment.name}):new Api.InputFile({id,parts,name:attachment.name,md5Checksum:createHash('md5').update(data).digest('hex')});
 return attachment.kind==='photo'?new Api.InputMediaUploadedPhoto({file}):new Api.InputMediaUploadedDocument({file,mimeType:'application/octet-stream',attributes:[new Api.DocumentAttributeFilename({fileName:attachment.name})],forceFile:true});
}
async function checkedReply(client:TelegramClient,peer:Api.TypeInputPeer,id:number,expectedKey:string):Promise<{info:ReplyInfo;fingerprint:string}>{
 const messages=await client.getMessages(peer,{ids:[id]});const message=messages[0];
 if(!(message instanceof Api.Message)||message.id!==id)throw Error('SEND_REPLY_UNAVAILABLE');
 const remoteKey=message.peerId instanceof Api.PeerUser?'user:'+message.peerId.userId:message.peerId instanceof Api.PeerChannel?'channel:'+message.peerId.channelId:'chat:'+message.peerId.chatId;
 if(remoteKey!==expectedKey)throw Error('SEND_REPLY_UNAVAILABLE');
 const media=message.media instanceof Api.MessageMediaPhoto&&message.media.photo instanceof Api.Photo?message.media.photo.id.toString():message.media instanceof Api.MessageMediaDocument&&message.media.document instanceof Api.Document?message.media.document.id.toString():'';
 const fingerprint=createHash('sha256').update(JSON.stringify([message.message,message.editDate??null,message.media?.className??'',media])).digest('hex');
 return {info:{id,text:(message.message??'').slice(0,200),media:message.media&&!(message.media instanceof Api.MessageMediaEmpty)?'Nội dung đính kèm':undefined},fingerprint};
}
export class ManualSender{
 private draft:Draft|undefined;
 private blockedUntil=0;
 reset(){this.draft=undefined;this.blockedUntil=0;}
 noteFailure(error:unknown){const failure=classifyError(error);if(failure.code==='RATE_LIMIT'&&failure.retryAfter)this.blockedUntil=Math.max(this.blockedUntil,Date.now()+failure.retryAfter*1000);return failure;}
 private checkCooldown(){const seconds=Math.ceil((this.blockedUntil-Date.now())/1000);if(seconds>0)throw Error('FLOOD_WAIT_'+seconds);}
 private async recipient(client:TelegramClient,inbox:InboxReader,target:SendTarget){const input=target.kind==='self'?'me':target.kind==='username'?'@'+target.username:inbox.inputPeer(target.key);if(!input)throw Error('INBOX_DIALOG_REQUIRED');const entity=await client.getEntity(input);if(!supported(entity))throw Error('SEND_FORBIDDEN');return entity;}
 async capabilities(client:TelegramClient,inbox:InboxReader,input:unknown):Promise<ManualReply>{this.checkCooldown();const action=parseManualAction(input);if(action.type!=='capabilities')throw Error('INPUT_INVALID');this.draft=undefined;return {ok:true,capabilities:sendCapabilities(await this.recipient(client,inbox,action.target))};}
 async preview(client:TelegramClient,inbox:InboxReader,input:unknown,attachment?:AttachmentData):Promise<ManualReply>{
  this.checkCooldown();const action=parseManualAction(input);if(action.type!=='preview')throw Error('INPUT_INVALID');this.draft=undefined;
  if(Boolean(action.fileId)!==Boolean(attachment)||attachment&&action.fileId!==attachment.id)throw Error('SEND_FILE_EXPIRED');
  const entity=await this.recipient(client,inbox,action.target),capabilities=sendCapabilities(entity);
  const cap=capabilities[attachment?attachment.kind:'text'];if(cap.state==='blocked')return {ok:false,error:classifyError(Error(cap.code??'SEND_FORBIDDEN')),capabilities};
  const peer=await client.getInputEntity(entity),recipient=identity(entity),id=randomUUID();
  let reply:Awaited<ReturnType<typeof checkedReply>>|undefined;
  if(action.replyTo!==undefined){if(action.target.kind!=='dialog'||!inbox.canReply(action.target.key,action.replyTo))throw Error('SEND_REPLY_UNAVAILABLE');reply=await checkedReply(client,peer,action.replyTo,action.target.key);}
  const info=attachment?{id:attachment.id,name:attachment.name,size:attachment.size,kind:attachment.kind}:undefined;
  const preview:SendPreview={id,recipient,text:action.text,attachment:info,reply:reply?.info,capabilities,expiresAt:new Date(Date.now()+5*60*1000).toISOString()};
  this.draft={preview,peer,attachment,replyFingerprint:reply?.fingerprint};return {ok:true,preview,capabilities};
 }
 async confirm(client:TelegramClient,id:string):Promise<ManualReply>{
  sendId(id);const draft=this.draft;if(!draft||draft.preview.id!==id||Date.parse(draft.preview.expiresAt)<Date.now())throw Error('SEND_PREVIEW_EXPIRED');
  this.checkCooldown();this.draft=undefined; // Consume before any await: a second click can never dispatch this preview again.
  let recipient:Identity;let capabilities:SendCapabilities|undefined;
  try{const entity=await client.getEntity(draft.peer);if(!supported(entity))throw Error('SEND_FORBIDDEN');capabilities=sendCapabilities(entity);allowed(entity,Boolean(draft.attachment),draft.attachment?.kind==='photo');recipient=identity(entity);if(draft.preview.reply){const checked=await checkedReply(client,draft.peer,draft.preview.reply.id,recipient.peerType+':'+recipient.id);if(checked.fingerprint!==draft.replyFingerprint)throw Error('SEND_REPLY_CHANGED');}if(recipient.id!==draft.preview.recipient.id||recipient.peerType!==draft.preview.recipient.peerType)throw Error('SEND_PREVIEW_EXPIRED');}catch(error){return {ok:false,error:this.noteFailure(error),capabilities};}
  let dispatched=false;
  try{
   const media=draft.attachment?await uploadSendAttachment(client,draft.attachment):undefined;
   if(media){const fresh=await client.getEntity(draft.peer);if(!supported(fresh))throw Error('SEND_FORBIDDEN');const current=identity(fresh);if(current.id!==recipient.id||current.peerType!==recipient.peerType)throw Error('SEND_PREVIEW_EXPIRED');capabilities=sendCapabilities(fresh);allowed(fresh,true,draft.attachment?.kind==='photo');}
   if(media&&draft.preview.reply){const checked=await checkedReply(client,draft.peer,draft.preview.reply.id,recipient.peerType+':'+recipient.id);if(checked.fingerprint!==draft.replyFingerprint)throw Error('SEND_REPLY_CHANGED');}
   dispatched=true;
   const result=draft.attachment?await client.sendFile(draft.peer,{file:media!,caption:draft.preview.text,forceDocument:draft.attachment.kind==='document',parseMode:false,formattingEntities:[],workers:1,replyTo:draft.preview.reply?.id}):await client.sendMessage(draft.peer,{message:draft.preview.text,parseMode:false,formattingEntities:[],linkPreview:false,replyTo:draft.preview.reply?.id});
   if(!(result instanceof Api.Message)||!result.id)throw Error('SEND_NO_ACK');
   return {ok:true,sent:{id:result.id,recipient,replyTo:draft.preview.reply?.id}};
  }catch(error){const mapped=this.noteFailure(error),rpc=Number((error as {code?:number}).code);const definite=!dispatched||mapped.code==='RATE_LIMIT'||rpc>=400&&rpc<500||['CHAT_WRITE_FORBIDDEN','USER_PRIVACY_RESTRICTED','USER_IS_BLOCKED','YOU_BLOCKED_USER','USER_BANNED_IN_CHANNEL','SEND_FORBIDDEN','PEER_FLOOD','CHAT_SEND_MEDIA_FORBIDDEN','CHAT_SEND_PHOTOS_FORBIDDEN','CHAT_SEND_DOCS_FORBIDDEN','CHAT_SEND_PLAIN_FORBIDDEN','CHANNEL_PRIVATE','SLOWMODE_WAIT'].includes(mapped.code);return {ok:false,error:mapped,uncertain:!definite,capabilities};}
 }
}
