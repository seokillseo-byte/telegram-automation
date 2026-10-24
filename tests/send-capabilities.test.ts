import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {sendCapabilities} from '../packages/telegram-user/src/send-capabilities';
import {ManualSender} from '../packages/telegram-user/src/manual-send';
import {InboxReader} from '../packages/telegram-user/src/inbox';
import {parseManualAction,sendErrorHelp,sendTargetKey,type AttachmentData} from '../packages/shared/src/manual-send';
import {classifyError} from '../packages/shared/src/protocol';
const sdk=createRequire(resolve('apps/desktop/package.json'));const {Api,errors}=sdk('telegram');
const channel=(extra:Record<string,unknown>={})=>new Api.Channel({id:BigInt(12),accessHash:BigInt(55),title:'Nhóm thử',megagroup:true,...extra});
const ban=(extra:Record<string,unknown>)=>new Api.ChatBannedRights({untilDate:0,...extra});

test('private privacy remains unknown while Saved Messages, deleted users and read-only channels are distinguished',()=>{
 const user=new Api.User({id:BigInt(1),firstName:'Test'});assert.equal(sendCapabilities(user).text.state,'unknown');user.self=true;assert.equal(sendCapabilities(user).text.state,'allowed');user.deleted=true;assert.equal(sendCapabilities(user).photo.state,'blocked');
 assert.equal(sendCapabilities(channel({broadcast:true,megagroup:false})).document.state,'blocked');assert.equal(sendCapabilities(channel({broadcast:true,adminRights:new Api.ChatAdminRights({postMessages:true})})).text.state,'allowed');
 assert.equal(sendCapabilities(channel({min:true,broadcast:true})).text.state,'unknown');assert.equal(sendCapabilities(channel({left:true,joinToSend:true})).text.code,'SEND_JOIN_REQUIRED');
});

test('granular restrictions combine current personal and default flags; expiry and admin exemption are respected',()=>{
 const now=1700000000000;const group=channel({bannedRights:ban({sendPhotos:true}),defaultBannedRights:ban({sendPlain:true})});let result=sendCapabilities(group,now);assert.equal(result.photo.state,'blocked');assert.equal(result.text.state,'blocked');assert.equal(result.document.state,'allowed');
 group.bannedRights=new Api.ChatBannedRights({untilDate:1699999999,sendPhotos:true});result=sendCapabilities(group,now);assert.equal(result.photo.state,'allowed');
 group.adminRights=new Api.ChatAdminRights({changeInfo:true});result=sendCapabilities(group,now);assert.equal(result.text.state,'allowed');
 group.bannedRights=ban({sendMedia:true});result=sendCapabilities(group,now);assert.equal(result.photo.state,'blocked');assert.equal(result.document.state,'blocked');
 assert.equal(sendCapabilities(channel({bannedRights:ban({viewMessages:true})})).text.state,'blocked');
 const basic=new Api.Chat({id:BigInt(2),title:'Basic',defaultBannedRights:ban({sendDocs:true})});assert.equal(sendCapabilities(basic).document.state,'blocked');assert.equal(sendCapabilities(basic).text.state,'allowed');
});

test('capability probe is read-only, validates a single target and never uploads or sends',async()=>{
 let reads=0,sends=0;const sender=new ManualSender(()=>{}),client={getEntity:async()=>{reads++;return channel({defaultBannedRights:ban({sendPlain:true})});},sendMessage:async()=>{sends++;}};
 const reply=await sender.capabilities(client as never,new InboxReader(),{type:'capabilities',target:{kind:'username',username:'@test_group'}});assert.ok(reply.ok&&reply.capabilities?.text.state==='blocked');assert.equal(reads,1);assert.equal(sends,0);
 assert.throws(()=>parseManualAction({type:'capabilities',target:{kind:'username',username:'a,b'}}));assert.throws(()=>parseManualAction({type:'capabilities',target:{kind:'self'},path:'C:/secret'}));assert.equal(sendTargetKey({kind:'username',username:'@Test_Group'}),'username:test_group');
});

test('permission revoked during upload prevents media dispatch and returns fresh capabilities',async()=>{
 const sender=new ManualSender(()=>{}),entity=channel();let deny=false,sends=0;
 const client={getEntity:async()=>{entity.defaultBannedRights=deny?ban({sendDocs:true}):undefined;return entity;},getInputEntity:async()=>new Api.InputPeerChannel({channelId:entity.id,accessHash:entity.accessHash}),invoke:async()=>{deny=true;return true;},sendFile:async()=>{sends++;}};
 const file:AttachmentData={id:'00000000-0000-4000-8000-000000000001',kind:'document',name:'a.txt',size:1,bytes:new Uint8Array([1])};
 const preview=await sender.preview(client as never,new InboxReader(),{type:'preview',target:{kind:'username',username:'test_group'},text:'',fileId:file.id},file);assert.ok(preview.ok&&preview.preview);const result=await sender.confirm(client as never,preview.ok?preview.preview!.id:'');assert.ok(!result.ok&&!result.uncertain&&result.capabilities?.document.state==='blocked');assert.equal(sends,0);
});

test('FloodWait blocks subsequent manual checks/previews in the worker without another API request',async()=>{
 const sender=new ManualSender(()=>{});let reads=0;const client={getEntity:async()=>{reads++;return new Api.User({id:BigInt(1),firstName:'Self',self:true});}};
 sender.noteFailure(new errors.FloodWaitError({capture:30}));await assert.rejects(sender.capabilities(client as never,new InboxReader(),{type:'capabilities',target:{kind:'self'}}),/FLOOD_WAIT_/);await assert.rejects(sender.preview(client as never,new InboxReader(),{type:'preview',target:{kind:'self'},text:'Hello'}),/FLOOD_WAIT_/);assert.equal(reads,0);
});

test('send error codes are safe and give concrete recovery instructions without unknown server payloads',()=>{
 for(const code of ['CHAT_SEND_PHOTOS_FORBIDDEN','USER_RESTRICTED','MEDIA_INVALID','TOPIC_CLOSED','ALLOW_PAYMENT_REQUIRED_500']){const error=classifyError(Error(code));assert.notEqual(error.code,'TELEGRAM_ERROR');assert.ok(error.message.length>10);assert.ok(sendErrorHelp(error.code).length>20);}
 const unknown=classifyError(Error('private payload phone token should not escape'));assert.ok(!unknown.message.includes('payload'));assert.equal(unknown.code,'TELEGRAM_ERROR');assert.match(sendErrorHelp('RATE_LIMIT'),/không tự gửi lại/);
});
