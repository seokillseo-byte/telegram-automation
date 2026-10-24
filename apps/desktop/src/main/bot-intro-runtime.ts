import {setTimeout as delay} from 'node:timers/promises';
import {IntroBotApi,BotApiError,introReply} from '../../../../packages/telegram-bot/src/intro';
import {classifyError,type Identity} from '../../../../packages/shared/src/protocol';
import {DEFAULT_BOT_INTRO,type BotSnapshot,type BotIntroConfig} from '../../../../packages/shared/src/bot-intro';
import type {BotIntroStore} from './bot-intro-store';
export class BotIntroRuntime{
 private api:IntroBotApi|undefined;
 private controller:AbortController|undefined;
 private epoch=0;
 private identity:Identity|undefined;
 private state:BotSnapshot['state']='stopped';
 private failure:BotSnapshot['error'];
 private retryUntil=0;
 private lastPollAt:string|undefined;
 constructor(private store:BotIntroStore,private request:typeof fetch=fetch,private now=()=>Date.now()){}
 snapshot(savedToken=false):BotSnapshot{return {state:this.state,identity:this.identity,config:this.identity?this.store.config(this.identity.id):{...DEFAULT_BOT_INTRO},error:this.failure,retryAt:this.retryUntil>this.now()?new Date(this.retryUntil).toISOString():undefined,lastPollAt:this.lastPollAt,savedToken,stats:this.identity?this.store.stats(this.identity.id):{starts:0,choices:0,uncertain:0}};}
 private fail(error:unknown){const failure=classifyError(error);if(error instanceof BotApiError&&error.retryAfter){failure.retryAfter=error.retryAfter;this.retryUntil=Math.max(this.retryUntil,this.now()+error.retryAfter*1000);}this.failure=failure;this.state='error';}
 stop(clear=false){this.epoch++;this.controller?.abort();this.controller=undefined;this.state='stopped';if(this.identity)this.store.interrupt(this.identity.id);this.failure=undefined;if(clear){this.api=undefined;this.identity=undefined;this.lastPollAt=undefined;}}
 async verify(token:string){if(this.state==='running'||this.state==='starting')throw Error('BOT_RUNNING');this.stop(true);const epoch=this.epoch,controller=new AbortController();this.controller=controller;this.state='verifying';try{const api=new IntroBotApi(token,this.request),identity=await api.verify(controller.signal);if(epoch!==this.epoch)throw Error('CANCELLED');this.api=api;this.identity=identity;this.state='verified';}catch(error){if(epoch===this.epoch)this.fail(error);throw epoch===this.epoch?error:Error('CANCELLED');}}
 save(botId:string,config:BotIntroConfig){if(!this.identity||this.identity.id!==botId)throw Error('BOT_ID_MISMATCH');if(['running','starting','verifying'].includes(this.state))throw Error('BOT_RUNNING');this.store.save(botId,config);}
 async start(){if(!this.api||!this.identity)throw Error('BOT_NOT_VERIFIED');if(['running','starting','verifying'].includes(this.state))throw Error('BOT_RUNNING');if(this.retryUntil>this.now())throw new BotApiError('BOT_RATE_LIMIT',Math.ceil((this.retryUntil-this.now())/1000));const api=this.api,identity=this.identity,epoch=++this.epoch,controller=new AbortController();this.controller=controller;this.state='starting';this.failure=undefined;try{await api.checkWebhook(controller.signal);if(epoch!==this.epoch)throw Error('CANCELLED');this.state='running';void this.loop(api,identity,epoch,controller.signal);}catch(error){if(epoch===this.epoch)this.fail(error);throw epoch===this.epoch?error:Error('CANCELLED');}}
 private async loop(api:IntroBotApi,identity:Identity,epoch:number,signal:AbortSignal){
  try{while(epoch===this.epoch&&!signal.aborted){const updates=await api.updates(this.store.offset(identity.id),signal);if(epoch!==this.epoch)return;this.lastPollAt=new Date(this.now()).toISOString();
   for(const update of updates.sort((a,b)=>Number(a.update_id)-Number(b.update_id))){if(epoch!==this.epoch)return;const id=Number(update.update_id),reply=introReply(update,identity,this.store.config(identity.id),this.now());if(!this.store.take(identity.id,id,reply?.kind??'ignored'))continue;
    if(!reply){this.store.finish(identity.id,id,'ignored');continue;}
    try{const result=await api.call(reply.method,reply.body,signal);if(epoch!==this.epoch)return;if(reply.method==='sendMessage'){const messageId=(result as {message_id?:number})?.message_id;if(!Number.isSafeInteger(messageId)||messageId!<=0)throw new BotApiError('BOT_REPLY_UNCERTAIN');this.store.finish(identity.id,id,'sent',undefined,messageId);}else{if(result!==true)throw new BotApiError('BOT_REPLY_UNCERTAIN');this.store.finish(identity.id,id,'handled');}}
    catch(error){if(epoch!==this.epoch)return;const code=classifyError(error).code;this.store.finish(identity.id,id,['BOT_NETWORK','BOT_REPLY_UNCERTAIN'].includes(code)?'uncertain':'failed',code);if(['BOT_RATE_LIMIT','BOT_POLL_CONFLICT','BOT_UNAUTHORIZED','BOT_NETWORK'].includes(code))throw error;}
   }
   if(epoch===this.epoch)await delay(250,undefined,{signal});
  }}catch(error){if(epoch===this.epoch){this.fail(error);this.controller?.abort();}}
 }
}
