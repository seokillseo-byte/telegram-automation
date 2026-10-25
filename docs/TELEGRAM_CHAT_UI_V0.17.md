# Giao diện chat và Automation · 0.17.0

## Phạm vi đã chốt

Chuyển trọng tâm ứng dụng desktop sang trò chuyện Telegram. Dùng lại phần kết nối, hộp thư, gửi tin, reply, mẫu tin và lịch gửi hiện có. Không triển khai thêm tìm kiếm/thu thập dữ liệu hay P6.3.

- Trang Tin nhắn mặc định cho cài đặt mới; cài đặt trang mở đầu đã lưu vẫn được tôn trọng. Cài đặt cho phép chọn Tin nhắn.
- Thanh điều hướng nhỏ: Tin nhắn, Automation, Danh bạ, Tài khoản trước; nghiên cứu/báo cáo và tiện ích ở dưới.
- Cột trái: tìm trong hội thoại đã tải, tên/username, avatar chữ, xem trước, số chưa đọc lúc tải; cuộn danh sách độc lập.
- Cột phải: tiêu đề hội thoại, lịch sử dạng bong bóng, tin nhận/gửi tách bên, thứ tự cũ → mới, ô soạn phía dưới.
- Sau khi vào Tin nhắn và kết nối, tự tải trang hội thoại đầu tiên một lần. Không tự thử lại khi lần đầu lỗi; nút Làm mới vẫn có sẵn. Cơ chế khôi phục kết nối/đối chiếu cập nhật cũ được giữ.
- Chọn hội thoại tự đổi người nhận của ô soạn sang hội thoại đó và bỏ xem trước/lịch đang xem lại. Người nhận luôn hiển thị phía trên ô soạn. Không gửi ngay khi chọn.
- Người nhận khác, Saved Messages, mục đích, mẫu tin và kiểm tra quyền nằm trong phần mở rộng dưới ô soạn. Reply tự mở phần này. Gửi vẫn cần Xem trước → xác nhận một lần.
- Automation hiển thị quản lý lịch gửi thật: xem nội dung, tạm dừng/tiếp tục/hủy, chọn lại giờ với lịch chưa thử, trạng thái cần kiểm tra/chưa rõ kết quả và nhật ký lịch. Nút Tạo lịch từ Tin nhắn quay về ô soạn.

## Test dễ làm

1. Cài 0.17.0. Nếu app mở ở trang cũ, vào Cài đặt → Trang mở đầu → Tin nhắn → Lưu.
2. Tài khoản → Khôi phục phiên đã lưu. Mở Tin nhắn: tự có danh sách hội thoại, không cần bấm tải ban đầu. Nếu lỗi kết nối thì Làm mới sau khi xử lý lỗi.
3. Bấm một hội thoại: lịch sử ở phải, ô soạn bên dưới. Tên người nhận ở ô soạn phải trùng hội thoại. Cuộn danh sách bên trái không kéo lịch sử bên phải.
4. Chọn hội thoại khác: tên người nhận thay đổi, bản xem trước cũ không còn. Không có tin tự gửi.
5. Gửi tin thử tới Saved Messages: mở Người nhận · Mẫu tin · Quyền gửi, chọn Saved Messages; nhập nội dung → Xem trước → kiểm tra tên → Gửi ngay một lần. Kiểm tra Telegram chính thức.
6. Reply một tin: phần người nhận tự mở, nội dung trích dẫn đúng; Xem trước kiểm tra tin được trả lời.
7. Tạo lịch: nhập văn bản → Xem trước → chọn giờ cách ít nhất vài phút → Xem lại lịch → Xác nhận lưu lịch một lần. Vào Automation: thấy lịch, thử tạm dừng/tiếp tục/hủy. Khi tới giờ, giữ app mở và tài khoản có mạng; kiểm tra kết quả thật trên Telegram.
8. Thu nhỏ cửa sổ: hai cột vẫn dùng được, ô soạn và lịch sử có vùng cuộn; menu Tài khoản và Automation truy cập được.
9. Kiểm tra đăng ký bot và hồ sơ/ghi chú cũ vẫn còn sau cập nhật.

## Giới hạn cần biết

Đây là giao diện lấy bố cục Telegram làm tham khảo, chưa phải ứng dụng Telegram đầy đủ. Avatar hiện chữ viết tắt; ảnh/tệp trong lịch sử vẫn là nhãn đính kèm, chưa tự tải hoặc hiển thị ảnh/video. Chưa có gọi điện/ghi âm, đồng bộ đọc, tìm toàn bộ nội dung hoặc đồng bộ tất cả hội thoại. Mỗi trang 30, bộ nhớ giới hạn 300 như bản trước. Tìm ở cột trái là lọc dữ liệu đã tải.

Gửi theo lịch hiện hỗ trợ văn bản một lần khi app mở và kết nối; không chạy khi app đóng. Quy tắc đồng ý/chặn gửi, giới hạn Telegram và cơ chế xử lý kết quả chưa rõ được giữ. Chưa có tự thêm liên hệ hoặc tự mời vào nhóm trong bản này.

Schema vẫn 9, giữ phiên đã mã hóa, dữ liệu và lịch cũ; không hạ xuống 0.14 hoặc cũ hơn.

## Validation

`pnpm check`; Windows CI chạy kiểm tra hộp thư tự tải một lần, bố cục hai cột, người nhận tự theo hội thoại, gửi/reply/mẫu/lịch, bot và dữ liệu, cả development và bản đóng gói. Kiểm tra tự động dùng fixture, cần test Telegram thực theo các bước trên.
