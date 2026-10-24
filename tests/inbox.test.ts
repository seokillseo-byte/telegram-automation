import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {InboxReader} from '../packages/telegram-user/src/inbox';
import {parseInboxAction,mergeInboxMessages,type InboxMessage} from '../packages/shared/src/inbox';
import {classifyError} from '../packages/shared/src/protocol';
const sdk=createRequire(resolve('apps/desktop/package.json'));const {Api,errors}=sdk('telegram');
const user=new Api.User({id:BigInt('9007199254740993'),firstName:'Người thử',accessHash:BigInt(777)});
const peer=new Api.PeerUser({userId:user.id});
function dialogSlice(count=30,pinned=false){
 const users=Array.from({length:count},(_,i)=>new Api.User({id:BigInt(i+1),firstName:'Hội thoại '+i,accessHash:BigInt(i+10)}));
 return new Api.messages.DialogsSlice({count:count+1,users,chats:[],dialogs:users.map((u,i)=>new Api.Dialog({peer:new Api.PeerUser({userId:u.id}),topMessage:100+i,unreadCount:2,pinned})),messages:users.map((u,i)=>new Api.Message({id:100+i,peerId:new Api.PeerUser({userId:u.id}),date:1700000000-i,message:'Nội dung '+i}))});
}
function withUser(){return new Api.messages.Dialogs({dialogs:[new Api.Dialog({peer,topMessage:100,unreadCount:3})],messages:[new Api.Message({id:100,peerId:peer,date:1700000000,message:'Chào bạn'})],users:[user],chats:[]});}

test('inbox IPC accepts bounded read actions only; message merge deduplicates within peer and caps memory',()=>{
 for(const action of [{type:'send',text:'hello'},{type:'messages',key:'../file'},{type:'messages',key:'user:1',before:0},{type:'messages',key:'user:1',before:1.5},{type:'dialogs',cursor:'rawPeer'},{type:'dialogs',token:'secret'}])assert.throws(()=>parseInboxAction(action));
 assert.deepEqual(parseInboxAction({type:'messages',key:'channel:9007199254740993',before:99}),{type:'messages',key:'channel:9007199254740993',before:99});
 const item=(id:number,text='old'):InboxMessage=>({id,text,outgoing:false,kind:'text'});
 const merged=mergeInboxMessages([item(5),item(3)],[item(5,'updated'),item(1)]);assert.deepEqual(merged.map(m=>m.id),[5,3,1]);assert.equal(merged[0].text,'updated');assert.equal(mergeInboxMessages([],Array.from({length:400},(_,i)=>item(i+1))).length,300);
});

test('dialog reader uses real serializable read requests with opaque cursors and keeps access hashes in worker',async()=>{
 const reader=new InboxReader();let calls=0;const requestKinds:string[]=[];
 const fake={invoke:async(request:InstanceType<typeof Api.messages.GetDialogs>)=>{calls++;requestKinds.push(request.className);assert.equal(request.limit,30);assert.ok(request.getBytes().length>0);if(calls===1){assert.equal(request.offsetId,0);return dialogSlice();}assert.equal(request.excludePinned,true);assert.equal(request.offsetId,129);assert.equal(request.offsetPeer.userId.toString(),'30');return new Api.messages.Dialogs({dialogs:[],messages:[],users:[],chats:[]});}};
 const first=await reader.read(fake as never,{type:'dialogs'});assert.ok(first.ok&&first.type==='dialogs');if(!first.ok||first.type!=='dialogs')return;
 assert.equal(first.dialogs.length,30);assert.ok(first.next);assert.equal(first.dialogs[0].unread,2);assert.ok(!JSON.stringify(first).includes('accessHash'));assert.ok(!JSON.stringify(first).includes('inputEntity'));
 const second=await reader.read(fake as never,{type:'dialogs',cursor:first.next});assert.ok(second.ok&&second.type==='dialogs'&&!second.next);await assert.rejects(reader.read(fake as never,{type:'dialogs',cursor:first.next}),/INBOX_CURSOR_EXPIRED/);assert.equal(calls,2);assert.deepEqual(requestKinds,['messages.GetDialogs','messages.GetDialogs']);
});

