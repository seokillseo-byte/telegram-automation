import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {QueueStore} from '../apps/desktop/src/main/queue-store';
import {ResearchStore} from '../apps/desktop/src/main/research-store';
import {queueRetry,scheduleTime,localScheduleToUtc,parseQueueAction,parseScheduledPayload,type ScheduledPayload} from '../packages/shared/src/queue';
import {ManualSender} from '../packages/telegram-user/src/manual-send';
import {InboxReader} from '../packages/telegram-user/src/inbox';
const sdk=createRequire(resolve('apps/desktop/package.json'));const {Api}=sdk('telegram');
const user={id:'9',name:'Tài khoản thử',kind:'user' as const,peerType:'user' as const};
const uid=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');

test('schedule timezone conversion handles Vietnam/UTC and rejects DST ambiguity, gaps and invalid dates',()=>{
 const now=Date.UTC(2026,0,1);assert.equal(localScheduleToUtc('2026-10-25T09:30','Asia/Ho_Chi_Minh',now),'2026-10-25T02:30:00.000Z');assert.equal(localScheduleToUtc('2026-10-25T09:30','UTC',now),'2026-10-25T09:30:00.000Z');
 for(const [time,zone] of [['2026-11-01T01:30','America/New_York'],['2026-03-08T02:30','America/New_York'],['2026-02-30T10:00','UTC'],['2026-02-01T10:00','wrong/zone']])assert.throws(()=>localScheduleToUtc(time,zone,now));
 assert.throws(()=>scheduleTime(new Date(now+1000).toISOString(),'UTC',now));assert.throws(()=>parseQueueAction({type:'sendAll',ids:[uid(1)]}));assert.throws(()=>parseQueueAction({type:'cancel',id:'../file'}));
});

test('durable jobs deduplicate preview IDs and account scope, claim atomically, and preserve legacy research',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'queue-store-')),file=join(dir,'research.sqlite');const research=new ResearchStore(file);let a=new QueueStore(file),b=new QueueStore(file);const now=Date.now(),dueAt=new Date(now+60000).toISOString();
 try{
  research.savePreferences({timeZone:'UTC',compact:true,startPage:'overview'});const encrypted=Buffer.from('ciphertext-only');const job=a.create('1',uid(1),user,dueAt,'UTC',encrypted);assert.equal(a.create('1',uid(1),user,dueAt,'UTC',encrypted).id,job.id);assert.equal(b.list('2').length,0);assert.throws(()=>b.detail('2',job.id));
  assert.equal(a.claim('1',now),undefined);const claimed=a.claim('1',now+60001);assert.equal(claimed?.id,job.id);assert.equal(b.claim('1',now+60002),undefined);assert.throws(()=>b.change('1',job.id,'cancel'));
  a.finish('1',job.id,'sent',undefined,123);assert.equal(b.list('1')[0].remoteId,123);assert.throws(()=>a.change('1',job.id,'reschedule',new Date(now+120000).toISOString(),'UTC'));assert.equal(a.detail('1',job.id).events.length,3);
  a.close();b.close();a=new QueueStore(file);b=new QueueStore(file);assert.equal(a.list('1')[0].state,'sent');assert.equal(research.preferences().timeZone,'UTC');assert.deepEqual(a.detail('1',job.id).payload,encrypted);
  assert.ok(!(await readFile(file)).includes(Buffer.from('apiHash')));
 }finally{a.close();b.close();research.close();await rm(dir,{recursive:true,force:true});}
});

test('pause/cancel prevent dispatch and restart converts running to uncertain, overdue to review without retry',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'queue-recovery-')),file=join(dir,'jobs.sqlite');let queue=new QueueStore(file);const now=Date.now(),time=new Date(now+60000).toISOString();
 try{
  const paused=queue.create('1',uid(1),user,time,'UTC',Buffer.from('x'));queue.change('1',paused.id,'pause');assert.equal(queue.claim('1',now+60001),undefined);
  const cancelled=queue.create('1',uid(2),user,time,'UTC',Buffer.from('x'));queue.change('1',cancelled.id,'cancel');
  const running=queue.create('1',uid(3),user,time,'UTC',Buffer.from('x'));assert.equal(queue.claim('1',now+60001)?.id,running.id);
  const missed=queue.create('1',uid(4),user,time,'UTC',Buffer.from('x'));queue.close();queue=new QueueStore(file);queue.recover(now+61000);
  assert.equal(queue.list('1').find(j=>j.id===running.id)?.state,'uncertain');assert.equal(queue.list('1').find(j=>j.id===missed.id)?.state,'needs_review');assert.equal(queue.claim('1',now+61001),undefined);assert.throws(()=>queue.change('1',running.id,'resume'));
  assert.throws(()=>queue.change('1',paused.id,'resume',undefined,undefined,now+61000));queue.change('1',missed.id,'reschedule',new Date(now+180000).toISOString(),'UTC',now+61000);assert.equal(queue.claim('1',now+180001)?.id,missed.id);
 }finally{queue.close();await rm(dir,{recursive:true,force:true});}
});

