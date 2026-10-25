# Tìm nhóm/kênh công khai · 0.16.0

Phạm vi bổ sung theo yêu cầu quay lại nghiên cứu username. Các bước P6 tiếp theo đang tạm dừng.

## Sử dụng

1. Cài bản Windows 0.16.0; vào Tài khoản → Khôi phục phiên đã lưu nếu chưa kết nối.
2. Vào Nghiên cứu ngành, chọn Phạm vi **Nhóm/kênh công khai · Tự lưu**.
3. Nhập từ khóa ít nhất 3 ký tự, ví dụ `seo`; bấm **Tìm kiếm**.
4. Ứng dụng tự lọc kết quả thành nhóm/kênh có username công khai, loại trùng theo loại peer + ID, lưu hồ sơ cùng nguồn và truy vấn, đối chiếu mới/đã thấy/thay đổi. Kết quả được chọn sẵn.
5. Bấm **Xuất Excel (.xlsx)** rồi chọn chỗ lưu. Không cần chọn từng dòng hoặc bấm Lưu hồ sơ. Có thể bỏ chọn các dòng không cần trước khi xuất.
6. **Mở trên Telegram** mở liên kết nhóm/kênh được chọn; việc tham gia do người dùng quyết định. **Phân tích nhóm/kênh** dùng module hiện có để xem mô tả, số thành viên nếu có và mẫu nội dung giới hạn.

## Tiêu chí nghiệm thu / test dễ làm

- Tìm một từ khóa: bảng chỉ có Nhóm/Kênh có username; mỗi dòng có dấu Đã lưu và được chọn sẵn. Nếu không có kết quả: hiển thị 0, không tạo hồ sơ giả.
- Vào Hồ sơ đã lưu: thấy các nhóm/kênh vừa tìm. Đóng/mở ứng dụng: hồ sơ vẫn còn.
- Tìm lại cùng từ khóa: hồ sơ trả lại không bị nhân đôi; kết quả đã quan sát có trạng thái Đã thấy hoặc Thông tin thay đổi. Không bảo đảm Telegram trả cùng tập kết quả.
- Thêm ghi chú vào hồ sơ lưu rồi tìm lại: ghi chú còn nguyên.
- Xuất Excel ngay sau tìm: số dòng đúng với số hồ sơ được chọn, giữ username, ID, nguồn, truy vấn và ghi chú; ID dài không bị làm tròn.
- Mở trên Telegram: chỉ mở `https://t.me/<username>` của nhóm/kênh đã lưu trong tài khoản hiện tại; không tự tham gia.
- Chuyển về Tất cả hồ sơ: chức năng tìm cá nhân/bot/nhóm/kênh hiện có vẫn hoạt động, không tự lưu toàn bộ kết quả ở chế độ này.
- Dữ liệu các tài khoản tách biệt; token bot, đăng ký chủ đề và lịch gửi không thay đổi.

## Giới hạn

Đây là tự động hóa xử lý sau một lần bấm tìm, không phải thu thập liên tục. Một truy vấn Telegram, yêu cầu tối đa 100 kết quả tổng hợp trước khi lọc nhóm/kênh. Không bảo đảm đủ 100 hoặc bao phủ toàn bộ nhóm; không phân trang hay tự rẽ nhánh. Kết quả có thể khớp tên nhóm hoặc username do Telegram quyết định. Bộ lọc Username chứa giúp chỉ giữ các username có chuỗi mong muốn khi xuất.

Không thêm tự gia nhập, liệt kê thành viên, lấy username cá nhân từ nhóm, tra toàn bộ nhóm của một người hoặc gửi quảng cáo. Công khai không đồng nghĩa được phép truy cập thành viên. Không vượt giới hạn Telegram; khi báo giới hạn/mất kết nối, hiển thị lỗi để người dùng xử lý.

Schema SQLite vẫn là 9, dùng chung dữ liệu 0.15. Không hạ xuống 0.14 hoặc cũ hơn. Không yêu cầu người dùng cung cấp token/phiên cho người khác.

## Kiểm tra tự động

`pnpm check`: kiểm tra kiểu, toàn bộ unit/integration test và bundle. Có kiểm tra tự lưu bền vững, loại cá nhân/bot/nhóm không có username, loại trùng, giữ ghi chú, tách tài khoản, IPC và URL ngoài ứng dụng. Windows CI chạy smoke giao diện cho tự chọn kết quả/Excel, cả development và ứng dụng đóng gói. Test API dùng fixture; kết quả tìm Telegram thật cần UAT bằng tài khoản người dùng.
