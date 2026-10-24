# P5.3 · Thử lại có phân loại · 0.11.0

Người dùng đã xác nhận gửi trực tiếp tới tài khoản thành công ở 0.9 và lịch gửi Saved Messages thành công ở 0.10. Đây là xác nhận live của người dùng, không phải kiểm chứng live của CI.

## Hành vi

- Tối đa **3 lần thử**, gồm lần đầu, cho mỗi lịch văn bản cá nhân đã xác nhận.
- `FLOOD_WAIT`/`SLOWMODE_WAIT` được ánh xạ `RATE_LIMIT`: chờ đủ số giây Telegram trả về cộng 1 giây. Chỉ tự thử lại nếu thời gian chờ hợp lệ và không quá 24 giờ. Toàn bộ hàng đợi của tài khoản tôn trọng thời gian chờ đã lưu; không đổi tài khoản để né giới hạn.
- Lỗi mạng được nhận diện **trước khi gọi SendMessage**: thử lại sau 30 giây rồi 120 giây. Không thử lại lỗi không nằm trong danh sách cho phép.
- Timeout, mất mạng, mất ACK **sau khi gọi SendMessage**: `Chưa rõ kết quả`, không tự thử lại. Không có nút gửi lại cưỡng bức.
- Lỗi quyền, riêng tư, chặn, `PEER_FLOOD`, phiên hết hạn hoặc payload lỗi: kết thúc thất bại, không tự thử lại.
- Mỗi lần thử dùng lại nội dung, người nhận đã ghim và cùng `randomId`. Quyền gửi/tài khoản được kiểm tra lại. Giới hạn retry của SDK cho riêng lệnh gửi lịch được đặt thành 1 rồi khôi phục; SDK vẫn quản lý truyền tải MTProto.
- Hiển thị số lần thử và thời điểm thử lại trong Lịch gửi. Có thể Tạm dừng / Tiếp tục / Hủy khi chưa thực thi lần tiếp theo. Tiếp tục lịch chưa thử khi mốc cũ còn cách trên 30 giây; lịch chờ thử lại chỉ cần mốc thử tiếp theo vẫn ở tương lai. Không sửa giờ/nội dung/người nhận của lịch đã thử.
- Khi đóng app/sleep/mất kết nối rồi quay lại sau mốc thử: cần kiểm tra, không tự gửi bù. Nếu lần trước đang chạy khi app dừng: chưa rõ kết quả. Lịch đã thử nhưng lỡ mốc tiếp theo chỉ được hủy; kiểm tra Telegram trước khi chủ động tạo lịch khác.

## Test dễ làm trên Windows

1. Cài 0.11 lên cùng tài khoản Windows, khôi phục phiên. Không xóa thư mục dữ liệu. Phiên bản dùng schema 6, **không hạ về 0.10 hoặc cũ hơn** sau khi mở dữ liệu.
2. Trong Hộp thư chọn Saved Messages, viết `Test P5.3 - <giờ hiện tại>`, Xem trước → chọn lịch sau 3–5 phút → Xem lại lịch → Xác nhận lưu.
3. Vào Lịch gửi: kiểm tra đúng người nhận, giờ, `Lần thử: 0/3`. Giữ app mở/kết nối. Đến giờ phải có đúng một tin, trạng thái Telegram đã xác nhận và `1/3`.
4. Tạo lịch thứ hai, Tạm dừng rồi Hủy. Qua giờ hẹn không có tin mới. Tạo lịch khác rồi Tạm dừng/Tiếp tục trước mốc ít nhất 30 giây để kiểm tra điều khiển.
5. Tạo lịch rồi đóng app, mở lại sau giờ hẹn: cần kiểm tra, không gửi bù. Không gây FloodWait bằng cách gửi liên tục để test.

## Test tự động dành cho phát triển

`pnpm check`: lint/TypeScript, unit + integration và bundle. Các fake transport kiểm tra FloodWait, lỗi mạng trước/sau dispatch, tối đa ba lần, cùng payload/randomId, chặn theo tài khoản, pause/cancel, khôi phục và lỗi vĩnh viễn. SQLite kiểm tra claim giao dịch và lưu/reopen. Windows smoke kiểm tra UI chờ thử lại → pause/resume/cancel với DB và DPAPI thật, **không gửi Telegram thật**; marker `QUEUE_CLASSIFIED_RETRY_CONTROLS_PASS` xuất hiện ở cả dev và packaged.

Chưa kiểm chứng live FloodWait/network retry bằng tài khoản người dùng. Không có retry cho gửi tay, lịch tệp/reply/lặp hoặc gửi chiến dịch. P5.4 cần tiếp tục nghiệm thu phục hồi; P5.5 consent/suppression chưa hoàn tất.
