import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {ResearchStore} from '../apps/desktop/src/main/research-store';
import {parseAppAction} from '../packages/shared/src/app-state';
import {parseTemplate,previewTemplate} from '../packages/shared/src/templates';

test('template variables reject unknown or malformed expressions; values stay literal and missing values visible',()=>{
 for(const body of ['Hi {{unknown}}','Hi {{ten','Hi {{}}','Hi {{ten.toString}}'])assert.throws(()=>parseTemplate({name:'Test',body}));
 assert.throws(()=>parseTemplate({name:' ',body:'hello'}));assert.throws(()=>parseTemplate({name:'x',body:'x'.repeat(4097)}));
 assert.throws(()=>parseAppAction({type:'deleteTemplate',id:'../../file'}));
 assert.throws(()=>parseAppAction({type:'saveTemplate',template:{name:'x',body:'ok',token:'secret'}}));
 const result=previewTemplate('Chào {{ ten }}: {{san_pham}} – {{ten}}',{ten:'$& {{cong_ty}} <script>'});
 assert.equal(result.text,'Chào $& {{cong_ty}} <script>: {{san_pham}} – $& {{cong_ty}} <script>');assert.deepEqual(result.missing,['san_pham']);
});

test('schema 3 upgrade preserves research and settings; templates CRUD persists and does not enter support logs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'templates-'));const file=join(dir,'app.sqlite');let store=new ResearchStore(file);
 try{
  store.savePreferences({timeZone:'UTC',compact:true,startPage:'account'});
  const rows=store.record('1','test',false,[{id:'5',name:'Test',username:'test_person',kind:'user',sources:['exact']}]);store.save('1',[rows[0].key]);store.note('1',rows[0].key,'Giữ ghi chú','','');store.close();
  const legacy=new DatabaseSync(file);legacy.exec("DROP TABLE message_templates; UPDATE research_meta SET value='3' WHERE key='schema_version'; PRAGMA user_version=3");legacy.close();store=new ResearchStore(file);
  assert.equal(store.snapshot('1').records[0].note,'Giữ ghi chú');assert.equal(store.preferences().timeZone,'UTC');
  const id=store.saveTemplate({name:'Tư vấn',body:'Chào {{ten}}. Nội dung riêng.'});store.saveTemplate({id,name:'Tư vấn mới',body:'Sản phẩm {{san_pham}}. Nội dung riêng.'});
  const copy=store.saveTemplate({name:'Bản sao',body:store.templates()[0].body});assert.notEqual(copy,id);store.close();store=new ResearchStore(file);
  assert.equal(store.templates().length,2);assert.equal(store.templates().find(row=>row.id===id)?.name,'Tư vấn mới');
  assert.ok(!JSON.stringify(store.appSnapshot('1').events).includes('Nội dung riêng'));store.deleteTemplate(copy);store.deleteTemplate(id);assert.equal(store.templates().length,0);
  assert.throws(()=>store.saveTemplate({id,name:'Stale',body:'Do not resurrect'}),/TEMPLATE_NOT_FOUND/);assert.throws(()=>store.deleteTemplate(id),/TEMPLATE_NOT_FOUND/);
  for(let i=0;i<200;i++)store.saveTemplate({name:'Mẫu '+i,body:'Nội dung'});
  assert.throws(()=>store.saveTemplate({name:'Over',body:'Nội dung'}),/TEMPLATE_LIMIT/);
  store.saveTemplate({id:store.templates()[0].id,name:'Still editable',body:'Nội dung mới'});assert.equal(store.templates().length,200);
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
