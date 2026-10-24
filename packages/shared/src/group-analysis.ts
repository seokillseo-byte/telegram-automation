export const GROUP_SAMPLE_LIMIT=100;
export type SampleMessage={id:number;date:number;text:string;views?:number;forwards?:number;replies?:number;reactions?:number};
export type Metric={total:number|null;average:number|null;available:number};
export type GroupReport={
 id:string;target:string;groupId:string;title:string;username:string;kind:'group'|'channel';about:string;members:number|null;analyzedAt:string;
 sampleLimit:number;fetched:number;sampleCount:number;historyStatus:'available'|'unavailable';oldest:string|null;newest:string|null;sampleDays:number;samplePerDay:number|null;mayBeTruncated:boolean;
 metrics:{views:Metric;forwards:Metric;replies:Metric;reactions:Metric};daily:{day:string;count:number}[];terms:{term:string;posts:number}[];warnings:string[];
};
export type AnalysisAction={type:'list'}|{type:'export'|'delete';ids:string[]};
export type AnalysisResponse={ok:true;reports?:GroupReport[];fileName?:string;cancelled?:boolean}|{ok:false;error:string};
export function normalizeGroupTarget(value:unknown):string{
 if(typeof value!=='string'||value.length>256)throw Error('INPUT_INVALID');
 let target=value.trim();
 if(/^https?:\/\//i.test(target)){
  let url:URL;try{url=new URL(target);}catch{throw Error('INPUT_INVALID');}
  if(url.protocol!=='https:'||!['t.me','telegram.me'].includes(url.hostname)||url.username||url.password||url.port||url.search||url.hash)throw Error('INPUT_INVALID');
  const match=url.pathname.match(/^\/([a-zA-Z][a-zA-Z0-9_]{2,63})(?:\/\d+)?\/?$/);if(!match)throw Error('INPUT_INVALID');target=match[1];
 }
 target=target.replace(/^@/,'');
 if(!/^[a-zA-Z][a-zA-Z0-9_]{2,63}$/.test(target)||['joinchat'].includes(target.toLowerCase()))throw Error('INPUT_INVALID');
 return target;
}
export function parseAnalysisAction(value:unknown):AnalysisAction{
 if(!value||typeof value!=='object')throw Error('INPUT_INVALID');
 const v=value as Record<string,unknown>;
 if(v.type==='list')return {type:'list'};
 if(!['export','delete'].includes(String(v.type))||!Array.isArray(v.ids)||!v.ids.length||v.ids.length>100||v.ids.some(id=>typeof id!=='string'||! /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)))throw Error('INPUT_INVALID');
 return {type:v.type as 'export'|'delete',ids:[...new Set(v.ids as string[])]};
}
const stop=new Set('the and for with that this from have your you are not www com http https của cho các một những trong được không với này như khi thì vào đến tại trên cũng hoặc hơn đang đã là và tôi bạn chúng thể theo lại chỉ còn có sẽ về đó để từ'.split(' '));
export function aggregateSample(messages:SampleMessage[]){
 const sample=[...new Map(messages.filter(m=>Number.isInteger(m.id)&&Number.isFinite(m.date)&&m.date>0).map(m=>[m.id,m])).values()];
 const metric=(key:'views'|'forwards'|'replies'|'reactions'):Metric=>{
  const values=sample.map(m=>m[key]).filter((v):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0);
  const total=values.reduce((a,b)=>a+b,0);return {total:values.length?total:null,average:values.length?total/values.length:null,available:values.length};
 };
 const daily=new Map<string,number>(),terms=new Map<string,number>();
 for(const m of sample){
  const day=new Date(m.date*1000).toISOString().slice(0,10);daily.set(day,(daily.get(day)??0)+1);
  const clean=m.text.toLowerCase().replace(/https?:\/\/\S+|\bwww\.\S+|[\w.+-]+@[\w.-]+\.[a-z]+|@[\p{L}\p{N}_]+|\+?\d[\d .()-]{6,}\d/gu,' ');
  const words=new Set((clean.match(/\p{L}[\p{L}\p{M}]{2,24}/gu)??[]).filter(w=>!stop.has(w)));
  for(const word of words)terms.set(word,(terms.get(word)??0)+1);
 }
 const sorted=sample.map(m=>m.date).sort((a,b)=>a-b),oldest=sorted.length?new Date(sorted[0]*1000).toISOString():null,newest=sorted.length?new Date(sorted[sorted.length-1]*1000).toISOString():null;
 const days=sorted.length?Math.floor(sorted[sorted.length-1]/86400)-Math.floor(sorted[0]/86400)+1:0;
 return {sampleCount:sample.length,oldest,newest,sampleDays:days,samplePerDay:days?sample.length/days:null,metrics:{views:metric('views'),forwards:metric('forwards'),replies:metric('replies'),reactions:metric('reactions')},daily:[...daily].sort(([a],[b])=>a.localeCompare(b)).map(([day,count])=>({day,count})),terms:[...terms].filter(([,posts])=>posts>=2).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,20).map(([term,posts])=>({term,posts}))};
}
