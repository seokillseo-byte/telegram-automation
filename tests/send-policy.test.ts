import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {SendPolicyStore} from '../apps/desktop/src/main/send-policy-store';
import {QueueStore} from '../apps/desktop/src/main/queue-store';
import {QueueRunner} from '../apps/desktop/src/main/queue-runner';
import {createPolicyCheckedJob} from '../apps/desktop/src/main/scheduled-policy';
import {ManualSender} from '../packages/telegram-user/src/manual-send';
import {InboxReader} from '../packages/telegram-user/src/inbox';
import {parsePolicyAction,policyPeer,type PolicyAction} from '../packages/shared/src/send-policy';
import {parseManualAction} from '../packages/shared/src/manual-send';
import {parseScheduledPayload,type ScheduledPayload} from '../packages/shared/src/queue';
const recipient={id:'9',peerType:'user' as const,kind:'user' as const,name:'Policy fixture'},target=policyPeer(recipient),uid=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const payload:ScheduledPayload={accountId:'1',recipient,peer:{type:'user',id:'9',accessHash:'55'},text:'Opt-in message',randomId:'123456',purpose:'marketing'};
const sdk=createRequire(resolve('apps/desktop/package.json')),{Api}=sdk('telegram');
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'send-policy-')),file=join(dir,'q.sqlite'),policy=new SendPolicyStore(file),queue=new QueueStore(file);return {file,policy,queue,change:(type:Extract<PolicyAction,{accountId:string}>['type'],accountId='1')=>policy.change({type,accountId,target,source:'Fixture explicit source'}),close:async()=>{queue.close();policy.close();await rm(dir,{recursive:true,force:true});}};}
function transport(){let sends=0;const entity=new Api.User({id:BigInt(9),firstName:'Policy fixture',accessHash:BigInt(55)}),peer=new Api.InputPeerUser({userId:entity.id,accessHash:entity.accessHash});return {sends:()=>sends,entity,client:{getEntity:async()=>entity,getInputEntity:async()=>peer,invoke:async()=>{sends++;return new Api.UpdateShortSentMessage({id:77,date:1700000000,pts:1,ptsCount:1});},sendMessage:async()=>{sends++;return new Api.Message({id:77,peerId:new Api.PeerUser({userId:entity.id}),date:1700000000,message:'ok'});}}};}

test('policy IPC validates exact numeric peer scope, explicit source and purpose; rejects bulk and extra fields',()=>{
 for(const input of [{type:'grant',accountId:'1',target,source:''},{type:'grant',accountId:'1',target:{...target,id:'@name'},source:'yes'},{type:'grant',accountId:'1',target,source:'yes',all:true},{type:'inspect',target:{...target,path:'x'}},{type:'list',accountId:'2'}])assert.throws(()=>parsePolicyAction(input));
 assert.equal(parseManualAction({type:'preview',target:{kind:'self'},text:'x',purpose:'marketing'}).type,'preview');assert.throws(()=>parseManualAction({type:'preview',target:{kind:'self'},text:'x',purpose:'bulk'}));assert.equal(parseScheduledPayload(payload).purpose,'marketing');
});

test('consent, suppression and audit persist; removing a block never restores consent; read-only worker sees fresh commits',async()=>{
 const f=await fixture(),reader=new SendPolicyStore(f.file,true);try{
  assert.throws(()=>reader.assertAllowed('1',recipient,'marketing'),/CONSENT_REQUIRED/);reader.assertAllowed('1',recipient,'personal');f.change('grant');reader.assertAllowed('1',recipient,'marketing');assert.throws(()=>reader.assertAllowed('2',recipient,'marketing'),/CONSENT_REQUIRED/);assert.throws(()=>reader.assertAllowed('1',{...recipient,peerType:'channel',kind:'channel'},'marketing'),/CONSENT_REQUIRED/);
  f.change('suppress');for(const purpose of ['personal','marketing'] as const)assert.throws(()=>reader.assertAllowed('1',recipient,purpose),/RECIPIENT_SUPPRESSED/);assert.throws(()=>f.change('grant'),/RECIPIENT_SUPPRESSED/);f.change('unsuppress');assert.throws(()=>reader.assertAllowed('1',recipient,'marketing'),/CONSENT_REVOKED/);reader.assertAllowed('1',recipient,'personal');f.change('grant');reader.assertAllowed('1',recipient,'marketing');f.change('revoke');assert.throws(()=>reader.assertAllowed('1',recipient,'marketing'),/CONSENT_REVOKED/);
  assert.deepEqual(f.policy.events('1',target).map(e=>e.type),['revoke','grant','unsuppress','suppress','grant']);assert.equal(f.policy.list('2').length,0);const reopened=new SendPolicyStore(f.file,true);try{assert.equal(reopened.inspect('1',target).consent,'revoked');}finally{reopened.close();}
 }finally{reader.close();await f.close();}
});

