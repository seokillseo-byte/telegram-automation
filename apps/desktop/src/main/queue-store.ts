import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {QUEUE_GRACE_MS,queueId,scheduleTime,type QueueJob,type QueueEvent,type JobState} from '../../../../packages/shared/src/queue';
import type {Identity} from '../../../../packages/shared/src/protocol';
export class QueueStore{
 private db:DatabaseSync;
 constructor(file:string){this.db=new DatabaseSync(file);this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=3000;
 CREATE TABLE IF NOT EXISTS scheduled_jobs(id TEXT PRIMARY KEY,account TEXT NOT NULL,recipient TEXT NOT NULL,due_at TEXT NOT NULL,zone TEXT NOT NULL,created_at TEXT NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,preview_id TEXT NOT NULL UNIQUE,payload BLOB NOT NULL,remote_id INTEGER,error_code TEXT);
 CREATE INDEX IF NOT EXISTS scheduled_due ON scheduled_jobs(account,state,due_at);
 CREATE TABLE IF NOT EXISTS scheduled_events(id INTEGER PRIMARY KEY,job_id TEXT NOT NULL,at TEXT NOT NULL,state TEXT NOT NULL,code TEXT);`);}
 private row(account:string,id:string){queueId(id);const row=this.db.prepare('SELECT * FROM scheduled_jobs WHERE account=? AND id=?').get(account,id);if(!row)throw Error('QUEUE_NOT_FOUND');return row;}
 private view(row:Record<string,unknown>):QueueJob{return {id:String(row.id),accountId:String(row.account),recipient:JSON.parse(String(row.recipient)),dueAt:String(row.due_at),zone:String(row.zone),createdAt:String(row.created_at),state:String(row.state) as JobState,attempts:Number(row.attempts),remoteId:row.remote_id===null?undefined:Number(row.remote_id),errorCode:row.error_code?String(row.error_code):undefined};}
 private event(id:string,state:JobState,code?:string){this.db.prepare('INSERT INTO scheduled_events(job_id,at,state,code) VALUES(?,?,?,?)').run(id,new Date().toISOString(),state,code??null);}
 private transaction<T>(operation:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const result=operation();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
 create(account:string,previewId:string,recipient:Identity,dueAt:string,zone:string,payload:Buffer):QueueJob{return this.transaction(()=>{
  scheduleTime(dueAt,zone);const previous=this.db.prepare('SELECT * FROM scheduled_jobs WHERE account=? AND preview_id=?').get(account,previewId);if(previous)return this.view(previous);
  if(Number(this.db.prepare("SELECT count(*) AS n FROM scheduled_jobs WHERE account=? AND state IN ('pending','paused','needs_review','running')").get(account)?.n)>=100)throw Error('QUEUE_LIMIT');
  const id=randomUUID();this.db.prepare("INSERT INTO scheduled_jobs(id,account,recipient,due_at,zone,created_at,state,preview_id,payload) VALUES(?,?,?,?,?,?,'pending',?,?)").run(id,account,JSON.stringify(recipient),dueAt,zone,new Date().toISOString(),previewId,payload);this.event(id,'pending');return this.view(this.row(account,id));
 });}
 list(account:string):QueueJob[]{return this.db.prepare('SELECT * FROM scheduled_jobs WHERE account=? ORDER BY created_at DESC,id DESC LIMIT 200').all(account).map(row=>this.view(row));}
 detail(account:string,id:string){const row=this.row(account,id);return {job:this.view(row),payload:Buffer.from(row.payload as Uint8Array),events:this.db.prepare('SELECT at,state,code FROM scheduled_events WHERE job_id=? ORDER BY id').all(id).map(e=>({at:String(e.at),state:String(e.state) as JobState,code:e.code?String(e.code):undefined} satisfies QueueEvent))};}
 private update(id:string,state:JobState,code?:string){this.db.prepare('UPDATE scheduled_jobs SET state=?,error_code=? WHERE id=?').run(state,code??null,id);this.event(id,state,code);}
 recover(now=Date.now()){this.transaction(()=>{for(const row of this.db.prepare("SELECT id FROM scheduled_jobs WHERE state='running'").all())this.update(String(row.id),'uncertain','QUEUE_INTERRUPTED');for(const row of this.db.prepare("SELECT id FROM scheduled_jobs WHERE state='pending' AND due_at<=?").all(new Date(now).toISOString()))this.update(String(row.id),'needs_review','QUEUE_OVERDUE');});}
 overdue(now=Date.now(),grace=QUEUE_GRACE_MS){this.transaction(()=>{for(const row of this.db.prepare("SELECT id FROM scheduled_jobs WHERE state='pending' AND due_at<=?").all(new Date(now-grace).toISOString()))this.update(String(row.id),'needs_review','QUEUE_OVERDUE');});}
 claim(account:string,now=Date.now()):QueueJob|undefined{return this.transaction(()=>{const row=this.db.prepare("SELECT * FROM scheduled_jobs WHERE account=? AND state='pending' AND attempts=0 AND due_at<=? AND due_at>=? ORDER BY due_at,id LIMIT 1").get(account,new Date(now).toISOString(),new Date(now-QUEUE_GRACE_MS).toISOString());if(!row)return;const id=String(row.id);this.db.prepare("UPDATE scheduled_jobs SET state='running',attempts=1 WHERE id=? AND state='pending' AND attempts=0").run(id);this.event(id,'running');return this.view(this.row(account,id));});}
 finish(account:string,id:string,state:'sent'|'failed'|'uncertain',code?:string,remoteId?:number){this.transaction(()=>{const row=this.row(account,id);if(row.state!=='running')return;this.update(id,state,code);if(remoteId)this.db.prepare('UPDATE scheduled_jobs SET remote_id=? WHERE id=?').run(remoteId,id);});}
 change(account:string,id:string,type:'pause'|'resume'|'cancel'|'reschedule',dueAt?:string,zone?:string,now=Date.now()):QueueJob{return this.transaction(()=>{
  const row=this.row(account,id),state=String(row.state);if(Number(row.attempts)>0||!['pending','paused','needs_review'].includes(state))throw Error('QUEUE_STATE_INVALID');
  if(type==='pause'){if(state!=='pending')throw Error('QUEUE_STATE_INVALID');this.update(id,'paused');}
  else if(type==='cancel')this.update(id,'cancelled');
  else if(type==='resume'){if(state!=='paused'||Date.parse(String(row.due_at))<=now+30000)throw Error('QUEUE_REVIEW_REQUIRED');this.update(id,'pending');}
  else{if(!dueAt||!zone)throw Error('INPUT_INVALID');scheduleTime(dueAt,zone,now);this.db.prepare('UPDATE scheduled_jobs SET due_at=?,zone=? WHERE id=?').run(dueAt,zone,id);this.update(id,'pending');}
  return this.view(this.row(account,id));
 });}
 close(){this.db.close();}
}
