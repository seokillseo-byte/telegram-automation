import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {mkdtemp,writeFile,rm,truncate} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {ManualSender,uploadSendAttachment} from '../packages/telegram-user/src/manual-send';
import {InboxReader} from '../packages/telegram-user/src/inbox';
import {readSendAttachment} from '../apps/desktop/src/main/send-attachment';
import {parseManualAction,DOCUMENT_MAX,type ManualReply,type AttachmentData} from '../packages/shared/src/manual-send';
const sdk=createRequire(resolve('apps/desktop/package.json'));const {Api,errors}=sdk('telegram');
const user=new Api.User({id:BigInt('9007199254740993'),firstName:'Người nhận thử',username:'test_recipient',accessHash:BigInt(55)}),peer=new Api.InputPeerUser({userId:user.id,accessHash:user.accessHash});
function fixture(){const calls:string[]=[];let entity=user;const fake={invoke:async(request:{className:string;getBytes:()=>Buffer})=>{calls.push(request.className);assert.ok(request.getBytes().length>0);return true;},getEntity:async(target:unknown)=>{calls.push('resolve');assert.ok(target==='@test_recipient'||target==='me'||target===peer);return entity;},getInputEntity:async()=>peer,sendMessage:async(_target:unknown,options:{message:string;parseMode:boolean;formattingEntities:unknown[];linkPreview:boolean})=>{calls.push('sendMessage');assert.equal(options.parseMode,false);assert.deepEqual(options.formattingEntities,[]);assert.equal(options.linkPreview,false);return new Api.Message({id:7,date:1700000000,message:options.message});},sendFile:async(_target:unknown,options:{file:{className:string;file:{name:string}};forceDocument:boolean;parseMode:boolean;formattingEntities:unknown[]})=>{calls.push('sendFile');assert.ok(['InputMediaUploadedPhoto','InputMediaUploadedDocument'].includes(options.file.className));assert.ok(options.file.file.name.length>0);assert.equal(options.parseMode,false);assert.deepEqual(options.formattingEntities,[]);return new Api.Message({id:8,date:1700000000,message:'caption'});}};return {fake,calls,setEntity:(value:typeof user)=>{entity=value;}};}
function previewId(reply:ManualReply):string{assert.ok(reply.ok&&reply.preview);return reply.ok?reply.preview!.id:'';}
const input={type:'preview',target:{kind:'username',username:'@test_recipient'},text:'Text **nguyên văn** <script>'};

test('manual send accepts a single explicit target and rejects paths, batches, empty content and overlong captions',()=>{
 for(const value of [{type:'sendAll',targets:['a','b']},{type:'preview',target:{kind:'username',username:'a,b'},text:'x'},{...input,path:'C:/secret.txt'},{...input,text:' '},{...input,target:{kind:'dialog',key:'../secret'}},{type:'pickFile',kind:'url'},{type:'confirm',id:'reuse-anything'}])assert.throws(()=>parseManualAction(value));
 assert.equal(parseManualAction(input).type,'preview');assert.throws(()=>parseManualAction({...input,text:'x'.repeat(1025),fileId:'00000000-0000-4000-8000-000000000001'}));
});

test('preview does not send; confirm pins immutable peer/content and consumes token before await',async()=>{
 const sender=new ManualSender(()=>{}),{fake,calls}=fixture();const id=previewId(await sender.preview(fake as never,new InboxReader(),input));assert.deepEqual(calls,['resolve']);
 const one=sender.confirm(fake as never,id);await assert.rejects(sender.confirm(fake as never,id),/SEND_PREVIEW_EXPIRED/);const reply=await one;assert.ok(reply.ok&&reply.sent?.id===7);assert.equal(calls.filter(c=>c==='sendMessage').length,1);
 await assert.rejects(sender.confirm(fake as never,id),/SEND_PREVIEW_EXPIRED/);sender.reset();await assert.rejects(sender.confirm(fake as never,id),/SEND_PREVIEW_EXPIRED/);
});

