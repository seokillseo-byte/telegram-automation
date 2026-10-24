import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {InboxReader} from '../packages/telegram-user/src/inbox';
import {subscribeInboxUpdates} from '../packages/telegram-user/src/inbox-updates';
import {EMPTY_INBOX,applyInboxUpdate,filterInboxDialogs,type InboxView,type InboxUpdate} from '../packages/shared/src/inbox';
const sdk=createRequire(resolve('apps/desktop/package.json'));const {Api}=sdk('telegram');const {UpdateConnectionState}=sdk('telegram/network');
const user=new Api.User({id:BigInt(10),accessHash:BigInt(777),firstName:'Đối tác',username:'partner_test'}),peer=new Api.PeerUser({userId:user.id});
const channel=new Api.Channel({id:BigInt(10),accessHash:BigInt(888),title:'Nhóm thử',megagroup:true}),channelPeer=new Api.PeerChannel({channelId:channel.id});
async function reader(){const result=new InboxReader();await result.read({invoke:async()=>new Api.messages.Dialogs({users:[user],chats:[channel],dialogs:[new Api.Dialog({peer,topMessage:5,unreadCount:1}),new Api.Dialog({peer:channelPeer,topMessage:5,unreadCount:0})],messages:[new Api.Message({id:5,peerId:peer,date:1700000000,message:'Cũ'}),new Api.Message({id:5,peerId:channelPeer,date:1700000000,message:'Kênh'})]})} as never,{type:'dialogs'});return result;}
function state():InboxView{return {...EMPTY_INBOX,loaded:true,messagesLoaded:true,selectedKey:'user:10',dialogs:[{id:'10',key:'user:10',name:'Đối tác',username:'partner_test',kind:'user',unread:1,preview:'Cũ',lastMessageId:5},{id:'10',key:'channel:10',name:'Nhóm thử',kind:'group',unread:0,preview:'Kênh',lastMessageId:5}],messages:[{id:5,text:'Cũ',outgoing:false,kind:'text'}]};}

test('live updates add once, edit in place, preserve snapshot unread count, and filter @username',async()=>{
 const source=await reader();const raw=new Api.UpdateNewMessage({message:new Api.Message({id:6,peerId:peer,date:1700000001,message:'Mới <script>',out:false}),pts:1,ptsCount:1});
 const update=source.update(raw)!;assert.equal(update.type,'message');assert.ok(!JSON.stringify(update).includes('accessHash'));let next=applyInboxUpdate(state(),update);next=applyInboxUpdate(next,update);assert.deepEqual(next.messages.map(m=>m.id),[6,5]);assert.equal(next.dialogs[0].unread,1);assert.equal(next.dialogs[0].preview,'Mới <script>');assert.equal(next.changedKeys.length,1);
 const edit=source.update(new Api.UpdateEditMessage({message:new Api.Message({id:6,peerId:peer,date:1700000001,message:'Đã sửa'}),pts:2,ptsCount:1}))!;next=applyInboxUpdate(next,edit);assert.equal(next.messages[0].text,'Đã sửa');assert.equal(next.dialogs[0].preview,'Đã sửa');
 assert.equal(filterInboxDialogs(next.dialogs,' @PARTNER_test ').length,1);assert.equal(filterInboxDialogs(next.dialogs,'không có').length,0);
});

test('short updates normalize private and group peers; unknown peers never expose message contents',async()=>{
 const source=await reader();const known=source.update(new Api.UpdateShortMessage({id:6,userId:user.id,date:1700000001,message:'Hi',pts:1,ptsCount:1,out:true}));assert.ok(known?.type==='message'&&known.key==='user:10'&&known.message.outgoing);
 const unknown=source.update(new Api.UpdateShortChatMessage({id:8,chatId:BigInt(99),fromId:BigInt(123),date:1700000001,message:'secret outside loaded scope',pts:2,ptsCount:1}));assert.deepEqual(unknown,{type:'changed'});assert.ok(!JSON.stringify(unknown).includes('secret'));assert.equal(applyInboxUpdate(state(),unknown!).unloadedChanged,true);
 source.reset();assert.deepEqual(source.update(new Api.UpdateShortMessage({id:6,userId:user.id,date:1700000001,message:'No cache',pts:1,ptsCount:1})),{type:'changed'});
});

