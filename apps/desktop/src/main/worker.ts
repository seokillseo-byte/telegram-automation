import {ManualSender} from '../../../../packages/telegram-user/src/manual-send';
const sender=new ManualSender();
import {subscribeInboxUpdates} from '../../../../packages/telegram-user/src/inbox-updates';
let unsubscribeInbox:(()=>void)|undefined;
import {InboxReader} from '../../../../packages/telegram-user/src/inbox';
const inbox=new InboxReader();
import {parentPort} from 'node:worker_threads';
import {Api} from 'telegram';
import {makeClient,identity,search} from '../../../../packages/telegram-user/src';
import {analyzeGroup} from '../../../../packages/telegram-user/src/group-analysis';
import {classifyError,type Status} from '../../../../packages/shared/src/protocol';
const port=parentPort!;
let client:ReturnType<typeof makeClient>|undefined;
let answer:((value:string)=>void)|undefined;
let busy=false;
let authFailure:unknown;let ownAccount='';
let stage='initializing';
const emit=(status:Status)=>port.postMessage({kind:'status',status});
async function ask(state:string):Promise<string>{stage=state;emit({state,stage});return new Promise(resolve=>{answer=resolve;});}
port.on('message',async (message)=>{
 if(message.type==='probe'){try{const probe=makeClient(1,'0'.repeat(32));await probe.destroy();port.postMessage({kind:'probe',ok:true});}catch(error){port.postMessage({kind:'probe',ok:false,error:classifyError(error)});}return;}
 if(message.type==='answer'){if(answer){const callback=answer;answer=undefined;callback(message.value);}return;}
 if(busy){emit({state:'error',error:classifyError(Error('BUSY'))});return;}
 busy=true;
 try{
  if(message.type==='login'||message.type==='restore'){
   authFailure=undefined;stage='creating_client';emit({state:'connecting',stage});
   ownAccount='';sender.reset();unsubscribeInbox?.();unsubscribeInbox=undefined;inbox.reset();if(client)await client.destroy();
   client=makeClient(message.apiId,message.apiHash,message.session??'');
   stage='connecting_transport';emit({state:'connecting',stage});
   await client.connect();
   stage=message.type==='restore'?'checking_session':'requesting_code';emit({state:'connecting',stage});
   if(message.type==='restore'){
    if(!await client.checkAuthorization())throw Error('AUTH_KEY_UNREGISTERED');
   } else {
    await client.start({phoneNumber:message.phone,firstAndLastNames:async()=>{throw Error('PHONE_NUMBER_UNOCCUPIED');},phoneCode:()=>ask('awaiting_code'),password:()=>ask('awaiting_password'),onError:async(error)=>{authFailure=error;return true;}});
    if(!await client.checkAuthorization())throw Error('CANCELLED');
   }
   stage='loading_identity';emit({state:'connecting',stage});
   const me=await client.getMe();ownAccount=me.id.toString();
   unsubscribeInbox=subscribeInboxUpdates(client,inbox,update=>port.postMessage({kind:'inbox_update',update}));
   port.postMessage({kind:'session',value:{apiId:message.apiId,apiHash:message.apiHash,session:client.session.save()},identity:identity(me as Api.User)});
  } else if(message.type==='scheduled'){
   try{if(!client)throw Error('NOT_CONNECTED');port.postMessage({kind:'queue_result',id:message.id,reply:await sender.scheduled(client,message.payload,ownAccount)});}
   catch(error){port.postMessage({kind:'queue_result',id:message.id,reply:{ok:false,error:sender.noteFailure(error)}});}
  } else if(message.type==='manual'){
   try{if(!client)throw Error('NOT_CONNECTED');if(message.action.type==='schedule'){port.postMessage({kind:'schedule_ready',payload:sender.exportSchedule(message.action.id,ownAccount),previewId:message.action.id,dueAt:message.action.dueAt,zone:message.action.zone});return;}const reply=message.action.type==='capabilities'?await sender.capabilities(client,inbox,message.action):message.action.type==='preview'?await sender.preview(client,inbox,message.action,message.attachment):await sender.confirm(client,message.action.id);port.postMessage({kind:'manual',reply});}
   catch(error){port.postMessage({kind:'manual',reply:{ok:false,error:sender.noteFailure(error)}});}
  } else if(message.type==='inbox'){
   try{if(!client||!await client.checkAuthorization())throw Error('NOT_CONNECTED');
    port.postMessage({kind:'inbox',reply:await inbox.read(client,message.action)});
   }catch(error){port.postMessage({kind:'inbox',reply:{ok:false,error:classifyError(error)}});}
  } else if(message.type==='search'){
   if(!client||!await client.checkAuthorization())throw Error('NOT_CONNECTED');
   stage=message.exact?'resolving_username':'searching_public';emit({state:'searching',stage});const results=await search(client,message.query,message.exact);emit({state:'search_complete',stage:'search_complete',queryResults:results,searchContext:{query:message.query,exact:message.exact}});
  } else if(message.type==='analyzeGroup'){
   if(!client||!await client.checkAuthorization())throw Error('NOT_CONNECTED');
   const groupReport=await analyzeGroup(client,message.target,next=>{stage=next;emit({state:'analyzing_group',stage});});
   stage='group_analysis_complete';emit({state:'group_analysis_complete',stage,groupReport});
  } else if(message.type==='logout'){
   if(client){await client.invoke(new Api.auth.LogOut());ownAccount='';sender.reset();unsubscribeInbox?.();unsubscribeInbox=undefined;inbox.reset();await client.destroy();client=undefined;}
   port.postMessage({kind:'logged_out'});
  }
 }catch(error){emit({state:'error',stage,error:classifyError(authFailure??error)});authFailure=undefined;}finally{busy=false;}
});
