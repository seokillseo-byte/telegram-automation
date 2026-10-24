import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {InboxReader} from '../packages/telegram-user/src/inbox';
import {ManualSender} from '../packages/telegram-user/src/manual-send';
import {parseManualAction,type AttachmentData,type ManualReply} from '../packages/shared/src/manual-send';
import {composeTemplate} from '../packages/shared/src/templates';
const sdk=createRequire(resolve('apps/desktop/package.json'));const {Api}=sdk('telegram');
const user=new Api.User({id:BigInt(9),accessHash:BigInt(11),firstName:'Test'}),peer=new Api.PeerUser({userId:user.id}),inputPeer=new Api.InputPeerUser({userId:user.id,accessHash:user.accessHash});
const action={type:'preview',target:{kind:'dialog',key:'user:9'},text:'Trả lời nguyên văn',replyTo:7};
function id(reply:ManualReply){assert.ok(reply.ok&&reply.preview);return reply.ok?reply.preview!.id:'';}
async function fixture(){
 const reader=new InboxReader();let message=new Api.Message({id:7,peerId:peer,date:1700000000,message:'Tin cần trả lời'}),sends=0,rechecks=0,lastReply:number|undefined;
 const fake={invoke:async(request:{className:string})=>{if(request.className==='messages.GetDialogs')return new Api.messages.Dialogs({dialogs:[new Api.Dialog({peer,topMessage:7,unreadCount:0})],messages:[message],users:[user],chats:[]});if(request.className==='messages.GetHistory')return new Api.messages.Messages({messages:[message,new Api.MessageService({id:8,peerId:peer,date:1700000001})],users:[user],chats:[]});if(request.className.startsWith('upload.'))return true;throw Error('Unexpected method');},getEntity:async()=>user,getInputEntity:async()=>inputPeer,getMessages:async(_peer:unknown,options:{ids:number[]})=>{rechecks++;assert.deepEqual(options.ids,[7]);return [message];},sendMessage:async(_peer:unknown,options:{replyTo?:number})=>{sends++;lastReply=options.replyTo;return new Api.Message({id:20,peerId:peer,date:1700000002,message:'Sent'});},sendFile:async(_peer:unknown,options:{replyTo?:number})=>{sends++;lastReply=options.replyTo;return new Api.Message({id:21,peerId:peer,date:1700000002,message:'Sent media'});}};
 await reader.read(fake as never,{type:'dialogs'});await reader.read(fake as never,{type:'messages',key:'user:9'});
 return {reader,fake,setMessage:(value:typeof message)=>{message=value;},stats:()=>({sends,rechecks,lastReply})};
}

test('reply input accepts only a bounded message ID in a specific loaded dialog',()=>{
 assert.equal(parseManualAction(action).type,'preview');
 for(const value of [0,-1,1.2,2147483648,'7'])assert.throws(()=>parseManualAction({...action,replyTo:value}));
 assert.throws(()=>parseManualAction({...action,target:{kind:'self'}}));assert.throws(()=>parseManualAction({...action,target:{kind:'username',username:'test_user'}}));
});

test('reply preview does not send and confirm binds text reply to its peer and original message ID',async()=>{
 const {reader,fake,stats}=await fixture(),sender=new ManualSender(()=>{});assert.equal(reader.canReply('user:9',7),true);assert.equal(reader.canReply('channel:9',7),false);assert.equal(reader.canReply('user:9',8),false);
 const preview=await sender.preview(fake as never,reader,action);assert.ok(preview.ok&&preview.preview?.reply?.id===7);assert.ok(preview.ok&&preview.preview?.reply?.text==='Tin cần trả lời');assert.equal(stats().sends,0);
 const result=await sender.confirm(fake as never,id(preview));assert.ok(result.ok&&result.sent?.replyTo===7);assert.deepEqual(stats(),{sends:1,rechecks:2,lastReply:7});await assert.rejects(sender.confirm(fake as never,id(preview)),/SEND_PREVIEW_EXPIRED/);
});

