import type {Identity} from './protocol';
export type SendPurpose='personal'|'marketing';
export type PolicyTarget={id:string;peerType:'user'|'chat'|'channel';name:string};
export type PolicyRecord={target:PolicyTarget;consent:'unknown'|'granted'|'revoked';suppressed:boolean;updatedAt?:string;source?:string};
export type PolicyEvent={at:string;type:'grant'|'revoke'|'suppress'|'unsuppress';source:string};
export type PolicyAction={type:'list'}|{type:'inspect';target:PolicyTarget}|{type:'grant'|'revoke'|'suppress'|'unsuppress';accountId:string;target:PolicyTarget;source:string};
export type PolicyReply={ok:true;accountId:string;records?:PolicyRecord[];record?:PolicyRecord;events?:PolicyEvent[]}|{ok:false;error:string};
export function sendPurpose(value:unknown):SendPurpose{if(value==='personal'||value==='marketing')return value;throw Error('INPUT_INVALID');}
export function policyTarget(value:unknown):PolicyTarget{
 if(!value||typeof value!=='object')throw Error('INPUT_INVALID');const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['id','peerType','name'].includes(k))||typeof v.id!=='string'||!(/^[1-9][0-9]{0,19}$/).test(v.id)||!['user','chat','channel'].includes(String(v.peerType))||typeof v.name!=='string'||!v.name.trim()||v.name.length>200||/[\u0000-\u001f]/.test(v.name))throw Error('INPUT_INVALID');return {id:v.id,peerType:v.peerType as PolicyTarget['peerType'],name:v.name.trim()};
}
export function policyPeer(identity:Identity):PolicyTarget{return policyTarget({id:identity.id,peerType:identity.peerType,name:identity.name});}
export function policyKey(target:PolicyTarget):string{return target.peerType+':'+target.id;}
export function parsePolicyAction(value:unknown):PolicyAction{
 if(!value||typeof value!=='object')throw Error('INPUT_INVALID');const v=value as Record<string,unknown>;
 if(v.type==='list'&&Object.keys(v).length===1)return {type:'list'};
 if(v.type==='inspect'&&Object.keys(v).length===2)return {type:'inspect',target:policyTarget(v.target)};
 if(['grant','revoke','suppress','unsuppress'].includes(String(v.type))&&Object.keys(v).length===4&&typeof v.accountId==='string'&&/^[1-9][0-9]{0,19}$/.test(v.accountId)&&typeof v.source==='string'&&v.source.trim()&&v.source.length<=500&&!/[\u0000-\u001f]/.test(v.source))return {type:v.type as 'grant'|'revoke'|'suppress'|'unsuppress',accountId:v.accountId,target:policyTarget(v.target),source:v.source.trim()};throw Error('INPUT_INVALID');
}
export const PURPOSE_LABELS:Record<SendPurpose,string>={personal:'Trao đổi / hỗ trợ cá nhân',marketing:'Marketing · cần đồng ý đã ghi nhận'};
