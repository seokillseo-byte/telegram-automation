import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {IntroBotApi,introReply} from '../packages/telegram-bot/src/intro';
import {BotIntroRuntime} from '../apps/desktop/src/main/bot-intro-runtime';
import {BotIntroStore} from '../apps/desktop/src/main/bot-intro-store';
import {SendPolicyStore} from '../apps/desktop/src/main/send-policy-store';
import {Vault} from '../apps/desktop/src/main/vault';
import {BOT_CHOICES,DEFAULT_BOT_INTRO,parseBotIntroAction,introMenu} from '../packages/shared/src/bot-intro';
const token='123456:'+('A'.repeat(35)),bot={id:'123456',name:'Fixture bot',kind:'bot' as const,username:'fixture_bot',peerType:'user' as const};
const stamp=Math.floor(Date.now()/1000);
function start(id=10,text='/start',chat=42){return {update_id:id,message:{message_id:id,date:stamp,text,chat:{id:chat,type:'private'},from:{id:chat,is_bot:false},entities:[{type:'bot_command',offset:0,length:text.split(' ')[0].length}]}};}
function choice(id=11,data:string=BOT_CHOICES[0].id){return {update_id:id,callback_query:{id:'callback-'+id,data,from:{id:42,is_bot:false},message:{message_id:99,date:stamp,chat:{id:42,type:'private'},from:{id:123456,is_bot:true}}}};}
const response=(result:unknown)=>new Response(JSON.stringify({ok:true,result}),{status:200});
async function fixture(){const dir=await mkdtemp(join(tmpdir(),'bot-intro-')),file=join(dir,'app.sqlite'),store=new BotIntroStore(file);return {dir,file,store,close:async()=>{store.close();await rm(dir,{recursive:true,force:true});}};}
async function until(check:()=>boolean){for(let i=0;i<100&&!check();i++)await new Promise(resolve=>setTimeout(resolve,10));assert.ok(check(),'Condition did not settle');}
function provider(batches:unknown[][]){const calls:{method:string;body:Record<string,unknown>}[]=[];let onSend:(()=>Promise<Response>)|undefined;
 const request:typeof fetch=async(url,init)=>{const method=String(url).split('/').at(-1)!,body=JSON.parse(String(init?.body));calls.push({method,body});assert.equal(init?.redirect,'error');if(method==='getMe')return response({id:123456,is_bot:true,first_name:'Fixture bot',username:'fixture_bot'});if(method==='getWebhookInfo')return response({url:''});if(method==='getUpdates'){if(batches.length)return response(batches.shift());return new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));}if(method==='sendMessage')return onSend?onSend():response({message_id:77});if(method==='answerCallbackQuery')return response(true);throw Error('Unexpected method');};
 return {calls,request,onSend:(fn:()=>Promise<Response>)=>{onSend=fn;}};}

test('bot commands/config validate allowlisted fields and preview always states that start is not consent',()=>{
 assert.equal(parseBotIntroAction({type:'verify',token,remember:true}).type,'verify');for(const action of [{type:'verify',token:'bad',remember:true},{type:'start',recipients:[42]},{type:'saveConfig',botId:'@name',config:DEFAULT_BOT_INTRO},{type:'saveConfig',botId:'1',config:{welcome:'x',subscribers:[42]}}])assert.throws(()=>parseBotIntroAction(action));
 const menu=introMenu({welcome:'Literal <b>hello</b>'});assert.ok(menu.text.startsWith('Literal <b>hello</b>'));assert.match(menu.text,/chưa đăng ký/);assert.equal(menu.reply_markup.inline_keyboard.length,3);assert.ok(BOT_CHOICES.every(c=>c.answer.length<=200&&Buffer.byteLength(c.id)<=64));assert.equal((menu as {parse_mode?:string}).parse_mode,undefined);
});

test('only fresh direct private commands and own-bot private menu callbacks produce replies',()=>{
 assert.equal(introReply(start(),bot,DEFAULT_BOT_INTRO)?.kind,'start');assert.equal(introReply(start(10,'/start@fixture_bot example'),bot,DEFAULT_BOT_INTRO)?.kind,'start');assert.equal(introReply(start(10,'/stop'),bot,DEFAULT_BOT_INTRO)?.kind,'stop');
 for(const update of [start(10,'/startsomething'),start(10,'/start@other_bot'),{...start(),message:{...start().message,date:stamp-400}},{...start(),message:{...start().message,chat:{id:42,type:'group'}}},{...start(),message:{...start().message,entities:[]}},{...start(),message:{...start().message,from:{id:42,is_bot:true}}},{...start(),message:{...start().message,forward_origin:{type:'user'}}}])assert.equal(introReply(update,bot,DEFAULT_BOT_INTRO),undefined);
 assert.equal(introReply(choice(),bot,DEFAULT_BOT_INTRO)?.method,'answerCallbackQuery');assert.equal(introReply(choice(11,'subscribe:all'),bot,DEFAULT_BOT_INTRO),undefined);assert.equal(introReply({...choice(),callback_query:{...choice().callback_query,message:{...choice().callback_query.message,from:{id:999,is_bot:true}}}},bot,DEFAULT_BOT_INTRO),undefined);
});

