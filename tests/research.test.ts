import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {ResearchStore} from '../apps/desktop/src/main/research-store';
import {toWorkbook,toCSV} from '../apps/desktop/src/main/research-export';
import {parseResearchAction,type ResearchPeer} from '../packages/shared/src/research';
import type {SearchPeer} from '../packages/shared/src/protocol';
const peer:SearchPeer={id:'9007199254740993',name:'Cộng đồng SEO',username:'seo_test',kind:'channel',peerType:'channel',sources:['discovery']};

test('SQLite deduplicates, compares observations, isolates accounts and persists notes across reopen',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'research-test-'));let db=new ResearchStore(join(dir,'test.sqlite'));
 try{
  const first=db.record('1','seo',false,[peer,peer,{...peer,id:'99',username:undefined}]);
  assert.equal(first.length,2);assert.equal(first[0].comparison,'new');assert.equal(first[1].comparison,'not_public');
  db.save('1',[first[0].key]);db.note('1',first[0].key,'Đối tác ngành','SEO','Marketing');
  assert.equal(db.record('1','seo',false,[peer])[0].comparison,'seen');
  assert.equal(db.record('1','marketing',false,[{...peer,username:'new_name'}])[0].comparison,'changed');
  assert.equal(db.snapshot('1').totalSaved,1);
  assert.equal(db.record('2','seo',false,[peer])[0].comparison,'new');
  assert.equal(db.snapshot('2').totalSaved,0);
  db.close();db=new ResearchStore(join(dir,'test.sqlite'));
  const saved=db.snapshot('1').records[0];assert.equal(saved.username,'new_name');assert.equal(saved.note,'Đối tác ngành');assert.equal(saved.id,'9007199254740993');
  assert.equal(db.snapshot('1').runs[0].changedCount,1);
  assert.throws(()=>db.save('1',['channel:999']));assert.equal(db.snapshot('1').totalSaved,1);
  db.remove('1',[saved.key]);assert.equal(db.snapshot('1').totalSaved,0);
  assert.equal(db.record('1','seo',false,[peer])[0].comparison,'new');
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('Excel roundtrip preserves large IDs, Vietnamese and formula-like notes as text; CSV neutralizes formulas',async()=>{
 const record:ResearchPeer={...peer,key:'channel:'+peer.id,comparison:'new',firstSeen:'2026-10-24T00:00:00.000Z',lastSeen:'2026-10-24T00:00:00.000Z',query:'seo',note:'=HYPERLINK("https://example.invalid")',tags:'SEO',category:'Công nghệ',saved:true};
 const sdk=createRequire(resolve('apps/desktop/package.json'));const ExcelJS=sdk('exceljs');
 const book=new ExcelJS.Workbook();await book.xlsx.load(await toWorkbook([record],'1'));
 const sheet=book.getWorksheet('Ho so');assert.equal(sheet.getCell('A2').value,peer.id);assert.equal(sheet.getCell('D2').value,'Cộng đồng SEO');assert.equal(sheet.getCell('N2').value,record.note);assert.equal(sheet.getCell('N2').type,ExcelJS.ValueType.String);assert.equal(sheet.getCell('N2').value.formula,undefined);
 assert.equal(book.getWorksheet('Thong ke').getCell('B4').value,1);
 const csv=toCSV([record]);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes(peer.id));
});

test('research IPC refuses paths, arbitrary IDs, oversized notes and malformed selection',()=>{
 assert.throws(()=>parseResearchAction({type:'export',scope:'saved',format:'exe',keys:['channel:1']}));
 assert.throws(()=>parseResearchAction({type:'save',keys:['../../file']}));
 assert.throws(()=>parseResearchAction({type:'note',key:'channel:1',note:'x'.repeat(4001),tags:'',category:''}));
 assert.throws(()=>parseResearchAction({type:'export',scope:'saved',format:'xlsx',keys:[]}));
 assert.deepEqual(parseResearchAction({type:'save',keys:['user:1','user:1']}),{type:'save',keys:['user:1']});
});

test('search preserves personalized and discovery sources and distinguishes chat/channel IDs',async()=>{
 const sdk=createRequire(resolve('apps/desktop/package.json'));const {Api}=sdk('telegram');
 const {search}=await import('../packages/telegram-user/src');
 const user=new Api.User({id:BigInt(11),firstName:'SEO',username:'seo_user'});
 const channel=new Api.Channel({id:BigInt(22),title:'SEO public',username:'seo_channel',broadcast:true});
 const chat=new Api.Chat({id:BigInt(22),title:'SEO private'});
 let calls=0;
 const fake={invoke:async(request:{className:string;limit?:number})=>{calls++;assert.equal(request.limit,20);return {myResults:[new Api.PeerUser({userId:BigInt(11)}),new Api.PeerChat({chatId:BigInt(22)})],results:[new Api.PeerUser({userId:BigInt(11)}),new Api.PeerChannel({channelId:BigInt(22)})],users:[user],chats:[channel,chat]};}};
 const peers=await search(fake as never,'seo',false);
 assert.equal(calls,1);assert.equal(peers.length,3);
 assert.deepEqual(peers.find(p=>p.id==='11')?.sources,['personalized','discovery']);
 assert.deepEqual(peers.find(p=>p.peerType==='channel')?.sources,['discovery']);
 assert.deepEqual(peers.find(p=>p.peerType==='chat')?.sources,['personalized']);
});
