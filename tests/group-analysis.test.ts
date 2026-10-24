import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {aggregateSample,normalizeGroupTarget,parseAnalysisAction,type GroupReport} from '../packages/shared/src/group-analysis';
import {analyzeGroup} from '../packages/telegram-user/src/group-analysis';
import {ResearchStore} from '../apps/desktop/src/main/research-store';
import {groupWorkbook} from '../apps/desktop/src/main/group-export';
const sdk=createRequire(resolve('apps/desktop/package.json'));const {Api,errors}=sdk('telegram');
const report:GroupReport={id:'00000000-0000-4000-8000-000000000001',target:'public_group',groupId:'9007199254740993',title:'Cộng đồng nghiên cứu',username:'public_group',kind:'group',about:'Mô tả công khai',members:null,analyzedAt:'2026-10-24T06:00:00.000Z',sampleLimit:100,fetched:2,historyStatus:'available',mayBeTruncated:false,warnings:[],...aggregateSample([{id:1,date:1700000000,text:'Nghiên cứu ngành SEO',views:0,replies:2},{id:2,date:1700086400,text:'Nghiên cứu ngành SEO',views:10,replies:4}])};

test('aggregates UTC days and known metrics without treating missing data as zero',()=>{
 const sample=aggregateSample([{id:1,date:1700000000,text:'SEO SEO marketing @person_test https://t.me/person_test +84912345678',views:0,replies:0},{id:2,date:1700086400,text:'SEO marketing @person_test',views:10},{id:2,date:1700086400,text:'SEO marketing @person_test',views:10}]);
 assert.equal(sample.sampleCount,2);assert.equal(sample.sampleDays,2);assert.equal(sample.samplePerDay,1);
 assert.deepEqual(sample.metrics.views,{total:10,average:5,available:2});
 assert.deepEqual(sample.metrics.replies,{total:0,average:0,available:1});
 assert.deepEqual(sample.metrics.reactions,{total:null,average:null,available:0});
 assert.equal(sample.terms.find(t=>t.term==='seo')?.posts,2);
 assert.ok(!JSON.stringify(sample).includes('person_test'));assert.ok(!JSON.stringify(sample).includes('84912345678'));
 assert.equal(aggregateSample([]).oldest,null);assert.equal(aggregateSample([]).samplePerDay,null);
});

test('target validation accepts public usernames and rejects private invites, arbitrary URLs and malformed IPC',()=>{
 assert.equal(normalizeGroupTarget(' @public_group '),'public_group');
 assert.equal(normalizeGroupTarget('https://t.me/public_group/123'),'public_group');
 for(const value of ['https://t.me/+abc','https://t.me/joinchat/abc','https://t.me/c/123/4','https://example.com/group','http://t.me/group','https://user:pass@t.me/group','https://t.me/group?x=1','../group'])assert.throws(()=>normalizeGroupTarget(value));
 assert.throws(()=>parseAnalysisAction({type:'export',ids:['../../file']}));
 assert.throws(()=>parseAnalysisAction({type:'delete',ids:[]}));
 assert.deepEqual(parseAnalysisAction({type:'export',ids:[report.id,report.id]}),{type:'export',ids:[report.id]});
});

function fixture(history:unknown[]){
 const channel=new Api.Channel({id:BigInt(123),accessHash:BigInt(456),title:'Cộng đồng SEO',username:'public_group',megagroup:true});
 const calls:string[]=[];
 const fake={invoke:async(request:{className:string})=>{calls.push(request.className);if(request.className==='contacts.ResolveUsername')return {peer:new Api.PeerChannel({channelId:BigInt(123)}),chats:[channel],users:[]};if(request.className==='channels.GetFullChannel')return {fullChat:new Api.ChannelFull({id:BigInt(123),about:'Mô tả',participantsCount:42})};throw Error('Unexpected request');},getMessages:async(_peer:unknown,options:{limit:number})=>{calls.push('getMessages');assert.equal(options.limit,100);return history;}};
 return {fake,calls};
}

test('group adapter reads metadata and bounded sample without participant enumeration or stored authors/text',async()=>{
 const messages=[new Api.Message({id:1,date:1700000000,message:'SEO marketing @private_author',fromId:new Api.PeerUser({userId:BigInt(777)}),views:10,forwards:0,replies:new Api.MessageReplies({replies:3}),reactions:new Api.MessageReactions({results:[new Api.ReactionCount({reaction:new Api.ReactionEmoji({emoticon:'👍'}),count:2})]})}),new Api.Message({id:2,date:1700086400,message:'SEO marketing @private_author'}),new Api.MessageService({id:3,date:1700086401})];
 const {fake,calls}=fixture(messages);const result=await analyzeGroup(fake as never,'@public_group');
 assert.deepEqual(calls,['contacts.ResolveUsername','channels.GetFullChannel','getMessages']);
 assert.equal(result.members,42);assert.equal(result.sampleCount,2);assert.equal(result.fetched,3);assert.equal(result.metrics.reactions.total,2);
 assert.ok(!JSON.stringify(result).includes('private_author'));assert.ok(!('messages' in result));assert.ok(!('participants' in result));
});

test('restricted history produces explicitly unavailable aggregates and FloodWait exits without another attempt',async()=>{
 const {fake,calls}=fixture([]);fake.getMessages=async()=>{calls.push('history-failed');throw Error('private payload');};
 const result=await analyzeGroup(fake as never,'public_group');assert.equal(result.historyStatus,'unavailable');assert.equal(result.metrics.views.total,null);assert.ok(!JSON.stringify(result).includes('private payload'));
 const flood=new errors.FloodWaitError({capture:30});let attempts=0;
 fake.getMessages=async()=>{attempts++;throw flood;};
 await assert.rejects(analyzeGroup(fake as never,'public_group'),error=>error===flood);assert.equal(attempts,1);
});

test('personal profile is rejected before reading metadata or history',async()=>{
 let calls=0;const fake={invoke:async()=>{calls++;return {peer:new Api.PeerUser({userId:BigInt(1)}),chats:[],users:[]};}};
 await assert.rejects(analyzeGroup(fake as never,'a_person'),/GROUP_TARGET_REQUIRED/);assert.equal(calls,1);
});

test('reports persist through additive SQLite migration, remain account scoped, export correct workbook and delete',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'group-report-'));const file=join(directory,'research.sqlite');let store=new ResearchStore(file);
 try{
  store.close();const legacy=new DatabaseSync(file);legacy.exec("DROP TABLE group_reports; UPDATE research_meta SET value='1' WHERE key='schema_version'");legacy.close();store=new ResearchStore(file);
  store.saveGroupReport('1',report);assert.equal(store.listGroupReports('2').length,0);assert.throws(()=>store.selectGroupReports('2',[report.id]));
  store.close();store=new ResearchStore(file);assert.equal(store.selectGroupReports('1',[report.id])[0].metrics.views.total,10);
  const ExcelJS=sdk('exceljs');const book=new ExcelJS.Workbook();await book.xlsx.load(await groupWorkbook(store.listGroupReports('1')));
  assert.equal(book.getWorksheet('Tong quan').getCell('A2').value,'9007199254740993');assert.equal(book.getWorksheet('Tong quan').getCell('E2').value,null);assert.equal(book.getWorksheet('Hoat dong UTC').rowCount,3);assert.equal(book.worksheets.length,4);
  store.deleteGroupReports('1',[report.id]);assert.equal(store.listGroupReports('1').length,0);
 }finally{store.close();await rm(directory,{recursive:true,force:true});}
});
