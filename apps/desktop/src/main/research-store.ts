import type {GroupReport} from '../../../../packages/shared/src/group-analysis';
import {DatabaseSync} from 'node:sqlite';
import type {SearchPeer} from '../../../../packages/shared/src/protocol';
import {peerKey,type ResearchPeer,type ResearchRun,type ResearchSnapshot} from '../../../../packages/shared/src/research';
export class ResearchStore{
 private db:DatabaseSync;
 constructor(file:string){
  this.db=new DatabaseSync(file);
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;
   CREATE TABLE IF NOT EXISTS research_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS research_entities(account TEXT NOT NULL,key TEXT NOT NULL,payload TEXT NOT NULL,first_seen TEXT NOT NULL,last_seen TEXT NOT NULL,query TEXT NOT NULL,saved INTEGER NOT NULL DEFAULT 0,note TEXT NOT NULL DEFAULT '',tags TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT '',PRIMARY KEY(account,key));
   CREATE TABLE IF NOT EXISTS research_runs(id INTEGER PRIMARY KEY,account TEXT NOT NULL,query TEXT NOT NULL,exact INTEGER NOT NULL,at TEXT NOT NULL,returned INTEGER NOT NULL,public_count INTEGER NOT NULL,new_count INTEGER NOT NULL,changed_count INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS research_observations(run_id INTEGER NOT NULL,account TEXT NOT NULL,key TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(run_id,key),FOREIGN KEY(run_id) REFERENCES research_runs(id) ON DELETE CASCADE);
   CREATE TABLE IF NOT EXISTS group_reports(id TEXT PRIMARY KEY,account TEXT NOT NULL,group_id TEXT NOT NULL,at TEXT NOT NULL,payload TEXT NOT NULL);
   INSERT INTO research_meta(key,value) VALUES('schema_version','2') ON CONFLICT(key) DO UPDATE SET value='2';`);
 }
 saveGroupReport(account:string,report:GroupReport){this.db.prepare('INSERT INTO group_reports(id,account,group_id,at,payload) VALUES(?,?,?,?,?)').run(report.id,account,report.groupId,report.analyzedAt,JSON.stringify(report));}
 listGroupReports(account:string):GroupReport[]{return this.db.prepare('SELECT payload FROM group_reports WHERE account=? ORDER BY at DESC LIMIT 100').all(account).map(row=>JSON.parse(String(row.payload)));}
 selectGroupReports(account:string,ids:string[]):GroupReport[]{return ids.map(id=>{const row=this.db.prepare('SELECT payload FROM group_reports WHERE account=? AND id=?').get(account,id);if(!row)throw Error('INPUT_INVALID');return JSON.parse(String(row.payload));});}
 deleteGroupReports(account:string,ids:string[]){this.db.exec('BEGIN IMMEDIATE');try{for(const id of ids)this.db.prepare('DELETE FROM group_reports WHERE account=? AND id=?').run(account,id);this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}}
 close(){this.db.close();}
 lastAccount(){return String(this.db.prepare("SELECT value FROM research_meta WHERE key='last_account'").get()?.value??'');}
 setAccount(account:string){this.db.prepare("INSERT INTO research_meta(key,value) VALUES('last_account',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(account);}
 private row(account:string,key:string){return this.db.prepare('SELECT * FROM research_entities WHERE account=? AND key=?').get(account,key);}
 private materialize(row:Record<string,unknown>):ResearchPeer{
  return {...JSON.parse(String(row.payload)),key:String(row.key),comparison:'seen',firstSeen:String(row.first_seen),lastSeen:String(row.last_seen),query:String(row.query),saved:Boolean(row.saved),note:String(row.note),tags:String(row.tags),category:String(row.category)};
 }
 record(account:string,query:string,exact:boolean,input:SearchPeer[],at=new Date().toISOString()):ResearchPeer[]{
  if(!/^\d+$/.test(account))throw Error('NOT_CONNECTED');
  const peers=[...new Map(input.map(peer=>[peerKey(peer),peer])).values()];
  const results:ResearchPeer[]=[];
  this.db.exec('BEGIN IMMEDIATE');
  try{
   for(const peer of peers){
    const key=peerKey(peer),old=this.row(account,key);
    const isPublic=Boolean(peer.username);
    const changed=old?(()=>{const before=JSON.parse(String(old.payload)) as SearchPeer;return before.username!==peer.username||before.name!==peer.name||before.kind!==peer.kind;})():false;
    if(isPublic||old){
     this.db.prepare(`INSERT INTO research_entities(account,key,payload,first_seen,last_seen,query) VALUES(?,?,?,?,?,?) ON CONFLICT(account,key) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen,query=excluded.query`).run(account,key,JSON.stringify(peer),at,at,query);
    }
    const stored=isPublic?this.row(account,key):undefined;
    results.push({...peer,key,comparison:!isPublic?'not_public':!old?'new':changed?'changed':'seen',firstSeen:String(stored?.first_seen??at),lastSeen:at,query,note:String(stored?.note??''),tags:String(stored?.tags??''),category:String(stored?.category??''),saved:Boolean(stored?.saved)});
   }
   const insert=this.db.prepare('INSERT INTO research_runs(account,query,exact,at,returned,public_count,new_count,changed_count) VALUES(?,?,?,?,?,?,?,?)').run(account,query,Number(exact),at,peers.length,results.filter(p=>p.username).length,results.filter(p=>p.comparison==='new').length,results.filter(p=>p.comparison==='changed').length);
   for(const peer of results.filter(p=>p.username))this.db.prepare('INSERT INTO research_observations(run_id,account,key,payload) VALUES(?,?,?,?)').run(insert.lastInsertRowid,account,peer.key,JSON.stringify(peer));
   this.db.exec('COMMIT');return results;
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 save(account:string,keys:string[]){
  this.db.exec('BEGIN IMMEDIATE');
  try{for(const key of keys){if(!this.row(account,key))throw Error('INPUT_INVALID');this.db.prepare('UPDATE research_entities SET saved=1 WHERE account=? AND key=?').run(account,key);}this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 note(account:string,key:string,note:string,tags:string,category:string){
  const row=this.row(account,key);if(!row?.saved)throw Error('INPUT_INVALID');
  this.db.prepare('UPDATE research_entities SET note=?,tags=?,category=? WHERE account=? AND key=?').run(note,tags,category,account,key);
 }
 remove(account:string,keys:string[]){
  this.db.exec('BEGIN IMMEDIATE');
  try{for(const key of keys){this.db.prepare('DELETE FROM research_observations WHERE account=? AND key=?').run(account,key);this.db.prepare('DELETE FROM research_entities WHERE account=? AND key=?').run(account,key);}this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 select(account:string,keys:string[],savedOnly=true):ResearchPeer[]{return keys.map(key=>{const row=this.row(account,key);if(!row||(savedOnly&&!row.saved))throw Error('INPUT_INVALID');return this.materialize(row);});}
 snapshot(account:string):ResearchSnapshot{
  const records=this.db.prepare('SELECT * FROM research_entities WHERE account=? AND saved=1 ORDER BY last_seen DESC LIMIT 5000').all(account).map(row=>this.materialize(row));
  const runs=this.db.prepare('SELECT * FROM research_runs WHERE account=? ORDER BY id DESC LIMIT 100').all(account).map(row=>({id:Number(row.id),query:String(row.query),exact:Boolean(row.exact),at:String(row.at),returned:Number(row.returned),publicCount:Number(row.public_count),newCount:Number(row.new_count),changedCount:Number(row.changed_count)} satisfies ResearchRun));
  const total=Number(this.db.prepare('SELECT count(*) AS n FROM research_entities WHERE account=? AND saved=1').get(account)?.n??0);
  return {accountId:account,records,runs,totalSaved:total};
 }
}
