import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseAction,classifyError} from '../packages/shared/src/protocol';
import {Vault} from '../apps/desktop/src/main/vault';
import {checkBot} from '../packages/telegram-bot/src';
test('IPC rejects malformed and unsupported actions',()=>{
 for(const value of [null,{}, {type:'sendAll'}, {type:'search',query:'abc',exact:'yes'}, {type:'login',apiId:0,apiHash:'x',phone:'1'}, {type:'bot',token:'https://attacker'}])assert.throws(()=>parseAction(value));
 assert.deepEqual(parseAction({type:'search',query:'@telegram',exact:true}),{type:'search',query:'telegram',exact:true});
 assert.equal(parseAction({type:'answer',value:' 2fa with spaces '}).type,'answer');
});
test('error mapping preserves server wait and redacts unknown errors',()=>{
 assert.equal(classifyError({errorMessage:'FLOOD_WAIT_37',seconds:37}).retryAfter,37);
 assert.equal(classifyError(Error('PHONE_CODE_INVALID')).code,'PHONE_CODE_INVALID');
 assert.ok(!JSON.stringify(classifyError(Error('secret-token 123'))).includes('secret-token'));
});
test('vault fails closed and writes ciphertext, restores and clears',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'telegram-spike-'));
 try{
  const blocked=new Vault(directory,{available:async()=>false,encrypt:async()=>{throw Error('must not run');},decrypt:async()=>''});
  await assert.rejects(blocked.save({session:'secret'}),/ENCRYPTION_UNAVAILABLE/);
  // Fake crypto verifies orchestration only; Windows smoke validates real DPAPI.
  const vault=new Vault(directory,{available:async()=>true,encrypt:async value=>Buffer.from(Buffer.from(value).map(x=>x^0x77)),decrypt:async value=>Buffer.from(value.map(x=>x^0x77)).toString()});
  await vault.save({session:'test-secret'});
  assert.ok(!(await readFile(join(directory,'user-session.enc'))).includes(Buffer.from('test-secret')));
  assert.deepEqual(await vault.load(),{session:'test-secret'});
  await vault.clear();await assert.rejects(vault.load(),/NO_SESSION/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('bot getMe validates server result without leaking token on network errors',async()=>{
 const fake=(async()=>new Response(JSON.stringify({ok:true,result:{id:123,is_bot:true,first_name:'Test',username:'test_bot'}}))) as typeof fetch;
 assert.equal((await checkBot('123:test',fake)).kind,'bot');
 await assert.rejects(checkBot('123:secret',(async()=>{throw Error('url contains secret');}) as typeof fetch),{message:'BOT_NETWORK'});
 await assert.rejects(checkBot('123:test',(async()=>new Response('{}',{status:401})) as typeof fetch),{message:'BOT_UNAUTHORIZED'});
});
test('secret value and input validation preserve password whitespace',()=>{
 const action=parseAction({type:'answer',value:'  pass word  '});
 assert.deepEqual(action,{type:'answer',value:'  pass word  '});
 assert.throws(()=>parseAction({type:'search',query:'../data',exact:true}));
 assert.throws(()=>parseAction({type:'bot',token:'123:abc\nhttps://other'}));
});
test('forget waits for an in-flight save and leaves no session behind',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'telegram-spike-race-'));
 try{
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const vault=new Vault(directory,{available:async()=>true,encrypt:async value=>{await gate;return Buffer.from(value);},decrypt:async value=>value.toString()});
  const save=vault.save({session:'race'});
  const clear=vault.clear();
  release();await save;await clear;
  await assert.rejects(vault.load(),/NO_SESSION/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('login diagnostics distinguish credential, network and packaged worker failures',()=>{
 for(const code of ['API_ID_INVALID','PHONE_NUMBER_INVALID','PHONE_NUMBER_BANNED','PHONE_NUMBER_FLOOD','UPDATE_APP_TO_LOGIN']){
  assert.equal(classifyError({errorMessage:code}).code,code);
 }
 assert.equal(classifyError({code:'ECONNRESET',message:'private phone number'}).code,'ECONNRESET');
 const moduleError=classifyError({code:'MODULE_NOT_FOUND',message:'Cannot find module C:/Users/private-name/secret'});
 assert.equal(moduleError.code,'WORKER_DEPENDENCY_MISSING');
 assert.ok(!JSON.stringify(moduleError).includes('private-name'));
 assert.equal(classifyError(new TypeError('secret api hash')).code,'CLIENT_TYPE_ERROR');
 assert.ok(!JSON.stringify(classifyError(new TypeError('secret api hash'))).includes('secret api hash'));
});
