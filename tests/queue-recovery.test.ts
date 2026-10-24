import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {QueueStore} from '../apps/desktop/src/main/queue-store';
import {QueueRunner} from '../apps/desktop/src/main/queue-runner';
import {parseQueueAction,queueRecoveryHelp,type ScheduledPayload} from '../packages/shared/src/queue';
import {ManualSender} from '../packages/telegram-user/src/manual-send';
const uid=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const recipient={id:'9',name:'Recovery fixture',kind:'user' as const,peerType:'user' as const};
const payload:ScheduledPayload={accountId:'1',recipient,peer:{type:'user',id:'9',accessHash:'55'},text:'One schedule',randomId:'123456',purpose:'personal'};
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'queue-runtime-')),file=join(directory,'q.sqlite'),store=new QueueStore(file),due=Date.now()+60000;
 const clock={wall:due,mono:100},context={accountId:'1',connected:true,online:true,suspended:false,busy:false};
 const sends:{id:string;runId:string;expiresAt:number;payload:ScheduledPayload}[]=[],terminations:string[]=[],errors:unknown[]=[];
 let decrypt:(bytes:Buffer)=>Promise<ScheduledPayload>=async()=>payload;
 const runner=new QueueRunner({store:()=>store,context:()=>context,decrypt:bytes=>decrypt(bytes),send:(id,payload,expiresAt,runId)=>sends.push({id,payload,expiresAt,runId}),lock:value=>{context.busy=value;},terminate:code=>{terminations.push(code);context.connected=false;},changed:()=>{},error:error=>errors.push(error)},()=>clock.wall,()=>clock.mono);
 return {directory,file,store,due,clock,context,sends,terminations,errors,runner,decrypt:(fn:typeof decrypt)=>{decrypt=fn;},job:(n:number,at=due,account='1')=>store.create(account,uid(n),recipient,new Date(at).toISOString(),'UTC',Buffer.from('encrypted fixture')),close:async()=>{store.close();await rm(directory,{recursive:true,force:true});}};
}

