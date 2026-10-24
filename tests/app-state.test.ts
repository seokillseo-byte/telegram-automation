import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {ResearchStore} from '../apps/desktop/src/main/research-store';
import {parsePreferences,parseAppAction,formatAppTime} from '../packages/shared/src/app-state';

test('preferences validate timezone and reject secret fields; timestamps use selected zone',()=>{
 assert.throws(()=>parsePreferences({timeZone:'not/a-zone',compact:false,startPage:'overview'}));
 assert.throws(()=>parsePreferences({timeZone:'UTC',compact:false,startPage:'overview',apiHash:'secret'}));
 assert.throws(()=>parseAppAction({type:'writeFile',path:'/tmp/private'}));
 assert.equal(parsePreferences({timeZone:'UTC',compact:true,startPage:'account'}).compact,true);
 assert.match(formatAppTime('2026-10-24T00:00:00Z','UTC'),/00:00:00/);
 assert.match(formatAppTime('2026-10-24T00:00:00Z','Asia/Ho_Chi_Minh'),/07:00:00/);
});

test('migration keeps existing notes, persists preferences, and stores only allowlisted log events',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'app-settings-'));const file=join(dir,'app.sqlite');let store=new ResearchStore(file);
 try{
  const results=store.record('1','test',false,[{id:'1',name:'Research',username:'test_profile',kind:'user',sources:['discovery']}]);store.save('1',[results[0].key]);store.note('1',results[0].key,'Keep note','SEO','Research');store.close();
  const legacy=new DatabaseSync(file);legacy.exec("DROP TABLE app_settings; DROP TABLE app_events; DROP TABLE schema_migrations; UPDATE research_meta SET value='2' WHERE key='schema_version'; PRAGMA user_version=2");legacy.close();
  store=new ResearchStore(file);assert.equal(store.snapshot('1').records[0].note,'Keep note');
  store.savePreferences({timeZone:'UTC',compact:true,startPage:'account'});store.addEvent('secret-token private phone');store.addEvent('error');store.close();
  store=new ResearchStore(file);assert.equal(store.preferences().startPage,'account');assert.equal(store.preferences().timeZone,'UTC');
  const state=store.appSnapshot('1');assert.equal(state.counts.saved,1);assert.equal(state.counts.searches,1);assert.ok(!JSON.stringify(state.events).includes('secret-token'));
  assert.ok(state.events.some(event=>event.event==='other'));assert.ok(state.events.some(event=>event.level==='error'));
  store.clearEvents();assert.equal(store.appSnapshot('1').events.length,1);assert.equal(store.snapshot('1').records[0].note,'Keep note');
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});

test('newer database version is refused without overwriting its schema marker',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'app-schema-'));const file=join(dir,'app.sqlite');const db=new ResearchStore(file);db.close();
 try{
  const future=new DatabaseSync(file);future.exec("UPDATE research_meta SET value='99' WHERE key='schema_version'; PRAGMA user_version=99");future.close();
  assert.throws(()=>new ResearchStore(file),/DATABASE_TOO_NEW/);
  const check=new DatabaseSync(file);assert.equal(check.prepare("SELECT value FROM research_meta WHERE key='schema_version'").get()?.value,'99');check.close();
 }finally{await rm(dir,{recursive:true,force:true});}
});