test('creation rechecks after async encryption; withdrawal cannot create a marketing job or silently change purpose',async()=>{
 const f=await fixture();try{
  const due=new Date(Date.now()+60000).toISOString();assert.throws(()=>createPolicyCheckedJob(f.queue,f.policy,payload,uid(1),due,'UTC',Buffer.from('cipher')),/CONSENT_REQUIRED/);f.change('grant');
  const cipher=await Promise.resolve(Buffer.from('cipher'));f.change('revoke');assert.throws(()=>createPolicyCheckedJob(f.queue,f.policy,payload,uid(1),due,'UTC',cipher),/CONSENT_REVOKED/);assert.equal(f.queue.list('1').length,0);
  f.change('grant');const job=createPolicyCheckedJob(f.queue,f.policy,payload,uid(1),due,'UTC',cipher);assert.equal(job.purpose,'marketing');f.change('suppress');assert.throws(()=>createPolicyCheckedJob(f.queue,f.policy,{...payload,purpose:'personal'},uid(2),due,'UTC',cipher),/RECIPIENT_SUPPRESSED/);
 }finally{await f.close();}
});

test('worker reads policy again after lookup, before SendMessage; revoked jobs fail without retry or dispatch',async()=>{
 const f=await fixture(),reader=new SendPolicyStore(f.file,true),t=transport();try{
  f.change('grant');t.client.getEntity=async()=>{f.change('revoke');return t.entity;};const sender=new ManualSender((r,p)=>reader.assertAllowed('1',r,p)),result=await sender.scheduled(t.client as never,payload,'1');assert.ok(!result.ok&&!result.uncertain&&result.error.code==='CONSENT_REVOKED');assert.equal(t.sends(),0);
  const unavailable=await new ManualSender().scheduled(t.client as never,{...payload,purpose:'personal'},'1');assert.ok(!unavailable.ok&&unavailable.error.code==='POLICY_UNAVAILABLE');assert.equal(t.sends(),0);
 }finally{reader.close();await f.close();}
});

test('preview pins purpose and policy changes after preview prevent immediate send and schedule export',async()=>{
 const f=await fixture(),t=transport(),sender=new ManualSender((r,p)=>f.policy.assertAllowed('1',r,p));try{
  await assert.rejects(sender.preview(t.client as never,new InboxReader(),{type:'preview',target:{kind:'username',username:'fixture'},text:'Hello',purpose:'marketing'}),/CONSENT_REQUIRED/);f.change('grant');
  const preview=await sender.preview(t.client as never,new InboxReader(),{type:'preview',target:{kind:'username',username:'fixture'},text:'Hello',purpose:'marketing'});assert.ok(preview.ok&&preview.preview);const id=preview.ok?preview.preview!.id:'';f.change('revoke');assert.throws(()=>sender.exportSchedule(id,'1'),/CONSENT_REVOKED/);const sent=await sender.confirm(t.client as never,id);assert.ok(!sent.ok&&!sent.uncertain&&sent.error.code==='CONSENT_REVOKED');assert.equal(t.sends(),0);
 }finally{await f.close();}
});

test('manual personal media is blocked if recipient is suppressed while file uploads',async()=>{
 const f=await fixture(),t=transport(),sender=new ManualSender((r,p)=>f.policy.assertAllowed('1',r,p));try{
  const attachment={id:uid(3),kind:'document' as const,name:'a.txt',size:1,bytes:Buffer.from('x')};let sends=0;const client={...t.client,invoke:async()=>{f.change('suppress');return true;},sendFile:async()=>{sends++;throw Error('Must not send');}};
  const preview=await sender.preview(client as never,new InboxReader(),{type:'preview',target:{kind:'username',username:'fixture'},text:'File',fileId:attachment.id},attachment);assert.ok(preview.ok&&preview.preview);const sent=await sender.confirm(client as never,preview.ok?preview.preview!.id:'');assert.ok(!sent.ok&&!sent.uncertain&&sent.error.code==='RECIPIENT_SUPPRESSED');assert.equal(sends,0);
 }finally{await f.close();}
});

