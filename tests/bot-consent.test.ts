import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BotIntroStore} from '../apps/desktop/src/main/bot-intro-store';
import {BotIntroRuntime} from '../apps/desktop/src/main/bot-intro-runtime';
import {BotConsentStore} from '../apps/desktop/src/main/bot-consent-store';
import {botConsentInput,introReply} from '../packages/telegram-bot/src/intro';
import {BOT_CONFIRM_TTL,type BotTopic} from '../packages/shared/src/bot-consent';
import {DEFAULT_BOT_INTRO,parseBotIntroAction} from '../packages/shared/src/bot-intro';
import {SendPolicyStore} from '../apps/desktop/src/main/send-policy-store';
const token='123456:'+('A'.repeat(35)),bot={id:'123456',name:'Fixture',kind:'bot' as const,username:'fixture_bot'};
const choose=(topic:BotTopic='product',updateId=1,userId='42')=>({type:'choose' as const,topic,updateId,userId,callbackId:'c'+updateId});
const confirm=(nonce:string,updateId=2,userId='42',messageId=77)=>({type:'confirm' as const,nonce,userId,updateId,messageId,callbackId:'c'+updateId});
const stop=(updateId=3,userId='42')=>({type:'stop' as const,userId,updateId,source:'bot:/stop' as const});
function callback(id:number,data:string,user=42,messageId=77){return {update_id:id,callback_query:{id:'c'+id,data,from:{id:user,is_bot:false},message:{message_id:messageId,date:Math.floor(Date.now()/1000),chat:{id:user,type:'private'},from:{id:123456,is_bot:true}}}};}
function command(id:number,text='/stop',date=Math.floor(Date.now()/1000)){return {update_id:id,message:{message_id:id,text,date,chat:{id:42,type:'private'},from:{id:42,is_bot:false},entities:[{type:'bot_command',offset:0,length:text.length}]}};}
const response=(result:unknown)=>new Response(JSON.stringify({ok:true,result}),{status:200});
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'bot-consent-')),file=join(dir,'app.sqlite'),store=new BotIntroStore(file);return {file,store,c:store.consents,close:async()=>{store.close();await rm(dir,{recursive:true,force:true});}};}
async function until(check:()=>boolean){for(let i=0;i<300&&!check();i++)await new Promise(resolve=>setTimeout(resolve,10));assert.ok(check(),'Condition did not settle');}
function provider(batches:Record<string,unknown>[][]){const calls:{method:string;body:Record<string,unknown>}[]=[];let send:((body:Record<string,unknown>)=>Response|Promise<Response>)|undefined,answer:((body:Record<string,unknown>)=>Response|Promise<Response>)|undefined;
 const request:typeof fetch=async(url,init)=>{const method=String(url).split('/').at(-1)!,body=JSON.parse(String(init?.body));calls.push({method,body});if(method==='getMe')return response({id:123456,is_bot:true,first_name:'Fixture',username:'fixture_bot'});if(method==='getWebhookInfo')return response({url:''});if(method==='getUpdates'){if(batches.length)return response(batches.shift());return new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));}if(method==='sendMessage')return send?send(body):response({message_id:77});if(method==='answerCallbackQuery')return answer?answer(body):response(true);throw Error('Unexpected method');};
 return {request,calls,send:(fn:typeof send)=>{send=fn;},answer:(fn:typeof answer)=>{answer=fn;}};}
function grant(c:BotConsentStore,topic:BotTopic,base:number,userId='42',botId='123456'){const nonce=c.choose(botId,choose(topic,base,userId))!;c.bind(botId,nonce,77);assert.equal(c.decide(botId,confirm(nonce,base+1,userId)),'confirmed');return nonce;}

