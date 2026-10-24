import ExcelJS from 'exceljs';
import {writeFile,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import type {GroupReport} from '../../../../packages/shared/src/group-analysis';
export async function groupWorkbook(reports:GroupReport[]):Promise<Buffer>{
 const book=new ExcelJS.Workbook();book.creator='Telegram Industry Research';
 const summary=book.addWorksheet('Tong quan',{views:[{state:'frozen',ySplit:1}]});
 summary.addRow(['ID nhóm/kênh','Tên','Username nhóm/kênh','Loại','Thành viên công bố','Phân tích (UTC)','Mẫu thông thường','Trạng thái lịch sử','Mục đã đọc','Cũ nhất (UTC)','Mới nhất (UTC)','Số ngày trong mẫu','Tin/ngày trong mẫu','Views TB','Có views / mẫu','Phản ứng TB','Có phản ứng / mẫu','Trả lời TB','Có trả lời / mẫu','Chuyển tiếp TB','Có chuyển tiếp / mẫu','Mô tả','Giới hạn']);
 const daily=book.addWorksheet('Hoat dong UTC');daily.addRow(['Báo cáo','Username nhóm/kênh','Ngày UTC','Số tin trong mẫu']);
 const terms=book.addWorksheet('Tu khoa');terms.addRow(['Báo cáo','Username nhóm/kênh','Từ','Số tin chứa từ trong mẫu']);
 for(const r of reports){
  summary.addRow([r.groupId,r.title,r.username,r.kind,r.members,r.analyzedAt,r.historyStatus==='available'?r.sampleCount:null,r.historyStatus,r.historyStatus==='available'?r.fetched:null,r.oldest,r.newest,r.historyStatus==='available'?r.sampleDays:null,r.samplePerDay,r.metrics.views.average,`${r.metrics.views.available}/${r.sampleCount}`,r.metrics.reactions.average,`${r.metrics.reactions.available}/${r.sampleCount}`,r.metrics.replies.average,`${r.metrics.replies.available}/${r.sampleCount}`,r.metrics.forwards.average,`${r.metrics.forwards.available}/${r.sampleCount}`,r.about,r.warnings.join(' | ')]);
  for(const d of r.daily)daily.addRow([r.id,r.username,d.day,d.count]);
  for(const term of r.terms)terms.addRow([r.id,r.username,term.term,term.posts]);
 }
 const scope=book.addWorksheet('Pham vi');scope.addRows([['Phạm vi','Phân tích tổng hợp thông tin công khai và tối đa 100 mục lịch sử gần nhất do Telegram trả về.'],['Dữ liệu không có','Ô trống là không khả dụng, không phải số 0. Trung bình chỉ tính trên mục có trường tương ứng.'],['Phương pháp từ khóa','Tần suất theo số tin chứa từ; từ đơn sau lọc cơ bản, không phải mô hình phân loại ngành.'],['Lưu trữ','Không có danh sách thành viên, username người gửi hoặc nguyên văn bài/tin nhắn.'],['Giới hạn','Số liệu trong mẫu, không đại diện toàn ngành hoặc toàn lịch sử. Album nhiều tin có thể được đếm thành nhiều mục.']]);
 for(const sheet of book.worksheets){sheet.getRow(1).font={bold:true};sheet.columns.forEach(c=>{c.width=24;});if(sheet.name!=='Pham vi')sheet.autoFilter={from:{row:1,column:1},to:{row:sheet.rowCount,column:sheet.columnCount}};}
 summary.getColumn(1).numFmt='@';scope.getColumn(1).width=28;scope.getColumn(2).width=110;
 return Buffer.from(await book.xlsx.writeBuffer());
}
export async function exportGroupReports(file:string,reports:GroupReport[]){const temporary=file+'.'+randomUUID()+'.tmp';try{await writeFile(temporary,await groupWorkbook(reports));await rename(temporary,file);}finally{await rm(temporary,{force:true});}}
