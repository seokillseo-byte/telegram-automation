# P4.5 — Quyền và lỗi gửi, 0.9.0

## Phạm vi đã triển khai

- Nút “Kiểm tra quyền gửi” cho một người nhận hiện tại, không cần nhập nội dung; chỉ đọc metadata của người nhận, không upload/gửi tin/thêm liên hệ/tham gia nhóm hoặc thay quyền.
- Bảng tách Văn bản, Ảnh, Tài liệu: Không ghi nhận hạn chế / Bị chặn / Chưa xác định đầy đủ, có lý do và thời điểm kiểm tra. Đây là ảnh chụp quyền, không phải bảo đảm gửi thành công.
- Saved Messages có thông tin của chính mình. Với cá nhân/bot khác, hồ sơ cơ bản không xác định đầy đủ chặn/riêng tư/Premium/giới hạn tài khoản: hiện chưa xác định thay vì hứa gửi được.
- Phân biệt kênh cần quyền đăng bài, nhóm chỉ quản trị, nhóm phải tham gia trước khi gửi, nhóm đã chuyển/ngừng, dữ liệu Channel.min thiếu quyền, cấm xem/gửi và cấm riêng text/photo/document.
- Tính các cờ hạn chế riêng và mặc định còn hiệu lực; quản trị/chủ nhóm không bị áp hạn chế mặc định. Quyền bị thu hồi khi upload được kiểm tra lại trước dispatch. Telegram vẫn quyết định cuối cùng, không có transaction kiểm tra+gửi nguyên tử.
- Ghi chú chế độ chậm hoặc quản trị ẩn danh nếu metadata có cờ tương ứng; không tự đổi send_as, không suy ra số giây chờ từ cờ slowmode.
- Bảng gắn với đúng người nhận; đổi người nhận bỏ kết quả cũ. Đọc kiểm tra/preview đang chờ mà người nhận/ngữ cảnh reply đổi thì không áp kết quả cũ cho đích mới.
- Khi loại nội dung đang chọn bị chặn, khóa preview; nút chọn ảnh/tài liệu bị chặn tương ứng. Có thể bỏ tệp/chọn loại được phép; muốn cập nhật quyền mới bấm kiểm tra lại. Preview/confirm vẫn kiểm tra backend, không chỉ dựa vào bảng UI.
- Lỗi hiển thị mã và hướng xử lý: quyền/nhóm, riêng tư/Premium/tin trả phí, tin gốc bị sửa/xóa, định dạng/kích thước/quyền đọc tệp, mạng/phiên, hạn chế tài khoản. Lỗi không biết không đưa raw payload ra màn hình/log.
- FloodWait/SlowModeWait trả RATE_LIMIT + thời gian chờ: bộ đếm khóa kiểm tra/preview/confirm trong UI, worker cũng từ chối thêm API đọc/gửi trong thời gian đã ghi nhận. Áp dụng thận trọng cho thao tác gửi thủ công trong phiên, không tự gửi khi hết giờ. Đây không phải lịch gửi hoặc queue.
- Thời gian chờ chưa là dữ liệu bền vững qua đóng app; khôi phục kết nối/tài khoản vẫn chịu giới hạn thật của Telegram. Không xoay tài khoản hoặc né hạn chế.
- Giữ draft, one-use preview và uncertain của 0.7–0.8. Giá trị biến, nội dung/tệp/quyền kiểm tra chỉ trong bộ nhớ; không có migration mới hoặc lưu nội dung gửi vào nhật ký.

Không triển khai thêm queue, lịch gửi, liên hệ hoặc tham gia nhóm trong P4.5.

## Test dễ làm trên Windows

1. Cài 0.9.0, khôi phục phiên, mở Hộp thư → Gửi tin thủ công → Saved Messages. Để trống nội dung và bấm Kiểm tra quyền gửi: có ba hàng và thời điểm, không có tin được gửi.
2. Nhập một câu, Xem trước rồi Xác nhận; đối chiếu đúng một tin trong Telegram chính thức. Chỉ có ID xác nhận API, không có cam kết đã đọc.
3. Chọn username một người bạn thử → Kiểm tra: có thể hiện Chưa xác định đầy đủ. Trạng thái này không có nghĩa chắc chắn bị cấm hoặc chắc chắn gửi được. Gửi thử sau khi kiểm tra đúng danh tính.
4. Với kênh bạn không có quyền đăng: kiểm tra phải hiện Bị chặn/khóa preview theo metadata hiện có. Không tự tham gia/nâng quyền.
5. Với nhóm test, dùng tài khoản thành viên thường; quản trị bằng tài khoản khác đặt cấm ảnh/tài liệu nhưng cho text. Bấm kiểm tra lại: hàng ảnh/tài liệu bị chặn, text không ghi nhận hạn chế. Nút chọn loại tệp bị cấm bị khóa; thử text. Nếu dùng chính tài khoản admin, hạn chế mặc định có thể không áp dụng nên kết quả khác là đúng.
6. Thay quyền ở Telegram chính thức sau preview rồi confirm: tool đọc lại quyền; khi bị chặn, giữ draft và hiển thị mã/hướng xử lý, không báo thành công giả. Quyền vẫn có thể đổi ngay sau bước kiểm tra cuối.
7. Đổi người nhận: bảng cũ biến mất. Bấm kiểm tra để lấy kết quả mới. Thử ảnh/tệp rỗng hoặc không đọc được: thông báo hướng dẫn kiểm tra tệp, không hiện đường dẫn riêng tư/raw lỗi.
8. Không cố gây FloodWait thật. CI giả lập bộ đếm: khóa thao tác, hết giờ chỉ mở nút, không tự gửi; worker không gọi API thêm trong thời gian đã ghi nhận.
9. Kiểm tra reply/mẫu tin, mất ack giữ draft và cảnh báo chưa rõ kết quả; kiểm tra phiên/nghiên cứu/Excel/cài đặt vẫn hoạt động.

## Bằng chứng tự động

`pnpm check`: compiler/lint, tests và bundle. Test mới: phân loại private/self/deleted/read-only/min, cấm theo loại, hạn chế mặc định/riêng/hết hạn/admin; kiểm tra quyền chỉ đọc, đổi quyền trong lúc upload không dispatch, worker chặn trong FloodWait, lỗi/khuyến nghị không lộ raw payload.
Windows dev và app đóng gói dùng fixture: bảng quyền blocked/unknown/allowed không dispatch, khóa/mở preview sau kiểm tra lại, RATE_LIMIT khóa nút/bộ đếm/giữ draft và không tự gửi sau hết giờ; regression reply/template/uncertain/live/DPAPI/SQLite/Excel.
CI không đăng nhập hoặc gửi tin Telegram thật. T08–T09 và kiểm tra trên tài khoản thật ở trên vẫn cần người dùng nghiệm thu. Không gọi V1 production-ready chỉ vì CI xanh.

## Bước kế tiếp

Nghiệm thu Phase 4 (Saved Messages, tài khoản thử và nhóm thử, T08–T09). Sau đó Phase 5 theo kế hoạch: lịch gửi một lần, hàng đợi bền vững, pause/cancel/recovery và kiểm tra consent/suppression đúng phạm vi. Chưa đánh dấu Phase 4 đã nghiệm thu live.

Nguồn: https://core.telegram.org/api/rights; https://core.telegram.org/constructor/chatBannedRights. GramJS được khóa phiên bản trong pnpm-lock.yaml; các điều kiện riêng tư/paid message mới có thể cần cập nhật SDK.
