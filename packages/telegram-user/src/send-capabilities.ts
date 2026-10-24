import {Api} from 'telegram';
import {identity} from './index';
import type {SendCapabilities,SendCapability} from '../../shared/src/manual-send';
export function sendCapabilities(entity:Api.User|Api.Chat|Api.Channel,now=Date.now()):SendCapabilities{
 const make=(state:SendCapability['state'],reason:string,code?:string):SendCapability=>({state,reason,code});
 const allowed=()=>make('allowed','Thông tin hiện có không ghi nhận hạn chế loại nội dung này.');
 const unknown=()=>make('unknown','Chưa xác định đầy đủ; Telegram quyết định khi gửi.');
 const report:SendCapabilities={recipient:identity(entity),checkedAt:new Date(now).toISOString(),text:unknown(),photo:unknown(),document:unknown(),notes:['Đây là ảnh chụp quyền hiện tại, không bảo đảm gửi thành công. Quyền được kiểm tra lại khi xác nhận.']};
 const blockAll=(reason:string,code:string)=>{report.text=report.photo=report.document=make('blocked',reason,code);return report;};
 if(entity instanceof Api.User){
  if(entity.deleted)return blockAll('Tài khoản đã bị xóa.','SEND_FORBIDDEN');
  if(entity.self)report.text=report.photo=report.document=allowed();
  else report.notes.push('Cài đặt riêng tư, chặn liên hệ, Premium và giới hạn tài khoản không được suy ra từ hồ sơ cơ bản.');
  return report;
 }
 if(entity instanceof Api.Chat&&entity.deactivated)return blockAll('Nhóm đã ngừng hoạt động.','SEND_FORBIDDEN');
 if(entity instanceof Api.Chat&&entity.migratedTo)return blockAll('Nhóm đã chuyển sang nhóm mới; hãy mở hội thoại mới.','SEND_TARGET_MIGRATED');
 if(entity.left&&(!(entity instanceof Api.Channel)||entity.joinToSend))return blockAll('Chưa có quyền gửi khi chưa tham gia. Tool không tự tham gia nhóm.','SEND_JOIN_REQUIRED');
 const admin=Boolean(entity.creator||entity.adminRights);
 if(entity instanceof Api.Channel&&entity.slowmodeEnabled)report.notes.push('Nhóm bật chế độ chậm; thời gian chờ cụ thể do Telegram trả khi gửi.');
 if(entity.adminRights?.anonymous)report.notes.push('Quản trị ẩn danh đang bật: danh nghĩa gửi có thể theo cấu hình nhóm trên Telegram.');
 if(entity instanceof Api.Channel&&!entity.min&&(entity.broadcast&&!entity.creator&&!entity.adminRights?.postMessages||entity.gigagroup&&!admin))return blockAll('Không có quyền đăng bài/gửi tin trong kênh hoặc nhóm chỉ dành cho quản trị.','CHAT_WRITE_FORBIDDEN');
 if(!(entity instanceof Api.Channel&&entity.min))report.text=report.photo=report.document=allowed();
 const active=(rights:Api.ChatBannedRights|undefined)=>rights&&(!rights.untilDate||rights.untilDate>now/1000)?rights:undefined;
 const rights=[active(entity instanceof Api.Channel?entity.bannedRights:undefined),!admin?active(entity.defaultBannedRights):undefined].filter((r):r is Api.ChatBannedRights=>Boolean(r));
 if(rights.some(r=>r.viewMessages||r.sendMessages))return blockAll('Thông tin quyền hiện tại cấm xem/gửi trong hội thoại.','CHAT_WRITE_FORBIDDEN');
 if(rights.some(r=>r.sendPlain))report.text=make('blocked','Thông tin quyền hiện tại cấm văn bản.','CHAT_SEND_PLAIN_FORBIDDEN');
 if(rights.some(r=>r.sendMedia||r.sendPhotos))report.photo=make('blocked','Thông tin quyền hiện tại cấm ảnh.','CHAT_SEND_PHOTOS_FORBIDDEN');
 if(rights.some(r=>r.sendMedia||r.sendDocs))report.document=make('blocked','Thông tin quyền hiện tại cấm tài liệu.','CHAT_SEND_DOCS_FORBIDDEN');
 return report;
}
