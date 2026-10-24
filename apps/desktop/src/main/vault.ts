import {access,readFile,writeFile,rename,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
export type CryptoProvider={available:()=>Promise<boolean>;encrypt:(value:string)=>Promise<Buffer>;decrypt:(value:Buffer)=>Promise<string>};
export class Vault {
 private pending:Promise<unknown>=Promise.resolve();
 constructor(private directory:string,private crypto:CryptoProvider,private fileName:'user-session.enc'|'bot-token.enc'='user-session.enc'){}
 private path(){return join(this.directory,this.fileName);}
 exists(){return this.serialize(async()=>{try{await access(this.path());return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}});}
 private serialize<T>(operation:()=>Promise<T>):Promise<T>{const next=this.pending.then(operation);this.pending=next.catch(()=>undefined);return next;}
 save(value:unknown){return this.serialize(async()=>{
  if(!await this.crypto.available())throw Error('ENCRYPTION_UNAVAILABLE');
  const ciphertext=await this.crypto.encrypt(JSON.stringify(value));
  await mkdir(this.directory,{recursive:true});
  await writeFile(this.path()+'.tmp',ciphertext,{mode:0o600});await rename(this.path()+'.tmp',this.path());
 });}
 load():Promise<unknown>{return this.serialize(async()=>{
  if(!await this.crypto.available())throw Error('ENCRYPTION_UNAVAILABLE');
  try{return JSON.parse(await this.crypto.decrypt(await readFile(this.path())));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw Error('NO_SESSION');throw e;}
 });}
 clear(){return this.serialize(async()=>{await rm(this.path(),{force:true});await rm(this.path()+'.tmp',{force:true});});}
}
