# Phase 5 bước đầu — lịch văn bản một lần, 0.10.0

Người dùng đã xác nhận gửi thủ công thành công tới một tài khoản thật ở Phase 4. Đây là bước P5.1 và nền P5.2, kèm điều khiển/recovery tối thiểu cần để vận hành lịch an toàn; chưa đánh dấu toàn bộ Phase 5 hoàn tất.

## Chức năng

- Từ bản Xem trước văn bản trong Hộp thư: chọn giờ theo múi giờ ở Cài đặt → Xem lại lịch → Xác nhận lưu lịch một lần. Đây là thao tác riêng với Gửi ngay, không gửi khi chỉ xem trước/lưu lịch.
- Một người nhận đã xác định bằng ID/input peer, một nội dung text đã xem trước. Dùng được nội dung nhập tay hoặc mẫu đã áp dụng. Đổi username hoặc sửa mẫu về sau không đổi người nhận/nội dung lịch.
- Giờ hẹn lưu UTC, kèm múi giờ khi tạo để đối chiếu; UI hiển thị theo múi giờ đã chọn. Khoảng từ 30 giây đến 365 ngày phía trước. Giờ không tồn tại/trùng do DST bị từ chối; có thể chọn giờ khác hoặc đổi cấu hình sang UTC.
- SQLite lưu lịch và sự kiện; chống tạo trùng từ cùng preview ID, claim trong transaction, mỗi lịch tối đa một lần thử dispatch. Random ID MTProto được cố định trước và lưu cùng payload. Không hứa exactly-once trong mọi tình huống; mất phản hồi không tự retry.
- Nội dung, input peer/access hash và random ID được mã hóa bằng Windows safeStorage trước khi ghi SQLite. Tên/ID người nhận, giờ và trạng thái là metadata local không mã hóa. Không lưu OTP/session/API Hash trong lịch. Xem nội dung giải mã trong app, không xuất ra nhật ký hỗ trợ.
- Menu Lịch gửi: danh sách 200 bản ghi gần nhất theo tài khoản, xem nội dung/sự kiện; tạm dừng, tiếp tục khi còn đủ thời gian, hủy lịch chưa chạy, chọn/xác nhận lại giờ mới cho lịch chưa thử gửi. Tối đa 100 lịch chưa hoàn tất mỗi tài khoản.
- App phải mở, máy có mạng và phiên đúng tài khoản đã kết nối trước giờ hẹn. Kiểm tra theo chu kỳ khoảng một giây, không phải bộ định thời chính xác đến mili giây.
- Khi đến giờ, kiểm tra tài khoản/ID người nhận và quyền gửi lại. Chỉ báo Telegram xác nhận khi API trả ID phù hợp; không có nghĩa đã đọc. Một dispatcher, không chạy song song với tác vụ Telegram khác của tool.
- Pending bị trễ hơn khoảng 5 giây do app bận/offline/timer bị gián đoạn → Cần kiểm tra, không tự gửi bù. Khi app khởi động/khôi phục mạng/phiên hoặc máy resume, lịch đã tới giờ được đưa về Cần kiểm tra.
- Crash/đóng app khi đang running → Chưa rõ kết quả (có thể đã gửi). Không có nút gửi lại/tiếp tục cho sent/failed/uncertain/running. Cần tự kiểm tra Telegram; nếu thực sự cần gửi khác, tạo bản xem trước/lịch mới.
- Hủy/tạm dừng chỉ có tác dụng trước claim. Sau khi đang thực thi không hứa hủy được request đã đi; đóng app hoặc hủy phiên lúc đó có thể tạo trạng thái chưa rõ kết quả.

## Phạm vi chưa có

- Chỉ lịch văn bản trao đổi/hỗ trợ cá nhân. Chưa lên lịch ảnh/tài liệu, reply, lịch lặp hoặc marketing. Không có nhập danh sách/gửi hàng loạt, thêm liên hệ/tham gia nhóm.
- Chưa tự retry FloodWait/lỗi tạm thời hoặc đối soát uncertain; lỗi được lưu failed/uncertain để kiểm tra. P5.3 phần retry theo phân loại và P5.5 consent/suppression marketing vẫn còn trong kế hoạch. Không coi hồ sơ tìm kiếm là đồng ý nhận tin.
- Chưa có server/chạy nền khi app đóng, tự khởi động Windows hoặc backup/restore (Phase 7).