function transport(){const entity=new Api.User({id:BigInt(9),firstName:'Recipient',accessHash:BigInt(55)}),peer=new Api.InputPeerUser({userId:entity.id,accessHash:entity.accessHash});let sends=0;const randomIds:string[]=[];
 const client={getEntity:async(target:unknown)=>{assert.ok(target==='@recipient'||target instanceof Api.InputPeerUser);return entity;},getInputEntity:async()=>peer,invoke:async(request:{className:string;randomId:{toString:()=>string};getBytes:()=>Buffer})=>{assert.equal(request.className,'messages.SendMessage');assert.ok(request.getBytes().length>0);sends++;randomIds.push(request.randomId.toString());return new Api.UpdateShortSentMessage({id:77,date:1700000000,pts:1,ptsCount:1});}};
 return {client,stats:()=>({sends,randomIds})};}

test('scheduling consumes preview without sending, persists fixed peer/random ID and verifies account on dispatch',async()=>{
 const {client,stats}=transport(),sender=new ManualSender();const preview=await sender.preview(client as never,new InboxReader(),{type:'preview',target:{kind:'username',username:'recipient'},text:'Scheduled **literal**'});assert.ok(preview.ok&&preview.preview);const id=preview.ok?preview.preview!.id:'';
 const payload=sender.exportSchedule(id,'1');assert.equal(stats().sends,0);assert.equal(payload.recipient.id,'9');assert.throws(()=>sender.exportSchedule(id,'1'),/SEND_PREVIEW_EXPIRED/);const stored=parseScheduledPayload(JSON.parse(JSON.stringify(payload)));
 const wrong=await sender.scheduled(client as never,stored,'2');assert.ok(!wrong.ok&&wrong.error.code==='QUEUE_ACCOUNT_MISMATCH');assert.equal(stats().sends,0);const sent=await sender.scheduled(client as never,stored,'1');assert.ok(sent.ok&&sent.sent?.id===77);assert.deepEqual(stats(),{sends:1,randomIds:[payload.randomId]});
});

test('scheduled lost acknowledgment is uncertain and malformed/marketing payload never dispatches',async()=>{
 const payload:ScheduledPayload={accountId:'1',recipient:user,peer:{type:'user',id:'9',accessHash:'55'},text:'Hello',randomId:'12345',purpose:'personal'};const {client,stats}=transport();let attempts=0;client.invoke=async()=>{attempts++;throw Error('TIMEOUT');};const result=await new ManualSender().scheduled(client as never,payload,'1');assert.ok(!result.ok&&result.uncertain);
 assert.throws(()=>parseScheduledPayload({...payload,purpose:'marketing'}));const bad=await new ManualSender().scheduled(client as never,{...payload,peer:{type:'user',id:'88',accessHash:'55'}},'1');assert.ok(!bad.ok&&!bad.uncertain);assert.equal(attempts,1);assert.equal(stats().sends,0);
});