test('history is bounded, handles text/media/service and missing entries, paginates by message ID without marking read',async()=>{
 const reader=new InboxReader();const calls:string[]=[];
 const fake={invoke:async(request:{className:string;limit:number;offsetId:number;getBytes:()=>Buffer})=>{calls.push(request.className);assert.ok(request.getBytes().length>0);if(request.className==='messages.GetDialogs')return withUser();assert.equal(request.className,'messages.GetHistory');assert.equal(request.limit,30);
  if(request.offsetId)return new Api.messages.Messages({messages:[new Api.Message({id:69,peerId:peer,date:1699999999,message:'Tin cũ'})],users:[],chats:[]});
  return new Api.messages.Messages({messages:Array.from({length:30},(_,i)=>i===0?new Api.MessageService({id:100,peerId:peer,date:1700000000}):i===1?new Api.MessageEmpty({id:99}):new Api.Message({id:100-i,peerId:peer,date:1700000000-i,message:i===2?'Ảnh chú thích':'Văn bản <script>',out:i===2,media:i===2?new Api.MessageMediaPhoto():undefined})),users:[],chats:[]});}};
 await assert.rejects(reader.read(fake as never,{type:'messages',key:'user:999'}),/INBOX_DIALOG_REQUIRED/);assert.equal(calls.length,0);
 await reader.read(fake as never,{type:'dialogs'});const result=await reader.read(fake as never,{type:'messages',key:'user:'+user.id});assert.ok(result.ok&&result.type==='messages');if(!result.ok||result.type!=='messages')return;
 assert.equal(result.messages.length,29);assert.equal(result.next,71);assert.equal(result.messages[0].kind,'service');assert.equal(result.messages[1].media,'Ảnh');assert.equal(result.messages[1].outgoing,true);assert.equal(result.messages[1].text,'Ảnh chú thích');assert.ok(!JSON.stringify(result).includes('accessHash'));
 const older=await reader.read(fake as never,{type:'messages',key:'user:'+user.id,before:result.next});assert.ok(older.ok&&older.type==='messages'&&!older.next);assert.deepEqual(calls,['messages.GetDialogs','messages.GetHistory','messages.GetHistory']);
 reader.reset();await assert.rejects(reader.read(fake as never,{type:'messages',key:'user:'+user.id}),/INBOX_DIALOG_REQUIRED/);
});

test('peer namespaces prevent message preview collisions and preserve large IDs',async()=>{
 const reader=new InboxReader();const channel=new Api.Channel({id:user.id,accessHash:BigInt(888),title:'Kênh thử',broadcast:true});const channelPeer=new Api.PeerChannel({channelId:user.id});
 const fake={invoke:async()=>new Api.messages.Dialogs({dialogs:[new Api.Dialog({peer,topMessage:7,unreadCount:0}),new Api.Dialog({peer:channelPeer,topMessage:7,unreadCount:0})],users:[user],chats:[channel],messages:[new Api.Message({id:7,peerId:peer,date:1700000000,message:'Cá nhân'}),new Api.Message({id:7,peerId:channelPeer,date:1700000000,message:'Kênh'})]})};
 const result=await reader.read(fake as never,{type:'dialogs'});assert.ok(result.ok&&result.type==='dialogs');if(!result.ok||result.type!=='dialogs')return;assert.deepEqual(result.dialogs.map(d=>d.key),['user:9007199254740993','channel:9007199254740993']);assert.deepEqual(result.dialogs.map(d=>d.preview),['Cá nhân','Kênh']);
});

test('failed refresh keeps current peers; permission errors and FloodWait do not cause extra requests or expose raw data',async()=>{
 const reader=new InboxReader();await reader.read({invoke:async()=>withUser()} as never,{type:'dialogs'});
 let calls=0;const flood=new errors.FloodWaitError({capture:45});const fake={invoke:async()=>{calls++;throw flood;}};
 await assert.rejects(reader.read(fake as never,{type:'dialogs'}),error=>error===flood);assert.equal(calls,1);assert.equal(classifyError(flood).retryAfter,45);
 const denied={invoke:async()=>{calls++;throw Error('CHANNEL_PRIVATE');}};
 await assert.rejects(reader.read(denied as never,{type:'messages',key:'user:'+user.id}),/CHANNEL_PRIVATE/);assert.equal(calls,2);
 assert.equal(classifyError(Error('payload secret from server')).code,'TELEGRAM_ERROR');
});

test('all-pinned first page continues at unpinned start without skipping newer dialogs',async()=>{
 const reader=new InboxReader();let count=0;const fake={invoke:async(request:{offsetDate:number;offsetId:number;excludePinned:boolean})=>{if(++count===1)return dialogSlice(30,true);assert.equal(request.excludePinned,true);assert.equal(request.offsetId,0);assert.equal(request.offsetDate,0);return new Api.messages.Dialogs({dialogs:[],messages:[],users:[],chats:[]});}};
 const result=await reader.read(fake as never,{type:'dialogs'});assert.ok(result.ok&&result.type==='dialogs'&&result.next);if(result.ok&&result.type==='dialogs')await reader.read(fake as never,{type:'dialogs',cursor:result.next});assert.equal(count,2);
});