## Test dễ làm — Saved Messages trước

1. Cài bản 0.10.0 → Khôi phục phiên → Hộp thư. Soạn một câu riêng dễ nhận biết, người nhận Saved Messages → Xem trước.
2. Giữ Gửi ngay chưa bấm. Trong “Hoặc hẹn gửi văn bản một lần”, chọn giờ sau khoảng 3–5 phút, kiểm tra múi giờ → Xem lại lịch. Kiểm tra tên/ID, nội dung, giờ và múi giờ → Xác nhận lưu lịch một lần.
3. Vào Lịch gửi: có một dòng Chờ đến giờ. Kiểm tra Telegram chính thức: chưa có tin trước giờ. Giữ app mở và kết nối, tới giờ kiểm tra đúng một tin và ID xác nhận trong bảng. Bấm xác nhận nhanh hai lần không tạo hai lịch từ cùng preview.
4. Tạo lịch khác sau vài phút, Tạm dừng trước giờ. Tới giờ không gửi. Nếu đã quá giờ, Tiếp tục yêu cầu chọn giờ mới; không tự gửi bù. Chọn giờ mới và xác nhận nếu muốn chạy.
5. Tạo lịch khác, Hủy lịch trước giờ → xác nhận. Chờ qua giờ: không gửi; mở lại vẫn Đã hủy.
6. Tạo lịch rồi đóng app qua giờ hẹn. Mở lại: Cần kiểm tra, không tự gửi ngay. Xem nội dung, chọn giờ mới để xác nhận lại.
7. Tạo lịch tương lai, đóng/mở app trước giờ, khôi phục đúng phiên trước giờ: lịch còn và có thể thực hiện đúng giờ. Đăng nhập tài khoản khác không dispatch lịch của tài khoản cũ.
8. Nếu hiển thị Chưa rõ kết quả: kiểm tra Telegram trước, không tạo lại ngay. Không cố gây crash/FloodWait thật; CI đã có giả lập.
9. Đổi múi giờ hiển thị: thời điểm UTC không đổi; bảng ghi rõ múi giờ hiển thị và múi giờ khi tạo. Kiểm tra gửi thủ công, ảnh/tài liệu/reply/mẫu tin/nghiên cứu/Excel cũ vẫn chạy.

## Dữ liệu và nâng cấp

Migration schema 4 → 5 giữ dữ liệu cũ và bổ sung bảng lịch/sự kiện trong cùng SQLite. Sau nâng cấp, không dùng bản 0.9 trở xuống với DB này; bản cũ sẽ từ chối schema mới để tránh ghi nhầm. Giữ bộ cài mới; chưa cần xóa dữ liệu hoặc đăng nhập lại nếu phiên còn hợp lệ. Việc chuyển máy/Windows user chưa có luồng khôi phục khóa/lịch.

## Bằng chứng kiểm tra

`pnpm check`: compiler/lint, tests, bundle. Tests mới: UTC/VN/DST, dedupe/account isolation, hai kết nối SQLite claim một lần, pause/cancel, reopen/recovery overdue và uncertain, export preview không gửi, fixed peer/random ID, account mismatch, mất ack và từ chối payload marketing/sai peer.
Windows CI dev và app đóng gói dùng fixture, không gửi Telegram thật: tạo lịch qua Composer có xác nhận riêng, double click không tạo trùng/không dispatch, xem/tạm dừng/tiếp tục/hủy trong UI, DPAPI roundtrip và mở lại SQLite. Các module cũ chạy regression.
CI không chứng minh lịch được gửi thật đúng thời điểm trên tài khoản người dùng. Các bước nghiệm thu live ở trên còn cần thực hiện. Chưa gọi hoàn tất Phase 5 hoặc V1 production-ready.

## Bước tiếp theo

Sau khi nghiệm thu lịch văn bản một lần: tiếp tục P5.3 phần retry có phân loại/FloodWait, màn xử lý lỗi và đối soát theo kế hoạch; vẫn không tự retry uncertain. Marketing chỉ mở sau khi có P5.5 consent/suppression và luồng đăng ký tương ứng.

Tham chiếu: https://core.telegram.org/method/messages.sendMessage; https://www.electronjs.org/docs/latest/api/power-monitor; cơ chế safeStorage/SQLite hiện có trong dự án.
