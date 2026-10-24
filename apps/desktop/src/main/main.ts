import {app,BrowserWindow,ipcMain,safeStorage} from 'electron';
import {Worker} from 'node:worker_threads';
import {join} from 'node:path';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {Vault} from './vault';
import {parseAction,classifyError,type Status} from '../../../../packages/shared/src/protocol';
import {checkBot} from '../../../../packages/telegram-bot/src';
let win:BrowserWindow;
let worker:Worker|undefined;
let watchdog:NodeJS.Timeout|undefined;
let vault:Vault;
let busy=false;
let generation=0;
let encryption=false;
let latest:Status={state:'disconnected'};
const page=pathToFileURL(join(__dirname,'index.html')).href;
function emit(status:Status){latest={...status,encryption};if(win&&!win.isDestroyed())win.webContents.send('spike:status',latest);}
function stopWatch(){clearTimeout(watchdog);watchdog=undefined;}
async function stopWorker(keepBusy=false){stopWatch();const previous=worker;worker=undefined;if(!keepBusy)busy=false;if(previous)await previous.terminate();}
function startWatch(){stopWatch();watchdog=setTimeout(()=>{void stopWorker().then(()=>emit({state:'error',error:classifyError(Error('TIMEOUT'))}));},90000);}
function getWorker(){
 if(worker)return worker;
 const current=new Worker(join(__dirname,'worker.cjs'));worker=current;
 current.on('message',async message=>{
  if(worker!==current)return;
  stopWatch();
  if(message.kind==='status'){
   if(['awaiting_code','awaiting_password'].includes(message.status.state)){startWatch();}else if(['searching','connecting'].includes(message.status.state)){startWatch();}else{busy=false;}
   emit(message.status);
  } else if(message.kind==='session'){
   try{await vault.save(message.value);if(worker!==current)return;busy=false;emit({state:'connected',identity:message.identity});}catch(error){await stopWorker();emit({state:'error',error:classifyError(error)});}
  } else if(message.kind==='logged_out'){await vault.clear();busy=false;emit({state:'disconnected'});}
 });
 current.on('error',error=>{const mapped=classifyError(error);void stopWorker().then(()=>emit({state:'error',stage:'starting_worker',error:mapped.code==='TELEGRAM_ERROR'?classifyError(Error('WORKER_FAILED')):mapped}));});
 current.on('exit',()=>{if(worker===current){worker=undefined;stopWatch();busy=false;emit({state:'error',error:classifyError(Error('WORKER_EXIT'))});}});
 return current;
}
if(!app.requestSingleInstanceLock())app.quit();
else app.whenReady().then(async()=>{
 encryption=process.platform==='win32'&&await safeStorage.isAsyncEncryptionAvailable();
 vault=new Vault(app.getPath('userData'),{available:async()=>encryption,encrypt:value=>safeStorage.encryptStringAsync(value),decrypt:async value=>(await safeStorage.decryptStringAsync(value)).result});
 win=new BrowserWindow({width:1100,height:850,minWidth:760,minHeight:600,webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.removeMenu();
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(event,url)=>{if(url!==page)event.preventDefault();});
 win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 win.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith(pathToFileURL(__dirname).href+'/')}));
 ipcMain.handle('spike:status',event=>{if(event.sender!==win.webContents||event.senderFrame?.url!==page)throw Error('IPC_REJECTED');return {...latest,encryption};});
 ipcMain.handle('spike:action',async(event,input)=>{
  if(event.sender!==win.webContents||event.senderFrame?.url!==page)throw Error('IPC_REJECTED');
  try{
   let action;try{action=parseAction(input);}catch(error){return classifyError(error);}
   if(action.type==='forget'){generation++;await stopWorker();await vault.clear();emit({state:'disconnected'});return;}
   if(action.type==='answer'){if(!busy||!['awaiting_code','awaiting_password'].includes(latest.state))return classifyError(Error('INPUT_INVALID'));startWatch();getWorker().postMessage(action);return;}
   if(busy)return classifyError(Error('BUSY'));
   if(action.type==='bot'){
    busy=true;const epoch=generation;emit({state:'checking_bot'});
    try{const identity=await checkBot(action.token);if(epoch===generation)emit({state:'bot_verified',identity});}catch(error){if(epoch===generation)emit({state:'error',error:classifyError(error)});}finally{if(epoch===generation)busy=false;}
    return;
   }
   if(action.type==='login'||action.type==='resume'){
    if(!encryption)throw Error('ENCRYPTION_UNAVAILABLE');
    busy=true;await stopWorker(true);emit({state:'connecting'});
    if(action.type==='resume'){
     const value=await vault.load() as {apiId:number;apiHash:string;session:string};
     if(!Number.isSafeInteger(value.apiId)||typeof value.apiHash!=='string'||typeof value.session!=='string')throw Error('NO_SESSION');
     getWorker().postMessage({type:'restore',...value});
    }else getWorker().postMessage(action);
    startWatch();return;
   }
   if(!worker)throw Error('NOT_CONNECTED');
   busy=true;startWatch();worker.postMessage(action);
  }catch(error){busy=false;emit({state:'error',error:classifyError(error)});}
 });
 await win.loadFile(join(__dirname,'index.html'));
 if(process.argv.includes('--smoke-test')){
  try{
   const ok=await win.webContents.executeJavaScript(`new Promise(resolve=>{let attempts=0;const timer=setInterval(()=>{const ready=document.querySelector('h1')?.textContent.includes('Phase 0') && typeof window.spike?.action === 'function' && typeof require === 'undefined';if(ready||++attempts>=50){clearInterval(timer);resolve(Boolean(ready));}},100);})`);
   if(!ok)throw Error('SMOKE_FAILED');
   if(process.platform==='win32'){
    if(!encryption)throw Error('ENCRYPTION_UNAVAILABLE');
    const directory=await mkdtemp(join(tmpdir(),'telegram-dpapi-'));
    try{
     const probe=new Vault(directory,{available:async()=>encryption,encrypt:value=>safeStorage.encryptStringAsync(value),decrypt:async value=>(await safeStorage.decryptStringAsync(value)).result});
     await probe.save({session:'phase0-dpapi-probe'});
     if((await readFile(join(directory,'user-session.enc'))).includes(Buffer.from('phase0-dpapi-probe')))throw Error('PLAINTEXT_FOUND');
     const restored=await probe.load() as {session:string};if(restored.session!=='phase0-dpapi-probe')throw Error('ROUNDTRIP_FAILED');
     await probe.clear();console.log('PHASE0_WINDOWS_DPAPI_PASS');
    }finally{await rm(directory,{recursive:true,force:true});}
   }
   await new Promise<void>((resolve,reject)=>{
    const probe=new Worker(join(__dirname,'worker.cjs'));
    const timeout=setTimeout(()=>{void probe.terminate();reject(Error('WORKER_PROBE_TIMEOUT'));},15000);
    probe.once('error',error=>{clearTimeout(timeout);reject(Error(classifyError(error).code));});
    probe.on('message',message=>{if(message.kind!=='probe')return;clearTimeout(timeout);void probe.terminate();if(message.ok){console.log('PHASE0_WORKER_PROBE_PASS');resolve();}else reject(Error(message.error.code));});
    probe.postMessage({type:'probe'});
   });
   console.log('PHASE0_SMOKE_PASS');app.exit(0);
  }catch(error){console.error('PHASE0_SMOKE_FAIL',classifyError(error).code);app.exit(1);}
 }
}).catch(()=>{console.error('APP_START_FAILED');app.exit(1);});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{void stopWorker();});
