import {TelegramClient,Api} from 'telegram';
import {StringSession} from 'telegram/sessions';
import {Logger,LogLevel} from 'telegram/extensions/Logger';
import {RESEARCH_SEARCH_LIMIT} from '../../shared/src/research';
import type {Identity,SearchPeer} from '../../shared/src/protocol';
export function makeClient(apiId:number,apiHash:string,session=''){
 // GramJS consumes one request attempt when migrating to the account DC.
 // Keep its normal bounded retry budget; FloodWait still exits immediately.
 const logger=new Logger(LogLevel.NONE);logger.log=()=>{};
 return new TelegramClient(new StringSession(session),apiId,apiHash,{connectionRetries:2,requestRetries:5,floodSleepThreshold:0,baseLogger:logger,autoReconnect:false});
}
export function identity(entity:Api.User|Api.Chat|Api.Channel):Identity{
 if(entity instanceof Api.User)return {id:entity.id.toString(),name:[entity.firstName,entity.lastName].filter(Boolean).join(' '),username:entity.username,kind:entity.bot?'bot':'user',peerType:'user'};
 return {id:entity.id.toString(),name:entity.title,username:entity instanceof Api.Channel?entity.username:undefined,kind:entity instanceof Api.Channel&&entity.broadcast?'channel':'group',peerType:entity instanceof Api.Channel?'channel':'chat'};
}
function supported(entity:Api.TypeUser|Api.TypeChat):entity is Api.User|Api.Chat|Api.Channel{return entity instanceof Api.User||entity instanceof Api.Chat||entity instanceof Api.Channel;}
export async function search(client:TelegramClient,query:string,exact:boolean):Promise<SearchPeer[]>{
 if(exact){const result=await client.invoke(new Api.contacts.ResolveUsername({username:query}));return [...result.users,...result.chats].filter(supported).map(entity=>({...identity(entity),sources:['exact']}));}
 const result=await client.invoke(new Api.contacts.Search({q:query,limit:RESEARCH_SEARCH_LIMIT}));
 const key=(peer:Api.TypePeer)=>peer instanceof Api.PeerUser?`user:${peer.userId}`:peer instanceof Api.PeerChannel?`channel:${peer.channelId}`:`chat:${peer.chatId}`;
 const personal=new Set(result.myResults.map(key)),discovered=new Set(result.results.map(key));
 return [...result.users,...result.chats].filter(supported).flatMap(entity=>{
  const peer=identity(entity),ref=`${peer.peerType}:${peer.id}`;
  const sources:SearchPeer['sources']=[];
  if(personal.has(ref))sources.push('personalized');
  if(discovered.has(ref))sources.push('discovery');
  return sources.length?[{...peer,sources}]:[];
 });
}