test('deletions respect channel namespace and edits outside cached window do not inject older history',async()=>{
 const source=await reader();const deleted=source.update(new Api.UpdateDeleteChannelMessages({channelId:channel.id,messages:[5],pts:1,ptsCount:1}))!;
 let next=applyInboxUpdate(state(),deleted);assert.equal(next.messages.length,1);assert.equal(next.dialogs[0].preview,'Cũ');assert.match(next.dialogs[1].preview,/thay đổi/);
 next=applyInboxUpdate(next,source.update(new Api.UpdateDeleteMessages({messages:[5],pts:1,ptsCount:1}))!);assert.equal(next.messages.length,0);
 const old=source.update(new Api.UpdateEditMessage({message:new Api.Message({id:1,peerId:peer,date:1600000000,message:'Cũ ngoài mẫu'}),pts:2,ptsCount:1}))!;assert.equal(applyInboxUpdate(state(),old).messages.length,1);
});

test('updates replayed after an in-flight snapshot keep edits, deletions and latest messages without duplicates',async()=>{
 const source=await reader();const changes=[source.update(new Api.UpdateNewMessage({message:new Api.Message({id:6,peerId:peer,date:1700000001,message:'Mới'}),pts:1,ptsCount:1}))!,source.update(new Api.UpdateEditMessage({message:new Api.Message({id:6,peerId:peer,date:1700000001,message:'Mới sửa'}),pts:2,ptsCount:1}))!,source.update(new Api.UpdateDeleteMessages({messages:[5],pts:3,ptsCount:1}))!];
 const response={...state(),messages:[...state().messages,{id:6,text:'Snapshot trước sửa',outgoing:false,kind:'text' as const}]};const next=changes.reduce(applyInboxUpdate,response);assert.equal(next.messages.length,1);assert.equal(next.messages[0].text,'Mới sửa');
});

test('pts gaps and too-long notifications request bounded resync; sequential channel pts stay independent',async()=>{
 const source=await reader();const message=(id:number,p=peer)=>new Api.Message({id,peerId:p,date:1700000000+id,message:'M'+id});
 assert.equal(source.update(new Api.UpdateNewMessage({message:message(6),pts:10,ptsCount:1}))?.type,'message');assert.deepEqual(source.update(new Api.UpdateNewMessage({message:message(7),pts:13,ptsCount:1})),{type:'resync'});
 assert.equal(source.update(new Api.UpdateNewChannelMessage({message:message(8,channelPeer),pts:100,ptsCount:1}))?.type,'message');assert.equal(source.update(new Api.UpdateNewChannelMessage({message:message(9,channelPeer),pts:101,ptsCount:1}))?.type,'message');
 assert.deepEqual(source.update(new Api.UpdatesTooLong()),{type:'resync'});assert.equal(applyInboxUpdate(state(),{type:'resync'}).needsRefresh,true);
});

test('live handler subscribes once, reports transport status, makes no API requests and detaches after logout',async()=>{
 const source=await reader(),published:InboxUpdate[]=[];let callback:((raw:unknown)=>void)|undefined,registeredEvent:unknown,removed=false;
 const fake={addEventHandler:(handler:(raw:unknown)=>void,event:unknown)=>{assert.equal(callback,undefined);callback=handler;registeredEvent=event;},removeEventHandler:(handler:unknown,event:unknown)=>{assert.equal(handler,callback);assert.equal(event,registeredEvent);removed=true;}};
 const off=subscribeInboxUpdates(fake as never,source,value=>published.push(value));callback!(new UpdateConnectionState(UpdateConnectionState.disconnected));callback!(new UpdateConnectionState(UpdateConnectionState.connected));callback!(new Api.UpdateShortMessage({id:6,userId:user.id,date:1700000001,message:'Hi',pts:1,ptsCount:1}));assert.deepEqual(published.slice(0,2),[{type:'connection',connected:false},{type:'connection',connected:true}]);assert.equal(published[2].type,'message');off();assert.equal(removed,true);callback!(new Api.UpdatesTooLong());assert.equal(published.length,3);
});
