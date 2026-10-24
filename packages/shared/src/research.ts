import type {SearchPeer} from './protocol';
export type Comparison='new'|'seen'|'changed'|'not_public';
export type ResearchPeer=SearchPeer&{key:string;comparison:Comparison;firstSeen:string;lastSeen:string;query:string;note:string;tags:string;category:string;saved:boolean};
export type ResearchRun={id:number;query:string;exact:boolean;at:string;returned:number;publicCount:number;newCount:number;changedCount:number};
export type ResearchSnapshot={accountId:string;records:ResearchPeer[];runs:ResearchRun[];totalSaved:number};
export type ResearchAction={type:'list'}|{type:'save'|'delete';keys:string[]}|{type:'note';key:string;note:string;tags:string;category:string}|{type:'export';scope:'results'|'saved';format:'xlsx'|'csv';keys:string[]};
export type ResearchResponse={ok:true;snapshot?:ResearchSnapshot;fileName?:string;cancelled?:boolean}|{ok:false;error:string};
export function peerKey(peer:Pick<SearchPeer,'id'|'kind'|'peerType'>):string{return `${peer.peerType??(peer.kind==='bot'?'user':peer.kind)}:${peer.id}`;}
export function parseResearchAction(value:unknown):ResearchAction{
 if(!value||typeof value!=='object')throw Error('INPUT_INVALID');
 const v=value as Record<string,unknown>;
 const text=(key:string,max:number)=>{if(typeof v[key]!=='string'||(v[key] as string).length>max)throw Error('INPUT_INVALID');return v[key] as string;};
 const key=(value:unknown)=>{if(typeof value!=='string'||! /^(user|chat|channel|group):\d{1,25}$/.test(value))throw Error('INPUT_INVALID');return value;};
 const keys=()=>{if(!Array.isArray(v.keys)||!v.keys.length||v.keys.length>5000)throw Error('NO_SELECTION');return [...new Set(v.keys.map(key))];};
 switch(v.type){
 case 'list':return {type:'list'};
 case 'save':case 'delete':return {type:v.type,keys:keys()};
 case 'note':return {type:'note',key:key(v.key),note:text('note',4000),tags:text('tags',500),category:text('category',150)};
 case 'export':if(!['results','saved'].includes(String(v.scope))||!['xlsx','csv'].includes(String(v.format)))throw Error('INPUT_INVALID');return {type:'export',scope:v.scope as 'results'|'saved',format:v.format as 'xlsx'|'csv',keys:keys()};
 default:throw Error('INPUT_INVALID');
 }
}

export const RESEARCH_SEARCH_LIMIT=100;
export type ResearchFilters={kind:string;source:string;publicOnly:boolean;contains:string};
export const DEFAULT_RESEARCH_FILTERS:ResearchFilters={kind:'all',source:'all',publicOnly:false,contains:''};
export function filterResearchPeers(data:ResearchPeer[],filters:ResearchFilters=DEFAULT_RESEARCH_FILTERS):ResearchPeer[]{
 const contains=filters.contains.replace(/^@/,'').toLowerCase();
 return data.filter(peer=>(filters.kind==='all'||peer.kind===filters.kind)&&(filters.source==='all'||peer.sources.includes(filters.source as 'personalized'|'discovery'|'exact'))&&(!filters.publicOnly||Boolean(peer.username))&&(!contains||peer.username?.toLowerCase().includes(contains)));
}
