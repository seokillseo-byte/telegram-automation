import type {TelegramClient} from 'telegram';
import {Raw} from 'telegram/events/Raw';
import {UpdateConnectionState} from 'telegram/network';
import type {InboxUpdate} from '../../shared/src/inbox';
import type {InboxReader} from './inbox';
export function subscribeInboxUpdates(client:Pick<TelegramClient,'addEventHandler'|'removeEventHandler'>,reader:InboxReader,publish:(update:InboxUpdate)=>void):()=>void{
 const event=new Raw({});let active=true;
 const handler=(raw:unknown)=>{
  if(!active)return;
  if(raw instanceof UpdateConnectionState){publish({type:'connection',connected:raw.state===UpdateConnectionState.connected});return;}
  const update=reader.update(raw);if(update)publish(update);
 };
 client.addEventHandler(handler,event);
 return ()=>{active=false;client.removeEventHandler(handler,event);};
}