test('interruption during asynchronous decrypt invalidates dispatch and allows explicit future confirmation only',async()=>{
 for(const code of ['QUEUE_SLEEP','QUEUE_CONNECTION_LOST','QUEUE_APP_CLOSED']){
  const f=await fixture();try{
   const job=f.job(1);let resolveDecrypt!:(value:ScheduledPayload)=>void;f.decrypt(()=>new Promise(resolve=>{resolveDecrypt=resolve;}));const pending=f.runner.tick();assert.ok(f.context.busy);f.runner.boundary(code);resolveDecrypt(payload);await pending;
   assert.equal(f.sends.length,0);assert.equal(f.terminations.length,0);assert.equal(f.context.busy,false);const recovered=f.store.detail('1',job.id).job;assert.equal(recovered.state,'needs_review');assert.equal(recovered.attempts,0);assert.equal(recovered.errorCode,code);
   assert.equal(f.runner.complete(job.id,f.sends[0]?.runId??uid(999),{ok:true,sent:{id:77,recipient}}),false);await f.runner.tick();assert.equal(f.sends.length,0);
   f.store.change('1',job.id,'reschedule',new Date(f.due+60000).toISOString(),'UTC',f.due);assert.equal(f.store.detail('1',job.id).job.state,'pending');assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
 }
});

test('posted flight becomes uncertain exactly once, stops transport, and ignores stale acknowledgment',async()=>{
 for(const code of ['QUEUE_SLEEP','QUEUE_CONNECTION_LOST','QUEUE_APP_CLOSED']){
  const f=await fixture();try{
   const job=f.job(1);await Promise.all([f.runner.tick(),f.runner.tick()]);assert.equal(f.sends.length,1);assert.equal(f.sends[0].expiresAt,f.due+5000);assert.equal(f.sends[0].payload.randomId,payload.randomId);
   f.runner.boundary(code);f.runner.boundary(code);assert.deepEqual(f.terminations,[code]);assert.equal(f.store.detail('1',job.id).job.state,'uncertain');assert.equal(f.runner.complete(job.id,f.sends[0]?.runId??uid(999),{ok:true,sent:{id:77,recipient}}),false);assert.equal(f.store.detail('1',job.id).job.remoteId,undefined);
   f.context.connected=true;await f.runner.tick();assert.equal(f.sends.length,1);assert.throws(()=>f.store.change('1',job.id,'resume'));assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
 }
});

test('offline/resume keeps future jobs and moves missed deadlines to review without catch-up',async()=>{
 const f=await fixture();try{
  const missed=f.job(1),future=f.job(2,f.due+60000);f.context.online=false;await f.runner.tick();assert.equal(f.store.detail('1',missed.id).job.state,'needs_review');assert.equal(f.store.detail('1',future.id).job.state,'pending');assert.equal(f.sends.length,0);
  f.clock.wall+=1000;f.clock.mono+=1000;f.context.online=true;f.runner.boundary('QUEUE_RECONNECTED');await f.runner.tick();assert.equal(f.sends.length,0);assert.equal(f.store.detail('1',future.id).job.state,'pending');
  f.context.suspended=true;f.clock.wall+=60000;f.clock.mono+=60000;f.runner.boundary('QUEUE_RESUMED');f.runner.resetClock();f.context.suspended=false;await f.runner.tick();assert.equal(f.store.detail('1',future.id).job.errorCode,'QUEUE_RESUMED');assert.equal(f.sends.length,0);
 }finally{await f.close();}
});

test('forward/backward clock changes require review and timer stalls never dispatch overdue work',async()=>{
 for(const delta of [60000,-60000]){
  const f=await fixture();try{const job=f.job(1,f.due+120000);f.clock.wall+=delta;f.clock.mono+=1000;await f.runner.tick();assert.equal(f.store.detail('1',job.id).job.errorCode,'QUEUE_CLOCK_CHANGED');assert.equal(f.sends.length,0);}finally{await f.close();}
 }
 const f=await fixture();try{const job=f.job(1);await f.runner.tick();f.clock.wall+=6000;f.clock.mono+=6000;await f.runner.tick();assert.equal(f.store.detail('1',job.id).job.state,'uncertain');assert.deepEqual(f.terminations,['QUEUE_TIMER_GAP']);}finally{await f.close();}
});

test('deadline and account are checked again after decrypt, before worker dispatch',async()=>{
 for(const reason of ['expired','account','clock'] as const){const f=await fixture();try{
  const job=f.job(1);f.decrypt(async()=>{if(reason==='expired'){f.clock.wall+=6000;f.clock.mono+=6000;}else if(reason==='account')f.context.accountId='2';else f.clock.wall-=60000;return payload;});await f.runner.tick();assert.equal(f.sends.length,0);assert.equal(f.store.detail('1',job.id).job.state,'needs_review');assert.equal(f.store.detail('1',job.id).job.attempts,0);
 }finally{await f.close();}}
});

test('worker-rejected expired dispatch is reviewable; valid result persists once and duplicate result is ignored',async()=>{
 const f=await fixture();try{
  const job=f.job(1);await f.runner.tick();assert.equal(f.runner.complete(job.id,f.sends[0]?.runId??uid(999),{ok:false,error:{code:'QUEUE_DISPATCH_EXPIRED',message:'Expired'}}),true);assert.equal(f.store.detail('1',job.id).job.state,'needs_review');assert.equal(f.store.detail('1',job.id).job.attempts,0);
  const other=f.job(2);await f.runner.tick();assert.equal(f.runner.complete(other.id,f.sends[1].runId,{ok:true,sent:{id:77,recipient}}),true);assert.equal(f.runner.complete(other.id,f.sends[1].runId,{ok:true,sent:{id:88,recipient}}),false);assert.equal(f.store.detail('1',other.id).job.remoteId,77);
 }finally{await f.close();}
});

test('review filter and full counts are account scoped and prioritize review over 200 newer normal records',async()=>{
 const f=await fixture();try{
  const job=f.job(1);f.store.reviewWaiting('QUEUE_CLOCK_CHANGED');const db=new DatabaseSync(f.file);try{const insert=db.prepare("INSERT INTO scheduled_jobs(id,account,recipient,due_at,zone,created_at,state,preview_id,payload) VALUES(?, '1', ?, ?, 'UTC', ?, 'sent', ?, ?)");for(let i=0;i<205;i++)insert.run(uid(100+i),JSON.stringify(recipient),new Date(f.due).toISOString(),new Date(f.due+1000+i).toISOString(),uid(100+i),Buffer.from('cipher'));}finally{db.close();}
  assert.equal(f.store.list('1').length,200);assert.equal(f.store.list('1')[0].id,job.id);assert.deepEqual(f.store.list('1',true).map(j=>j.id),[job.id]);assert.deepEqual(f.store.summary('1'),{needsReview:1,uncertain:0});assert.deepEqual(f.store.summary('2'),{needsReview:0,uncertain:0});
  assert.deepEqual(parseQueueAction({type:'list',reviewOnly:true}),{type:'list',reviewOnly:true});assert.throws(()=>parseQueueAction({type:'list',reviewOnly:'all'}));assert.throws(()=>parseQueueAction({type:'list',accountId:'2'}));assert.match(queueRecoveryHelp(f.store.detail('1',job.id).job),/Chọn giờ mới/);
 }finally{await f.close();}
});

test('actual process kill after committed claim recovers uncertain without duplicate events or automatic dispatch',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'queue-crash-')),file=join(directory,'q.sqlite');
 const script=`const {QueueStore}=require('./apps/desktop/src/main/queue-store.ts');const q=new QueueStore(process.argv[1]);const due=Date.now()+60000;const job=q.create('1','00000000-0000-4000-8000-000000000001',{id:'9',name:'Fixture',kind:'user',peerType:'user'},new Date(due).toISOString(),'UTC',Buffer.from('cipher'));q.claim('1',due);console.log(job.id);setInterval(()=>{},1000);`;
 const child=spawn(process.execPath,['--import','tsx','-e',script,file],{cwd:resolve('.'),stdio:['ignore','pipe','pipe']});const closed=once(child,'close');let timer:NodeJS.Timeout|undefined;
 try{
  const id=await new Promise<string>((resolve,reject)=>{let output='';timer=setTimeout(()=>reject(Error('Child startup timeout')),15000);child.once('error',reject);child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.includes('\n'))resolve(output.trim());});child.once('exit',()=>reject(Error('Child exited before claim')));});clearTimeout(timer);child.kill('SIGKILL');await closed;
  const q=new QueueStore(file);try{q.recover();const detail=q.detail('1',id);assert.equal(detail.job.state,'uncertain');assert.equal(detail.job.errorCode,'QUEUE_INTERRUPTED');const count=detail.events.length;q.recover();assert.equal(q.detail('1',id).events.length,count);assert.equal(q.claim('1',Date.now()+60001),undefined);}finally{q.close();}
 }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await closed;}await rm(directory,{recursive:true,force:true});}
});

