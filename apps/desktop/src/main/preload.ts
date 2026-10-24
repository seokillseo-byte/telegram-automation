import type {BotIntroAction} from '../../../../packages/shared/src/bot-intro';
import type {PolicyAction} from '../../../../packages/shared/src/send-policy';
import type {QueueAction} from '../../../../packages/shared/src/queue';
import type {ManualAction} from '../../../../packages/shared/src/manual-send';
import type {InboxAction,InboxUpdate} from '../../../../packages/shared/src/inbox';
import {contextBridge,ipcRenderer} from 'electron';
import type {AppAction} from '../../../../packages/shared/src/app-state';
import type {Action,Status} from '../../../../packages/shared/src/protocol';
import type {AnalysisAction} from '../../../../packages/shared/src/group-analysis';
import type {ResearchAction} from '../../../../packages/shared/src/research';
contextBridge.exposeInMainWorld('spike',{
 botIntro:(action:BotIntroAction)=>ipcRenderer.invoke('bot-intro:action',action),
 policy:(action:PolicyAction)=>ipcRenderer.invoke('policy:action',action),
 queue:(action:QueueAction)=>ipcRenderer.invoke('queue:action',action),
 manual:(action:ManualAction)=>ipcRenderer.invoke('manual:action',action),
 inboxUpdates:(callback:(update:InboxUpdate)=>void)=>{const listener=(_event:unknown,update:InboxUpdate)=>callback(update);ipcRenderer.on('inbox:update',listener);return ()=>ipcRenderer.removeListener('inbox:update',listener);},
 inbox:(action:InboxAction)=>ipcRenderer.invoke('inbox:action',action),
 app:(action:AppAction)=>ipcRenderer.invoke('app:action',action),
 action:(action:Action)=>ipcRenderer.invoke('spike:action',action),
 analysis:(action:AnalysisAction)=>ipcRenderer.invoke('analysis:action',action),
 research:(action:ResearchAction)=>ipcRenderer.invoke('research:action',action),
 status:()=>ipcRenderer.invoke('spike:status'),
 subscribe:(callback:(status:Status)=>void)=>{const listener=(_event:unknown,status:Status)=>callback(status);ipcRenderer.on('spike:status',listener);return ()=>ipcRenderer.removeListener('spike:status',listener);}
});
