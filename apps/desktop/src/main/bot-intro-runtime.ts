import {BOT_TOPICS,type BotConsentInput} from '../../../../packages/shared/src/bot-consent';
import {setTimeout as delay} from 'node:timers/promises';
import {IntroBotApi,BotApiError,introReply,botConsentInput,type IntroReply} from '../../../../packages/telegram-bot/src/intro';
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
 snapshot(savedToken=false):BotSnapshot{return {state:this.state,identity:this.identity,config:this.identity?this.store.config(this.identity.id):{...DEFAULT_BOT_INTRO},error:this.failure,retryAt:this.retryUntil>this.now()?new Date(this.retryUntil).toISOString():undefined,lastPollAt:this.lastPollAt,savedToken,consentStats:this.identity?this.store.consents.stats(this.identity.id):{subscribers:0,activeTopics:0},stats:this.identity?this.store.stats(this.identity.id):{starts:0,choices:0,uncertain:0}};}
 private fail(error:unknown){const failure=classifyError(error);if(error instanceof BotApiError&&error.retryAfter){failure.retryAfter=error.retryAfter;this.retryUntil=Math.max(this.retryUntil,this.now()+error.retryAfter*1000);}this.failure=failure;this.state='error';}
 stop(clear=false){this.epoch++;this.controller?.abort();this.controller=undefined;this.state='stopped';if(this.identity)this.store.interrupt(this.identity.id);this.failure=undefined;if(clear){this.api=undefined;this.identity=undefined;this.lastPollAt=undefined;}}
 async verify(token:string){if(this.retryUntil>this.now())throw new BotApiError('BOT_RATE_LIMIT',Math.ceil((this.retryUntil-this.now())/1000));if(this.state==='running'||this.state==='starting')throw Error('BOT_RUNNING');this.stop(true);const epoch=this.epoch,controller=new AbortController();this.controller=controller;this.state='verifying';try{const api=new IntroBotApi(token,this.request),identity=await api.verify(controller.signal);if(epoch!==this.epoch)throw Error('CANCELLED');this.api=api;this.identity=identity;this.state='verified';}catch(error){if(epoch===this.epoch)this.fail(error);throw epoch===this.epoch?error:Error('CANCELLED');}}
 history(botId:string){if(this.identity?.id!==botId)throw Error('BOT_ID_MISMATCH');return this.store.consents.history(botId);}
 save(botId:string,config:BotIntroConfig){if(!this.identity||this.identity.id!==botId)throw Error('BOT_ID_MISMATCH');if(['running','starting','verifying'].includes(this.state))throw Error('BOT_RUNNING');this.store.save(botId,config);}
 async start(){if(!this.api||!this.identity)throw Error('BOT_NOT_VERIFIED');if(['running','starting','verifying'].includes(this.state))throw Error('BOT_RUNNING');if(this.retryUntil>this.now())throw new BotApiError('BOT_RATE_LIMIT',Math.ceil((this.retryUntil-this.now())/1000));const api=this.api,identity=this.identity,epoch=++this.epoch,controller=new AbortController();this.controller=controller;this.state='starting';this.failure=undefined;try{await api.checkWebhook(controller.signal);if(epoch!==this.epoch)throw Error('CANCELLED');this.state='running';void this.loop(api,identity,epoch,controller.signal);}catch(error){if(epoch===this.epoch)this.fail(error);throw epoch===this.epoch?error:Error('CANCELLED');}}
 private consentReply(bot:Identity,input:BotConsentInput):{reply:IntroReply;nonce?:string}{
  if(input.type==='stop'){this.store.consents.stop(bot.id,input,this.now());return {reply:input.callbackId?{kind:'choice',method:'answerCallbackQuery',body:{callback_query_id:input.callbackId,text:'Đã hủy tất cả đăng ký nhận tin với bot này. Muốn đăng ký lại, gửi /start và xác nhận chủ đề mới.',show_alert:true}}:{kind:'stop',method:'sendMessage',body:{chat_id:Number(input.userId),text:'Đã hủy tất cả đăng ký nhận tin với bot này. Muốn đăng ký lại, gửi /start và xác nhận chủ đề mới.'}}};}
  if(input.type==='choose'){const nonce=this.store.consents.choose(bot.id,input,this.now());if(!nonce)return {reply:{kind:'choice',method:'answerCallbackQuery',body:{callback_query_id:input.callbackId,text:'Lựa chọn cũ đã bị hủy bởi /stop. Gửi /start để chọn lại.',show_alert:true}}};const topic=BOT_TOPICS.find(t=>t.id===input.topic)!;return {nonce,reply:{kind:'choice',method:'sendMessage',body:{chat_id:Number(input.userId),text:'Xác nhận đăng ký: '+topic.label+'\n'+topic.description+'\nChỉ nhận chủ đề này. Bấm Xác nhận trong 5 phút; /stop hủy tất cả đăng ký. Nếu không muốn, bấm Hủy.',reply_markup:{inline_keyboard:[[{text:'Xác nhận: '+topic.label,callback_data:'bc:yes:'+nonce}],[{text:'Hủy yêu cầu này',callback_data:'bc:no:'+nonce}]]}}}};}
  const result=this.store.consents.decide(bot.id,input,this.now());return {reply:{kind:'choice',method:'answerCallbackQuery',body:{callback_query_id:input.callbackId,text:result==='confirmed'?'Đã ghi nhận đồng ý nhận tin cho đúng chủ đề bạn vừa xác nhận. Gửi /stop để hủy tất cả.':result==='cancelled'?'Đã hủy yêu cầu này. Đăng ký hiện có không thay đổi; gửi /stop để hủy tất cả.':'Yêu cầu hết hạn, không khớp hoặc đã xử lý. Gửi /start để chọn lại.',show_alert:true,cache_time:0}}};
 }
 private async loop(api:IntroBotApi,identity:Identity,epoch:number,signal:AbortSignal){
  try{while(epoch===this.epoch&&!signal.aborted){const updates=await api.updates(this.store.offset(identity.id),signal);if(epoch!==this.epoch)return;this.lastPollAt=new Date(this.now()).toISOString();
   // Apply every received opt-out locally before waiting on any outbound reply.
   for(const update of [...updates].sort((a,b)=>Number(a.update_id)-Number(b.update_id))){const input=botConsentInput(update,identity,this.now());if(input?.type==='stop'&&input.updateId>=this.store.offset(identity.id))this.store.consents.stop(identity.id,input,this.now());}
   for(const update of updates.sort((a,b)=>Number(a.update_id)-Number(b.update_id))){if(epoch!==this.epoch)return;const id=Number(update.update_id),input=botConsentInput(update,identity,this.now()),original=introReply(update,identity,this.store.config(identity.id),this.now());if(!this.store.take(identity.id,id,input?.type??original?.kind??'ignored'))continue;
    const planned:{reply?:IntroReply;nonce?:string}=input?this.consentReply(identity,input):{reply:original},reply=planned.reply;
    if(!reply){this.store.finish(identity.id,id,'ignored');continue;}
    try{
     if(input?.type==='choose'&&reply.method==='sendMessage'){await api.call('answerCallbackQuery',{callback_query_id:input.callbackId,text:'Vui lòng xác nhận trong tin nhắn tiếp theo.',cache_time:0},signal);if(epoch!==this.epoch)return;}
     const result=await api.call(reply.method,reply.body,signal);if(epoch!==this.epoch)return;
     if(reply.method==='sendMessage'){const messageId=(result as {message_id?:number})?.message_id;if(!Number.isSafeInteger(messageId)||messageId!<=0)throw new BotApiError('BOT_REPLY_UNCERTAIN');if(planned.nonce)this.store.consents.bind(identity.id,planned.nonce,messageId!);this.store.finish(identity.id,id,reply.kind==='choice'?'handled':'sent',undefined,messageId);}else{if(result!==true)throw new BotApiError('BOT_REPLY_UNCERTAIN');this.store.finish(identity.id,id,'handled');}}
    catch(error){if(epoch!==this.epoch)return;const code=classifyError(error).code;this.store.finish(identity.id,id,['BOT_NETWORK','BOT_REPLY_UNCERTAIN'].includes(code)?'uncertain':'failed',code);if(['BOT_RATE_LIMIT','BOT_POLL_CONFLICT','BOT_UNAUTHORIZED','BOT_NETWORK'].includes(code))throw error;}
   }
   if(epoch===this.epoch)await delay(250,undefined,{signal});
  }}catch(error){if(epoch===this.epoch){this.fail(error);this.controller?.abort();}}
 }
}
