import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {classifyError} from '../packages/shared/src/protocol';
import {makeClient} from '../packages/telegram-user/src';
const sdk=createRequire(resolve('apps/desktop/package.json'));
const {Api,errors}=sdk('telegram');
const {invoke}=sdk('telegram/client/users');

test('real SDK retries sendCode after Telegram redirects login to another DC',async()=>{
 const adapter=makeClient(1,'0'.repeat(32));
 const options=adapter as unknown as {_requestRetries:number;floodSleepThreshold:number};
 let attempts=0;let migratedTo=0;
 const expected={phoneCodeHash:'test-code-hash'};
 const sender={addStateToQueue(state:{reject:(e:unknown)=>void;resolve:(v:unknown)=>void}){
  attempts++;
  if(attempts===1)state.reject(new errors.PhoneMigrateError({capture:2}));
  else state.resolve(expected);
 }};
 const client={_sender:sender,_connectedDeferred:{promise:Promise.resolve()},_requestRetries:options._requestRetries,floodSleepThreshold:options.floodSleepThreshold,_log:{info:()=>{}},session:{processEntities:()=>{}},_entityCache:{add:()=>{}},isUserAuthorized:async()=>false,_switchDC:async(dc:number)=>{migratedTo=dc;}};
 const request=new Api.auth.SendCode({phoneNumber:'+10000000000',apiId:1,apiHash:'0'.repeat(32),settings:new Api.CodeSettings({})});
 const result=await invoke(client,request);
 assert.equal(result,expected);assert.equal(attempts,2);assert.equal(migratedTo,2);
});

test('real SDK surfaces FloodWait without automatically retrying login',async()=>{
 const adapter=makeClient(1,'0'.repeat(32));
 const options=adapter as unknown as {_requestRetries:number;floodSleepThreshold:number};
 let attempts=0;
 const sender={addStateToQueue(state:{reject:(e:unknown)=>void}){attempts++;state.reject(new errors.FloodWaitError({capture:30}));}};
 const client={_sender:sender,_connectedDeferred:{promise:Promise.resolve()},_requestRetries:options._requestRetries,floodSleepThreshold:options.floodSleepThreshold,_log:{info:()=>{}},session:{processEntities:()=>{}},_entityCache:{add:()=>{}}};
 const request=new Api.auth.SendCode({phoneNumber:'+10000000000',apiId:1,apiHash:'0'.repeat(32),settings:new Api.CodeSettings({})});
 await assert.rejects(invoke(client,request),(error:unknown)=>error instanceof errors.FloodWaitError);
 assert.equal(attempts,1);
});

test('real GramJS error subclasses preserve RPC code and FloodWait seconds in UI',()=>{
 assert.equal(classifyError(new errors.BadRequestError('API_ID_INVALID',undefined,400)).code,'API_ID_INVALID');
 assert.equal(classifyError(new errors.BadRequestError('PHONE_NUMBER_INVALID',undefined,400)).code,'PHONE_NUMBER_INVALID');
 assert.equal(classifyError(new errors.FloodWaitError({capture:37})).retryAfter,37);
 assert.equal(classifyError(Error('Request was unsuccessful 1 time(s)')).code,'REQUEST_RETRIES_EXHAUSTED');
 const unknown=classifyError(new errors.BadRequestError('SECRET_API_VALUE',undefined,400));
 assert.equal(unknown.code,'TELEGRAM_ERROR');
 assert.ok(!JSON.stringify(unknown).includes('SECRET_API_VALUE'));
});