test('topic selection alone is not consent; confirmation binds bot, user, topic and delivered message',async()=>{
 const f=await fixture();try{const nonce=f.c.choose(bot.id,choose())!;assert.match(nonce,/^[a-f0-9]{32}$/);assert.equal(f.c.active(bot.id,'42','product'),false);assert.equal(f.c.history(bot.id).length,0);assert.equal(f.c.decide(bot.id,confirm(nonce)),'invalid');f.c.bind(bot.id,nonce,77);
 assert.equal(f.c.decide('999',confirm(nonce)),'invalid');assert.equal(f.c.decide(bot.id,confirm(nonce,2,'43')),'invalid');assert.equal(f.c.decide(bot.id,confirm(nonce,2,'42',78)),'invalid');assert.equal(f.c.decide(bot.id,confirm(nonce)),'confirmed');assert.equal(f.c.active(bot.id,'42','product'),true);assert.equal(f.c.active(bot.id,'42','guides'),false);assert.deepEqual(f.c.stats(bot.id),{subscribers:1,activeTopics:1});assert.equal(f.c.history(bot.id)[0].source,'bot:confirm_callback');assert.equal(f.c.history(bot.id)[0].purpose,'bot_topic_updates');}
 finally{await f.close();}
});

test('expired, cancelled, replaced and already-used confirmations cannot register',async()=>{
 const f=await fixture();try{const now=Date.now(),expired=f.c.choose(bot.id,choose(),now)!;f.c.bind(bot.id,expired,77);assert.equal(f.c.decide(bot.id,confirm(expired),now+BOT_CONFIRM_TTL),'invalid');
 const old=f.c.choose(bot.id,choose('product',3))!,current=f.c.choose(bot.id,choose('guides',4))!;f.c.bind(bot.id,old,77);f.c.bind(bot.id,current,77);assert.equal(f.c.decide(bot.id,confirm(old,5)),'invalid');assert.equal(f.c.decide(bot.id,{...confirm(current,6),type:'cancel'}),'cancelled');assert.equal(f.c.decide(bot.id,confirm(current,7)),'invalid');assert.equal(f.c.stats(bot.id).subscribers,0);
 const used=grant(f.c,'product',8);assert.equal(f.c.decide(bot.id,confirm(used,10)),'invalid');assert.equal(f.c.history(bot.id).length,1);}
 finally{await f.close();}
});

test('stop revokes all topics, invalidates old buttons and permits only a fresh explicit opt-in',async()=>{
 const f=await fixture();try{grant(f.c,'product',1);grant(f.c,'guides',3);grant(f.c,'product',5,'43');grant(f.c,'guides',7,'42','999');const pending=f.c.choose(bot.id,choose('product',9))!;f.c.bind(bot.id,pending,77);
 f.c.stop(bot.id,stop(11));assert.equal(f.c.active(bot.id,'42','product'),false);assert.equal(f.c.active(bot.id,'42','guides'),false);assert.equal(f.c.active(bot.id,'43','product'),true);assert.equal(f.c.active('999','42','guides'),true);assert.equal(f.c.decide(bot.id,confirm(pending,12)),'invalid');assert.equal(f.c.choose(bot.id,choose('product',10)),undefined);f.c.stop(bot.id,stop(11));assert.equal(f.c.history(bot.id).filter(e=>e.event==='opt_out').length,1);
 grant(f.c,'guides',13);assert.equal(f.c.active(bot.id,'42','guides'),true);assert.equal(f.c.active(bot.id,'42','product'),false);}
 finally{await f.close();}
});

test('registration and immutable consent history persist across reopen without inheriting user-account policy',async()=>{
 const f=await fixture(),policy=new SendPolicyStore(f.file);try{policy.change({type:'grant',accountId:'1',target:{id:'42',peerType:'user',name:'Fixture'},source:'User-account-only consent'});assert.equal(f.c.active(bot.id,'42','product'),false);grant(f.c,'product',1);const reopened=new BotConsentStore(f.file);try{assert.equal(reopened.active(bot.id,'42','product'),true);assert.equal(reopened.decide(bot.id,confirm('0'.repeat(32),2)),'invalid');assert.equal(reopened.history(bot.id).length,1);assert.equal(reopened.history('999').length,0);}finally{reopened.close();}assert.equal(policy.inspect('1',{id:'42',peerType:'user',name:'Fixture'}).consent,'granted');}
 finally{policy.close();await f.close();}
});

