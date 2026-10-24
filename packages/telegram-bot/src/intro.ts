import type {Identity} from '../../shared/src/protocol';
import {botToken,BOT_CHOICES,introMenu,type BotIntroConfig} from '../../shared/src/bot-intro';
export class BotApiError extends Error{constructor(code:string,readonly retryAfter?:number){super(code);}}
export class IntroBotApi{
 private token:string;
 constructor(token:string,private request:typeof fetch=fetch){this.token=botToken(token);}
 async call(method:'getMe'|'getWebhookInfo'|'getUpdates'|'sendMessage'|'answerCallbackQuery',body:Record<string,unknown>,signal:AbortSignal):Promise<unknown>{
  let response:Response;try{response=await this.request(`https://api.telegram.org/bot${this.token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(method==='getUpdates'?30000:15000)]),redirect:'error'});}catch{throw new BotApiError('BOT_NETWORK');}
  let data:{ok?:boolean;result?:unknown;error_code?:number;parameters?:{retry_after?:number}};try{data=await response.json();}catch{throw new BotApiError(method==='sendMessage'||method==='answerCallbackQuery'?'BOT_REPLY_UNCERTAIN':'BOT_API');}
  if(!data||typeof data!=='object')throw new BotApiError('BOT_API');
  const code=data.error_code??response.status;if((response.status>=500||code>=500)&&(method==='sendMessage'||method==='answerCallbackQuery'))throw new BotApiError('BOT_REPLY_UNCERTAIN');
  if(code===401||code===404)throw new BotApiError('BOT_UNAUTHORIZED');if(code===409)throw new BotApiError('BOT_POLL_CONFLICT');if(code===403)throw new BotApiError('BOT_BLOCKED');
  if(code===429){const seconds=data.parameters?.retry_after;throw new BotApiError('BOT_RATE_LIMIT',typeof seconds==='number'&&Number.isFinite(seconds)&&seconds>0?Math.min(Math.ceil(seconds),86400):60);}
  if(!response.ok||data.ok!==true)throw new BotApiError('BOT_API');return data.result;
 }
 async verify(signal:AbortSignal):Promise<Identity>{const me=await this.call('getMe',{},signal) as {id?:number;is_bot?:boolean;first_name?:string;username?:string};if(!me||!Number.isSafeInteger(me.id)||me.id!<=0||me.is_bot!==true||typeof me.first_name!=='string'||!me.first_name||typeof me.username!=='string'||!/^\w{3,64}$/.test(me.username))throw new BotApiError('BOT_API');await this.checkWebhook(signal);return {id:String(me.id),name:me.first_name,username:me.username,kind:'bot',peerType:'user'};}
 async checkWebhook(signal:AbortSignal){const result=await this.call('getWebhookInfo',{},signal) as {url?:unknown};if(!result||typeof result.url!=='string')throw new BotApiError('BOT_API');if(result.url)throw new BotApiError('BOT_WEBHOOK_ACTIVE');}
 async updates(offset:number,signal:AbortSignal){const result=await this.call('getUpdates',{offset,limit:30,timeout:20,allowed_updates:['message','callback_query']},signal);if(!Array.isArray(result)||result.length>30||result.some(u=>!u||!Number.isSafeInteger(u.update_id)||u.update_id<0||u.update_id>=Number.MAX_SAFE_INTEGER))throw new BotApiError('BOT_API');return result as Record<string,unknown>[];}
}
type Message={message_id?:number;date?:number;text?:string;chat?:{id?:number;type?:string};from?:{id?:number;is_bot?:boolean};entities?:{type:string;offset:number;length:number}[];forward_origin?:unknown;via_bot?:unknown;is_automatic_forward?:boolean};
export type IntroReply={kind:'start'|'stop';method:'sendMessage';body:Record<string,unknown>}|{kind:'choice';method:'answerCallbackQuery';body:Record<string,unknown>};
export function introReply(update:Record<string,unknown>,bot:Identity,config:BotIntroConfig,now=Date.now()):IntroReply|undefined{
 const message=update.message as Message|undefined;
 if(message){
  if(message.chat?.type!=='private'||!Number.isSafeInteger(message.chat.id)||message.chat.id!<=0||message.from?.id!==message.chat.id||message.from?.is_bot!==false||message.forward_origin||message.via_bot||message.is_automatic_forward||!Number.isSafeInteger(message.date)||now/1000-message.date!>300||message.date!-now/1000>30||typeof message.text!=='string'||!Number.isSafeInteger(message.message_id)||message.message_id!<=0)return;
  const match=message.text.match(/^\/(start|stop)(?:@([a-zA-Z0-9_]+))?(?:\s+[^\r\n]{1,64})?$/);if(!match||match[2]&&match[2].toLowerCase()!==bot.username?.toLowerCase())return;
  const command='/'+match[1]+(match[2]?'@'+match[2]:'');if(!Array.isArray(message.entities)||!message.entities.some(e=>e&&e.type==='bot_command'&&e.offset===0&&e.length===command.length))return;
  return match[1]==='start'?{kind:'start',method:'sendMessage',body:{chat_id:message.chat.id,...introMenu(config)}}:{kind:'stop',method:'sendMessage',body:{chat_id:message.chat.id,text:'Bạn chưa đăng ký nhận nội dung qua bot này. Bot hiện không gửi thông báo tự động.'}};
 }
 const callback=update.callback_query as {id?:string;from?:{id?:number;is_bot?:boolean};data?:string;message?:Message}|undefined;
 if(!callback||typeof callback.id!=='string'||!callback.id||callback.id.length>256||callback.from?.is_bot!==false||!Number.isSafeInteger(callback.from.id)||callback.from.id!<=0||callback.message?.chat?.type!=='private'||callback.message.chat.id!==callback.from.id||String(callback.message.from?.id)!==bot.id)return;
 const choice=BOT_CHOICES.find(c=>c.id===callback.data);return choice?{kind:'choice',method:'answerCallbackQuery',body:{callback_query_id:callback.id,text:choice.answer,show_alert:true,cache_time:0}}:undefined;
}
