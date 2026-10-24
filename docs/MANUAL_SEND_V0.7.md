# P4.3 — Gửi tin thủ công 0.7.0

## Phạm vi đã triển khai

- Gửi văn bản thuần, một ảnh JPEG/PNG hoặc một tài liệu, một người nhận mỗi lần.
- Người nhận: Saved Messages; hội thoại đang mở; hoặc username chính xác cá nhân/bot/nhóm/kênh. Có thể tra người chưa có trong danh bạ nhưng Telegram quyết định có được gửi hay không. Không tự thêm liên hệ, tham gia nhóm hoặc thay quyền.
- Xem trước hiển thị tên, username, ID và loại người nhận; nội dung, tên/loại/kích thước tệp. Bản này chưa có ảnh thumbnail trong preview.
- Preview chỉ tra người nhận/quyền; chưa upload hoặc gửi. Bản xem trước hiệu lực 5 phút, cố định ID/input peer và nội dung, chỉ được xác nhận một lần. Sửa nội dung/đổi người nhận/tệp phải xem trước lại.
- Kiểm tra quyền cơ bản khi xem trước và ngay trước gửi (kênh đăng bài, quyền cấm gửi, nhóm yêu cầu tham gia); quyền riêng tư/hạn chế khác vẫn do API quyết định. Không cam kết preview đảm bảo gửi được.
- Text tối đa 4096 ký tự; caption tối đa 1024; một ảnh ≤10 MiB hoặc một tài liệu ≤20 MiB, không có album. Chọn tệp bằng hộp thoại hệ thống, không nhận đường dẫn/URL từ renderer. Ảnh kiểm tra đuôi/chữ ký JPEG/PNG, Telegram kiểm tra nội dung cuối cùng. Chụp bytes vào bộ nhớ, không đọc lại nội dung khác sau preview.
- Gửi thành công chỉ khi adapter nhận Message có ID từ Telegram, không có nghĩa đã đọc. Lỗi giữ bản soạn; không tự gửi lại. Lỗi quyền/FloodWait hiển thị an toàn.
- Khi mất phản hồi sau dispatch, worker dừng/hủy/kết nối lỗi: có thể “chưa rõ kết quả”; bản xem trước đã dùng không được gửi lần hai. Giữ bản soạn, yêu cầu kiểm tra Telegram rồi chủ động quyết định tạo preview mới. Hủy trong lúc gửi không bảo đảm thu hồi request đã đi.
- Có chống double click và dùng lại token trong phiên; SDK có retry nội bộ theo cấu hình hiện hành. Không tuyên bố exactly-once qua crash/restart hoặc đối soát durable; phần hàng đợi bền vững ở Phase 5.
- Nội dung/tệp chỉ trong bộ nhớ, không lưu log hoặc SQLite; bản soạn giữ qua lỗi và chuyển menu trong lần mở app, không phục hồi sau đóng. Đổi tài khoản xóa bản soạn. Session vẫn mã hóa riêng.

Chưa có reply/mẫu tin trong ô soạn (P4.4), lịch gửi/queue (Phase 5), gửi hàng loạt hoặc thao tác kết bạn/tham gia nhóm.

## Test dễ làm — bắt đầu với Saved Messages

1. Cài 0.7.0 → Tài khoản → Khôi phục phiên → Hộp thư. Khi chưa kết nối, nút gửi bị khóa.
2. Tại Gửi tin thủ công giữ “Saved Messages của tôi”, nhập một câu có dấu. Bấm Xem trước: kiểm tra ID/tên chính mình. Mở Telegram chính thức: chưa có tin gửi.
3. Bấm Xác nhận gửi một lần. Tool báo ID tin khi API xác nhận; Telegram có đúng một tin. Bấm nhanh hai lần cũng không tạo hai dispatch từ cùng preview.
4. Soạn lại, xem trước rồi Quay lại sửa. Đổi nội dung: phải xem trước lại trước khi có nút gửi.
5. Chọn ảnh JPEG/PNG nhỏ → xem trước tên/kích thước/chú thích → xác nhận → kiểm tra Telegram nhận ảnh và caption. Chọn cùng ảnh dưới dạng tài liệu: Telegram nhận tệp. Thử thêm PDF/TXT nhỏ.
6. Bỏ tệp, gửi lại text. Tệp rỗng, vượt giới hạn hoặc không đúng đuôi/chữ ký ảnh không được dùng.
7. Tải hội thoại, mở hội thoại của người bạn thử, chọn “Hội thoại đang mở”, xem trước và xác nhận. Tài khoản thử nhận đúng nội dung một lần.
8. Chọn “Username chính xác”, nhập username tài khoản thử chưa có trong danh bạ. Kiểm tra kỹ ID/tên trước gửi. Nếu Telegram từ chối, tool báo lỗi và giữ bản soạn; không tự retry.
9. Thử nhóm test bạn có quyền gửi. Với kênh không có quyền đăng, preview/gửi phải báo không có quyền; không tự tham gia hoặc nâng quyền.
10. Mất mạng/lỗi sau khi xác nhận có thể hiện “CHƯA RÕ KẾT QUẢ”. Kiểm tra Telegram trước; tool giữ nội dung, khóa preview mới đến khi bạn đánh dấu đã kiểm tra. Không cố gây FloodWait thật.
11. Đóng/mở lại: không có tin được tự gửi. Kiểm tra mẫu tin/nghiên cứu/cài đặt và nhận tin trực tiếp vẫn hoạt động.

## Kiểm tra tự động

`pnpm check`: compiler/lint, tests và build. Tests mới: validation chỉ một người nhận, preview không gửi, bind ID/nội dung, consume trước await, quyền thay đổi/username không chuyển người nhận, photo/document buffer, FloodWait/quyền, timeout/no ack uncertain, file rỗng/lớn/ảnh sai.
Windows CI dev và app đã đóng gói kiểm tra Composer bằng fixture chỉ trong `--smoke-test`: preview không dispatch, xác nhận/double click, giữ draft và chặn gửi lại khi uncertain; các module cũ chạy regression.
CI không có tài khoản Telegram thật và không gửi tin thật. Các bước nghiệm thu live ở trên cần người dùng thực hiện; chưa đánh dấu Phase 4 hoàn tất.

## Bước kế tiếp

P4.4: trả lời tin cụ thể (reply) và dùng mẫu tin đã lưu trong Composer, giữ luồng xem trước/xác nhận. Sau đó nghiệm thu luồng gửi trước khi triển khai Phase 5.

Nguồn: https://core.telegram.org/method/messages.sendMessage; https://core.telegram.org/method/messages.sendMedia; mã GramJS khóa trong pnpm-lock.yaml.
