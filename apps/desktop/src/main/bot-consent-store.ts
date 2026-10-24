import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import {BOT_CONFIRM_TTL,type BotConsentEvent,type BotConsentInput,type BotTopic} from '../../../../packages/shared/src/bot-consent';
export class BotConsentStore{
 private db:DatabaseSync;
 constructor(file:string){this.db=new DatabaseSync(file);this.db.exec(`PRAGMA busy_timeout=3000;
 CREATE TABLE IF NOT EXISTS bot_consent_users(bot TEXT NOT NULL,user_id TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,last_stop INTEGER NOT NULL DEFAULT -1,PRIMARY KEY(bot,user_id));
 CREATE TABLE IF NOT EXISTS bot_pending_consents(nonce TEXT PRIMARY KEY,bot TEXT NOT NULL,user_id TEXT NOT NULL,topic TEXT NOT NULL,revision INTEGER NOT NULL,expires_at INTEGER NOT NULL,state TEXT NOT NULL,message_id INTEGER);
 CREATE TABLE IF NOT EXISTS bot_subscriptions(bot TEXT NOT NULL,user_id TEXT NOT NULL,topic TEXT NOT NULL,state TEXT NOT NULL,updated_at TEXT NOT NULL,purpose TEXT NOT NULL,PRIMARY KEY(bot,user_id,topic));
 CREATE TABLE IF NOT EXISTS bot_consent_events(bot TEXT NOT NULL,update_id INTEGER NOT NULL,user_id TEXT NOT NULL,topic TEXT NOT NULL,event TEXT NOT NULL,at TEXT NOT NULL,source TEXT NOT NULL,purpose TEXT NOT NULL,PRIMARY KEY(bot,update_id));`);}
 private transaction<T>(fn:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
 private user(bot:string,userId:string){this.db.prepare('INSERT OR IGNORE INTO bot_consent_users(bot,user_id) VALUES(?,?)').run(bot,userId);return this.db.prepare('SELECT revision,last_stop FROM bot_consent_users WHERE bot=? AND user_id=?').get(bot,userId)!;}
 stop(bot:string,input:Extract<BotConsentInput,{type:'stop'}>,now=Date.now()){return this.transaction(()=>{
  if(this.db.prepare('SELECT update_id FROM bot_consent_events WHERE bot=? AND update_id=?').get(bot,input.updateId))return;
  const user=this.user(bot,input.userId);if(input.updateId<=Number(user.last_stop))return;
  this.db.prepare('UPDATE bot_consent_users SET revision=revision+1,last_stop=? WHERE bot=? AND user_id=?').run(input.updateId,bot,input.userId);
  this.db.prepare("UPDATE bot_pending_consents SET state='cancelled' WHERE bot=? AND user_id=? AND state='pending'").run(bot,input.userId);
  const at=new Date(now).toISOString();this.db.prepare("UPDATE bot_subscriptions SET state='revoked',updated_at=? WHERE bot=? AND user_id=?").run(at,bot,input.userId);
  this.db.prepare("INSERT INTO bot_consent_events(bot,update_id,user_id,topic,event,at,source,purpose) VALUES(?,?,?,'*','opt_out',?,?,'bot_topic_updates')").run(bot,input.updateId,input.userId,at,input.source);
 });}
 choose(bot:string,input:Extract<BotConsentInput,{type:'choose'}>,now=Date.now()):string|undefined{return this.transaction(()=>{
  const user=this.user(bot,input.userId);if(input.updateId<=Number(user.last_stop))return;
  this.db.prepare("UPDATE bot_pending_consents SET state='cancelled' WHERE bot=? AND user_id=? AND state='pending'").run(bot,input.userId);
  this.db.prepare('DELETE FROM bot_pending_consents WHERE expires_at<?').run(now-86400000);
  const nonce=randomBytes(16).toString('hex');this.db.prepare("INSERT INTO bot_pending_consents(nonce,bot,user_id,topic,revision,expires_at,state) VALUES(?,?,?,?,?,?,'pending')").run(nonce,bot,input.userId,input.topic,user.revision,now+BOT_CONFIRM_TTL);return nonce;
 });}
 bind(bot:string,nonce:string,messageId:number){this.db.prepare("UPDATE bot_pending_consents SET message_id=? WHERE bot=? AND nonce=? AND state='pending'").run(messageId,bot,nonce);}
 decide(bot:string,input:Extract<BotConsentInput,{type:'confirm'|'cancel'}>,now=Date.now()):'confirmed'|'cancelled'|'invalid'{return this.transaction(()=>{
  const pending=this.db.prepare('SELECT * FROM bot_pending_consents WHERE nonce=? AND bot=? AND user_id=?').get(input.nonce,bot,input.userId);if(!pending||pending.state!=='pending'||Number(pending.message_id)!==input.messageId||Number(pending.expires_at)<=now)return 'invalid';
  const user=this.user(bot,input.userId);if(Number(pending.revision)!==Number(user.revision)||input.updateId<=Number(user.last_stop))return 'invalid';
  if(this.db.prepare('SELECT update_id FROM bot_consent_events WHERE bot=? AND update_id=?').get(bot,input.updateId))return 'invalid';
  this.db.prepare('UPDATE bot_pending_consents SET state=? WHERE nonce=?').run(input.type==='confirm'?'confirmed':'cancelled',input.nonce);if(input.type==='cancel')return 'cancelled';
  const at=new Date(now).toISOString();this.db.prepare("INSERT INTO bot_subscriptions(bot,user_id,topic,state,updated_at,purpose) VALUES(?,?,?,'active',?,'bot_topic_updates') ON CONFLICT(bot,user_id,topic) DO UPDATE SET state='active',updated_at=excluded.updated_at").run(bot,input.userId,pending.topic,at);
  this.db.prepare("INSERT INTO bot_consent_events(bot,update_id,user_id,topic,event,at,source,purpose) VALUES(?,?,?,?,'opt_in',?,'bot:confirm_callback','bot_topic_updates')").run(bot,input.updateId,input.userId,pending.topic,at);return 'confirmed';
 });}
 active(bot:string,userId:string,topic:BotTopic){return Boolean(this.db.prepare("SELECT topic FROM bot_subscriptions WHERE bot=? AND user_id=? AND topic=? AND state='active'").get(bot,userId,topic));}
 stats(bot:string){const r=this.db.prepare("SELECT COUNT(DISTINCT user_id) AS users,COUNT(*) AS topics FROM bot_subscriptions WHERE bot=? AND state='active'").get(bot);return {subscribers:Number(r?.users??0),activeTopics:Number(r?.topics??0)};}
 history(bot:string):BotConsentEvent[]{return this.db.prepare('SELECT * FROM bot_consent_events WHERE bot=? ORDER BY at DESC,update_id DESC LIMIT 100').all(bot).map(r=>({at:String(r.at),userId:String(r.user_id),topic:String(r.topic) as BotConsentEvent['topic'],event:String(r.event) as BotConsentEvent['event'],source:String(r.source) as BotConsentEvent['source'],purpose:'bot_topic_updates',updateId:Number(r.update_id)}));}
 close(){this.db.close();}
}
