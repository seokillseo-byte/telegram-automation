import {TelegramClient,Api} from 'telegram';
import {StringSession} from 'telegram/sessions';
import {Logger,LogLevel} from 'telegram/extensions/Logger';
import type {Identity} from '../../shared/src/protocol';
export function makeClient(apiId:number,apiHash:string,session=''){
 const logger=new Logger(LogLevel.NONE);logger.log=()=>{};
 return new TelegramClient(new StringSession(session),apiId,apiHash,{connectionRetries:2,requestRetries:1,floodSleepThreshold:0,baseLogger:logger,autoReconnect:false});
}
export function identity(entity:Api.User|Api.Chat|Api.Channel):Identity{
 if(entity instanceof Api.User)return {id:entity.id.toString(),name:[entity.firstName,entity.lastName].filter(Boolean).join(' '),username:entity.username,kind:entity.bot?'bot':'user'};
 return {id:entity.id.toString(),name:entity.title,username:entity instanceof Api.Channel?entity.username:undefined,kind:entity instanceof Api.Channel&&entity.broadcast?'channel':'group'};
}
function supported(entity:Api.TypeUser|Api.TypeChat):entity is Api.User|Api.Chat|Api.Channel{return entity instanceof Api.User||entity instanceof Api.Chat||entity instanceof Api.Channel;}
export async function search(client:TelegramClient,query:string,exact:boolean):Promise<Identity[]>{
 if(exact){const result=await client.invoke(new Api.contacts.ResolveUsername({username:query}));return [...result.users,...result.chats].filter(supported).map(identity);}
 const result=await client.invoke(new Api.contacts.Search({q:query,limit:20}));
 const refs=new Set([...result.myResults,...result.results].map(peer=>peer instanceof Api.PeerUser?`user:${peer.userId}`:peer instanceof Api.PeerChannel?`channel:${peer.channelId}`:`chat:${peer.chatId}`));
 return [...result.users,...result.chats].filter(supported).filter(entity=>refs.has(`${entity instanceof Api.User?'user':entity instanceof Api.Channel?'channel':'chat'}:${entity.id}`)).map(identity);
}