test('verify is read-only; explicit start sends menu/choice exactly once and never grants consent',async()=>{
 const f=await fixture(),p=provider([[start(),start(),choice(),start(12,'/start',43)]]),runtime=new BotIntroRuntime(f.store,p.request),policy=new SendPolicyStore(f.file);
 try{await runtime.verify(token);assert.deepEqual(p.calls.map(c=>c.method),['getMe','getWebhookInfo']);assert.equal(runtime.snapshot().state,'verified');await runtime.start();await until(()=>runtime.snapshot().stats.starts===2&&runtime.snapshot().stats.choices===1);runtime.stop();assert.equal(p.calls.filter(c=>c.method==='sendMessage').length,2);assert.equal(p.calls.filter(c=>c.method==='answerCallbackQuery').length,1);assert.equal(policy.list('123456').length,0);assert.equal(policy.list('1').length,0);assert.equal(f.store.offset('123456'),13);assert.equal(JSON.stringify(runtime.snapshot()).includes(token),false);assert.equal(p.calls.some(c=>['deleteWebhook','setWebhook','setMyCommands'].includes(c.method)),false);}
 finally{runtime.stop();policy.close();await f.close();}
});

test('webhook and competing polling are reported without deleting integrations or sending messages',async()=>{
 const f=await fixture();let methods:string[]=[];const webhook:typeof fetch=async(url)=>{const method=String(url).split('/').at(-1)!;methods.push(method);return method==='getMe'?response({id:123456,is_bot:true,first_name:'Fixture',username:'fixture_bot'}):response({url:'https://example.test/private-webhook'});};const runtime=new BotIntroRuntime(f.store,webhook);
 try{await assert.rejects(runtime.verify(token),/BOT_WEBHOOK_ACTIVE/);assert.deepEqual(methods,['getMe','getWebhookInfo']);assert.equal(runtime.snapshot().state,'error');const p=provider([]),other=new BotIntroRuntime(f.store,async(url,init)=>String(url).endsWith('/getUpdates')?new Response(JSON.stringify({ok:false,error_code:409}),{status:409}):p.request(url,init));await other.verify(token);await other.start();await until(()=>other.snapshot().state==='error');assert.equal(other.snapshot().error?.code,'BOT_POLL_CONFLICT');assert.equal(p.calls.filter(c=>c.method==='sendMessage').length,0);other.stop();}
 finally{runtime.stop();await f.close();}
});

test('stop invalidates a pending poll and late responses cannot send or advance offsets',async()=>{
 const f=await fixture(),p=provider([]);let release!:(value:Response)=>void;const runtime=new BotIntroRuntime(f.store,async(url,init)=>String(url).endsWith('/getUpdates')?new Promise(resolve=>{release=resolve;}):p.request(url,init));
 try{await runtime.verify(token);await runtime.start();await until(()=>Boolean(release));runtime.stop();release(response([start()]));await new Promise(resolve=>setTimeout(resolve,20));assert.equal(runtime.snapshot().state,'stopped');assert.equal(p.calls.filter(c=>c.method==='sendMessage').length,0);assert.equal(f.store.offset('123456'),0);}
 finally{runtime.stop();await f.close();}
});

test('stop during an outbound request stays uncertain; reopening skips the old update instead of replaying it',async()=>{
 const f=await fixture(),p=provider([[start()]]),runtime=new BotIntroRuntime(f.store,p.request);let release!:(value:Response)=>void;p.onSend(()=>new Promise(resolve=>{release=resolve;}));
 try{await runtime.verify(token);await runtime.start();await until(()=>Boolean(release));runtime.stop();release(response({message_id:77}));await new Promise(resolve=>setTimeout(resolve,20));assert.equal(runtime.snapshot().stats.uncertain,1);assert.equal(runtime.snapshot().stats.starts,0);const p2=provider([[start(),start(11)]]),reopened=new BotIntroStore(f.file),other=new BotIntroRuntime(reopened,p2.request);try{await other.verify(token);await other.start();await until(()=>other.snapshot().stats.starts===1);other.stop();assert.equal(p2.calls.filter(c=>c.method==='sendMessage').length,1);assert.equal(other.snapshot().stats.uncertain,1);}finally{other.stop();reopened.close();}}
 finally{runtime.stop();await f.close();}
});

