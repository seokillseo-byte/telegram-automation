import {parseInboxAction,type InboxReply} from '../../../../packages/shared/src/inbox';
import {parseAppAction,type AppReply} from '../../../../packages/shared/src/app-state';
import {app,BrowserWindow,ipcMain,safeStorage,dialog} from 'electron';
import {Worker} from 'node:worker_threads';
import {join,basename} from 'node:path';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {Vault} from './vault';
import {parseAction,classifyError,type Status} from '../../../../packages/shared/src/protocol';
import {parseAnalysisAction,aggregateSample,type GroupReport,type AnalysisResponse} from '../../../../packages/shared/src/group-analysis';
import {groupWorkbook,exportGroupReports} from './group-export';
import {ResearchStore} from './research-store';
import {writeExport,toWorkbook} from './research-export';
import {parseResearchAction,type ResearchPeer,type ResearchResponse} from '../../../../packages/shared/src/research';
import type {Identity} from '../../../../packages/shared/src/protocol';
import {checkBot} from '../../../../packages/telegram-bot/src';
let win:BrowserWindow;
let worker:Worker|undefined;
let watchdog:NodeJS.Timeout|undefined;
let vault:Vault;
let research:ResearchStore;
let researchScope='';
let currentResults:ResearchPeer[]=[];
let userIdentity:Identity|undefined;
let exporting=false;
let busy=false;
let pendingInbox:((reply:InboxReply)=>void)|undefined;
let generation=0;
let encryption=false;
let latest:Status={state:'disconnected'};
const page=pathToFileURL(join(__dirname,'index.html')).href;
let lastEvent='';
function emit(status:Status){if(status.state!==lastEvent){try{research?.addEvent(status.state);}catch{/* logging must not interrupt Telegram */}lastEvent=status.state;}latest={...status,encryption,userIdentity,userConnected:Boolean(userIdentity&&worker)};if(win&&!win.isDestroyed())win.webContents.send('spike:status',latest);}
function stopWatch(){clearTimeout(watchdog);watchdog=undefined;}
async function stopWorker(keepBusy=false,inboxError='CANCELLED'){stopWatch();if(pendingInbox){pendingInbox({ok:false,error:classifyError(Error(inboxError))});pendingInbox=undefined;}const previous=worker;worker=undefined;userIdentity=undefined;currentResults=[];if(!keepBusy)busy=false;if(previous)await previous.terminate();}
function startWatch(){stopWatch();watchdog=setTimeout(()=>{void stopWorker(false,'TIMEOUT').then(()=>emit({state:'error',error:classifyError(Error('TIMEOUT'))}));},90000);}
function getWorker(){
 if(worker)return worker;
 const current=new Worker(join(__dirname,'worker.cjs'));worker=current;
 current.on('message',async message=>{
  if(worker!==current)return;
  stopWatch();
  if(message.kind==='inbox'){
   if(!message.reply.ok&&['NOT_CONNECTED','AUTH_KEY_UNREGISTERED','SESSION_REVOKED','SESSION_EXPIRED'].includes(message.reply.error.code)){await stopWorker(false,message.reply.error.code);emit({state:'error',error:message.reply.error});return;}
   const resolve=pendingInbox;pendingInbox=undefined;busy=false;emit(message.reply.ok?{state:'inbox_ready'}:{state:'error',error:message.reply.error});resolve?.(message.reply);return;
  }
  if(message.kind==='status'){
   if(message.status.state==='group_analysis_complete'&&message.status.groupReport){
    try{research.saveGroupReport(researchScope,message.status.groupReport);}catch{busy=false;emit({state:'error',stage:'saving_group_report',error:classifyError(Error('RESEARCH_ERROR'))});return;}
   }
   if(message.status.state==='search_complete'&&message.status.searchContext){
    try{
     const context=message.status.searchContext;
     currentResults=research.record(researchScope,context.query,context.exact,message.status.queryResults??[]);
     message.status.researchResults=currentResults;
    }catch{busy=false;emit({state:'error',stage:'saving_research',error:classifyError(Error('RESEARCH_ERROR'))});return;}
   }
   if(['awaiting_code','awaiting_password'].includes(message.status.state)){startWatch();}else if(['searching','connecting','analyzing_group'].includes(message.status.state)){startWatch();}else{busy=false;}
   emit(message.status);
  } else if(message.kind==='session'){
   try{await vault.save(message.value);if(worker!==current)return;busy=false;userIdentity=message.identity;researchScope=message.identity.id;research.setAccount(researchScope);emit({state:'connected',identity:message.identity});}catch(error){await stopWorker();emit({state:'error',error:classifyError(error)});}
  } else if(message.kind==='logged_out'){await vault.clear();userIdentity=undefined;currentResults=[];busy=false;emit({state:'disconnected'});}
 });
 current.on('error',error=>{const mapped=classifyError(error);void stopWorker(false,mapped.code).then(()=>emit({state:'error',stage:'starting_worker',error:mapped.code==='TELEGRAM_ERROR'?classifyError(Error('WORKER_FAILED')):mapped}));});
 current.on('exit',()=>{if(worker===current)void stopWorker(false,'WORKER_EXIT').then(()=>emit({state:'error',error:classifyError(Error('WORKER_EXIT'))}));});
 return current;
}
if(!app.requestSingleInstanceLock())app.quit();
else app.whenReady().then(async()=>{
 encryption=process.platform==='win32'&&await safeStorage.isAsyncEncryptionAvailable();
 vault=new Vault(app.getPath('userData'),{available:async()=>encryption,encrypt:value=>safeStorage.encryptStringAsync(value),decrypt:async value=>(await safeStorage.decryptStringAsync(value)).result});
 research=new ResearchStore(join(app.getPath('userData'),'industry-research.sqlite'));researchScope=research.lastAccount();research.addEvent('app_started');
 win=new BrowserWindow({width:1100,height:850,minWidth:760,minHeight:600,webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.removeMenu();
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(event,url)=>{if(url!==page)event.preventDefault();});
 win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 win.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith(pathToFileURL(__dirname).href+'/')}));
 ipcMain.handle('inbox:action',async(event,input):Promise<InboxReply>=>{
  if(event.sender!==win.webContents||event.senderFrame?.url!==page)throw Error('IPC_REJECTED');
  try{
   const action=parseInboxAction(input);
   if(!worker||!userIdentity)throw Error('NOT_CONNECTED');
   if(busy)throw Error('BUSY');
   busy=true;emit({state:'inbox_loading'});startWatch();
   return await new Promise<InboxReply>(resolve=>{pendingInbox=resolve;try{worker!.postMessage({type:'inbox',action});}catch(error){pendingInbox=undefined;busy=false;stopWatch();emit({state:'error',error:classifyError(error)});resolve({ok:false,error:classifyError(error)});}});
  }catch(error){return {ok:false,error:classifyError(error)};}
 });
 ipcMain.handle('app:action',async(event,input):Promise<AppReply>=>{
  if(event.sender!==win.webContents||event.senderFrame?.url!==page)throw Error('IPC_REJECTED');
  try{
   const action=parseAppAction(input);
   if(action.type==='saveTemplate')research.saveTemplate(action.template);
   if(action.type==='deleteTemplate')research.deleteTemplate(action.id);
   if(action.type==='savePreferences')research.savePreferences(action.preferences);
   if(action.type==='clearLogs')research.clearEvents();
   if(action.type==='exportLogs'){
    if(exporting)throw Error('BUSY');exporting=true;
    try{
     const events=research.appSnapshot(researchScope).events;
     const chosen=await dialog.showSaveDialog(win,{title:'Xuất nhật ký hỗ trợ',defaultPath:join(app.getPath('documents'),'Telegram-App-Logs.json'),filters:[{name:'JSON',extensions:['json']}]});
     if(chosen.canceled||!chosen.filePath)return {ok:true,cancelled:true};
     const file=chosen.filePath.toLowerCase().endsWith('.json')?chosen.filePath:chosen.filePath+'.json';
     await writeFile(file,JSON.stringify({version:app.getVersion(),events},null,2));return {ok:true,fileName:basename(file)};
    }finally{exporting=false;}
   }
   return {ok:true,snapshot:research.appSnapshot(researchScope)};
  }catch(error){const code=error instanceof Error?error.message:'';const messages:Record<string,string>={TEMPLATE_VARIABLE_INVALID:'Biến không hợp lệ. Dùng {{ten}}, {{san_pham}}, {{cong_ty}}, {{lien_ket}}.',TEMPLATE_NOT_FOUND:'Mẫu đã bị xóa. Hãy tải lại danh sách.',TEMPLATE_LIMIT:'Đã đạt giới hạn 200 mẫu. Hãy xóa mẫu không dùng.'};return {ok:false,error:messages[code]??classifyError(error).message};}
 });
 ipcMain.handle('analysis:action',async(event,input):Promise<AnalysisResponse>=>{
  if(event.sender!==win.webContents||event.senderFrame?.url!==page)throw Error('IPC_REJECTED');
  try{
   const action=parseAnalysisAction(input);
   if(action.type==='list')return {ok:true,reports:research.listGroupReports(researchScope)};
   if(!researchScope)throw Error('NOT_CONNECTED');
   if(action.type==='delete'){research.deleteGroupReports(researchScope,action.ids);return {ok:true,reports:research.listGroupReports(researchScope)};}
   if(exporting)throw Error('BUSY');
   const selected=research.selectGroupReports(researchScope,action.ids);
   exporting=true;
   try{
    const chosen=await dialog.showSaveDialog(win,{title:'Xuất báo cáo phân tích nhóm/kênh',defaultPath:join(app.getPath('documents'),`Telegram-Group-Analysis-${new Date().toISOString().slice(0,10)}.xlsx`),filters:[{name:'Excel',extensions:['xlsx']}]});
    if(chosen.canceled||!chosen.filePath)return {ok:true,cancelled:true};
    const file=chosen.filePath.toLowerCase().endsWith('.xlsx')?chosen.filePath:chosen.filePath+'.xlsx';
    try{await exportGroupReports(file,selected);}catch{throw Error('EXPORT_ERROR');}
    return {ok:true,fileName:basename(file)};
   }finally{exporting=false;}
  }catch(error){const code=String((error as {code?:string}).code??'');return {ok:false,error:classifyError(code.startsWith('ERR_SQLITE')||code.startsWith('SQLITE')?Error('RESEARCH_ERROR'):error).message};}
 });
 ipcMain.handle('research:action',async(event,input):Promise<ResearchResponse>=>{
  if(event.sender!==win.webContents||event.senderFrame?.url!==page)throw Error('IPC_REJECTED');
  try{
   const action=parseResearchAction(input);
   if(action.type==='list')return {ok:true,snapshot:research.snapshot(researchScope)};
   if(!researchScope)throw Error('NOT_CONNECTED');
   if(action.type==='save'){
    if(busy)throw Error('BUSY');
    const allowed=new Set(currentResults.filter(p=>p.username).map(p=>p.key));
    if(action.keys.some(key=>!allowed.has(key)))throw Error('INPUT_INVALID');
    research.save(researchScope,action.keys);
    currentResults=currentResults.map(p=>action.keys.includes(p.key)?{...p,saved:true}:p);
   }else if(action.type==='note')research.note(researchScope,action.key,action.note,action.tags,action.category);
   else if(action.type==='delete'){
    research.remove(researchScope,action.keys);
    currentResults=currentResults.filter(p=>!action.keys.includes(p.key));
   }else if(action.type==='export'){
    if(exporting)throw Error('BUSY');
    const selected=action.scope==='saved'?research.select(researchScope,action.keys):action.keys.map(key=>{const peer=currentResults.find(p=>p.key===key&&p.username);if(!peer)throw Error('INPUT_INVALID');const stored=research.select(researchScope,[key],false)[0];return {...stored,comparison:peer.comparison};});
    const exportAccount=researchScope;exporting=true;
    try{
     const chosen=await dialog.showSaveDialog(win,{title:'Xuất hồ sơ nghiên cứu đã chọn',defaultPath:join(app.getPath('documents'),`Telegram-Research-${new Date().toISOString().slice(0,10)}.${action.format}`),filters:[{name:action.format==='xlsx'?'Excel':'CSV',extensions:[action.format]}]});
     if(chosen.canceled||!chosen.filePath)return {ok:true,cancelled:true};
     const file=chosen.filePath.toLowerCase().endsWith('.'+action.format)?chosen.filePath:chosen.filePath+'.'+action.format;
     try{await writeExport(file,selected,exportAccount,action.format);}catch{throw Error('EXPORT_ERROR');}
     return {ok:true,fileName:basename(file)};
    }finally{exporting=false;}
   }
   return {ok:true,snapshot:research.snapshot(researchScope)};
  }catch(error){const code=String((error as {code?:string}).code??'');return {ok:false,error:classifyError(code.startsWith('ERR_SQLITE')||code.startsWith('SQLITE')?Error('RESEARCH_ERROR'):error).message};}
 });
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
   if(action.type==='analyzeGroup'&&!userIdentity)throw Error('NOT_CONNECTED');
   if(action.type==='search'){if(!userIdentity)throw Error('NOT_CONNECTED');currentResults=[];}
   busy=true;startWatch();worker.postMessage(action);
  }catch(error){busy=false;emit({state:'error',error:classifyError(error)});}
 });
 await win.loadFile(join(__dirname,'index.html'));
 if(process.argv.includes('--smoke-test')){
  try{
   const ok=await win.webContents.executeJavaScript(`new Promise(resolve=>{let attempts=0;const timer=setInterval(()=>{const ready=document.querySelector('h1')?.textContent.includes('Telegram Automation') && typeof window.spike?.action === 'function' && typeof window.spike?.analysis === 'function' && typeof window.spike?.app === 'function' && document.querySelector('nav')?.textContent.includes('Phân tích nhóm/kênh') && typeof require === 'undefined';if(ready||++attempts>=50){clearInterval(timer);resolve(Boolean(ready));}},100);})`);
   if(!ok)throw Error('SMOKE_FAILED');
   const navigationOk=await win.webContents.executeJavaScript(`(async()=>{const buttons=[...document.querySelectorAll('nav button')];if(buttons.length!==11)return false;for(const button of buttons){button.click();await new Promise(resolve=>setTimeout(resolve,100));if(document.querySelector('.workspace')?.dataset.page!==button.dataset.page)return false;}return true;})()`);
   if(!navigationOk)throw Error('SMOKE_FAILED');console.log('PHASE1_NAVIGATION_PASS');
   const inboxOk=await win.webContents.executeJavaScript(`(async()=>{
    document.querySelector('nav button[data-page="inbox"]').click();await new Promise(resolve=>setTimeout(resolve,150));
    if(!document.querySelector('[data-testid="inbox-disconnected"]')||!document.querySelector('[data-testid="inbox-refresh"]').disabled||typeof window.spike.inbox!=='function')return false;
    const disconnected=await window.spike.inbox({type:'dialogs'}),invalid=await window.spike.inbox({type:'send',text:'must not send'});
    return !disconnected.ok&&disconnected.error.code==='NOT_CONNECTED'&&!invalid.ok&&invalid.error.code==='INPUT_INVALID';
   })()`);
   if(!inboxOk)throw Error('SMOKE_FAILED');console.log('INBOX_DISCONNECTED_IPC_PASS');
   const templatesOk=await win.webContents.executeJavaScript(`(async()=>{
    document.querySelector('nav button[data-page="templates"]').click();await new Promise(resolve=>setTimeout(resolve,150));
    const input=document.querySelector('[data-testid="template-name"]'),body=document.querySelector('[data-testid="template-body"]');
    const setValue=(node,value)=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node),'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));};
    setValue(input,'Kiểm tra giao diện');setValue(body,'Chào {{ten}}');await new Promise(resolve=>setTimeout(resolve,100));
    if(!document.querySelector('[data-testid="template-preview"]').textContent.includes('Chào {{ten}}'))return false;
    document.querySelector('[data-testid="template-save"]').click();await new Promise(resolve=>setTimeout(resolve,300));
    const state=await window.spike.app({type:'get'});if(!state.ok)return false;
    const row=state.snapshot.templates.find(item=>item.name==='Kiểm tra giao diện');if(!row)return false;
    const result=await window.spike.app({type:'deleteTemplate',id:row.id});return result.ok&&!result.snapshot.templates.some(item=>item.id===row.id);
   })()`);
   if(!templatesOk)throw Error('SMOKE_FAILED');console.log('TEMPLATES_RENDERER_IPC_PASS');
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
   const researchDir=await mkdtemp(join(tmpdir(),'telegram-research-smoke-'));
   try{
    const file=join(researchDir,'research.sqlite');let probeStore=new ResearchStore(file);
    const sample={id:'9007199254740993',name:'Nghiên cứu thử',username:'research_demo',kind:'channel' as const,peerType:'channel' as const,sources:['discovery' as const]};
    const results=probeStore.record('1','research',false,[sample]);probeStore.save('1',[results[0].key]);probeStore.note('1',results[0].key,'Ghi chú thử','SEO','Công nghệ');probeStore.close();
    probeStore=new ResearchStore(file);const snapshot=probeStore.snapshot('1');
    if(snapshot.records.length!==1||snapshot.records[0].note!=='Ghi chú thử')throw Error('RESEARCH_ERROR');
    const workbook=await toWorkbook(snapshot.records,'1');if(workbook[0]!==80||workbook[1]!==75)throw Error('EXPORT_ERROR');
    const report:GroupReport={id:'00000000-0000-4000-8000-000000000001',target:'research_demo',username:'research_demo',groupId:'12345678901234567',title:'Kênh thử',kind:'channel',about:'Mẫu kiểm chứng',members:null,analyzedAt:new Date().toISOString(),sampleLimit:100,fetched:1,historyStatus:'available',mayBeTruncated:false,warnings:[],...aggregateSample([{id:1,date:1700000000,text:'Nghiên cứu',views:5}])};
    probeStore.savePreferences({timeZone:'UTC',compact:true,startPage:'overview'});probeStore.addEvent('connected');
    const templateId=probeStore.saveTemplate({name:'Mẫu kiểm chứng',body:'Chào {{ten}}'});
    probeStore.saveGroupReport('1',report);probeStore.close();probeStore=new ResearchStore(file);
    if(probeStore.templates()[0]?.id!==templateId)throw Error('RESEARCH_ERROR');probeStore.deleteTemplate(templateId);if(probeStore.templates().length)throw Error('RESEARCH_ERROR');console.log('TEMPLATES_SQLITE_PASS');
    if(probeStore.preferences().timeZone!=='UTC'||!probeStore.appSnapshot('1').events.length)throw Error('RESEARCH_ERROR');console.log('PHASE1_SETTINGS_LOGS_PASS');
    const reports=probeStore.listGroupReports('1');if(reports.length!==1||reports[0].metrics.views.total!==5)throw Error('RESEARCH_ERROR');
    const analysisBook=await groupWorkbook(reports);if(analysisBook[0]!==80||analysisBook[1]!==75)throw Error('EXPORT_ERROR');
    probeStore.close();console.log('GROUP_ANALYSIS_SQLITE_XLSX_PASS');console.log('RESEARCH_SQLITE_XLSX_PASS');
   }finally{await rm(researchDir,{recursive:true,force:true});}
   console.log('PHASE0_SMOKE_PASS');app.exit(0);
  }catch(error){console.error('PHASE0_SMOKE_FAIL',classifyError(error).code);app.exit(1);}
 }
}).catch(error=>{console.error('APP_START_FAILED',classifyError(error).code);if(!process.argv.includes('--smoke-test'))dialog.showErrorBox('Không thể mở ứng dụng',classifyError(error).message);app.exit(1);});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{void stopWorker();research?.close();});
