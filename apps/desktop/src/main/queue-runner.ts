import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {QUEUE_GRACE_MS,type QueueJob,type ScheduledPayload} from '../../../../packages/shared/src/queue';
import {classifyError} from '../../../../packages/shared/src/protocol';
import type {ManualReply} from '../../../../packages/shared/src/manual-send';
import type {QueueStore} from './queue-store';
type Context={accountId?:string;connected:boolean;online:boolean;suspended:boolean;busy:boolean};
type Hooks={store:()=>QueueStore;context:()=>Context;authorize:(payload:ScheduledPayload)=>void;decrypt:(bytes:Buffer)=>Promise<ScheduledPayload>;send:(id:string,payload:ScheduledPayload,expiresAt:number,runId:string)=>void;lock:(busy:boolean)=>void;terminate:(code:string)=>void;changed:()=>void;error:(error:unknown)=>void};
type Flight={job:QueueJob;dispatched:boolean;runId:string};
// Main-process coordinator: invalidate the flight before terminating the worker.
export class QueueRunner{
 private flight:Flight|undefined;
 private wall:number;
 private mono:number;
 constructor(private hooks:Hooks,private now=()=>Date.now(),private monotonic=()=>performance.now()){this.wall=now();this.mono=monotonic();}
 matches(id:string,runId:string){return this.flight?.job.id===id&&this.flight.runId===runId;}
 private ready(context:Context){return Boolean(context.accountId&&context.connected&&context.online&&!context.suspended);}
 private release(){this.flight=undefined;this.hooks.lock(false);}
 interrupt(code:string,terminate=true){
  const flight=this.flight;if(!flight)return;
  // Even if persistence fails, no old decrypt/result callback may dispatch again.
  this.flight=undefined;
  try{this.hooks.store().interrupt(flight.job.accountId,flight.job.id,flight.dispatched,code);this.hooks.changed();}catch(error){this.hooks.error(error);}finally{this.hooks.lock(false);if(terminate&&flight.dispatched)this.hooks.terminate(code);}
 }
 boundary(code:string){this.interrupt(code);try{this.hooks.store().overdue(this.now(),0,code);}catch(error){this.hooks.error(error);}}
 policyChanged(account:string,recipient:{id:string;peerType:string},marketingOnly:boolean,code:string){const f=this.flight;if(!f||f.job.accountId!==account||f.job.recipient.id!==recipient.id||f.job.recipient.peerType!==recipient.peerType||marketingOnly&&(f.job.purpose??'personal')!=='marketing')return;this.interrupt(code);}
 resetClock(){this.wall=this.now();this.mono=this.monotonic();}
 async tick(){
  const now=this.now(),mono=this.monotonic(),elapsed=now-this.wall,drift=elapsed-(mono-this.mono);this.wall=now;this.mono=mono;
  try{
   if(Math.abs(drift)>QUEUE_GRACE_MS){this.interrupt('QUEUE_CLOCK_CHANGED');this.hooks.store().reviewWaiting('QUEUE_CLOCK_CHANGED');this.hooks.changed();return;}
   if(elapsed>QUEUE_GRACE_MS||elapsed<0){this.boundary('QUEUE_TIMER_GAP');return;}
   const context=this.hooks.context();this.hooks.store().overdue(now,this.ready(context)?QUEUE_GRACE_MS:0);
   if(this.flight||context.busy||!this.ready(context))return;
   const job=this.hooks.store().claim(context.accountId!,now);if(!job)return;
   const startedMono=this.monotonic(),startedWall=this.now(),flight:Flight={job,dispatched:false,runId:randomUUID()};this.flight=flight;this.hooks.lock(true);
   try{
    const payload=await this.hooks.decrypt(this.hooks.store().detail(job.accountId,job.id).payload);
    if(this.flight!==flight)return;
    if(Math.abs((this.now()-startedWall)-(this.monotonic()-startedMono))>QUEUE_GRACE_MS){this.interrupt('QUEUE_CLOCK_CHANGED');this.hooks.store().reviewWaiting('QUEUE_CLOCK_CHANGED');return;}
    const current=this.hooks.context(),expiresAt=Date.parse(job.nextAttemptAt??job.dueAt)+QUEUE_GRACE_MS;
    if(!this.ready(current)||current.accountId!==job.accountId){this.interrupt('QUEUE_CONNECTION_LOST');return;}
    if(this.now()>expiresAt){this.interrupt('QUEUE_DISPATCH_EXPIRED');return;}
    if(payload.accountId!==job.accountId||payload.recipient.id!==job.recipient.id||payload.recipient.peerType!==job.recipient.peerType||payload.purpose!==(job.purpose??'personal'))throw Error('QUEUE_PAYLOAD_INVALID');
    this.hooks.authorize(payload);flight.dispatched=true;this.hooks.send(job.id,payload,expiresAt,flight.runId);
   }catch(error){if(this.flight===flight){try{this.hooks.store().finish(job.accountId,job.id,flight.dispatched?'uncertain':'failed',classifyError(error).code);}finally{this.release();}this.hooks.error(error);}}
  }catch(error){this.hooks.error(error);}
 }
 complete(id:string,runId:string,reply:ManualReply){
  const flight=this.flight;if(!flight||flight.job.id!==id||flight.runId!==runId)return false;
  try{
   if(reply.ok&&reply.sent)this.hooks.store().finish(flight.job.accountId,id,'sent',undefined,reply.sent.id);
   else if(!reply.ok&&reply.error.code==='QUEUE_DISPATCH_EXPIRED')this.hooks.store().interrupt(flight.job.accountId,id,false,'QUEUE_DISPATCH_EXPIRED');
   else if(!reply.ok)this.hooks.store().reject(flight.job.accountId,id,reply.error,Boolean(reply.uncertain),this.now());
   else this.hooks.store().finish(flight.job.accountId,id,'uncertain','SEND_NO_ACK');
   this.hooks.changed();
  }catch(error){this.hooks.error(error);}finally{this.release();}
  return true;
 }
}