test('permissions are checked again at confirm and username changes cannot redirect an existing preview',async()=>{
 const sender=new ManualSender(()=>{}),{fake,calls,setEntity}=fixture();const id=previewId(await sender.preview(fake as never,new InboxReader(),input));setEntity(new Api.User({id:BigInt(999),firstName:'Changed',accessHash:BigInt(4)}));const reply=await sender.confirm(fake as never,id);assert.ok(!reply.ok&&reply.error.code==='SEND_PREVIEW_EXPIRED');assert.ok(!calls.includes('sendMessage'));
 const channel=new Api.Channel({id:BigInt(123),title:'Read only',broadcast:true,accessHash:BigInt(4)});const denied={...fake,getEntity:async()=>channel};const blocked=await sender.preview(denied as never,new InboxReader(),input);assert.ok(!blocked.ok&&blocked.error.code==='CHAT_WRITE_FORBIDDEN'&&blocked.capabilities?.text.state==='blocked');assert.ok(!calls.includes('sendMessage'));
});

test('photo and document dispatch one immutable buffer with explicit media mode',async()=>{
 for(const kind of ['photo','document'] as const){const sender=new ManualSender(()=>{}),{fake,calls}=fixture();const attachment:AttachmentData={id:'00000000-0000-4000-8000-000000000001',name:kind==='photo'?'image.png':'test.txt',kind,size:3,bytes:new Uint8Array([1,2,3])};let actualMode:boolean|undefined;const sendFile=fake.sendFile;fake.sendFile=async(target,options)=>{actualMode=options.forceDocument;return sendFile(target,options);};const id=previewId(await sender.preview(fake as never,new InboxReader(),{...input,text:'caption',fileId:attachment.id},attachment));assert.ok(!calls.includes('sendFile'));const reply=await sender.confirm(fake as never,id);assert.ok(reply.ok&&reply.sent?.id===8);assert.equal(actualMode,kind==='document');assert.equal(calls.filter(c=>c==='sendFile').length,1);}
});

test('FloodWait and permission failures stop without retry; lost acknowledgments stay uncertain and token cannot be retried',async()=>{
 for(const error of [new errors.FloodWaitError({capture:30}),Error('CHAT_WRITE_FORBIDDEN'),Error('TIMEOUT')]){const sender=new ManualSender(()=>{}),{fake}=fixture();let sends=0;fake.sendMessage=async()=>{sends++;throw error;};const id=previewId(await sender.preview(fake as never,new InboxReader(),input));const reply=await sender.confirm(fake as never,id);assert.ok(!reply.ok);if(!reply.ok){assert.equal(Boolean(reply.uncertain),error.message==='TIMEOUT');if(reply.error.code==='RATE_LIMIT')assert.equal(reply.error.retryAfter,30);}assert.equal(sends,1);await assert.rejects(sender.confirm(fake as never,id),/SEND_PREVIEW_EXPIRED/);}
 const sender=new ManualSender(()=>{}),{fake}=fixture();fake.sendMessage=async()=>undefined as never;const id=previewId(await sender.preview(fake as never,new InboxReader(),input));const reply=await sender.confirm(fake as never,id);assert.ok(!reply.ok&&reply.uncertain);
});

