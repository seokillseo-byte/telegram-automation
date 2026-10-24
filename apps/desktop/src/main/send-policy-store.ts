import {DatabaseSync} from 'node:sqlite';
import {sendPurpose,parsePolicyAction,policyTarget,policyPeer,policyKey,type SendPurpose,type PolicyRecord,type PolicyTarget,type PolicyEvent,type PolicyAction} from '../../../../packages/shared/src/send-policy';
import type {Identity} from '../../../../packages/shared/src/protocol';
export class SendPolicyStore{
 private db:DatabaseSync;
 constructor(file:string,private readOnly=false){this.db=new DatabaseSync(file,{readOnly});this.db.exec('PRAGMA busy_timeout=3000');if(!readOnly)this.db.exec(`
 CREATE TABLE IF NOT EXISTS send_policies(account TEXT NOT NULL,peer TEXT NOT NULL,target TEXT NOT NULL,consent TEXT NOT NULL DEFAULT 'unknown',suppressed INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,source TEXT NOT NULL,PRIMARY KEY(account,peer));
 CREATE TABLE IF NOT EXISTS send_policy_events(id INTEGER PRIMARY KEY,account TEXT NOT NULL,peer TEXT NOT NULL,at TEXT NOT NULL,type TEXT NOT NULL,source TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS policy_event_peer ON send_policy_events(account,peer,id);`);}
 inspect(account:string,input:PolicyTarget):PolicyRecord{const target=policyTarget(input),r=this.db.prepare('SELECT * FROM send_policies WHERE account=? AND peer=?').get(account,policyKey(target));return r?{target:JSON.parse(String(r.target)),consent:String(r.consent) as PolicyRecord['consent'],suppressed:Boolean(r.suppressed),updatedAt:String(r.updated_at),source:String(r.source)}:{target,consent:'unknown',suppressed:false};}
 list(account:string):PolicyRecord[]{return this.db.prepare('SELECT target FROM send_policies WHERE account=? ORDER BY updated_at DESC,peer LIMIT 200').all(account).map(r=>this.inspect(account,JSON.parse(String(r.target))));}
 events(account:string,target:PolicyTarget):PolicyEvent[]{return this.db.prepare('SELECT at,type,source FROM send_policy_events WHERE account=? AND peer=? ORDER BY id DESC LIMIT 50').all(account,policyKey(target)).map(r=>({at:String(r.at),type:String(r.type) as PolicyEvent['type'],source:String(r.source)}));}
 change(value:Extract<PolicyAction,{accountId:string}>){
  const a=parsePolicyAction(value);if(!('accountId' in a)||this.readOnly)throw Error('INPUT_INVALID');this.db.exec('BEGIN IMMEDIATE');
  try{const current=this.inspect(a.accountId,a.target);if(a.type==='grant'&&current.suppressed)throw Error('RECIPIENT_SUPPRESSED');
   const consent=a.type==='grant'?'granted':a.type==='revoke'||a.type==='suppress'?'revoked':current.consent,suppressed=a.type==='suppress'?true:a.type==='unsuppress'?false:current.suppressed,at=new Date().toISOString(),key=policyKey(a.target);
   this.db.prepare('INSERT INTO send_policies(account,peer,target,consent,suppressed,updated_at,source) VALUES(?,?,?,?,?,?,?) ON CONFLICT(account,peer) DO UPDATE SET target=excluded.target,consent=excluded.consent,suppressed=excluded.suppressed,updated_at=excluded.updated_at,source=excluded.source').run(a.accountId,key,JSON.stringify(a.target),consent,Number(suppressed),at,a.source);
   this.db.prepare('INSERT INTO send_policy_events(account,peer,at,type,source) VALUES(?,?,?,?,?)').run(a.accountId,key,at,a.type,a.source);this.db.exec('COMMIT');return this.inspect(a.accountId,a.target);
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 assertAllowed(account:string,recipient:Identity,purpose:SendPurpose){
  let record:PolicyRecord;try{if(!account)throw Error('NOT_CONNECTED');sendPurpose(purpose);record=this.inspect(account,policyPeer(recipient));}catch{throw Error('POLICY_UNAVAILABLE');}
  if(record.suppressed)throw Error('RECIPIENT_SUPPRESSED');if(purpose==='marketing'&&record.consent!=='granted')throw Error(record.consent==='revoked'?'CONSENT_REVOKED':'CONSENT_REQUIRED');
 }
 close(){this.db.close();}
}