test('photo/document replies retain replyTo through upload and recheck before media dispatch',async()=>{
 for(const kind of ['photo','document'] as const){const {reader,fake,stats}=await fixture(),sender=new ManualSender(()=>{});const file:AttachmentData={id:'00000000-0000-4000-8000-000000000001',kind,name:kind==='photo'?'test.png':'test.txt',size:3,bytes:new Uint8Array([1,2,3])};
 const preview=await sender.preview(fake as never,reader,{...action,fileId:file.id},file);const sent=await sender.confirm(fake as never,id(preview));assert.ok(sent.ok&&sent.sent?.replyTo===7);assert.deepEqual(stats(),{sends:1,rechecks:3,lastReply:7});}
});

test('deleted, changed or wrong-peer originals abort before dispatch without falling back to a normal message',async()=>{
 for(const variant of ['deleted','changed','wrong_peer']){const {reader,fake,setMessage,stats}=await fixture(),sender=new ManualSender(()=>{});const preview=await sender.preview(fake as never,reader,action);
 setMessage(variant==='deleted'?new Api.MessageEmpty({id:7}):new Api.Message({id:7,peerId:variant==='wrong_peer'?new Api.PeerChannel({channelId:BigInt(9)}):peer,date:1700000000,message:'Đã thay đổi'}));
 const result=await sender.confirm(fake as never,id(preview));assert.ok(!result.ok&&!result.uncertain);if(!result.ok)assert.equal(result.error.code,variant==='changed'?'SEND_REPLY_CHANGED':'SEND_REPLY_UNAVAILABLE');assert.equal(stats().sends,0);}
 const {reader,fake,stats}=await fixture(),sender=new ManualSender(()=>{});reader.update(new Api.UpdateDeleteMessages({messages:[7],pts:1,ptsCount:1}));assert.equal(reader.canReply('user:9',7),false);await assert.rejects(sender.preview(fake as never,reader,action),/SEND_REPLY_UNAVAILABLE/);assert.equal(stats().sends,0);
});

test('composer template expansion requires all values, preserves literals and rejects text/caption overflow',()=>{
 const body='Chào {{ten}}: {{san_pham}}';assert.throws(()=>composeTemplate(body,{ten:' '}),/TEMPLATE_VALUES_REQUIRED/);
 assert.equal(composeTemplate(body,{ten:'$& <script>',san_pham:'{{ten}}'}),'Chào $& <script>: {{ten}}');
 assert.throws(()=>composeTemplate('{{san_pham}}',{san_pham:'x'.repeat(4097)}),/TEMPLATE_CONTENT_TOO_LONG/);assert.throws(()=>composeTemplate('{{san_pham}}',{san_pham:'x'.repeat(1025)},1024),/TEMPLATE_CONTENT_TOO_LONG/);
 assert.equal(composeTemplate('Nội dung không có biến',{}),'Nội dung không có biến');assert.equal(body,'Chào {{ten}}: {{san_pham}}');
});

test('real SDK text request carries InputReplyToMessage with the selected ID',async()=>{
 const sendMessage=sdk('telegram/client/messages').sendMessage;let sends=0;
 const fake={getInputEntity:async()=>inputPeer,buildReplyMarkup:()=>undefined,invoke:async(request:{className:string;replyTo:{replyToMsgId:number};getBytes:()=>Buffer})=>{assert.equal(request.className,'messages.SendMessage');assert.equal(request.replyTo.replyToMsgId,7);assert.ok(request.getBytes().length>0);sends++;return new Api.UpdatesTooLong();},_getResponseMessage:()=>new Api.Message({id:22,date:1700000000,message:'Reply'})};
 const message=await sendMessage(fake,inputPeer,{message:'Reply',replyTo:7,parseMode:false,formattingEntities:[]});assert.equal(message.id,22);assert.equal(sends,1);
});
