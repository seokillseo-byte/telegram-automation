export type Identity = {id:string; name:string; username?:string; kind:'user'|'bot'|'group'|'channel'};
export type Failure = {code:string; message:string; retryAfter?:number};
export type Status = {state:string; identity?:Identity; error?:Failure; queryResults?:Identity[]; encryption?:boolean};
export type Action =
 | {type:'login';apiId:number;apiHash:string;phone:string}
 | {type:'answer';value:string}
 | {type:'resume'} | {type:'logout'} | {type:'forget'}
 | {type:'bot';token:string}
 | {type:'search';query:string;exact:boolean};
export function parseAction(value:unknown):Action {
 if (!value || typeof value!=='object') throw Error('INPUT_INVALID');
 const v=value as Record<string,unknown>;
 const str=(k:string,max:number)=> {const x=v[k];if(typeof x!=='string'||!x.trim()||x.length>max)throw Error('INPUT_INVALID');return x.trim();};
 switch(v.type){
 case 'login': {const apiId=Number(v.apiId),apiHash=str('apiHash',32),phone=str('phone',25);if(!Number.isSafeInteger(apiId)||apiId<=0||!/^[a-f\d]{32}$/i.test(apiHash)||!/^\+\d{7,15}$/.test(phone))throw Error('INPUT_INVALID');return {type:'login',apiId,apiHash,phone};}
 case 'answer': if(typeof v.value!=='string'||!v.value||v.value.length>1024)throw Error('INPUT_INVALID'); return {type:'answer',value:v.value};
 case 'resume':case 'logout':case 'forget':return {type:v.type};
 case 'bot': {const token=str('token',256);if(!/^\d+:[A-Za-z0-9_-]+$/.test(token))throw Error('INPUT_INVALID');return {type:'bot',token};}
 case 'search': {const query=str('query',64).replace(/^@/,'');if(!/^[a-zA-Z0-9_]{3,64}$/.test(query)||typeof v.exact!=='boolean')throw Error('INPUT_INVALID');return {type:'search',query,exact:v.exact};}
 default:throw Error('INPUT_INVALID');
 }
}
export function classifyError(error:unknown):Failure {
 const e=error as {errorMessage?:string;message?:string;seconds?:number};
 const code=String(e?.errorMessage??e?.message??'UNKNOWN');
 const wait=code.match(/(?:FLOOD_WAIT|FLOOD_PREMIUM_WAIT|SLOWMODE_WAIT)_?(\d+)?/);
 if(wait){const seconds=Number(e?.seconds??wait[1]??60);return {code:'RATE_LIMIT',message:'Telegram yêu cầu chờ trước khi thử lại.',retryAfter:seconds};}
 const map:Record<string,string>={INPUT_INVALID:'Thông tin nhập chưa hợp lệ.',PHONE_NUMBER_UNOCCUPIED:'Số điện thoại chưa có tài khoản. Hãy tạo tài khoản bằng Telegram chính thức.',PHONE_CODE_INVALID:'Mã xác minh không đúng. Hãy bắt đầu đăng nhập lại.',PHONE_CODE_EXPIRED:'Mã đã hết hạn. Hãy bắt đầu lại.',PASSWORD_HASH_INVALID:'Mật khẩu hai bước không đúng.',SESSION_REVOKED:'Phiên đã bị thu hồi. Hãy đăng nhập lại.',AUTH_KEY_UNREGISTERED:'Phiên không còn hợp lệ. Hãy đăng nhập lại.',USERNAME_NOT_OCCUPIED:'Không tìm thấy username.',USERNAME_INVALID:'Username không hợp lệ.',BOT_UNAUTHORIZED:'Token bot không hợp lệ.',BOT_RATE_LIMIT:'Bot đang bị giới hạn. Hãy thử lại sau.',ENCRYPTION_UNAVAILABLE:'Mã hóa Windows chưa sẵn sàng. Không lưu bí mật.',NOT_CONNECTED:'Hãy kết nối tài khoản người dùng trước.',BUSY:'Đang có thao tác khác. Hãy chờ hoàn tất.',NO_SESSION:'Chưa có phiên đã lưu.',TIMEOUT:'Kết nối quá thời gian chờ. Kiểm tra mạng rồi thử lại.',CANCELLED:'Thao tác đã hủy.',BOT_NETWORK:'Không kết nối được Bot API.',BOT_API:'Bot API trả lỗi.',QUERY_TOO_SHORT:'Telegram từ chối truy vấn quá ngắn.'};
 if(map[code])return {code,message:map[code]};
 return {code:'TELEGRAM_ERROR',message:'Thao tác không thành công. Kiểm tra kết nối hoặc thông tin đăng nhập rồi thử lại.'};
}
