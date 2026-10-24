import {normalizeGroupTarget} from './group-analysis';
export type Identity = {id:string; name:string; username?:string; kind:'user'|'bot'|'group'|'channel';peerType?:'user'|'chat'|'channel'};
export type SearchPeer=Identity&{sources:('personalized'|'discovery'|'exact')[]};
export type Failure = {code:string; message:string; retryAfter?:number};
export type Status = {state:string; identity?:Identity; error?:Failure; groupReport?:import('./group-analysis').GroupReport; queryResults?:SearchPeer[]; researchResults?:import('./research').ResearchPeer[]; searchContext?:{query:string;exact:boolean}; userIdentity?:Identity; userConnected?:boolean; encryption?:boolean; stage?:string};
export type Action =
 | {type:'login';apiId:number;apiHash:string;phone:string}
 | {type:'answer';value:string}
 | {type:'resume'} | {type:'logout'} | {type:'forget'}
 | {type:'bot';token:string}
 | {type:'search';query:string;exact:boolean}
 | {type:'analyzeGroup';target:string};
export function parseAction(value:unknown):Action {
 if (!value || typeof value!=='object') throw Error('INPUT_INVALID');
 const v=value as Record<string,unknown>;
 const str=(k:string,max:number)=> {const x=v[k];if(typeof x!=='string'||!x.trim()||x.length>max)throw Error('INPUT_INVALID');return x.trim();};
 switch(v.type){
 case 'login': {const apiId=Number(v.apiId),apiHash=str('apiHash',32),phone=str('phone',25);if(!Number.isSafeInteger(apiId)||apiId<=0||!/^[a-f\d]{32}$/i.test(apiHash)||!/^\+\d{7,15}$/.test(phone))throw Error('INPUT_INVALID');return {type:'login',apiId,apiHash,phone};}
 case 'answer': if(typeof v.value!=='string'||!v.value||v.value.length>1024)throw Error('INPUT_INVALID'); return {type:'answer',value:v.value};
 case 'resume':case 'logout':case 'forget':return {type:v.type};
 case 'bot': {const token=str('token',256);if(!/^\d+:[A-Za-z0-9_-]+$/.test(token))throw Error('INPUT_INVALID');return {type:'bot',token};}
 case 'analyzeGroup':return {type:'analyzeGroup',target:normalizeGroupTarget(v.target)};
 case 'search': {const query=str('query',80).replace(/^@/,'');if(typeof v.exact!=='boolean'||query.length<3||/[\u0000-\u001f\u007f]/.test(query)||(v.exact&&!/^[a-zA-Z0-9_]{3,64}$/.test(query)))throw Error('INPUT_INVALID');return {type:'search',query,exact:v.exact};}
 default:throw Error('INPUT_INVALID');
 }
}
export function classifyError(error:unknown):Failure {
 const e=error as {errorMessage?:string;message?:string;seconds?:number;code?:string;name?:string};
 let code=String(e?.errorMessage??e?.message??'UNKNOWN');
 // Some GramJS base classes replace errorMessage with BAD_REQUEST/FLOOD.
 // The original Telegram RPC name remains in message; only known mappings are returned.
 if(['BAD_REQUEST','UNAUTHORIZED','FLOOD','ERROR_SEE_OTHER','AUTH_KEY','FORBIDDEN','NOT_FOUND'].includes(code)){
  const original=String(e?.message??'').match(/^\s*(?:\d{3})?:?\s*([A-Z][A-Z0-9_]{2,64})(?=\s+\(caused by|$)/);
  if(original)code=original[1];
 }
 if(/^Request was unsuccessful \d+ time\(s\)$/.test(code))code='REQUEST_RETRIES_EXHAUSTED';
 const networkCode=String(e?.code??'');
 if(['ETIMEDOUT','ESOCKETTIMEDOUT','ECONNRESET','ECONNREFUSED','ENETUNREACH','EHOSTUNREACH','EAI_AGAIN','ENOTFOUND'].includes(networkCode))code=networkCode;
 if(/^(?:TIMEOUT|Timeout|Connection timed out|Not connected|Cannot send requests while disconnected)$/i.test(code))code='NETWORK_TIMEOUT';
 if(code.includes('Cannot find module')||networkCode==='MODULE_NOT_FOUND')code='WORKER_DEPENDENCY_MISSING';
 if(code.includes('Could not connect')||code.includes('Connection closed'))code='CONNECTION_FAILED';
 if(code==='AUTH_USER_CANCEL')code='CANCELLED';
 const wait=code.match(/(?:FLOOD_WAIT|FLOOD_PREMIUM_WAIT|SLOWMODE_WAIT)_?(\d+)?/);
 if(wait||(['FloodWaitError','FloodTestPhoneWaitError','SlowModeWaitError'].includes(e?.name??'')&&Number.isFinite(e?.seconds))){const seconds=Number(e?.seconds??wait?.[1]??60);return {code:'RATE_LIMIT',message:'Telegram yêu cầu chờ trước khi thử lại.',retryAfter:seconds};}
 const map:Record<string,string>={GROUP_TARGET_REQUIRED:'Hãy nhập username của nhóm hoặc kênh, không phải tài khoản cá nhân/bot.',GROUP_PUBLIC_REQUIRED:'Chỉ phân tích nhóm/kênh có username công khai và có thể truy cập.',GROUP_ACCESS_DENIED:'Không đọc được thông tin nhóm/kênh với quyền hiện tại.',CHANNEL_PRIVATE:'Nhóm/kênh riêng tư hoặc tài khoản hiện tại không có quyền truy cập. Không tự tham gia hay vượt giới hạn.',CHANNEL_INVALID:'Nhóm/kênh không hợp lệ hoặc không còn truy cập được.',CHAT_ADMIN_REQUIRED:'Telegram yêu cầu quyền quản trị cho thao tác này.',REQUEST_RETRIES_EXHAUSTED:'Yêu cầu chưa hoàn tất sau khi Telegram chuyển máy chủ hoặc trả lỗi tạm thời. Hãy thử lại sau; không bấm liên tục.',API_ID_INVALID:'API ID và API Hash không khớp hoặc không hợp lệ. Kiểm tra lại cặp giá trị tại my.telegram.org.',API_ID_PUBLISHED_FLOOD:'Telegram đã hạn chế API ID này. Kiểm tra ứng dụng API của bạn trên my.telegram.org.',PHONE_NUMBER_INVALID:'Telegram từ chối số điện thoại. Nhập theo dạng +84… và bỏ số 0 đầu.',PHONE_NUMBER_BANNED:'Telegram báo số điện thoại này bị khóa.',PHONE_NUMBER_FLOOD:'Telegram đang hạn chế số lần đăng nhập của số điện thoại này. Dừng thử liên tục và chờ Telegram cho phép.',PHONE_PASSWORD_FLOOD:'Telegram đang giới hạn số lần nhập mật khẩu. Hãy chờ rồi thử lại.',AUTH_RESTART:'Telegram yêu cầu bắt đầu lại quy trình đăng nhập.',UPDATE_APP_TO_LOGIN:'Telegram yêu cầu cập nhật thành phần đăng nhập của ứng dụng.',CONNECTION_FAILED:'Không thiết lập được kết nối tới Telegram. Kiểm tra mạng hoặc thử bằng mạng khác.',NETWORK_TIMEOUT:'Kết nối Telegram quá thời gian chờ. Kiểm tra mạng trước khi thử lại.',ETIMEDOUT:'Không kết nối tới Telegram trong thời gian cho phép.',ESOCKETTIMEDOUT:'Kết nối Telegram quá thời gian chờ.',ECONNRESET:'Kết nối Telegram bị ngắt. Kiểm tra mạng rồi thử lại.',ECONNREFUSED:'Kết nối tới Telegram bị từ chối.',ENETUNREACH:'Không có đường mạng tới Telegram.',EHOSTUNREACH:'Không truy cập được máy chủ Telegram.',EAI_AGAIN:'Tra cứu địa chỉ máy chủ tạm thời thất bại.',ENOTFOUND:'Không tìm thấy địa chỉ máy chủ Telegram.',WORKER_FAILED:'Bộ phận kết nối không khởi động được. Cần cập nhật bộ cài.',WORKER_EXIT:'Bộ phận kết nối đã dừng bất thường. Hãy mở lại ứng dụng.',WORKER_DEPENDENCY_MISSING:'Bộ cài thiếu thành phần kết nối Telegram. Cần cập nhật bộ cài.',RESEARCH_ERROR:'Không thể đọc hoặc ghi dữ liệu nghiên cứu. Dữ liệu cũ được giữ lại; hãy kiểm tra dung lượng đĩa.',NO_SELECTION:'Hãy chọn ít nhất một hồ sơ có username.',EXPORT_ERROR:'Không xuất được file. Kiểm tra quyền ghi và đóng file nếu đang mở trong Excel.',INPUT_INVALID:'Thông tin nhập chưa hợp lệ.',PHONE_NUMBER_UNOCCUPIED:'Số điện thoại chưa có tài khoản. Hãy tạo tài khoản bằng Telegram chính thức.',PHONE_CODE_INVALID:'Mã xác minh không đúng. Hãy bắt đầu đăng nhập lại.',PHONE_CODE_EXPIRED:'Mã đã hết hạn. Hãy bắt đầu lại.',PASSWORD_HASH_INVALID:'Mật khẩu hai bước không đúng.',SESSION_REVOKED:'Phiên đã bị thu hồi. Hãy đăng nhập lại.',AUTH_KEY_UNREGISTERED:'Phiên không còn hợp lệ. Hãy đăng nhập lại.',USERNAME_NOT_OCCUPIED:'Không tìm thấy username.',USERNAME_INVALID:'Username không hợp lệ.',BOT_UNAUTHORIZED:'Token bot không hợp lệ.',BOT_RATE_LIMIT:'Bot đang bị giới hạn. Hãy thử lại sau.',ENCRYPTION_UNAVAILABLE:'Mã hóa Windows chưa sẵn sàng. Không lưu bí mật.',NOT_CONNECTED:'Hãy kết nối tài khoản người dùng trước.',BUSY:'Đang có thao tác khác. Hãy chờ hoàn tất.',NO_SESSION:'Chưa có phiên đã lưu.',TIMEOUT:'Kết nối quá thời gian chờ. Kiểm tra mạng rồi thử lại.',CANCELLED:'Thao tác đã hủy.',BOT_NETWORK:'Không kết nối được Bot API.',BOT_API:'Bot API trả lỗi.',QUERY_TOO_SHORT:'Telegram từ chối truy vấn quá ngắn.'};
 if(map[code])return {code,message:map[code]};
 if(e?.name==='TypeError')return {code:'CLIENT_TYPE_ERROR',message:'Thành phần kết nối gặp lỗi tương thích. Gửi mã lỗi và bước xử lý đang hiển thị để kiểm tra.'};
 return {code:'TELEGRAM_ERROR',message:'Thao tác không thành công. Kiểm tra kết nối hoặc thông tin đăng nhập rồi thử lại.'};
}
