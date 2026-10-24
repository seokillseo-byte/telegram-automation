import {DatabaseSync} from 'node:sqlite';
import {botIntroConfig,DEFAULT_BOT_INTRO,type BotIntroConfig} from '../../../../packages/shared/src/bot-intro';
export class BotIntroStore{
 private db:DatabaseSync;
 constructor(file:string){this.db=new DatabaseSync(file);this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=3000;
 CREATE TABLE IF NOT EXISTS bot_intro_config(bot TEXT PRIMARY KEY,config TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS bot_intro_offsets(bot TEXT PRIMARY KEY,next_update INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS bot_intro_events(bot TEXT NOT NULL,update_id INTEGER NOT NULL,kind TEXT NOT NULL,state TEXT NOT NULL,at TEXT NOT NULL,message_id INTEGER,code TEXT,PRIMARY KEY(bot,update_id));
 UPDATE bot_intro_events SET state='uncertain',code='BOT_REPLY_INTERRUPTED' WHERE state='processing';`);}
 config(bot:string):BotIntroConfig{const r=this.db.prepare('SELECT config FROM bot_intro_config WHERE bot=?').get(bot);return r?botIntroConfig(JSON.parse(String(r.config))):{...DEFAULT_BOT_INTRO};}
 save(bot:string,config:BotIntroConfig){this.db.prepare('INSERT INTO bot_intro_config(bot,config) VALUES(?,?) ON CONFLICT(bot) DO UPDATE SET config=excluded.config').run(bot,JSON.stringify(botIntroConfig(config)));}
 offset(bot:string){return Number(this.db.prepare('SELECT next_update FROM bot_intro_offsets WHERE bot=?').get(bot)?.next_update??0);}
 take(bot:string,id:number,kind:string){this.db.exec('BEGIN IMMEDIATE');try{let accepted=false;if(id>=this.offset(bot)){const exists=this.db.prepare('SELECT update_id FROM bot_intro_events WHERE bot=? AND update_id=?').get(bot,id);if(!exists){this.db.prepare('INSERT INTO bot_intro_events(bot,update_id,kind,state,at) VALUES(?,?,?,?,?)').run(bot,id,kind,'processing',new Date().toISOString());accepted=true;}this.db.prepare('INSERT INTO bot_intro_offsets(bot,next_update) VALUES(?,?) ON CONFLICT(bot) DO UPDATE SET next_update=MAX(next_update,excluded.next_update)').run(bot,id+1);}this.db.exec('COMMIT');return accepted;}catch(error){this.db.exec('ROLLBACK');throw error;}}
 finish(bot:string,id:number,state:'sent'|'handled'|'ignored'|'failed'|'uncertain',code?:string,messageId?:number){this.db.prepare("UPDATE bot_intro_events SET state=?,code=?,message_id=? WHERE bot=? AND update_id=? AND state='processing'").run(state,code??null,messageId??null,bot,id);this.db.prepare('DELETE FROM bot_intro_events WHERE rowid NOT IN (SELECT rowid FROM bot_intro_events ORDER BY at DESC,rowid DESC LIMIT 1000)').run();}
 interrupt(bot:string){this.db.prepare("UPDATE bot_intro_events SET state='uncertain',code='BOT_REPLY_INTERRUPTED' WHERE bot=? AND state='processing'").run(bot);}
 stats(bot:string){const r=this.db.prepare("SELECT SUM(kind='start' AND state='sent') AS starts,SUM(kind='choice' AND state='handled') AS choices,SUM(state='uncertain') AS uncertain FROM bot_intro_events WHERE bot=?").get(bot);return {starts:Number(r?.starts??0),choices:Number(r?.choices??0),uncertain:Number(r?.uncertain??0)};}
 close(){this.db.close();}
}
