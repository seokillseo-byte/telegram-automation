# Nghiên cứu ngành — 0.1.0

## Phạm vi đã triển khai
Bản này bổ sung module nghiên cứu vào nền Phase 0 theo yêu cầu mới, đưa một phần chức năng dữ liệu/tìm kiếm của Phase 1/3 lên trước. Không có nghĩa toàn bộ Phase 1–3 đã hoàn tất. Phiên Telegram và appId được giữ để có thể khôi phục phiên cũ.

- Tìm theo từ khóa (mặc định) hoặc tra username chính xác. Hỗ trợ chủ đề có dấu/khoảng trắng khi tìm từ khóa.
- Một truy vấn do người dùng bấm mỗi lần, request limit vẫn 20. Không tăng quy mô thu thập, không lặp tự động hoặc phân trang giả.
- Nguồn: Cá nhân hóa (my_results), Tìm kiếm Telegram (results), Tra chính xác. Một hồ sơ có thể thuộc hai nguồn; nguồn không chứng minh người đó chưa từng tương tác.
- Phân biệt namespace user/chat/channel để không gộp nhầm ID trùng số. Bot và cá nhân dùng cùng namespace user.
- Lọc loại, nguồn, có username và username chứa chuỗi. Mặc định chỉ hiện có username.
- Hồ sơ có username được ghi quan sát local để so sánh. Kết quả không có username không tự tạo hồ sơ nghiên cứu mới, không được chọn lưu/xuất.
- Mới / đã thấy / thay đổi dựa trên mọi quan sát trước của cùng tài khoản trên máy. Thay đổi gồm username, tên, loại; không suy ra thay đổi trên toàn Telegram.
- Chọn hồ sơ để lưu, thêm chủ đề, nhãn, ghi chú. Xóa đã chọn xóa hồ sơ và observation tương ứng; số liệu tổng hợp lịch sử run vẫn giữ.
- SQLite local lưu hồ sơ, các quan sát công khai và lịch sử tìm thành công. Không chứa OTP, api_hash, bot token hoặc session. Ghi chú/nghiên cứu không được mã hóa như file phiên.
- Hiện 5.000 hồ sơ lưu gần nhất và 100 run gần nhất; không có tính năng tải nền khi đóng app.
- Excel .xlsx/CSV xuất các hồ sơ đang chọn, nguồn, truy vấn gần nhất, thời điểm UTC, ghi chú; worksheet thống kê tập đã chọn. ID ghi text, không làm tròn; CSV chặn formula injection, XLSX ghi chuỗi thuần.
- Hủy hộp thoại xuất không tạo file. Ghi file tạm rồi rename để giảm nguy cơ file dở dang.
- Thống kê mô tả tập dữ liệu đã thu, không phải ước tính quy mô ngành.

## Thử trên Windows
1. Tải ZIP artifact **Telegram-Industry-Research-Windows-x64** từ run xanh, giải nén.
2. Đóng ứng dụng cũ. Cài **Telegram-Industry-Research-0.1.0-x64-Setup.exe**. Tên ứng dụng trong Windows có thể vẫn là Telegram Automation Phase 0 để giữ tương thích với nền cũ.
3. Mở → tab **Tài khoản & Kết nối** → **Khôi phục phiên đã lưu**. Không cần nhập API lại nếu phiên hợp lệ.
4. Sang **Nghiên cứu ngành** → nhập seo → chọn **Tìm theo từ khóa** → Tìm kiếm.
5. Kiểm tra tổng trả về và số hiển thị: mặc định các dòng không có username bị ẩn. Bỏ lọc để xem chúng, nhưng không chọn lưu/xuất được.
6. Lọc nguồn/loại, chọn một vài hồ sơ có username → **Lưu hồ sơ đã chọn**.
7. Sang **Hồ sơ đã lưu** → **Ghi chú** → nhập chủ đề SEO, nhãn và ghi chú có dấu → Lưu.
8. Chọn hồ sơ → **Xuất Excel (.xlsx)** → chọn chỗ lưu. Mở Excel, kiểm tra tên tiếng Việt, ID, nguồn, ghi chú và sheet Thong ke. Thử CSV riêng nếu cần.
9. Đóng/mở app: hồ sơ và ghi chú vẫn còn, có thể xem offline. Khôi phục phiên để tìm tiếp.
10. Tìm lại cùng từ khóa một lần khi cần nghiên cứu: hồ sơ trùng được đánh dấu đã thấy; không bảo đảm có hồ sơ mới. Nếu không có thay đổi thật thì số mới có thể bằng 0.
11. Vào lịch sử xem truy vấn, thời điểm, số kết quả có username, mới/thay đổi.
12. Chọn một hồ sơ thử, xóa sau khi đọc xác nhận; kiểm tra đã mất. Dữ liệu nghiên cứu không bị xóa chỉ vì logout Telegram.

Không dán số điện thoại/OTP/token vào ghi chú. Không dùng danh sách nghiên cứu làm bằng chứng đồng ý nhận quảng cáo.

## Nghiệm thu kỹ thuật
- Test SQLite: loại trùng, so sánh, tách tài khoản/namespace, reopen giữ ghi chú, xóa.
- Test SDK bằng fake invoke: tách nguồn, không thêm request tự động.
- Test XLSX roundtrip: ID lớn, Unicode, chuỗi bắt đầu bằng dấu = không thành formula.
- Test IPC: không nhận file path tùy ý, khóa sai, note quá dài hoặc format lạ.
- Windows smoke dev + đóng gói: React/preload, DPAPI, Telegram worker, SQLite persist và sinh XLSX.
- Live Telegram/Excel trên máy chủ tài khoản cần nghiệm thu riêng; CI không thay thế bước này.