test('rate limit stops without auto retry and honors the returned wait on explicit restart; errors redact token',async()=>{
 const f=await fixture(),p=provider([[start()]]);let now=Date.now();p.onSend(async()=>new Response(JSON.stringify({ok:false,error_code:429,parameters:{retry_after:60}}),{status:429}));const runtime=new BotIntroRuntime(f.store,p.request,()=>now);
 try{await runtime.verify(token);await runtime.start();await until(()=>runtime.snapshot().state==='error');assert.equal(runtime.snapshot().error?.retryAfter,60);const count=p.calls.length;await assert.rejects(runtime.start(),/BOT_RATE_LIMIT/);await assert.rejects(runtime.verify(token),/BOT_RATE_LIMIT/);assert.equal(p.calls.length,count);now+=61000;assert.equal(runtime.snapshot().retryAt,undefined);const bad=new IntroBotApi(token,async()=>{throw Error('Network '+token);});await assert.rejects(bad.verify(new AbortController().signal),error=>!String(error).includes(token)&&String(error).includes('BOT_NETWORK'));}
 finally{runtime.stop();await f.close();}
});

test('bot configs/offsets are isolated; interrupted claims recover without replay, storing no recipient content',async()=>{
 const f=await fixture();try{f.store.save('1',{welcome:'Bot one'});f.store.save('2',{welcome:'Bot two'});assert.equal(f.store.config('1').welcome,'Bot one');assert.equal(f.store.config('2').welcome,'Bot two');assert.equal(f.store.take('1',100,'start'),true);assert.equal(f.store.take('1',100,'start'),false);assert.equal(f.store.offset('2'),0);const reopened=new BotIntroStore(f.file);try{assert.equal(reopened.stats('1').uncertain,1);assert.equal(reopened.take('1',100,'start'),false);assert.equal(reopened.offset('1'),101);}finally{reopened.close();}assert.equal((await readFile(f.file)).includes(Buffer.from(token)),false);}
 finally{await f.close();}
});

test('bot token vault uses its own encrypted file and clearing it preserves the user session',async()=>{
 const f=await fixture(),crypto={available:async()=>true,encrypt:async(v:string)=>Buffer.from(Buffer.from(v).map(b=>b^0x37)),decrypt:async(v:Buffer)=>Buffer.from(v.map(b=>b^0x37)).toString()},user=new Vault(f.dir,crypto),botVault=new Vault(f.dir,crypto,'bot-token.enc');
 try{assert.equal(await botVault.exists(),false);await user.save({session:'user-secret'});await botVault.save({token});assert.equal(await botVault.exists(),true);assert.equal((await readFile(join(f.dir,'bot-token.enc'))).includes(Buffer.from(token)),false);assert.deepEqual(await botVault.load(),{token});await botVault.clear();assert.equal(await botVault.exists(),false);assert.deepEqual(await user.load(),{session:'user-secret'});}
 finally{await f.close();}
});

test('server failure or unreadable acknowledgment after outbound reply is uncertain and never retried',async()=>{
 const f=await fixture(),p=provider([[start()]]),runtime=new BotIntroRuntime(f.store,p.request);p.onSend(async()=>new Response('upstream failed',{status:502}));
 try{await runtime.verify(token);await runtime.start();await until(()=>runtime.snapshot().stats.uncertain===1);runtime.stop();assert.equal(p.calls.filter(c=>c.method==='sendMessage').length,1);assert.equal(runtime.snapshot().stats.starts,0);assert.equal(f.store.offset('123456'),11);}
 finally{runtime.stop();await f.close();}
});

test('late token verification cannot restore a stopped bot or start a listener',async()=>{
 const f=await fixture(),p=provider([]);let release!:(r:Response)=>void;const runtime=new BotIntroRuntime(f.store,async(url,init)=>String(url).endsWith('/getMe')?new Promise(resolve=>{release=resolve;}):p.request(url,init));
 try{const verifying=runtime.verify(token).catch(error=>error);await until(()=>Boolean(release));runtime.stop(true);release(response({id:123456,is_bot:true,first_name:'Fixture bot',username:'fixture_bot'}));assert.match(String(await verifying),/CANCELLED/);assert.equal(runtime.snapshot().state,'stopped');assert.equal(runtime.snapshot().identity,undefined);assert.equal(p.calls.some(c=>c.method==='getUpdates'||c.method==='sendMessage'),false);}
 finally{runtime.stop();await f.close();}
});
