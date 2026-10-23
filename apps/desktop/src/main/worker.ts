import {parentPort} from 'node:worker_threads';
import {Api} from 'telegram';
import {makeClient,identity,search} from '../../../../packages/telegram-user/src';
import {classifyError,type Status} from '../../../../packages/shared/src/protocol';
const port=parentPort!;
let client:ReturnType<typeof makeClient>|undefined;
let answer:((value:string)=>void)|undefined;
let busy=false;
let authFailure:unknown;
const emit=(status:Status)=>port.postMessage({kind:'status',status});
async function ask(state:string):Promise<string>{emit({state});return new Promise(resolve=>{answer=resolve;});}
port.on('message',async (message)=>{
 if(message.type==='answer'){if(answer){const callback=answer;answer=undefined;callback(message.value);}return;}
 if(busy){emit({state:'error',error:classifyError(Error('BUSY'))});return;}
 busy=true;
 try{
  if(message.type==='login'||message.type==='restore'){
   authFailure=undefined;
   if(client)await client.destroy();
   client=makeClient(message.apiId,message.apiHash,message.session??'');
   if(message.type==='restore'){
    await client.connect();if(!await client.checkAuthorization())throw Error('AUTH_KEY_UNREGISTERED');
   } else {
    await client.start({phoneNumber:message.phone,firstAndLastNames:async()=>{throw Error('PHONE_NUMBER_UNOCCUPIED');},phoneCode:()=>ask('awaiting_code'),password:()=>ask('awaiting_password'),onError:async(error)=>{authFailure=error;return true;}});
    if(!await client.checkAuthorization())throw Error('CANCELLED');
   }
   const me=await client.getMe();
   port.postMessage({kind:'session',value:{apiId:message.apiId,apiHash:message.apiHash,session:client.session.save()},identity:identity(me as Api.User)});
  } else if(message.type==='search'){
   if(!client||!await client.checkAuthorization())throw Error('NOT_CONNECTED');
   emit({state:'searching'});const results=await search(client,message.query,message.exact);emit({state:'search_complete',queryResults:results});
  } else if(message.type==='logout'){
   if(client){await client.invoke(new Api.auth.LogOut());await client.destroy();client=undefined;}
   port.postMessage({kind:'logged_out'});
  }
 }catch(error){emit({state:'error',error:classifyError(authFailure??error)});authFailure=undefined;}finally{busy=false;}
});