test('classified retries persist waits, block account, reuse payload and stop after three attempts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'queue-retry-')),file=join(dir,'jobs.sqlite');let q=new QueueStore(file);const now=Date.now(),due=now+60000;
 try{
  const job=q.create('1',uid(41),user,new Date(due).toISOString(),'UTC',Buffer.from('fixed encrypted payload'));
  const other=q.create('1',uid(42),user,new Date(due+40000).toISOString(),'UTC',Buffer.from('other'));
  assert.equal(q.claim('1',due)?.id,job.id);q.reject('1',job.id,{code:'RATE_LIMIT',retryAfter:60},false,due);
  assert.equal(q.detail('1',job.id).job.state,'retry_wait');assert.equal(q.claim('1',due+40000),undefined);
  q.close();q=new QueueStore(file);q.recover(due+10000);assert.equal(q.claim('1',due+60000),undefined);
  const retry=q.claim('1',due+61000);assert.equal(retry?.id,job.id);assert.equal(retry?.attempts,2);assert.equal(q.detail('1',job.id).payload.toString(),'fixed encrypted payload');
  q.reject('1',job.id,{code:'TIMEOUT'},false,due+61000);q.change('1',job.id,'pause');assert.equal(q.claim('1',due+181000),undefined);q.change('1',job.id,'cancel');assert.equal(q.detail('1',job.id).job.state,'cancelled');q.overdue(due+181000);assert.equal(q.detail('1',other.id).job.state,'needs_review');
  const final=q.create('2',uid(43),user,new Date(due).toISOString(),'UTC',Buffer.from('fixed'));
  for(let attempt=1,at=due;attempt<=3;attempt++){assert.equal(q.claim('2',at)?.attempts,attempt);q.reject('2',final.id,{code:'RATE_LIMIT',retryAfter:1},false,at);at+=2000;}
  assert.equal(q.detail('2',final.id).job.state,'failed');assert.equal(q.claim('2',due+10000),undefined);
 }finally{q.close();await rm(dir,{recursive:true,force:true});}
});

test('uncertain and permanent failures never retry; interrupted retry is review only',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'queue-no-retry-')),q=new QueueStore(join(dir,'q.sqlite')),now=Date.now()+60000;
 try{for(const [index,code,uncertain] of [[1,'TIMEOUT',true],[2,'PEER_FLOOD',false],[3,'CHAT_WRITE_FORBIDDEN',false],[4,'USER_PRIVACY_RESTRICTED',false],[5,'RATE_LIMIT',false]] as const){const j=q.create('1',uid(index),user,new Date(now).toISOString(),'UTC',Buffer.from('x'));assert.equal(q.claim('1',now)?.id,j.id);q.reject('1',j.id,{code},uncertain,now);assert.equal(q.detail('1',j.id).job.state,uncertain?'uncertain':'failed');}
 const j=q.create('2',uid(8),user,new Date(now).toISOString(),'UTC',Buffer.from('x'));q.claim('2',now);q.reject('2',j.id,{code:'TIMEOUT'},false,now);q.recover(now+31000);assert.equal(q.detail('2',j.id).job.state,'needs_review');assert.equal(q.claim('2',now+31001),undefined);assert.throws(()=>q.change('2',j.id,'reschedule',new Date(now+90000).toISOString(),'UTC',now));q.change('2',j.id,'cancel');
 }finally{q.close();await rm(dir,{recursive:true,force:true});}
});

test('scheduled adapter disables SDK request retries, restores setting, and distinguishes pre-send network errors',async()=>{
 const payload:ScheduledPayload={accountId:'1',recipient:user,peer:{type:'user',id:'9',accessHash:'55'},text:'Hello',randomId:'12345',purpose:'personal'};
 const fixture=transport(),client={...fixture.client,_requestRetries:5};let sends=0;client.invoke=async()=>{assert.equal(client._requestRetries,1);sends++;throw Error('ECONNRESET');};
 const sent=await new ManualSender().scheduled(client as never,payload,'1');assert.ok(!sent.ok&&sent.uncertain);assert.equal(sends,1);assert.equal(client._requestRetries,5);
 client.getEntity=async()=>{throw Error('ECONNRESET');};const before=await new ManualSender().scheduled(client as never,payload,'1');assert.ok(!before.ok&&!before.uncertain&&before.error.code==='ECONNRESET');assert.equal(sends,1);
});

test('retry policy rejects invalid waits, long waits, exhausted attempts and uncertain outcomes',()=>{
 for(const retryAfter of [undefined,0,-1,NaN,Infinity,86401])assert.equal(queueRetry({code:'RATE_LIMIT',retryAfter},false,1,0),undefined);
 assert.equal(queueRetry({code:'RATE_LIMIT',retryAfter:1},false,1,0),'1970-01-01T00:00:02.000Z');assert.equal(queueRetry({code:'RATE_LIMIT',retryAfter:1},true,1,0),undefined);assert.equal(queueRetry({code:'TIMEOUT'},false,3,0),undefined);assert.equal(queueRetry({code:'TELEGRAM_ERROR'},false,1,0),undefined);
});