test('worker checks expiry before lookup and immediately before sending, with no dispatch on expiry',async()=>{
 const sdk=createRequire(resolve('apps/desktop/package.json')),{Api}=sdk('telegram');let lookups=0,sends=0;
 const client={getEntity:async()=>{lookups++;await new Promise(resolve=>setTimeout(resolve,30));return new Api.User({id:BigInt(9),firstName:'Fixture',accessHash:BigInt(55)});},invoke:async()=>{sends++;throw Error('Should never send');}};
 const sender=new ManualSender(),expired=await sender.scheduled(client as never,payload,'1',Date.now()-1);assert.ok(!expired.ok&&expired.error.code==='QUEUE_DISPATCH_EXPIRED'&&!expired.uncertain);assert.equal(lookups,0);
 const duringLookup=await sender.scheduled(client as never,payload,'1',Date.now()+10);assert.ok(!duringLookup.ok&&duringLookup.error.code==='QUEUE_DISPATCH_EXPIRED'&&!duringLookup.uncertain);assert.equal(sends,0);assert.equal(lookups,1);
});

test('a delayed result from an expired attempt cannot settle a new attempt of the same job',async()=>{
 const f=await fixture();try{
  const job=f.job(1);await f.runner.tick();const oldRun=f.sends[0].runId;
  f.runner.complete(job.id,oldRun,{ok:false,error:{code:'QUEUE_DISPATCH_EXPIRED',message:'Expired'}});
  f.store.change('1',job.id,'reschedule',new Date(f.due+60000).toISOString(),'UTC',f.due);f.clock.wall+=60000;f.clock.mono+=60000;f.runner.resetClock();await f.runner.tick();const newRun=f.sends[1].runId;assert.notEqual(oldRun,newRun);
  assert.equal(f.runner.complete(job.id,oldRun,{ok:true,sent:{id:88,recipient}}),false);assert.equal(f.context.busy,true);assert.equal(f.store.detail('1',job.id).job.state,'running');assert.equal(f.runner.complete(job.id,newRun,{ok:true,sent:{id:77,recipient}}),true);assert.equal(f.store.detail('1',job.id).job.remoteId,77);
 }finally{await f.close();}
});

test('runner preserves classified retries and sends the same pinned payload only after its persisted wait',async()=>{
 const f=await fixture();try{
  const job=f.job(1);await f.runner.tick();f.runner.complete(job.id,f.sends[0].runId,{ok:false,error:{code:'RATE_LIMIT',message:'Wait',retryAfter:1}});assert.equal(f.store.detail('1',job.id).job.state,'retry_wait');
  f.clock.wall+=1000;f.clock.mono+=1000;await f.runner.tick();assert.equal(f.sends.length,1);f.clock.wall+=1000;f.clock.mono+=1000;await f.runner.tick();assert.equal(f.sends.length,2);assert.deepEqual(f.sends[0].payload,f.sends[1].payload);assert.equal(f.sends[1].expiresAt,f.due+7000);
  f.runner.complete(job.id,f.sends[1].runId,{ok:true,sent:{id:77,recipient}});assert.equal(f.store.detail('1',job.id).job.attempts,2);assert.equal(f.store.detail('1',job.id).job.state,'sent');assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});
