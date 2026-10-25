import {parseTemplate,templateId,type MessageTemplate,type TemplateDraft} from './templates';
export type Preferences={timeZone:string;compact:boolean;startPage:'inbox'|'overview'|'account'|'research'|'analytics'};
export const DEFAULT_PREFERENCES:Preferences={timeZone:'Asia/Ho_Chi_Minh',compact:false,startPage:'inbox'};
export type AppEvent={id:number;at:string;level:'info'|'error';event:string};
export type AppSnapshot={preferences:Preferences;events:AppEvent[];templates:MessageTemplate[];counts:{saved:number;searches:number;reports:number}};
export type AppAction={type:'saveTemplate';template:TemplateDraft}|{type:'deleteTemplate';id:string}|{type:'get'}|{type:'savePreferences';preferences:Preferences}|{type:'exportLogs'}|{type:'clearLogs'};
export type AppReply={ok:true;snapshot?:AppSnapshot;fileName?:string;cancelled?:boolean}|{ok:false;error:string};
export const EVENT_LABELS:Record<string,string>={queue_sending:'Đang gửi lịch đã xác nhận',queue_ready:'Đã cập nhật lịch gửi',manual_preparing:'Đang chuẩn bị xem trước',manual_sending:'Đang gửi tin thủ công',manual_ready:'Thao tác gửi thủ công đã hoàn tất',inbox_loading:'Đang đọc hộp thư',inbox_ready:'Đã đọc hộp thư',template_saved:'Đã lưu mẫu tin',template_deleted:'Đã xóa mẫu tin',app_started:'Ứng dụng đã mở',connecting:'Đang kết nối Telegram',connected:'Phiên người dùng đã xác thực',disconnected:'Đã ngắt kết nối',searching:'Đang tìm kiếm',search_complete:'Tìm kiếm hoàn tất',analyzing_group:'Đang phân tích nhóm/kênh',group_analysis_complete:'Đã lưu báo cáo nhóm/kênh',error:'Thao tác gặp lỗi',settings_saved:'Đã lưu cài đặt',logs_cleared:'Đã xóa nhật ký',other:'Sự kiện hệ thống'};
export function parsePreferences(value:unknown):Preferences{
 if(!value||typeof value!=='object')throw Error('INPUT_INVALID');const v=value as Record<string,unknown>;
 if(Object.keys(v).some(key=>!['timeZone','compact','startPage'].includes(key))||typeof v.timeZone!=='string'||v.timeZone.length>80||typeof v.compact!=='boolean'||!['inbox','overview','account','research','analytics'].includes(String(v.startPage)))throw Error('INPUT_INVALID');
 try{new Intl.DateTimeFormat('vi-VN',{timeZone:v.timeZone}).format();}catch{throw Error('INPUT_INVALID');}
 return {timeZone:v.timeZone,compact:v.compact,startPage:v.startPage as Preferences['startPage']};
}
export function parseAppAction(value:unknown):AppAction{
 if(!value||typeof value!=='object')throw Error('INPUT_INVALID');const v=value as Record<string,unknown>;
 if(v.type==='saveTemplate')return {type:v.type,template:parseTemplate(v.template)};
 if(v.type==='deleteTemplate')return {type:v.type,id:templateId(v.id)};
 if(v.type==='savePreferences')return {type:v.type,preferences:parsePreferences(v.preferences)};
 if(v.type==='get'||v.type==='exportLogs'||v.type==='clearLogs')return {type:v.type};throw Error('INPUT_INVALID');
}
export function formatAppTime(value:string,timeZone:string):string{return new Intl.DateTimeFormat('vi-VN',{timeZone,dateStyle:'short',timeStyle:'medium'}).format(new Date(value));}