test('native file loader snapshots only regular bounded files, verifies photo signature, and never returns a path',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'manual-attachment-'));try{
  const path=join(directory,'test.txt');await writeFile(path,'nội dung');const file=await readSendAttachment(path,'document');assert.equal(file.name,'test.txt');assert.ok(!('path' in file));assert.equal(Buffer.from(file.bytes).toString(),'nội dung');await writeFile(path,'changed');assert.equal(Buffer.from(file.bytes).toString(),'nội dung');
  await assert.rejects(readSendAttachment(directory,'document'));await assert.rejects(readSendAttachment(path,'photo'),/SEND_PHOTO_FORMAT/);
  const png=join(directory,'test.png');await writeFile(png,Buffer.from([137,80,78,71,13,10,26,10]));assert.equal((await readSendAttachment(png,'photo')).kind,'photo');
  await writeFile(path,'');await assert.rejects(readSendAttachment(path,'document'),/SEND_FILE_SIZE/);await truncate(path,DOCUMENT_MAX+1);await assert.rejects(readSendAttachment(path,'document'),/SEND_FILE_SIZE/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('chunk upload stops immediately on FloodWait and never dispatches media after failed upload',async()=>{
 const file:AttachmentData={id:'00000000-0000-4000-8000-000000000001',name:'test.txt',size:600000,kind:'document',bytes:new Uint8Array(600000)};
 let uploads=0;const fake={invoke:async()=>{uploads++;throw new errors.FloodWaitError({capture:120});}};
 await assert.rejects(uploadSendAttachment(fake as never,file));assert.equal(uploads,1);
 const sender=new ManualSender(()=>{}),fixtureClient=fixture();fixtureClient.fake.invoke=fake.invoke;const id=previewId(await sender.preview(fixtureClient.fake as never,new InboxReader(),{...input,text:'caption',fileId:file.id},file));const reply=await sender.confirm(fixtureClient.fake as never,id);assert.ok(!reply.ok&&!reply.uncertain&&reply.error.retryAfter===120);assert.ok(!fixtureClient.calls.includes('sendFile'));assert.equal(uploads,2);
});

test('real SDK sendFile consumes preuploaded media without entering SDK upload/retry code',async()=>{
 const sdkSendFile=sdk('telegram/client/uploads').sendFile;
 for(const kind of ['photo','document'] as const){let dispatches=0;const handle=new Api.InputFile({id:BigInt(42),parts:1,name:'test.png',md5Checksum:''});const media=kind==='photo'?new Api.InputMediaUploadedPhoto({file:handle}):new Api.InputMediaUploadedDocument({file:handle,mimeType:'application/octet-stream',attributes:[new Api.DocumentAttributeFilename({fileName:'test.png'})],forceFile:true});
  const fake={getInputEntity:async()=>peer,buildReplyMarkup:()=>undefined,invoke:async(request:{className:string;randomId:unknown;media:unknown;replyTo:{replyToMsgId:number};getBytes:()=>Buffer})=>{assert.equal(request.className,'messages.SendMedia');assert.equal(request.media,media);assert.equal(request.replyTo.replyToMsgId,7);assert.ok(request.randomId);assert.ok(request.getBytes().length>0);dispatches++;return new Api.UpdatesTooLong();},_getResponseMessage:()=>new Api.Message({id:9,date:1700000000,message:'caption'})};
  const reply=await sdkSendFile(fake,peer,{file:media,caption:'caption',forceDocument:kind==='document',formattingEntities:[],parseMode:false,replyTo:7});assert.equal(reply.id,9);assert.equal(dispatches,1);
 }
});

test('preview expiration and reset prevent sending, and permissions revoked after preview are enforced',async()=>{
 const sender=new ManualSender(()=>{}),{fake,calls}=fixture();const id=previewId(await sender.preview(fake as never,new InboxReader(),input));const original=Date.now;
 try{const later=original()+301000;Date.now=()=>later;await assert.rejects(sender.confirm(fake as never,id),/SEND_PREVIEW_EXPIRED/);}finally{Date.now=original;}
 assert.ok(!calls.includes('sendMessage'));sender.reset();await assert.rejects(sender.confirm(fake as never,id),/SEND_PREVIEW_EXPIRED/);
 let allowed=true;const channel=new Api.Channel({id:BigInt(1),accessHash:BigInt(2),title:'Kênh thử',broadcast:true,creator:true});const client={...fake,getEntity:async()=>{channel.creator=allowed;return channel;}};
 const channelPreview=previewId(await sender.preview(client as never,new InboxReader(),input));allowed=false;const result=await sender.confirm(client as never,channelPreview);assert.ok(!result.ok&&result.error.code==='CHAT_WRITE_FORBIDDEN');assert.ok(!calls.includes('sendMessage'));
});
