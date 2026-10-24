# P4.4 — Reply và mẫu tin trong ô soạn, 0.8.0

## Phạm vi

- Hộp thư: nút “Trả lời tin này” trên tin văn bản/tệp đã tải, không có trên tin sự kiện. Chọn nút sẽ đưa về ô soạn và chuyển người nhận sang đúng hội thoại đang mở.
- Hiển thị ID và trích đoạn tối đa 200 ký tự của tin gốc. Có Bỏ trả lời. Đổi hội thoại/người nhận hoặc ngắt phiên bỏ ngữ cảnh reply, giữ các quy tắc bản soạn của 0.7.
- Preview gắn recipient/input peer, reply ID và nội dung; chỉ xác nhận một lần trong 5 phút. Không nhận reply ID tự nhập cho username/Saved Messages: phải chọn từ lịch sử hội thoại đã tải.
- Worker giữ tối đa 300 ID có thể reply của hội thoại đang đọc, theo namespace peer; không chấp nhận ID của hội thoại khác. Đọc lại đúng một tin gốc khi preview/confirm; khi reply bằng tệp, đọc lại sau upload trước dispatch.
- Tin gốc bị xóa/không truy cập được: báo lỗi, không chủ động chuyển thành tin gửi thường. Nếu nội dung/phiên bản/media của tin gốc thay đổi sau preview: dừng và yêu cầu xem trước lại. Nếu tin biến mất khỏi UI, khóa preview mới cho đến khi chọn lại hoặc Bỏ trả lời.
- Không thể kiểm tra và gửi như một transaction nguyên tử trên Telegram: tin vẫn có thể thay đổi ngay sau kiểm tra cuối. Telegram quyết định kết quả cuối; không cam kết chống được mọi race hoặc hỗ trợ riêng quản lý forum topic/comment thread.
- Reply áp dụng cho text, một ảnh hoặc tài liệu, giữ giới hạn và xử lý quyền/FloodWait/uncertain của 0.7. Không thêm forward/edit/delete từ tool.
- Composer có danh sách mẫu đã lưu. Điền đủ biến `{{ten}}`, `{{san_pham}}`, `{{cong_ty}}`, `{{lien_ket}}` mà mẫu sử dụng → “Đưa mẫu vào ô soạn”. Mẫu không có biến dùng ngay.
- Áp dụng thay nội dung bản soạn (hỏi trước khi thay bản soạn không rỗng), không sửa mẫu gốc và không gửi. Người dùng tiếp tục sửa văn bản, xem trước và xác nhận như bình thường. Nội dung sau thay biến bị kiểm tra giới hạn 4096 hoặc 1024 cho caption; không tự cắt ngắn.
- Giá trị biến là văn bản thuần, không thực thi HTML/Markdown hoặc thay biến lồng nhau. Không lưu giá trị biến/nội dung reply vào log/SQLite. Không tự điền tên từ người khác hoặc tự tạo chiến dịch.

## Test dễ làm

1. Cài 0.8.0 → Khôi phục phiên → Hộp thư → tải một hội thoại thử hoặc Saved Messages từ danh sách. Tại một tin thường, bấm Trả lời tin này. Kiểm tra người nhận chuyển sang đúng hội thoại và có khung “Trả lời tin #…”.
2. Nhập câu trả lời → Xem trước: kiểm tra ID/trích đoạn tin gốc và người nhận. Chưa có tin gửi khi chỉ preview. Xác nhận rồi kiểm tra Telegram chính thức: câu trả lời trỏ đúng tin gốc, chỉ một lần.
3. Thử reply bằng ảnh/tài liệu nhỏ với caption. Kiểm tra tệp và liên kết reply trong Telegram chính thức.
4. Chọn reply rồi bấm Bỏ trả lời: ngữ cảnh biến mất; nội dung soạn còn. Muốn gửi tin thường phải xem trước lại.
5. Trong lúc đang chọn reply, xóa tin gốc bằng Telegram chính thức. Nếu update đã tới, tool hiển thị tin không còn/khóa preview. Nếu chưa tới, preview/confirm kiểm tra server và báo lỗi. Không tự gửi thành tin thường.
6. Preview reply rồi sửa tin gốc từ Telegram chính thức. Tool có thể bỏ preview ngay khi nhận update; nếu vẫn còn preview, confirm kiểm tra lại và yêu cầu preview mới.
7. Vào Mẫu tin, tạo “Tư vấn” với nội dung `Chào {{ten}}, thông tin {{san_pham}} tại {{lien_ket}}`. Quay lại Hộp thư, chọn mẫu trong ô soạn. Khi chưa điền đủ biến, không áp dụng được.
8. Điền đủ biến, bấm Đưa mẫu vào ô soạn. Kiểm tra nội dung được thay đúng; có thể sửa tiếp. Chưa gửi tin cho tới khi Xem trước rồi Xác nhận. Mẫu gốc ở menu Mẫu tin không đổi.
9. Với bản soạn có sẵn, áp dụng mẫu: chọn Hủy trong hộp hỏi thì giữ nguyên bản soạn. Thử mẫu vượt 1024 ký tự khi đang đính kèm tệp: báo lỗi, không cắt nội dung.
10. Chuyển hội thoại/tài khoản: reply cũ không gắn sang hội thoại mới. Kiểm tra gửi thường, nhận tin trực tiếp và mẫu tin cũ vẫn hoạt động.

## Bằng chứng kiểm tra

`pnpm check`: compiler/lint, tests và bundle. Tests mới kiểm tra reply ID/namespace/cache, preview không gửi, replyTo cho text/photo/document, tin xóa/sửa/sai peer, SDK serialize InputReplyToMessage, template thiếu biến/văn bản literal/giới hạn caption.
Windows CI dùng fixture chỉ trong `--smoke-test`: chọn reply, áp dụng mẫu từ SQLite và điền biến, preview hiển thị reply, confirm, ngữ cảnh xóa sau thành công; tin gốc bị xóa chặn preview mới. Các module cũ chạy regression dev và app đóng gói.
CI không đăng nhập hoặc gửi tin Telegram thật. Nghiệm thu tài khoản thật theo các bước trên còn cần thực hiện; không đánh dấu toàn bộ Phase 4 đã nghiệm thu.

## Bước kế tiếp theo kế hoạch

P4.5: hoàn thiện hiển thị khả năng/quyền gửi theo loại hội thoại và rà soát lỗi gửi, nghiệm thu Phase 4 trước Phase 5 hàng đợi/lịch gửi. Bản này chưa triển khai queue, lịch hoặc liên hệ/tham gia nhóm.

Tham chiếu: GramJS SendMessageParams.replyTo, SendFileInterface.replyTo (phiên bản khóa trong pnpm-lock.yaml); https://core.telegram.org/method/messages.sendMessage; https://core.telegram.org/method/messages.sendMedia.
