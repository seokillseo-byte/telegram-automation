import {BOT_SUBSCRIBE_CHOICES,type BotConsentEvent} from './bot-consent';
import type {Failure,Identity} from './protocol';
export type BotIntroConfig={welcome:string};
export const DEFAULT_BOT_INTRO:BotIntroConfig={welcome:'Chào bạn! Bạn muốn tìm hiểu nội dung nào?'};
export const BOT_INTRO_NOTICE='Mở /start hoặc xem chủ đề không tự đăng ký nhận tin. Chỉ đăng ký khi bạn bấm Xác nhận cho từng chủ đề. Gửi /stop để hủy tất cả đăng ký của bạn với bot này.';
export const BOT_CHOICES=[{id:'intro:product:v1',label:'Nội dung: Sản phẩm',answer:'Menu giới thiệu cũ không ghi nhận đăng ký. Gửi /start để chọn và xác nhận chủ đề, hoặc /stop để hủy đăng ký.'},{id:'intro:guides:v1',label:'Nội dung: Hướng dẫn',answer:'Menu giới thiệu cũ không ghi nhận đăng ký. Gửi /start để chọn và xác nhận chủ đề, hoặc /stop để hủy đăng ký.'},{id:'intro:none:v1',label:'Chưa đăng ký',answer:'Menu giới thiệu cũ không thay đổi đăng ký. Gửi /start để chọn chủ đề hoặc /stop để hủy đăng ký.'}] as const;
export type BotSnapshot={state:'stopped'|'verifying'|'verified'|'starting'|'running'|'error';identity?:Identity;config:BotIntroConfig;error?:Failure;retryAt?:string;lastPollAt?:string;savedToken:boolean;consentStats?:{subscribers:number;activeTopics:number};stats:{starts:number;choices:number;uncertain:number}};
export type BotIntroAction={type:'status'|'restore'|'start'|'stop'|'forget'}|{type:'verify';token:string;remember:boolean}|{type:'consentHistory';botId:string}|{type:'saveConfig';botId:string;config:BotIntroConfig};
export type BotIntroReply={ok:true;snapshot:BotSnapshot;history?:BotConsentEvent[]}|{ok:false;error:Failure;snapshot?:BotSnapshot};
export function botToken(value:unknown):string{if(typeof value!=='string'||value.length>256||!/^\d+:[A-Za-z0-9_-]{20,}$/.test(value.trim()))throw Error('INPUT_INVALID');return value.trim();}
export function botIntroConfig(value:unknown):BotIntroConfig{if(!value||typeof value!=='object'||Object.keys(value).some(k=>k!=='welcome'))throw Error('INPUT_INVALID');const text=(value as BotIntroConfig).welcome;if(typeof text!=='string'||!text.trim()||text.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw Error('INPUT_INVALID');return {welcome:text.trim()};}
export function parseBotIntroAction(value:unknown):BotIntroAction{
 if(!value||typeof value!=='object')throw Error('INPUT_INVALID');const v=value as Record<string,unknown>;
 if(['status','restore','start','stop','forget'].includes(String(v.type))&&Object.keys(v).length===1)return {type:v.type as 'status'|'restore'|'start'|'stop'|'forget'};
 if(v.type==='verify'&&Object.keys(v).length===3&&typeof v.remember==='boolean')return {type:'verify',token:botToken(v.token),remember:v.remember};
 if(v.type==='consentHistory'&&Object.keys(v).length===2&&typeof v.botId==='string'&&/^[1-9][0-9]{0,19}$/.test(v.botId))return {type:'consentHistory',botId:v.botId};
 if(v.type==='saveConfig'&&Object.keys(v).length===3&&typeof v.botId==='string'&&/^[1-9][0-9]{0,19}$/.test(v.botId))return {type:'saveConfig',botId:v.botId,config:botIntroConfig(v.config)};throw Error('INPUT_INVALID');
}
export function introMenu(config:BotIntroConfig){return {text:botIntroConfig(config).welcome+'\n\n'+BOT_INTRO_NOTICE,reply_markup:{inline_keyboard:BOT_SUBSCRIBE_CHOICES.map(c=>[{text:c.label,callback_data:c.id}])},link_preview_options:{is_disabled:true}};}