test('withdrawal cancels only matching queued marketing; suppression cancels personal too, preserving account and peer namespaces',async()=>{
 const f=await fixture(),now=Date.now()+60000;try{
  const marketing=f.queue.create('1',uid(1),recipient,new Date(now).toISOString(),'UTC',Buffer.from('x'),'marketing'),personal=f.queue.create('1',uid(2),recipient,new Date(now).toISOString(),'UTC',Buffer.from('x'));
  const otherAccount=f.queue.create('2',uid(3),recipient,new Date(now).toISOString(),'UTC',Buffer.from('x'),'marketing'),otherPeer=f.queue.create('1',uid(4),{...recipient,peerType:'channel',kind:'channel'},new Date(now).toISOString(),'UTC',Buffer.from('x'),'marketing');
  f.queue.blockWaiting('1',target,true,'CONSENT_REVOKED');assert.equal(f.queue.detail('1',marketing.id).job.state,'cancelled');assert.equal(f.queue.detail('1',personal.id).job.state,'pending');assert.equal(f.queue.detail('2',otherAccount.id).job.state,'pending');assert.equal(f.queue.detail('1',otherPeer.id).job.state,'pending');f.queue.blockWaiting('1',target,false,'RECIPIENT_SUPPRESSED');assert.equal(f.queue.detail('1',personal.id).job.state,'cancelled');
 }finally{await f.close();}
});

test('queue runner checks policy on every attempt and invalidates a posted flight when consent changes',async()=>{
 const f=await fixture(),at=Date.now()+60000;let sends=0,terminations=0;const runner=new QueueRunner({store:()=>f.queue,authorize:p=>f.policy.assertAllowed(p.accountId,p.recipient,p.purpose),context:()=>({accountId:'1',connected:true,online:true,suspended:false,busy:false}),decrypt:async()=>payload,send:()=>{sends++;},lock:()=>{},terminate:()=>{terminations++;},changed:()=>{},error:()=>{}},()=>at,()=>1);
 try{
  const job=f.queue.create('1',uid(1),recipient,new Date(at).toISOString(),'UTC',Buffer.from('x'),'marketing');await runner.tick();assert.equal(f.queue.detail('1',job.id).job.errorCode,'CONSENT_REQUIRED');assert.equal(sends,0);
  f.change('grant');const active=f.queue.create('1',uid(2),recipient,new Date(at).toISOString(),'UTC',Buffer.from('x'),'marketing');await runner.tick();assert.equal(sends,1);f.change('revoke');runner.policyChanged('1',target,true,'CONSENT_REVOKED');assert.equal(f.queue.detail('1',active.id).job.state,'uncertain');assert.equal(terminations,1);await runner.tick();assert.equal(sends,1);
 }finally{await f.close();}
});

test('runner denies withdrawal during decrypt and rejects a marketing payload mislabeled personal in metadata',async()=>{
 for(const mode of ['withdraw','mismatch'] as const){const f=await fixture(),at=Date.now()+60000;let sends=0;try{
  f.change('grant');const job=f.queue.create('1',uid(1),recipient,new Date(at).toISOString(),'UTC',Buffer.from('cipher'),mode==='mismatch'?'personal':'marketing');
  const runner=new QueueRunner({store:()=>f.queue,authorize:p=>f.policy.assertAllowed(p.accountId,p.recipient,p.purpose),context:()=>({accountId:'1',connected:true,online:true,suspended:false,busy:false}),decrypt:async()=>{if(mode==='withdraw')f.change('revoke');return payload;},send:()=>{sends++;},lock:()=>{},terminate:()=>{},changed:()=>{},error:()=>{}},()=>at,()=>1);
  await runner.tick();assert.equal(sends,0);assert.equal(f.queue.detail('1',job.id).job.errorCode,mode==='withdraw'?'CONSENT_REVOKED':'QUEUE_PAYLOAD_INVALID');
 }finally{await f.close();}}
});
