import {BotIntroStore} from './bot-intro-store';
import {BotIntroRuntime} from './bot-intro-runtime';
import {botToken,parseBotIntroAction,type BotIntroReply} from '../../../../packages/shared/src/bot-intro';
import {randomUUID} from 'node:crypto';
import {createPolicyCheckedJob} from './scheduled-policy';
import {parsePolicyAction,type PolicyReply,type SendPurpose} from '../../../../packages/shared/src/send-policy';
import {SendPolicyStore} from './send-policy-store';
import {parseQueueAction,parseScheduledPayload,scheduleTime,type QueueReply} from '../../../../packages/shared/src/queue';
import {QueueStore} from './queue-store';
import {QueueRunner} from './queue-runner';
import {parseManualAction,type ManualReply,type SendPreview,type AttachmentData} from '../../../../packages/shared/src/manual-send';
import {readSendAttachment} from './send-attachment';
import {parseInboxAction,type InboxReply} from '../../../../packages/shared/src/inbox';
import {parseAppAction,type AppReply} from '../../../../packages/shared/src/app-state';
import {app,BrowserWindow,ipcMain,safeStorage,dialog,powerMonitor} from 'electron';
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
let botVault:Vault;
let botStore:BotIntroStore;
let botIntro:BotIntroRuntime;
let savedBotToken=false;
let botOperation=false;
let botEpoch=0;
let research:ResearchStore;
let queue:QueueStore;
let policy:SendPolicyStore;
let queueTimer:NodeJS.Timeout|undefined;
let queueRunner:QueueRunner;
let suspended=false;
let researchScope='';
let currentResults:ResearchPeer[]=[];
let userIdentity:Identity|undefined;
let inboxOnline=true;
let exporting=false;
let busy=false;
let manualFile:AttachmentData|undefined;
let pendingManual:((reply:ManualReply)=>void)|undefined;
let manualDispatch=false;
let manualPreview:SendPreview|undefined;
let pendingSchedule:{id:string;dueAt:string;zone:string;accountId:string}|undefined;
let pendingInbox:((reply:InboxReply)=>void)|undefined;
let generation=0;
let encryption=false;
let latest:Status={state:'disconnected'};
const page=pathToFileURL(join(__dirname,'index.html')).href;
let lastEvent='';
function emit(status:Status){if(status.state!==lastEvent){try{research?.addEvent(status.state);}catch{/* logging must not interrupt Telegram */}lastEvent=status.state;}latest={...status,encryption,userIdentity,userConnected:Boolean(userIdentity&&worker),inboxOnline:userIdentity?inboxOnline:undefined};if(win&&!win.isDestroyed())win.webContents.send('spike:status',latest);}
async function decryptJob(bytes:Buffer){if(!encryption)throw Error('ENCRYPTION_UNAVAILABLE');try{return parseScheduledPayload(JSON.parse((await safeStorage.decryptStringAsync(bytes)).result));}catch{throw Error('QUEUE_PAYLOAD_INVALID');}}
function stopWatch(){clearTimeout(watchdog);watchdog=undefined;}
async function stopWorker(keepBusy=false,inboxError='CANCELLED'){generation++;stopWatch();queueRunner?.interrupt(inboxError,false);manualPreview=undefined;manualFile=undefined;pendingSchedule=undefined;if(pendingManual){pendingManual({ok:false,error:classifyError(Error(inboxError)),uncertain:manualDispatch});pendingManual=undefined;}manualDispatch=false;if(pendingInbox){pendingInbox({ok:false,error:classifyError(Error(inboxError))});pendingInbox=undefined;}inboxOnline=false;const previous=worker;worker=undefined;userIdentity=undefined;currentResults=[];if(!keepBusy)busy=false;if(previous)await previous.terminate();}
function startWatch(milliseconds=90000){stopWatch();watchdog=setTimeout(()=>{void stopWorker(false,'TIMEOUT').then(()=>emit({state:'error',error:classifyError(Error('TIMEOUT'))}));},milliseconds);}
function getWorker(){
 if(worker)return worker;
 const current=new Worker(join(__dirname,'worker.cjs'),{workerData:{policyFile:join(app.getPath('userData'),'industry-research.sqlite')}});worker=current;
 current.on('message',async message=>{
  if(worker!==current)return;
  if(message.kind==='inbox_update'){if(!userIdentity)return;if(message.update.type==='connection'){if(message.update.connected!==inboxOnline)queueRunner.boundary(message.update.connected?'QUEUE_RECONNECTED':'QUEUE_CONNECTION_LOST');if(worker!==current)return;inboxOnline=message.update.connected;latest={...latest,inboxOnline};win.webContents.send('spike:status',latest);}win.webContents.send('inbox:update',message.update);return;}
  if(message.kind==='queue_result'&&!queueRunner.matches(message.id,message.runId))return;
  if(message.kind==='schedule_ready'&&!pendingSchedule)return;
  stopWatch();
  if(message.kind==='schedule_ready'){
   const resolve=pendingManual,epoch=generation,confirmation=pendingSchedule!;
   try{
    if(!encryption||!userIdentity)throw Error('ENCRYPTION_UNAVAILABLE');const payload=parseScheduledPayload(message.payload);if(payload.accountId!==userIdentity.id||payload.accountId!==confirmation.accountId||message.previewId!==confirmation.id)throw Error('QUEUE_ACCOUNT_MISMATCH');
    const ciphertext=await safeStorage.encryptStringAsync(JSON.stringify(payload));if(worker!==current||epoch!==generation)return;
    const time=scheduleTime(confirmation.dueAt,confirmation.zone),job=createPolicyCheckedJob(queue,policy,payload,confirmation.id,time.dueAt,time.zone,ciphertext);
    pendingManual=undefined;pendingSchedule=undefined;busy=false;emit({state:'queue_ready'});resolve?.({ok:true,scheduled:{id:job.id,dueAt:job.dueAt,zone:job.zone}});
   }catch(error){if(worker!==current||epoch!==generation)return;pendingManual=undefined;pendingSchedule=undefined;busy=false;emit({state:'error',error:classifyError(error)});resolve?.({ok:false,error:classifyError(error)});}return;
  }
  if(message.kind==='queue_result'){queueRunner.complete(message.id,message.runId,message.reply);return;}
  if(message.kind==='manual'){if(message.reply.ok&&message.reply.preview)manualPreview=message.reply.preview;else if(manualDispatch)manualPreview=undefined;const resolve=pendingManual;pendingManual=undefined;pendingSchedule=undefined;manualDispatch=false;busy=false;if(!message.reply.ok&&['NOT_CONNECTED','AUTH_KEY_UNREGISTERED','SESSION_REVOKED','SESSION_EXPIRED'].includes(message.reply.error.code))await stopWorker(false,message.reply.error.code);emit(message.reply.ok?{state:'manual_ready'}:{state:'error',error:message.reply.error});resolve?.(message.reply);return;}
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
   try{await vault.save(message.value);if(worker!==current)return;busy=false;inboxOnline=true;userIdentity=message.identity;researchScope=message.identity.id;research.setAccount(researchScope);queueRunner.boundary('QUEUE_RECONNECTED');emit({state:'connected',identity:message.identity});}catch(error){await stopWorker();emit({state:'error',error:classifyError(error)});}
  } else if(message.kind==='logged_out'){await vault.clear();manualFile=undefined;userIdentity=undefined;currentResults=[];busy=false;emit({state:'disconnected'});}
 });
 current.on('error',error=>{if(worker!==current)return;const mapped=classifyError(error);void stopWorker(false,mapped.code).then(()=>emit({state:'error',stage:'starting_worker',error:mapped.code==='TELEGRAM_ERROR'?classifyError(Error('WORKER_FAILED')):mapped}));});
 current.on('exit',()=>{if(worker===current)void stopWorker(false,'WORKER_EXIT').then(()=>emit({state:'error',error:classifyError(Error('WORKER_EXIT'))}));});
 return current;
}
if(!app.requestSingleInstanceLock())app.quit();
else app.whenReady().then(async()=>{
 encryption=process.platform==='win32'&&await safeStorage.isAsyncEncryptionAvailable();
 vault=new Vault(app.getPath('userData'),{available:async()=>encryption,encrypt:value=>safeStorage.encryptStringAsync(value),decrypt:async value=>(await safeStorage.decryptStringAsync(value)).result});
 botVault=new Vault(app.getPath('userData'),{available:async()=>encryption,encrypt:value=>safeStorage.encryptStringAsync(value),decrypt:async value=>(await safeStorage.decryptStringAsync(value)).result},'bot-token.enc');savedBotToken=await botVault.exists();
 research=new ResearchStore(join(app.getPath('userData'),'industry-research.sqlite'));researchScope=research.lastAccount();research.addEvent('app_started');policy=new SendPolicyStore(join(app.getPath('userData'),'industry-research.sqlite'));queue=new QueueStore(join(app.getPath('userData'),'industry-research.sqlite'));queue.recover();botStore=new BotIntroStore(join(app.getPath('userData'),'industry-research.sqlite'));botIntro=new BotIntroRuntime(botStore);
 queueRunner=new QueueRunner({authorize:payload=>policy.assertAllowed(payload.accountId,payload.recipient,payload.purpose),store:()=>queue,context:()=>({accountId:userIdentity?.id,connected:Boolean(worker&&userIdentity),online:inboxOnline,suspended,busy}),decrypt:decryptJob,send:(id,payload,expiresAt,runId)=>{emit({state:'queue_sending'});startWatch();worker!.postMessage({type:'scheduled',id,payload,expiresAt,runId});},lock:value=>{busy=value;if(!value)stopWatch();},terminate:code=>{void stopWorker(false,code).then(()=>emit({state:'error',error:classifyError(Error(code))}));},changed:()=>emit({state:'queue_ready'}),error:()=>emit({state:'error',error:classifyError(Error('QUEUE_STORE_ERROR'))})});
 win=new BrowserWindow({width:1100,height:850,minWidth:760,minHeight:600,webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.removeMenu();
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(event,url)=>{if(url!==page)event.preventDefault();});
 win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 win.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith(pathToFileURL(__dirname).href+'/')}));
 ipcMain.handle('bot-intro:action',async(event,input):Promise<BotIntroReply>=>{
  if(event.sender!==win.webContents||event.senderFrame?.url!==page)throw Error('IPC_REJECTED');
  let owns=false;
  try{const action=parseBotIntroAction(input);if(action.type==='status')return {ok:true,snapshot:botIntro.snapshot(savedBotToken)};
   if(action.type==='stop'){botEpoch++;botIntro.stop();return {ok:true,snapshot:botIntro.snapshot(savedBotToken)};}
   if(botOperation)throw Error('BUSY');botOperation=true;owns=true;const epoch=botEpoch;
   if(action.type==='verify'){if(process.argv.includes('--smoke-test'))console.log('BOT_SMOKE_VERIFY_OPTIONS',action.remember,encryption);if(action.remember&&!encryption)throw Error('ENCRYPTION_UNAVAILABLE');await botIntro.verify(action.token);if(epoch!==botEpoch)throw Error('CANCELLED');if(action.remember){await botVault.save({token:action.token});savedBotToken=true;}else{await botVault.clear();savedBotToken=false;}}
   else if(action.type==='restore'){const stored=await botVault.load() as {token?:unknown};if(epoch!==botEpoch)throw Error('CANCELLED');await botIntro.verify(botToken(stored?.token));}
   else if(action.type==='start')await botIntro.start();
   else if(action.type==='forget'){botEpoch++;botIntro.stop(true);await botVault.clear();savedBotToken=false;}
   else if(action.type==='consentHistory')return {ok:true,snapshot:botIntro.snapshot(savedBotToken),history:botIntro.history(action.botId)};
   else if(action.type==='saveConfig')botIntro.save(action.botId,action.config);
   return {ok:true,snapshot:botIntro.snapshot(savedBotToken)};
  }catch(error){return {ok:false,error:classifyError(error),snapshot:botIntro.snapshot(savedBotToken)};}finally{if(owns)botOperation=false;}
 });
 ipcMain.handle('policy:action' ,async(event,input):Promise<PolicyReply>=>{
  if(event.sender!==win.webContents||event.senderFrame?.url!==page)throw Error('IPC_REJECTED');
  try{const action=parsePolicyAction(input),accountId=researchScope;
   if(action.type==='list')return {ok:true,accountId,records:accountId?policy.list(accountId):[]};
   if(!accountId)throw Error('NOT_CONNECTED');
   if('accountId' in action){if(action.accountId!==accountId)throw Error('POLICY_ACCOUNT_MISMATCH');policy.change(action);
    if(action.type==='revoke'||action.type==='suppress'){const marketingOnly=action.type==='revoke',code=marketingOnly?'CONSENT_REVOKED':'RECIPIENT_SUPPRESSED';queue.blockWaiting(accountId,action.target,marketingOnly,code);queueRunner.policyChanged(accountId,action.target,marketingOnly,code);if(manualDispatch&&manualPreview&&userIdentity?.id===accountId&&manualPreview.recipient.id===action.target.id&&manualPreview.recipient.peerType===action.target.peerType&&(!marketingOnly||manualPreview.purpose==='marketing'))void stopWorker(false,code).then(()=>emit({state:'error',error:classifyError(Error(code))}));}
   }
   return {ok:true,accountId,records:policy.list(accountId),record:policy.inspect(accountId,action.target),events:policy.events(accountId,action.target)};
  }catch(error){return {ok:false,error:classifyError(error).message};}
 });
 ipcMain.handle('queue:action' ,async(event,input):Promise<QueueReply>=>{
  if(event.sender!==win.webContents||event.senderFrame?.url!==page)throw Error('IPC_REJECTED');
  try{
   const action=parseQueueAction(input);if(action.type==='list')return {ok:true,jobs:queue.list(researchScope,action.reviewOnly),summary:queue.summary(researchScope)};
   if(!researchScope)throw Error('NOT_CONNECTED');
   if(action.type==='detail'){const record=queue.detail(researchScope,action.id),payload=await decryptJob(record.payload);if(payload.accountId!==researchScope)throw Error('QUEUE_ACCOUNT_MISMATCH');return {ok:true,detail:{job:record.job,text:payload.text,events:record.events}};}
   if(action.type==='resume'||action.type==='reschedule'){const job=queue.detail(researchScope,action.id).job;policy.assertAllowed(researchScope,job.recipient,job.purpose??'personal');}
   queue.change(researchScope,action.id,action.type,action.type==='reschedule'?action.dueAt:undefined,action.type==='reschedule'?action.zone:undefined);return {ok:true,jobs:queue.list(researchScope),summary:queue.summary(researchScope)};
  }catch(error){return {ok:false,error:classifyError(error).message};}
 });
 ipcMain.handle('manual:action',async(event,input):Promise<ManualReply>=>{
  if(event.sender!==win.webContents||event.senderFrame?.url!==page)throw Error('IPC_REJECTED');
  let ownBusy=false;const epoch=generation;
  try{
   const action=parseManualAction(input);
   if(!worker||!userIdentity)throw Error('NOT_CONNECTED');if(busy)throw Error('BUSY');if(!inboxOnline)throw Error('NETWORK_TIMEOUT');
   busy=true;ownBusy=true;
   if(action.type==='clearFile'){manualFile=undefined;busy=false;return {ok:true,cancelled:true};}
   emit({state:action.type==='confirm'?'manual_sending':'manual_preparing'});
   if(action.type==='pickFile'){
    const chosen=await dialog.showOpenDialog(win,{title:action.kind==='photo'?'Chọn ảnh JPEG/PNG (tối đa 10 MB)':'Chọn tài liệu (tối đa 20 MB)',properties:['openFile'],filters:action.kind==='photo'?[{name:'Ảnh',extensions:['jpg','jpeg','png']}]:[{name:'Tệp',extensions:['*']}]});
    if(epoch!==generation)throw Error('CANCELLED');if(chosen.canceled||!chosen.filePaths[0]){busy=false;emit({state:'manual_ready'});return {ok:true,cancelled:true};}
    const selected=await readSendAttachment(chosen.filePaths[0],action.kind);if(epoch!==generation)throw Error('CANCELLED');manualFile=selected;
    busy=false;emit({state:'manual_ready'});const {bytes:_,...attachment}=selected;return {ok:true,attachment};
   }
   if(action.type==='preview'&&action.fileId&&manualFile?.id!==action.fileId)throw Error('SEND_FILE_EXPIRED');
   if(action.type==='confirm'&&manualPreview?.id===action.id)policy.assertAllowed(userIdentity.id,manualPreview.recipient,manualPreview.purpose??'personal');
   pendingSchedule=action.type==='schedule'?{id:action.id,dueAt:action.dueAt,zone:action.zone,accountId:userIdentity.id}:undefined;manualDispatch=action.type==='confirm';startWatch(action.type==='confirm'?180000:90000);
   return await new Promise<ManualReply>(resolve=>{pendingManual=resolve;try{worker!.postMessage({type:'manual',action,attachment:action.type==='preview'&&action.fileId?manualFile:undefined});}catch(error){pendingManual=undefined;pendingSchedule=undefined;manualDispatch=false;busy=false;stopWatch();emit({state:'error',error:classifyError(error)});resolve({ok:false,error:classifyError(error)});}});
  }catch(error){if(ownBusy&&epoch===generation){busy=false;emit({state:'error',error:classifyError(error)});}return {ok:false,error:classifyError(error)};}
 });
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
 if(!process.argv.includes('--smoke-test')){queueTimer=setInterval(()=>{void queueRunner.tick();},1000);powerMonitor.on('suspend',()=>{suspended=true;botIntro.stop();queueRunner.boundary('QUEUE_SLEEP');});powerMonitor.on('resume',()=>{queueRunner.boundary('QUEUE_RESUMED');queueRunner.resetClock();suspended=false;});}
 if(process.argv.includes('--smoke-test')){
  try{
   const ok=await win.webContents.executeJavaScript(`new Promise(resolve=>{let attempts=0;const timer=setInterval(()=>{const ready=document.querySelector('h1')?.textContent.includes('Telegram Automation') && typeof window.spike?.action === 'function' && typeof window.spike?.analysis === 'function' && typeof window.spike?.app === 'function' && document.querySelector('nav')?.textContent.includes('Phân tích nhóm/kênh') && typeof require === 'undefined';if(ready||++attempts>=50){clearInterval(timer);resolve(Boolean(ready));}},100);})`);
   if(!ok)throw Error('SMOKE_FAILED');
   const navigationOk=await win.webContents.executeJavaScript(`(async()=>{const buttons=[...document.querySelectorAll('nav button')];if(buttons.length!==11)return false;for(const button of buttons){button.click();await new Promise(resolve=>setTimeout(resolve,100));if(document.querySelector('.workspace')?.dataset.page!==button.dataset.page)return false;}return true;})()`);
   if(!navigationOk)throw Error('SMOKE_FAILED');console.log('PHASE1_NAVIGATION_PASS');
   if(process.platform==='win32'){
    const directory=await mkdtemp(join(tmpdir(),'telegram-bot-intro-smoke-')),previousIntro=botIntro,previousBotStore=botStore,previousBotVault=botVault,previousSaved=savedBotToken;
    const crypto={available:async()=>encryption,encrypt:(value:string)=>safeStorage.encryptStringAsync(value),decrypt:async(value:Buffer)=>(await safeStorage.decryptStringAsync(value)).result};
    let botReplies=0,polls=0;let releaseIntroPoll:((updates:Record<string,unknown>[])=>void)|undefined;let confirmationData='';const methods:string[]=[];const now=Math.floor(Date.now()/1000),introUpdates=[{update_id:1,message:{message_id:1,date:now,text:'/start',chat:{id:42,type:'private'},from:{id:42,is_bot:false},entities:[{type:'bot_command',offset:0,length:6}]}},{update_id:1,message:{message_id:1,date:now,text:'/start',chat:{id:42,type:'private'},from:{id:42,is_bot:false},entities:[{type:'bot_command',offset:0,length:6}]}},{update_id:2,callback_query:{id:'fixture-choice',data:'intro:product:v1',from:{id:42,is_bot:false},message:{message_id:77,date:now,chat:{id:42,type:'private'},from:{id:123456,is_bot:true}}}}];
    const reply=(result:unknown)=>new Response(JSON.stringify({ok:true,result}),{status:200});
    const fixtureBotFetch:typeof fetch=async(url,init)=>{const method=String(url).split('/').at(-1)!;methods.push(method);if(method==='getMe')return reply({id:123456,is_bot:true,first_name:'Fixture bot',username:'fixture_bot'});if(method==='getWebhookInfo')return reply({url:''});if(method==='getUpdates'){polls++;if(polls===1)return reply(introUpdates);return new Promise((resolve,reject)=>{releaseIntroPoll=updates=>{releaseIntroPoll=undefined;resolve(reply(updates));};init?.signal?.addEventListener('abort',()=>{releaseIntroPoll=undefined;reject(Error('cancelled'));},{once:true});});}if(method==='sendMessage'){botReplies++;const body=JSON.parse(String(init?.body));if(body.chat_id!==42)throw Error('SMOKE_FAILED');if(body.text.startsWith('Xác nhận đăng ký:')){confirmationData=body.reply_markup.inline_keyboard[0][0].callback_data;return reply({message_id:79});}if(!body.text.startsWith('Đã hủy tất cả')&&(!body.text.includes('không tự đăng ký')||body.reply_markup.inline_keyboard.length!==3))throw Error('SMOKE_FAILED');return reply({message_id:77});}if(method==='answerCallbackQuery'){botReplies++;return reply(true);}throw Error('SMOKE_FAILED');};
    botStore=new BotIntroStore(join(directory,'bot.sqlite'));botIntro=new BotIntroRuntime(botStore,fixtureBotFetch);botVault=new Vault(directory,crypto,'bot-token.enc');savedBotToken=false;
    const userProbe=new Vault(directory,crypto);await userProbe.save({session:'user-session-kept'});
    try{
     const verified=await win.webContents.executeJavaScript(`(async()=>{const wait=()=>new Promise(resolve=>setTimeout(resolve,100));document.querySelector('nav button[data-page="account"]').click();await wait();const token=document.querySelector('[data-testid="bot-intro-token"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(token,'123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');token.dispatchEvent(new Event('input',{bubbles:true}));if(!document.querySelector('[data-testid="bot-intro-remember"]').checked)document.querySelector('[data-testid="bot-intro-remember"]').click();await wait();document.querySelector('[data-testid="bot-intro-verify"]').click();for(let i=0;i<30;i++){await wait();if(document.querySelector('[data-testid="bot-intro-state"]')?.textContent.includes('Đã kiểm tra'))return document.querySelector('[data-testid="bot-intro-token"]').value==='';}return false;})()`);
     console.log('BOT_SMOKE_VERIFY_RESULT',Boolean(verified),botReplies,polls,savedBotToken,botIntro.snapshot().state,botIntro.snapshot().error?.code??'NONE');if(!verified||botReplies||polls||!savedBotToken)throw Error('SMOKE_FAILED');const ciphertext=await readFile(join(directory,'bot-token.enc'));if(ciphertext.includes(Buffer.from('123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')))throw Error('PLAINTEXT_FOUND');
     const running=await win.webContents.executeJavaScript(`(async()=>{const wait=()=>new Promise(resolve=>setTimeout(resolve,100));const welcome=document.querySelector('[data-testid="bot-intro-welcome"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(welcome,'Xin chào kiểm thử');welcome.dispatchEvent(new Event('input',{bubbles:true}));await wait();document.querySelector('[data-testid="bot-intro-save"]').click();await wait();const original=window.confirm;window.confirm=()=>true;document.querySelector('[data-testid="bot-intro-start"]').click();window.confirm=original;for(let i=0;i<40;i++){await wait();if(document.querySelector('[data-testid="bot-intro-stats"]')?.textContent.includes('/start đã trả lời: 1')&&document.querySelector('[data-testid="bot-intro-stats"]')?.textContent.includes('Lựa chọn đã giải thích: 1'))return document.querySelector('[data-testid="bot-intro-state"]')?.textContent.includes('Đang lắng nghe')&&document.querySelector('[data-testid="bot-intro-preview"]')?.textContent.includes('Xin chào kiểm thử');}return false;})()`);
     if(!running||Number(botReplies)!==2||policy.list('123456').length||methods.some(method=>['deleteWebhook','setWebhook'].includes(method)))throw Error('SMOKE_FAILED');
     const consentCallback=(id:number,data:string,messageId=77)=>({update_id:id,callback_query:{id:'consent-'+id,data,from:{id:42,is_bot:false},message:{message_id:messageId,date:now,chat:{id:42,type:'private'},from:{id:123456,is_bot:true}}}});
     if(!releaseIntroPoll)throw Error('SMOKE_FAILED');releaseIntroPoll([consentCallback(3,'sub:topic:product:v2')]);await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,350))`);
     if(!confirmationData||botStore.consents.stats('123456').subscribers!==0||!releaseIntroPoll)throw Error('SMOKE_FAILED');releaseIntroPoll([consentCallback(4,confirmationData,79)]);await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,350))`);
     const consentVisible=await win.webContents.executeJavaScript(`(async()=>{document.querySelector('[data-testid="bot-consent-history"]').click();await new Promise(resolve=>setTimeout(resolve,150));return document.querySelector('[data-testid="bot-consent-events"]')?.textContent.includes('Đồng ý')&&document.querySelector('[data-testid="bot-intro-stats"]')?.textContent.includes('Người đang đăng ký: 1');})()`);
     if(!consentVisible||!botStore.consents.active('123456','42','product')||!releaseIntroPoll)throw Error('SMOKE_FAILED');releaseIntroPoll([{update_id:5,message:{message_id:5,date:now,text:'/stop',chat:{id:42,type:'private'},from:{id:42,is_bot:false},entities:[{type:'bot_command',offset:0,length:5}]}}]);await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,350))`);
     if(botStore.consents.active('123456','42','product')||!releaseIntroPoll)throw Error('SMOKE_FAILED');releaseIntroPoll([consentCallback(6,confirmationData,79)]);await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,350))`);
     const optOutVisible=await win.webContents.executeJavaScript(`(async()=>{document.querySelector('[data-testid="bot-consent-history"]').click();await new Promise(resolve=>setTimeout(resolve,150));return document.querySelector('[data-testid="bot-consent-events"]')?.textContent.includes('bot:/stop')&&document.querySelector('[data-testid="bot-intro-stats"]')?.textContent.includes('Người đang đăng ký: 0');})()`);
     if(!optOutVisible||botStore.consents.active('123456','42','product')||botStore.consents.history('123456').length!==2||policy.list('123456').length)throw Error('SMOKE_FAILED');console.log('BOT_TOPIC_CONSENT_STOP_PASS');

     const stopped=await win.webContents.executeJavaScript(`(async()=>{const wait=()=>new Promise(resolve=>setTimeout(resolve,100));document.querySelector('[data-testid="bot-intro-stop"]').click();await wait();document.querySelector('[data-testid="bot-intro-restore"]').click();for(let i=0;i<30;i++){await wait();if(document.querySelector('[data-testid="bot-intro-state"]')?.textContent.includes('Đã kiểm tra'))break;}if(!document.querySelector('[data-testid="bot-intro-state"]')?.textContent.includes('Đã kiểm tra'))return false;const original=window.confirm;window.confirm=()=>true;document.querySelector('[data-testid="bot-intro-forget"]').click();window.confirm=original;for(let i=0;i<30;i++){await wait();if(document.querySelector('[data-testid="bot-intro-state"]')?.textContent==='Đã dừng')return true;}return false;})()`);
     if(!stopped||await botVault.exists()||Number(botReplies)!==7||JSON.stringify(await userProbe.load())!==JSON.stringify({session:'user-session-kept'}))throw Error('SMOKE_FAILED');console.log('BOT_START_MENU_UI_PASS');console.log('BOT_TOKEN_DPAPI_ISOLATION_PASS');
    }finally{botIntro.stop(true);botStore.close();botIntro=previousIntro;botStore=previousBotStore;botVault=previousBotVault;savedBotToken=previousSaved;await rm(directory,{recursive:true,force:true});}
   }

   const inboxOk=await win.webContents.executeJavaScript(`(async()=>{
    document.querySelector('nav button[data-page="inbox"]').click();await new Promise(resolve=>setTimeout(resolve,150));
    if(!document.querySelector('[data-testid="inbox-disconnected"]')||!document.querySelector('[data-testid="inbox-refresh"]').disabled||typeof window.spike.inbox!=='function')return false;
    const disconnected=await window.spike.inbox({type:'dialogs'}),invalid=await window.spike.inbox({type:'send',text:'must not send'}),manual=await window.spike.manual({type:'preview',target:{kind:'self'},text:'must not send'});if(manual.ok||manual.error.code!=='NOT_CONNECTED'||!document.querySelector('[data-testid="send-preview"]').disabled)return false;
    return !disconnected.ok&&disconnected.error.code==='NOT_CONNECTED'&&!invalid.ok&&invalid.error.code==='INPUT_INVALID';
   })()`);
   if(!inboxOk)throw Error('SMOKE_FAILED');console.log('INBOX_DISCONNECTED_IPC_PASS');
   // Fixture-only UI contract test; never enabled in normal application use.
   let fixtureReads=0;let fixtureMessages=[{id:5,at:'2026-10-24T00:00:00Z',text:'Tin ban đầu',outgoing:false,kind:'text' as const}];
   ipcMain.removeHandler('inbox:action');ipcMain.handle('inbox:action',(_event,input)=>{
    const action=parseInboxAction(input);fixtureReads++;
    if(action.type==='dialogs')return {ok:true,type:'dialogs',dialogs:[{id:'1',key:'user:1',kind:'user',name:'Hội thoại thử',username:'fixture_user',unread:1,preview:fixtureMessages[0].text,lastMessageId:fixtureMessages[0].id}]};
    return {ok:true,type:'messages',key:action.key,messages:fixtureMessages};
   });
   const fixtureReplyTemplate=research.saveTemplate({name:'Mẫu reply kiểm thử',body:'Chào {{ten}}, sản phẩm {{san_pham}}.'});
   const fixtureStatus={state:'connected',userConnected:true,inboxOnline:true,userIdentity:{id:'1',name:'Kiểm thử',kind:'user' as const,peerType:'user' as const}};
   win.webContents.send('spike:status',fixtureStatus);
   await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,150))`);
   const opened=await win.webContents.executeJavaScript(`(async()=>{document.querySelector('[data-testid="inbox-refresh"]').click();await new Promise(resolve=>setTimeout(resolve,200));document.querySelector('.dialog-row')?.click();await new Promise(resolve=>setTimeout(resolve,200));return document.querySelector('.inbox-message')?.textContent.includes('Tin ban đầu');})()`);
   if(!opened)throw Error('SMOKE_FAILED');
   const delta={type:'message',key:'user:1',edited:false,message:{id:6,at:'2026-10-24T00:00:01Z',text:'Tin trực tiếp',kind:'text',outgoing:false}};
   win.webContents.send('inbox:update',delta);win.webContents.send('inbox:update',delta);
   fixtureMessages=[{...fixtureMessages[0],id:6,text:'Đã sửa <script>'}];
   win.webContents.send('inbox:update',{...delta,edited:true,message:fixtureMessages[0]});win.webContents.send('inbox:update',{type:'delete',ids:[5]});
   const liveOk=await win.webContents.executeJavaScript(`(async()=>{await new Promise(resolve=>setTimeout(resolve,150));const messages=document.querySelectorAll('.inbox-message');if(messages.length!==1||!messages[0].textContent.includes('Đã sửa <script>'))return false;const input=document.querySelector('[data-testid="inbox-filter"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'@fixture_user');input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,100));return document.querySelectorAll('.dialog-row').length===1;})()`);
   if(!liveOk)throw Error('SMOKE_FAILED');console.log('INBOX_LIVE_RENDERER_PASS');
   const beforeReconnect=fixtureReads;
   win.webContents.send('spike:status',{state:'disconnected',userConnected:false});await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,100))`);
   if(!await win.webContents.executeJavaScript(`document.querySelectorAll('.inbox-message').length===0`))throw Error('SMOKE_FAILED');
   win.webContents.send('spike:status',fixtureStatus);await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,500))`);
   if(fixtureReads!==beforeReconnect+2||!await win.webContents.executeJavaScript(`document.querySelector('.inbox-message')?.textContent.includes('Đã sửa <script>')`))throw Error('SMOKE_FAILED');console.log('INBOX_RECONNECT_REFRESH_PASS');
   let fixtureManualSends=0,fixtureManualToken=false,fixtureManualUncertain=false,fixtureRightsBlocked=true,fixtureManualRate=false;let fixtureReplyId:number|undefined;let fixtureScheduleText='';let fixtureManualPurpose:SendPurpose='personal';
   ipcMain.removeHandler('manual:action');ipcMain.handle('manual:action',async(_event,input)=>{
    const action=parseManualAction(input);
    if(action.type==='capabilities')return {ok:true,capabilities:{recipient:fixtureStatus.userIdentity,checkedAt:new Date().toISOString(),text:{state:fixtureRightsBlocked?'blocked':'allowed',reason:'Quyền kiểm thử',code:fixtureRightsBlocked?'CHAT_SEND_PLAIN_FORBIDDEN':undefined},photo:{state:'allowed',reason:'Quyền kiểm thử'},document:{state:'unknown',reason:'Chưa xác định'},notes:['Thông tin kiểm thử, chưa gửi tin.']}};
    if(action.type==='schedule'&&fixtureManualToken){fixtureManualToken=false;const recipient={id:'1',name:'Kiểm thử',kind:'user' as const,peerType:'user' as const};const payload=parseScheduledPayload({accountId:'1',recipient,peer:{type:'self'},text:fixtureScheduleText,randomId:'1234567',purpose:fixtureManualPurpose});const encrypted=await safeStorage.encryptStringAsync(JSON.stringify(payload));const job=createPolicyCheckedJob(queue,policy,payload,action.id,action.dueAt,action.zone,encrypted);return {ok:true,scheduled:{id:job.id,dueAt:job.dueAt,zone:job.zone}};}
    if(action.type==='preview'){fixtureManualPurpose=action.purpose??'personal';try{policy.assertAllowed('1',fixtureStatus.userIdentity,fixtureManualPurpose);}catch(error){return {ok:false,error:classifyError(error)};}fixtureManualToken=true;fixtureScheduleText=action.text;fixtureReplyId=action.replyTo;return {ok:true,preview:{id:randomUUID(),purpose:fixtureManualPurpose,recipient:fixtureStatus.userIdentity,text:action.text,reply:action.replyTo?{id:action.replyTo,text:fixtureMessages[0].text}:undefined,expiresAt:new Date(Date.now()+300000).toISOString()}};}
    if(action.type==='confirm'&&fixtureManualToken){fixtureManualToken=false;fixtureManualSends++;return fixtureManualRate?{ok:false,error:{code:'RATE_LIMIT',message:'Telegram yêu cầu chờ.',retryAfter:2}}:fixtureManualUncertain?{ok:false,error:classifyError(Error('TIMEOUT')),uncertain:true}:{ok:true,sent:{id:77,recipient:fixtureStatus.userIdentity}};}
    return {ok:false,error:classifyError(Error('SEND_PREVIEW_EXPIRED'))};
   });
   const rightsBlocked=await win.webContents.executeJavaScript(`(async()=>{document.querySelector('[data-testid="send-check-rights"]').click();await new Promise(resolve=>setTimeout(resolve,150));return document.querySelector('[data-capability="text"]')?.dataset.state==='blocked'&&document.querySelector('[data-capability="document"]')?.textContent.includes('Chưa xác định')&&document.querySelector('[data-testid="send-preview"]').disabled;})()`);
   if(!rightsBlocked||Number(fixtureManualSends)!==0)throw Error('SMOKE_FAILED');fixtureRightsBlocked=false;
   await win.webContents.executeJavaScript(`document.querySelector('[data-testid="send-check-rights"]').click()`);await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,150))`);
   if(!await win.webContents.executeJavaScript(`document.querySelector('[data-capability="text"]')?.dataset.state==='allowed'&&!document.querySelector('[data-testid="send-preview"]').disabled`))throw Error('SMOKE_FAILED');console.log('SEND_RIGHTS_UI_PASS');
   const composerPreview=await win.webContents.executeJavaScript(`(async()=>{const input=document.querySelector('[data-testid="send-text"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Tin thử **nguyên văn**');input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,100));document.querySelector('[data-testid="send-preview"]').click();await new Promise(resolve=>setTimeout(resolve,150));return document.querySelector('[data-testid="send-preview-panel"]')?.textContent.includes('Tin thử **nguyên văn**');})()`);
   if(!composerPreview||fixtureManualSends!==0)throw Error('SMOKE_FAILED');
   await win.webContents.executeJavaScript(`(()=>{const button=document.querySelector('[data-testid="send-confirm"]');button.click();button.click();})()`);await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,150))`);
   if(Number(fixtureManualSends)!==1||!await win.webContents.executeJavaScript(`document.querySelector('[data-testid="send-text"]').value===''`))throw Error('SMOKE_FAILED');console.log('MANUAL_COMPOSER_PREVIEW_CONFIRM_PASS');
   const replyTemplateOk=await win.webContents.executeJavaScript(`(async()=>{
    document.querySelector('[data-testid="message-reply"]').click();await new Promise(resolve=>setTimeout(resolve,100));
    const select=document.querySelector('[data-testid="compose-template"]');const option=[...select.options].find(option=>option.textContent==='Mẫu reply kiểm thử');if(!option)return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,option.value);select.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,100));
    document.querySelector('[data-testid="compose-template-apply"]').click();await new Promise(resolve=>setTimeout(resolve,100));if(document.querySelector('[data-testid="send-text"]').value!=='')return false;
    for(const [key,value] of [['ten','Bạn thử'],['san_pham','Sản phẩm thử']]){const input=document.querySelector('[data-template-variable="'+key+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}
    await new Promise(resolve=>setTimeout(resolve,100));document.querySelector('[data-testid="compose-template-apply"]').click();await new Promise(resolve=>setTimeout(resolve,100));
    if(document.querySelector('[data-testid="send-text"]').value!=='Chào Bạn thử, sản phẩm Sản phẩm thử.')return false;
    document.querySelector('[data-testid="send-preview"]').click();await new Promise(resolve=>setTimeout(resolve,150));return document.querySelector('[data-testid="reply-preview"]')?.textContent.includes('#6');
   })()`);
   if(!replyTemplateOk||Number(fixtureManualSends)!==1||fixtureReplyId!==6)throw Error('SMOKE_FAILED');
   await win.webContents.executeJavaScript(`document.querySelector('[data-testid="send-confirm"]').click()`);await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,150))`);
   if(Number(fixtureManualSends)!==2||!await win.webContents.executeJavaScript(`!document.querySelector('[data-testid="reply-context"]')&&document.querySelector('[data-testid="send-text"]').value===''`))throw Error('SMOKE_FAILED');console.log('REPLY_TEMPLATE_COMPOSER_PASS');
   await win.webContents.executeJavaScript(`document.querySelector('[data-testid="message-reply"]').click()`);await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,100))`);
   win.webContents.send('inbox:update',{type:'delete',ids:[6]});await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,150))`);
   if(!await win.webContents.executeJavaScript(`document.querySelector('[data-testid="reply-context"]')?.textContent.includes('không còn')&&document.querySelector('[data-testid="send-preview"]').disabled`))throw Error('SMOKE_FAILED');console.log('REPLY_DELETED_GUARD_PASS');
   await win.webContents.executeJavaScript(`document.querySelector('[data-testid="reply-clear"]').click()`);await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,100))`);
   fixtureManualUncertain=true;
   await win.webContents.executeJavaScript(`(async()=>{const input=document.querySelector('[data-testid="send-text"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Giữ bản soạn khi chưa rõ kết quả');input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,100));document.querySelector('[data-testid="send-preview"]').click();await new Promise(resolve=>setTimeout(resolve,100));document.querySelector('[data-testid="send-confirm"]').click();await new Promise(resolve=>setTimeout(resolve,150));})()`);
   if(Number(fixtureManualSends)!==3||!await win.webContents.executeJavaScript(`document.querySelector('[data-testid="send-text"]').value==='Giữ bản soạn khi chưa rõ kết quả'&&document.querySelector('[data-testid="send-preview"]').disabled`))throw Error('SMOKE_FAILED');console.log('MANUAL_UNCERTAIN_DRAFT_PASS');research.deleteTemplate(fixtureReplyTemplate);
   fixtureManualUncertain=false;fixtureManualRate=true;
   await win.webContents.executeJavaScript(`(async()=>{document.querySelector('[data-testid="send-uncertain-ack"]').click();await new Promise(resolve=>setTimeout(resolve,100));document.querySelector('[data-testid="send-preview"]').click();await new Promise(resolve=>setTimeout(resolve,100));document.querySelector('[data-testid="send-confirm"]').click();await new Promise(resolve=>setTimeout(resolve,150));})()`);
   if(Number(fixtureManualSends)!==4||!await win.webContents.executeJavaScript(`Boolean(document.querySelector('[data-testid="send-cooldown"]'))&&document.querySelector('[data-testid="send-preview"]').disabled&&document.querySelector('[data-testid="send-error-help"]')?.textContent.includes('RATE_LIMIT')`))throw Error('SMOKE_FAILED');
   await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,2400))`);
   if(Number(fixtureManualSends)!==4||!await win.webContents.executeJavaScript(`!document.querySelector('[data-testid="send-preview"]').disabled&&document.querySelector('[data-testid="send-text"]').value==='Giữ bản soạn khi chưa rõ kết quả'`))throw Error('SMOKE_FAILED');console.log('SEND_RATE_LIMIT_GUARD_PASS');
   if(process.platform==='win32'){
    const directory=await mkdtemp(join(tmpdir(),'telegram-queue-smoke-')),previousQueue=queue,previousScope=researchScope,previousPolicy=policy;queue=new QueueStore(join(directory,'queue.sqlite'));policy=new SendPolicyStore(join(directory,'queue.sqlite'));researchScope='1';
    try{
     const schedulingOk=await win.webContents.executeJavaScript(`(async()=>{document.querySelector('[data-testid="send-preview"]').click();await new Promise(resolve=>setTimeout(resolve,150));document.querySelector('[data-testid="schedule-review"]').click();await new Promise(resolve=>setTimeout(resolve,100));if(!document.querySelector('[data-testid="schedule-summary"]'))return false;const confirm=document.querySelector('[data-testid="schedule-confirm"]');confirm.click();confirm.click();await new Promise(resolve=>setTimeout(resolve,350));document.querySelector('nav button[data-page="schedule"]').click();await new Promise(resolve=>setTimeout(resolve,250));return Boolean(document.querySelector('[data-job-state="pending"]'));})()`);
     if(!schedulingOk||Number(fixtureManualSends)!==4||queue.list('1').length!==1)throw Error('SMOKE_FAILED');
     const controlsOk=await win.webContents.executeJavaScript(`(async()=>{const button=text=>[...document.querySelectorAll('[data-job-state] button')].find(b=>b.textContent===text);button('Xem nội dung').click();await new Promise(resolve=>setTimeout(resolve,150));button('Tạm dừng').click();await new Promise(resolve=>setTimeout(resolve,150));if(!document.querySelector('[data-job-state="paused"]'))return false;button('Tiếp tục').click();await new Promise(resolve=>setTimeout(resolve,150));if(!document.querySelector('[data-job-state="pending"]'))return false;const confirm=window.confirm;window.confirm=()=>true;button('Hủy lịch').click();window.confirm=confirm;await new Promise(resolve=>setTimeout(resolve,150));return Boolean(document.querySelector('[data-job-state="cancelled"]'));})()`);
     if(!controlsOk)throw Error('SMOKE_FAILED');
     const job=queue.list('1')[0],payload=await decryptJob(queue.detail('1',job.id).payload);if(payload.text!==fixtureScheduleText)throw Error('SMOKE_FAILED');
     if((await readFile(join(directory,'queue.sqlite'))).includes(Buffer.from(fixtureScheduleText)))throw Error('PLAINTEXT_FOUND');
     await win.webContents.executeJavaScript(`document.querySelector('nav button[data-page="inbox"]').click()`);await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,100))`);queue.close();queue=new QueueStore(join(directory,'queue.sqlite'));if(queue.list('1')[0].state!=='cancelled')throw Error('SMOKE_FAILED');console.log('QUEUE_SCHEDULE_CONTROLS_PASS');console.log('QUEUE_DPAPI_PERSISTENCE_PASS');
     const retryAt=Date.now()+60000,retryJob=queue.create('1','00000000-0000-4000-8000-000000000093',job.recipient,new Date(retryAt).toISOString(),'UTC',await safeStorage.encryptStringAsync(JSON.stringify(payload)));queue.claim('1',retryAt);queue.reject('1',retryJob.id,{code:'RATE_LIMIT',retryAfter:600},false,retryAt);
     await win.webContents.executeJavaScript(`document.querySelector('nav button[data-page="schedule"]').click()`);await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,250))`);
     const retryOk=await win.webContents.executeJavaScript(`(async()=>{const button=(state,text)=>[...document.querySelectorAll('[data-job-state="'+state+'"] button')].find(b=>b.textContent===text);if(!document.querySelector('[data-job-state="retry_wait"]')?.textContent.includes('1/3'))return false;button('retry_wait','Tạm dừng').click();await new Promise(resolve=>setTimeout(resolve,150));button('paused','Tiếp tục').click();await new Promise(resolve=>setTimeout(resolve,150));const original=window.confirm;window.confirm=()=>true;button('retry_wait','Hủy lịch').click();window.confirm=original;await new Promise(resolve=>setTimeout(resolve,150));return !document.querySelector('[data-job-state="retry_wait"]');})()`);
     if(!retryOk||queue.detail('1',retryJob.id).job.state!=='cancelled'||Number(fixtureManualSends)!==4)throw Error('SMOKE_FAILED');console.log('QUEUE_CLASSIFIED_RETRY_CONTROLS_PASS');
     const recoveryAt=retryAt+700000,cipher=await safeStorage.encryptStringAsync(JSON.stringify(payload));
     const missedJob=queue.create('1','00000000-0000-4000-8000-000000000094',job.recipient,new Date(recoveryAt).toISOString(),'UTC',cipher);queue.overdue(recoveryAt+1,0,'QUEUE_RESUMED');
     const interruptedJob=queue.create('1','00000000-0000-4000-8000-000000000095',job.recipient,new Date(recoveryAt+3000).toISOString(),'UTC',cipher);if(queue.claim('1',recoveryAt+3000)?.id!==interruptedJob.id)throw Error('SMOKE_FAILED');
     queue.create('1','00000000-0000-4000-8000-000000000096',job.recipient,new Date(recoveryAt+3600000).toISOString(),'UTC',cipher);
     queue.close();queue=new QueueStore(join(directory,'queue.sqlite'));queue.recover(recoveryAt+4000);
     const reviewOk=await win.webContents.executeJavaScript(`(async()=>{document.querySelector('[data-testid="queue-refresh"]').click();await new Promise(resolve=>setTimeout(resolve,200));if(!document.querySelector('[data-testid="queue-recovery-summary"]')?.textContent.includes('1 lịch quá hạn/gián đoạn · 1 lịch chưa rõ kết quả'))return false;document.querySelector('[data-testid="queue-review-filter"]').click();await new Promise(resolve=>setTimeout(resolve,200));const uncertain=document.querySelector('[data-job-state="uncertain"]');if(!uncertain||uncertain.querySelectorAll('button').length!==1||!uncertain.textContent.includes('sẽ không tự gửi lại'))return false;if(document.querySelectorAll('[data-job-state]').length!==2)return false;const missed=document.querySelector('[data-job-state="needs_review"]');[...missed.querySelectorAll('button')].find(b=>b.textContent==='Chọn giờ mới').click();await new Promise(resolve=>setTimeout(resolve,100));const original=window.confirm;window.confirm=()=>true;document.querySelector('[data-testid="queue-reschedule-confirm"]').click();window.confirm=original;await new Promise(resolve=>setTimeout(resolve,200));return !document.querySelector('[data-job-state="needs_review"]')&&Boolean(document.querySelector('[data-job-state="uncertain"]'));})()`);
     if(!reviewOk||queue.detail('1',missedJob.id).job.state!=='pending'||queue.detail('1',interruptedJob.id).job.state!=='uncertain'||Number(fixtureManualSends)!==4)throw Error('SMOKE_FAILED');console.log('QUEUE_RECOVERY_REVIEW_PASS');
     const consentUi=await win.webContents.executeJavaScript(`(async()=>{const wait=()=>new Promise(resolve=>setTimeout(resolve,180));const fill=(selector,value)=>{const input=document.querySelector(selector);Object.getOwnPropertyDescriptor(input instanceof HTMLSelectElement?HTMLSelectElement.prototype:input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event(input instanceof HTMLSelectElement?'change':'input',{bubbles:true}));};document.querySelector('nav button[data-page="inbox"]').click();await wait();fill('[data-testid="send-purpose"]','marketing');fill('[data-testid="send-text"]','Marketing fixture opt-in');await wait();document.querySelector('[data-testid="send-preview"]').click();await wait();if(!document.querySelector('[data-testid="send-error-help"]')?.textContent.includes('CONSENT_REQUIRED'))return false;document.querySelector('nav button[data-page="contacts"]').click();await wait();fill('[data-testid="policy-peer-id"]','1');fill('[data-testid="policy-peer-name"]','Kiểm thử');await wait();document.querySelector('[data-testid="policy-inspect"]').click();await wait();fill('[data-testid="policy-source"]','Fixture explicit opt-in');document.querySelector('[data-testid="policy-consent-confirm"]').click();await wait();const original=window.confirm;window.confirm=()=>true;document.querySelector('[data-testid="policy-grant"]').click();window.confirm=original;await wait();if(!document.querySelector('[data-testid="policy-current"]')?.textContent.includes('Đã ghi nhận đồng ý'))return false;document.querySelector('nav button[data-page="inbox"]').click();await wait();document.querySelector('[data-testid="send-preview"]').click();await wait();document.querySelector('[data-testid="schedule-review"]').click();await wait();document.querySelector('[data-testid="schedule-confirm"]').click();await wait();return true;})()`);
     const marketingJob=queue.list('1').find(row=>row.purpose==='marketing');if(!consentUi||!marketingJob||marketingJob.state!=='pending')throw Error('SMOKE_FAILED');
     const revokeUi=await win.webContents.executeJavaScript(`(async()=>{const wait=()=>new Promise(resolve=>setTimeout(resolve,180));const fill=(selector,value)=>{const input=document.querySelector(selector);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));};document.querySelector('nav button[data-page="contacts"]').click();await wait();fill('[data-testid="policy-peer-id"]','1');fill('[data-testid="policy-peer-name"]','Kiểm thử');await wait();document.querySelector('[data-testid="policy-inspect"]').click();await wait();for(const type of ['revoke','suppress','unsuppress']){fill('[data-testid="policy-source"]','Fixture '+type);await wait();const original=window.confirm;window.confirm=()=>true;document.querySelector('[data-testid="policy-'+type+'"]').click();window.confirm=original;await wait();}if(!document.querySelector('[data-testid="policy-current"]')?.textContent.includes('Đã rút đồng ý')||!document.querySelector('[data-testid="policy-current"]')?.textContent.includes('Chặn gửi: Không'))return false;const rejected=await window.spike.policy({type:'grant',accountId:'2',target:{id:'1',peerType:'user',name:'Wrong account'},source:'Fixture'});return !rejected.ok;})()`);
     if(!revokeUi||queue.detail('1',marketingJob.id).job.state!=='cancelled'||queue.detail('1',marketingJob.id).job.errorCode!=='CONSENT_REVOKED'||policy.inspect('1',{id:'1',peerType:'user',name:'Fixture'}).consent!=='revoked'||policy.list('2').length||Number(fixtureManualSends)!==4)throw Error('SMOKE_FAILED');console.log('SEND_CONSENT_SUPPRESSION_PASS');

     await win.webContents.executeJavaScript(`document.querySelector('nav button[data-page="inbox"]').click()`);await win.webContents.executeJavaScript(`new Promise(resolve=>setTimeout(resolve,100))`);


    }finally{queue.close();policy.close();policy=previousPolicy;queue=previousQueue;researchScope=previousScope;await rm(directory,{recursive:true,force:true});}
   }
   win.webContents.send('spike:status',{state:'disconnected',userConnected:false});

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
  }catch(error){console.error('PHASE0_SMOKE_FAIL',classifyError(error).code,error instanceof Error?error.name:'UNKNOWN');app.exit(1);}
 }
}).catch(error=>{console.error('APP_START_FAILED',classifyError(error).code);if(!process.argv.includes('--smoke-test'))dialog.showErrorBox('Không thể mở ứng dụng',classifyError(error).message);app.exit(1);});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{botEpoch++;botIntro?.stop(true);botStore?.close();clearInterval(queueTimer);void stopWorker(false,'QUEUE_APP_CLOSED');queue?.close();policy?.close();research?.close();});
