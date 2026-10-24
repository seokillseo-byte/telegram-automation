# Hộp thư chỉ đọc — 0.5.0

Triển khai bước kế tiếp đã thống nhất: danh sách hội thoại và đọc lịch sử có phân trang (P4.1, giữ tạm trong bộ nhớ). Không đánh dấu hoàn thành toàn bộ Phase 4 hoặc V1.

## Phạm vi

- Tài khoản người dùng đang kết nối/khôi phục phiên; bot getMe không cấp quyền đọc hộp thư.
- Tải lại và tải thêm hội thoại, hiển thị loại, tên/username, số chưa đọc, nội dung xem trước và thời điểm; lọc cục bộ trong danh sách đã tải.
- Chọn hội thoại để đọc văn bản, chiều gửi/nhận, thời điểm, ID tin; sự kiện và tệp có nhãn. Chỉ hiển thị văn bản thuần, không thực thi HTML hoặc tải liên kết.
- Tải tin cũ hơn hoặc tải lại tin mới nhất; loại trùng theo ID trong từng hội thoại. Mới nhất hiển thị trước.
- Mỗi request tối đa 30 mục; mỗi lần bấm chỉ một request hộp thư. Giữ tối đa 300 hội thoại và 300 mục lịch sử của hội thoại đang mở. Đạt giới hạn thì tải lại để bắt đầu lại, không có tác vụ quét nền.
- Chỉ xử lý hội thoại Telegram trả đủ thông tin truy cập. Hội thoại bị cấm/không có lịch sử báo lỗi hoặc trạng thái rỗng đúng kết quả, không tự tham gia nhóm.
- Nội dung chỉ giữ trong bộ nhớ, xóa khi ngắt/đổi phiên hoặc đóng ứng dụng; không lưu SQLite, không xuất nội dung vào nhật ký hỗ trợ. Không phục hồi hộp thư offline sau restart.
- Đọc qua messages.GetDialogs và messages.GetHistory; không gọi readHistory, sendMessage, tải tệp hoặc danh sách thành viên.
- Access hash và cursor truy cập nằm trong worker, không gửi renderer. Các IPC chỉ nhận lệnh đọc được kiểm tra. Ngắt worker/hủy phiên kết thúc yêu cầu đang chờ.

Chưa bao gồm: tự nhận cập nhật thời gian thực (P4.2), gửi text/ảnh/tài liệu (P4.3), reply, lịch gửi hoặc đồng bộ bot. Mẫu tin 0.4.0 tiếp tục dùng độc lập.

## Test dễ làm

1. Cài 0.5.0, mở Hộp thư khi chưa đăng nhập: có hướng dẫn kết nối, nút tải bị khóa.
2. Vào Tài khoản → Khôi phục phiên đã lưu (hoặc đăng nhập). Vào Hộp thư → Tải lại hội thoại. So tên và số chưa đọc với Telegram chính thức tại cùng thời điểm; số này là snapshot lúc tải.
3. Nếu có trên 30 hội thoại, bấm Tải thêm: xuất hiện hội thoại tiếp theo, không thêm hàng trùng. Lọc theo tên chỉ lọc các hội thoại đã tải.
4. Chọn Saved Messages hoặc hội thoại thử: đối chiếu nội dung và thời điểm. Nếu có ảnh/tệp chỉ thấy nhãn và chú thích, không tải file. Tin mới nhất ở trên.
5. Với hội thoại có trên 30 mục, bấm Tải tin cũ hơn; kiểm tra ID giảm, không lặp. Chuyển hội thoại khác: không lẫn nội dung hội thoại trước.
6. Gửi một tin thử bằng Telegram chính thức, sau đó bấm Tải lại tin mới nhất trong tool: tin mới xuất hiện. Chưa có tự cập nhật.
7. Kiểm tra một hội thoại còn chưa đọc: việc mở trong tool không tự đánh dấu đã đọc. Không mở cùng hội thoại trong Telegram chính thức khi đối chiếu để tránh app đó tự đánh dấu.
8. Tắt mạng rồi bấm tải: báo lỗi, không hiện như tải thành công/rỗng. Khôi phục mạng; nếu phiên mất kết nối thì khôi phục phiên và tải lại. Không cần cố gây FloodWait thật.
9. Trong lúc tải, vào Tài khoản → Hủy / Xóa phiên trên máy (nếu muốn kiểm tra hủy): không treo yêu cầu; Hộp thư xóa nội dung và khóa nút. Đăng nhập tài khoản khác không thấy nội dung cũ.
10. Đóng/mở ứng dụng: mẫu tin, nghiên cứu và cài đặt cũ còn; hộp thư phải kết nối/tải lại. Nhật ký hỗ trợ không chứa nội dung đọc từ hộp thư.

## Bằng chứng tự động và giới hạn

- `pnpm check`: compiler/lint, toàn bộ tests, bundle.
- Test adapter với lớp request thật của GramJS và dữ liệu giả lập: serialize request, phân trang, peer ID lớn và namespace, cursor hết hạn, pinned-only page, văn bản/ảnh/sự kiện, thiếu mục, cache giới hạn, mất quyền, FloodWait không gọi thêm.
- Windows Electron và bản đóng gói: điều hướng Hộp thư, trạng thái chưa kết nối, bridge/IPC từ chối gửi và yêu cầu chưa đăng nhập; regression module cũ.
- CI không đăng nhập tài khoản Telegram thật. Các bước 2–10 là nghiệm thu thủ công cần thực hiện trên máy người dùng; chưa tuyên bố đã PASS luồng hộp thư live hoặc gửi/nhận tin.

Nguồn API: https://core.telegram.org/method/messages.getDialogs và https://core.telegram.org/method/messages.getHistory. Phiên bản GramJS hiện khóa trong pnpm-lock.yaml.
