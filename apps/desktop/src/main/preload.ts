import {contextBridge,ipcRenderer} from 'electron';
import type {Action,Status} from '../../../../packages/shared/src/protocol';
import type {AnalysisAction} from '../../../../packages/shared/src/group-analysis';
import type {ResearchAction} from '../../../../packages/shared/src/research';
contextBridge.exposeInMainWorld('spike',{
 action:(action:Action)=>ipcRenderer.invoke('spike:action',action),
 analysis:(action:AnalysisAction)=>ipcRenderer.invoke('analysis:action',action),
 research:(action:ResearchAction)=>ipcRenderer.invoke('research:action',action),
 status:()=>ipcRenderer.invoke('spike:status'),
 subscribe:(callback:(status:Status)=>void)=>{const listener=(_event:unknown,status:Status)=>callback(status);ipcRenderer.on('spike:status',listener);return ()=>ipcRenderer.removeListener('spike:status',listener);}
});