test('stop parsing accepts delayed direct opt-outs but rejects foreign/group commands and invalid callbacks',()=>{
 assert.equal(botConsentInput(command(1,'/stop',Math.floor(Date.now()/1000)-86400),bot)?.type,'stop');assert.equal(botConsentInput(command(1,'/stop',Math.floor(Date.now()/1000)+86400),bot)?.type,'stop');assert.equal(botConsentInput({...command(1),message:{...command(1).message,chat:{id:42,type:'group'}}},bot),undefined);assert.equal(botConsentInput(callback(1,'sub:topic:product:v2'),bot)?.type,'choose');assert.equal(botConsentInput(callback(1,'sub:topic:all:v2'),bot),undefined);assert.equal(botConsentInput(callback(1,'bc:yes:bad'),bot),undefined);assert.equal(botConsentInput(callback(1,'intro:product:v1'),bot),undefined);assert.equal(introReply(callback(1,'intro:product:v1'),bot,DEFAULT_BOT_INTRO)?.kind,'choice');assert.throws(()=>parseBotIntroAction({type:'consentHistory',botId:'123456',userId:'42'}));
});

test('runtime persists a chosen-topic confirmation before acknowledging; duplicate updates never grant twice',async()=>{
 const f=await fixture(),batches=[[command(1,'/start'),callback(2,'sub:topic:product:v2')]],p=provider(batches),runtime=new BotIntroRuntime(f.store,p.request);
 p.send(body=>{const keyboard=body.reply_markup as {inline_keyboard:{callback_data:string}[][]};const data=keyboard.inline_keyboard[0][0].callback_data;if(data.startsWith('bc:yes:')){assert.equal(f.c.stats(bot.id).subscribers,0);batches.push([callback(3,data),callback(3,data)]);}return response({message_id:77});});p.answer(body=>{if(String(body.text).startsWith('Đã ghi nhận'))assert.equal(f.c.active(bot.id,'42','product'),true);return response(true);});
 try{await runtime.verify(token);await runtime.start();await until(()=>runtime.snapshot().consentStats?.subscribers===1);runtime.stop();assert.equal(f.c.history(bot.id).length,1);assert.equal(f.c.history(bot.id)[0].topic,'product');assert.equal(runtime.history(bot.id).length,1);assert.throws(()=>runtime.history('999'),/BOT_ID_MISMATCH/);assert.equal(p.calls.filter(c=>c.method==='sendMessage').length,2);}
 finally{runtime.stop();await f.close();}
});

test('stop in the received batch is applied before any replies and defeats an older queued confirmation',async()=>{
 const f=await fixture();grant(f.c,'product',1);const nonce=f.c.choose(bot.id,choose('guides',3))!;f.c.bind(bot.id,nonce,77);const p=provider([[callback(4,'bc:yes:'+nonce),command(5)]]),runtime=new BotIntroRuntime(f.store,p.request);
 p.answer(()=>{assert.equal(f.c.active(bot.id,'42','product'),false);assert.equal(f.c.active(bot.id,'42','guides'),false);return response(true);});p.send(()=>{assert.equal(f.c.stats(bot.id).subscribers,0);return response({message_id:78});});
 try{await runtime.verify(token);await runtime.start();await until(()=>f.store.offset(bot.id)===6);runtime.stop();assert.equal(f.c.history(bot.id).filter(e=>e.event==='opt_in').length,1);assert.equal(f.c.history(bot.id)[0].event,'opt_out');}
 finally{runtime.stop();await f.close();}
});

test('losing opt-in or stop acknowledgment never rolls back the saved consent decision',async()=>{
 const f=await fixture(),nonce=f.c.choose(bot.id,choose())!;f.c.bind(bot.id,nonce,77);const p=provider([[callback(2,'bc:yes:'+nonce)]]),runtime=new BotIntroRuntime(f.store,p.request);p.answer(async()=>{throw Error('lost ack');});
 try{await runtime.verify(token);await runtime.start();await until(()=>runtime.snapshot().state==='error');assert.equal(f.c.active(bot.id,'42','product'),true);runtime.stop();const q=provider([[command(3)]]),other=new BotIntroRuntime(f.store,q.request);q.send(async()=>{assert.equal(f.c.active(bot.id,'42','product'),false);throw Error('lost ack');});try{await other.verify(token);await other.start();await until(()=>other.snapshot().state==='error');assert.equal(f.c.active(bot.id,'42','product'),false);assert.equal(f.c.history(bot.id)[0].source,'bot:/stop');assert.equal(f.c.history(bot.id).length,2);}finally{other.stop();}}
 finally{runtime.stop();await f.close();}
});
