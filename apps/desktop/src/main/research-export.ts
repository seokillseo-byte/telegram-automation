import ExcelJS from 'exceljs';
import {writeFile,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import type {ResearchPeer} from '../../../../packages/shared/src/research';
const sourceLabel:Record<string,string>={personalized:'Cá nhân hóa',discovery:'Tìm kiếm Telegram',exact:'Tra chính xác'};
const headers=['ID Telegram','Không gian ID','Loại','Tên','Username','Liên kết','Nguồn','Từ khóa gần nhất','Phát hiện lần đầu (UTC)','Thấy gần nhất (UTC)','Đối chiếu','Chủ đề','Nhãn','Ghi chú'];
function values(peer:ResearchPeer):string[]{return [peer.id,peer.peerType??'',peer.kind,peer.name,peer.username??'',peer.username?`https://t.me/${peer.username}`:'',peer.sources.map(s=>sourceLabel[s]).join('; '),peer.query,peer.firstSeen,peer.lastSeen,peer.comparison,peer.category,peer.tags,peer.note];}
export function csvCell(value:string):string{const safe=/^[\s]*[=+\-@]/.test(value)?`'${value}`:value;return '"'+safe.replace(/"/g,'""')+'"';}
export function toCSV(peers:ResearchPeer[]):string{return '\uFEFF'+[headers,...peers.map(values)].map(row=>row.map(csvCell).join(',')).join('\r\n');}
export async function toWorkbook(peers:ResearchPeer[],account:string):Promise<Buffer>{
 const book=new ExcelJS.Workbook();book.creator='Telegram Industry Research';
 const sheet=book.addWorksheet('Ho so',{views:[{state:'frozen',ySplit:1}]});
 sheet.addRow(headers);for(const peer of peers)sheet.addRow(values(peer));
 sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,peers.length+1),column:headers.length}};
 sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF087CB7'}};
 sheet.columns.forEach((column,index)=>{column.width=[0,1,2,4,10].includes(index)?22:36;column.numFmt='@';});
 const summary=book.addWorksheet('Thong ke');summary.addRows([['Phạm vi','Các hồ sơ đã chọn; không đại diện toàn bộ ngành'],['Thời điểm xuất (UTC)',new Date().toISOString()],['Tài khoản nghiên cứu (ID)',account],['Tổng hồ sơ',peers.length],...['user','bot','group','channel'].map(kind=>[kind,peers.filter(p=>p.kind===kind).length])]);summary.getColumn(1).width=30;summary.getColumn(2).width=70;
 return Buffer.from(await book.xlsx.writeBuffer());
}
export async function writeExport(path:string,peers:ResearchPeer[],account:string,format:'xlsx'|'csv'){
 const temporary=path+'.'+randomUUID()+'.tmp';
 try{await writeFile(temporary,format==='xlsx'?await toWorkbook(peers,account):toCSV(peers));await rename(temporary,path);}finally{await rm(temporary,{force:true});}
}
