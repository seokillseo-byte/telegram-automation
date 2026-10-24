# Phân tích nhóm/kênh — 0.2.0

## Chức năng
- Tab **Phân tích nhóm/kênh** mới. Nhập @username, https://t.me/username hoặc liên kết bài công khai.
- Có nút **Phân tích nhóm/kênh** ở dòng nhóm/kênh có username trong kết quả nghiên cứu hoặc hồ sơ đã lưu; nút này mở tab và điền đích, chưa tự chạy.
- Người dùng chủ động bấm **Phân tích** cho từng nhóm/kênh. Cần phiên người dùng đã xác thực; bot không thay thế phiên này.
- Đọc tên, ID nhóm/kênh, username, mô tả và số thành viên khi Telegram cung cấp.
- Lấy tối đa 100 mục lịch sử gần nhất, loại tin dịch vụ, loại trùng message ID và tính thống kê.
- Mẫu ngày UTC: số tin thường trong mẫu, khoảng cũ/mới nhất, số ngày lịch bao phủ, số tin/ngày trong khoảng mẫu. UI hiển thị biểu đồ 14 ngày có tin gần nhất; Excel có toàn bộ ngày xuất hiện trong mẫu.
- Views, forwards, replies, reactions: tổng, trung bình và số tin có trường đó. Trường thiếu là null/không khả dụng, không phải 0. Trung bình chỉ chia số tin có trường tương ứng, không chia toàn mẫu khi thiếu dữ liệu.
- Từ khóa: tối đa 20 từ đơn xuất hiện trong ít nhất 2 tin sau lọc từ dừng, URL, email, @mention và chuỗi số điện thoại cơ bản. Đây là tần suất số tin chứa từ, không phải kết luận NLP/AI về ngành.
- Mỗi lần phân tích thành công tự lưu một bản chụp báo cáo vào SQLite; xem 100 bản gần nhất theo tài khoản, chọn để xuất Excel hoặc xóa.
- Workbook có 4 sheet: Tong quan, Hoat dong UTC, Tu khoa, Pham vi. Giữ ID text và các ô không khả dụng để trống. Có thời điểm, phương pháp và giới hạn mẫu.

## Giới hạn thiết kế
- Chỉ nhóm/kênh có username công khai và quyền đọc phù hợp. Không phân tích tài khoản cá nhân hoặc bot.
- Không tham gia nhóm, xử lý link mời riêng tư, đọc danh sách thành viên, thu username người gửi hoặc vượt quyền truy cập.
- Tin nhắn chỉ ở bộ nhớ worker trong quá trình tính. Không lưu nguyên văn, ID người gửi, danh sách thành viên hoặc từng tin nhắn vào DB/báo cáo.
- Nếu đọc được thông tin công khai nhưng không đọc được lịch sử: lưu báo cáo thông tin với cảnh báo lịch sử không khả dụng; không giả số tương tác bằng 0. Nếu không đọc được thông tin nhóm/kênh: trả lỗi và không tạo báo cáo.
- FloodWait được trả về ngay, không tự chạy thêm vòng yêu cầu. Không tự quét danh sách nhiều nhóm.
- 100 mục là mẫu gần nhất Telegram trả về, không phải toàn bộ lịch sử. Tin dịch vụ có thể khiến mẫu tin thường ít hơn 100. Album nhiều tin có thể được tính nhiều mục.
- Views không phải người xem duy nhất; số replies/reactions là trường Telegram trả về, không suy ra danh sách người tương tác. Không tính tỷ lệ tương tác nếu thiếu cơ sở.
- DB thêm table group_reports theo cách cộng thêm, giữ nghiên cứu/ghi chú và phiên cũ. Báo cáo không mã hóa như session. Nút xóa báo cáo không đăng xuất Telegram hoặc xóa hồ sơ nghiên cứu.

## Hướng dẫn test Windows
1. Đóng ứng dụng cũ, tải artifact xanh và cài **Telegram-Industry-Research-0.2.0-x64-Setup.exe**.
2. Vào **Tài khoản & Kết nối → Khôi phục phiên đã lưu**. Kiểm tra giao diện ghi 0.2.0.
3. Vào **Phân tích nhóm/kênh**, nhập một nhóm/kênh công khai bạn biết, bấm **Phân tích** một lần.
4. Kiểm tra đúng tên/username. Quan sát số thành viên và các chỉ số có dữ liệu; chấp nhận Không khả dụng khi Telegram không cung cấp.
5. Kiểm tra thời điểm phân tích, khoảng mẫu, số mục đọc, số tin thường. Nếu 100 mục, phải có lưu ý giới hạn mẫu.
6. Xem bảng tương tác, số tin có chỉ số, hoạt động ngày UTC và từ xuất hiện. Không có bảng thành viên hoặc username người gửi.
7. Bấm **Xuất báo cáo này (.xlsx)**, chọn nơi lưu, mở Excel. Kiểm tra 4 sheet và ID không bị làm tròn. Hủy hộp thoại xuất thử một lần: không tạo file.
8. Đóng/mở app, chưa kết nối vẫn xem được báo cáo đã lưu. Khôi phục phiên để chạy phân tích mới.
9. Thử nhập username tài khoản cá nhân: phải báo yêu cầu nhóm/kênh. Link mời riêng tư hoặc URL ngoài Telegram phải bị từ chối.
10. Nếu lịch sử bị hạn chế, kiểm tra cảnh báo và trường không khả dụng; không tự join hoặc tăng quyền.
11. Chọn báo cáo thử và xóa sau khi đọc xác nhận; kiểm tra hồ sơ nghiên cứu/ghi chú cũ còn nguyên.
12. Trong tab nghiên cứu, chọn nút Phân tích nhóm/kênh ở hồ sơ phù hợp: chuyển tab và điền đúng username, chỉ chạy sau khi bấm Phân tích.

## Bằng chứng kỹ thuật
- Test aggregate: UTC, loại trùng, số 0 có dữ liệu so với thiếu trường, loại @mention/đường dẫn/số khỏi từ khóa.
- Test adapter SDK với fixture: chỉ ResolveUsername/GetFullChannel/getMessages limit100; không có phương thức lấy thành viên.
- Test profile cá nhân, quyền lịch sử thiếu, FloodWait không thử lại.
- Test DB migration cộng thêm, account isolation, reopen, xóa; test XLSX roundtrip và ID lớn/ô null.
- Windows smoke dev và packaged: tab/preload, worker, DPAPI, SQLite và XLSX báo cáo.
- Chưa có credential trong CI. Đọc live Telegram, luồng bấm và mở Excel trên máy chủ tài khoản vẫn cần nghiệm thu riêng.

## Nguồn tham khảo
- https://core.telegram.org/method/channels.getFullChannel
- https://core.telegram.org/method/messages.getHistory
- https://core.telegram.org/constructor/message
