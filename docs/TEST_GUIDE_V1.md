# Hướng dẫn test V1 — dành cho người dùng Windows

Trạng thái: checklist cho các bản phát triển tương lai; hiện chưa có .exe. Chỉ test mục thuộc phase đã được bàn giao.
Không cần chạy terminal để sử dụng bản cài. Lệnh dev/build sẽ được bổ sung sau khi Phase 0 khóa stack.

## Chuẩn bị

1. Dùng Windows 10/11 x64 và mạng ổn định.
2. Chuẩn bị tài khoản Telegram do bạn sở hữu; tạo một nhóm riêng để thử.
3. Nếu thử nhắn người khác, nhờ một người đồng ý nhận tin test.
4. Với bot, tự tạo bot thử qua BotFather. Giữ token trên máy, không gửi lên GitHub/chat.
5. Với tài khoản cá nhân, nhập api_id/api_hash vào app theo hướng dẫn Phase 2.
6. Tải đúng artifact/release được cung cấp, ghi version và commit. Không dùng tài khoản/mật khẩu giả để kết luận kết nối thật.
7. Kết quả: PASS nếu đúng mọi bước; FAIL nếu sai; BLOCKED nếu thiếu điều kiện; NOT RUN nếu chưa chạy.

## T00 — Bản kiểm chứng nền tảng (Phase 0)

1. Tải bộ cài spike được cung cấp, cài và mở.
2. Kết nối tài khoản thử theo hướng dẫn.
3. Đóng rồi mở lại; xác nhận nhận diện đúng tài khoản.
4. Người phát triển kiểm tra session trên đĩa và xác nhận không plaintext.
Đạt: bộ cài chạy, phiên khôi phục, có bằng chứng bảo vệ session. Người dùng không phải tự mở file bí mật.

## T01 — Cài và điều hướng (Phase 1)

1. Tải .exe từ link phase tương ứng; cài và mở.
2. Bấm từng menu bên trái.
3. Đóng/mở lại app.
Đạt: không trắng màn hình, không crash, menu đúng; chức năng chưa làm được ghi rõ.

## T02 — Lưu cấu hình (Phase 1)

1. Vào Cài đặt, đổi múi giờ sang Asia/Ho_Chi_Minh.
2. Lưu, đóng hẳn và mở lại.
Đạt: giá trị vẫn giữ; không tự tạo dữ liệu demo trong chế độ thật.

## T03 — Đăng nhập tài khoản (Phase 2)

1. Vào Tài khoản → Thêm tài khoản người dùng.
2. Nhập thông tin API và số điện thoại của bạn.
3. Nhập mã Telegram yêu cầu, rồi 2FA nếu có.
4. Kiểm tra tên tài khoản; đóng/mở app.
5. Đăng xuất rồi mở lại.
Đạt: đúng danh tính, restart giữ phiên trước logout; sau logout không tự đăng nhập.
Test thêm: mã sai báo rõ, cho sửa; không chụp hay chia sẻ OTP.

## T04 — Kết nối bot (Phase 2)

1. Chọn Thêm bot, nhập token bot thử.
2. Kiểm tra tên/username bot hiện đúng.
3. Thử token sai và quan sát lỗi.
Đạt: token đúng kết nối, token sai không báo thành công; bot không có nút tìm kiếm username toàn cục.
Nếu bot đã chạy ở hệ thống khác, không tự ý tắt webhook của hệ thống đó.

## T05 — Tìm username (Phase 3)

1. Chọn tài khoản người dùng đã kết nối.
2. Tìm username chính xác của tài khoản thử bạn biết.
3. Tìm từ khóa seo; nếu Telegram từ chối truy vấn ngắn, app phải báo rõ.
4. Quan sát loại kết quả và lọc username chứa seo.
Đạt: dữ liệu thật hoặc trạng thái rỗng/lỗi chính xác; không hiển thị cam kết tìm được tất cả.
Không lấy số kết quả cố định làm tiêu chí vì Telegram có thể trả khác nhau.

## T06 — Lưu và chống trùng (Phase 3)

1. Chọn một kết quả và lưu vào danh sách nghiên cứu.
2. Thêm nhãn SEO và ghi chú; đóng/mở app.
3. Tìm lại và lưu cùng tài khoản lần nữa.
Đạt: nhãn/ghi chú giữ nguyên, không tạo liên hệ trùng; trạng thái đồng ý nhận quảng cáo vẫn chưa có.

## T07 — Xuất/nhập CSV (Phase 3)

1. Chọn vài hồ sơ thử có tên tiếng Việt.
2. Xuất CSV và mở bằng Excel.
3. Nhập lại file, xem preview rồi xác nhận.
Đạt: tiếng Việt đúng, username/ID đúng, không tạo trùng.
Người phát triển test thêm dữ liệu bắt đầu bằng =, +, -, @ không bị Excel thực thi như công thức.
CSV không chứa session/token hoặc thông tin không được API cung cấp.

## T08 — Gửi tin thử (Phase 4)

1. Mở Saved Messages hoặc hội thoại với người đã đồng ý test.
2. Soạn TEST-V1 kèm thời gian hiện tại.
3. Mở preview: kiểm tra chưa có tin gửi.
4. Bấm Gửi đúng một lần; kiểm tra trong Telegram chính thức.
5. Thử ảnh và tài liệu không nhạy cảm.
Đạt: đúng người, đúng nội dung, mỗi thao tác chỉ một tin; gửi thành công không được ghi thành đã đọc.

## T09 — Mất mạng và quyền gửi (Phase 4)

1. Soạn tin rồi tắt mạng trước khi gửi.
2. Gửi và quan sát trạng thái; kết nối lại.
3. Với nhóm thử, tắt quyền gửi của tài khoản nếu có điều kiện.
Đạt: không báo thành công giả, giữ bản soạn; lỗi quyền dễ hiểu.
Nếu trạng thái gửi không rõ, kiểm tra Telegram trước khi gửi lại.

## T10 — Lịch gửi (Phase 5)

1. Lên lịch tin test sau 3 phút; kiểm tra giờ và người nhận.
2. Giữ app mở, máy không sleep và có mạng.
3. Kiểm tra tin xuất hiện một lần khi đến lịch.
Đạt: thời gian đúng múi giờ, trạng thái đúng, không trùng.

## T11 — Tạm dừng/hủy (Phase 5)

1. Tạo lịch sau 5 phút rồi tạm dừng ngay.
2. Qua thời điểm dự kiến, kiểm tra không có tin.
3. Tiếp tục bằng lịch tương lai phù hợp, hoặc hủy.
4. Tạo một lịch khác rồi hủy trước khi đến giờ.
Đạt: job paused/cancelled chưa dispatch không gửi; lịch sử ghi thao tác.
Hủy khi request đã gửi không có nghĩa Telegram sẽ thu hồi tin.

## T12 — Đóng app và khởi động lại (Phase 5)

1. Lên lịch sau 3 phút.
2. Thoát hẳn app, chờ qua giờ dự kiến, mở lại.
3. Kiểm tra màn lịch quá hạn; chọn hủy hoặc lên lịch lại.
Đạt: không tự gửi bù, không mất job, không gửi trùng.
Trường hợp uncertain/FloodWait được người phát triển test bằng giả lập; không cố gửi nhiều để gây giới hạn thật.

## T13 — Bot opt-in/opt-out (Phase 6)

1. Mở bot thử, bấm Start.
2. Chưa chọn đăng ký: kiểm tra không có opt-in quảng cáo.
3. Chọn nhận nội dung Guest Post; kiểm tra hồ sơ có chủ đề, nguồn và thời điểm.
4. Lên lịch một tin marketing thử, sau đó gửi /stop trước giờ gửi.
5. Kiểm tra job không được gửi.
Đạt: opt-in rõ ràng, /stop tạo loại trừ và chặn tin chưa thực thi.
Không được tự gán opt-in cho hồ sơ từ tìm kiếm/CSV.

## T14 — CRM cơ bản (Phase 6)

1. Gắn nhãn Guest Post, thêm ghi chú và trạng thái Đang tư vấn.
2. Đóng/mở app, lọc theo nhãn và tìm hồ sơ.
Đạt: dữ liệu giữ nguyên và lọc đúng; consent bot và user account không bị trộn.

## T15 — Backup/restore (Phase 7)

1. Tạo backup dữ liệu thử; ghi số liên hệ và nhãn.
2. Thay một ghi chú rồi restore backup.
3. Xác nhận cảnh báo và kiểm tra ghi chú cũ quay lại.
4. Nếu cần, kết nối lại Telegram.
Đạt: restore nhất quán, dữ liệu đúng, secret không nằm trong backup mặc định.
Backup nghiệp vụ vẫn có thể chứa hội thoại; cất ở nơi riêng tư.

## T16 — Nhật ký và lỗi (Phase 7)

1. Vào Nhật ký, lọc lần gửi thất bại/thành công.
2. Xuất log hỗ trợ rồi kiểm tra trước khi chia sẻ.
Đạt: có version, thời gian, mã lỗi, job ID; không có token, OTP, mật khẩu hay session.
Ảnh chụp cần che tên/số điện thoại/người nhận nếu không cần thiết.

## T17 — Bộ cài phát hành và nâng cấp (Phase 7)

1. Dùng máy Windows sạch không có Node/Python/Docker.
2. Cài .exe, chạy T01, T03, T05, T08.
3. Cài nâng cấp từ bản trước, kiểm tra cấu hình và danh bạ còn nguyên.
4. Kiểm tra release có version, ghi chú, checksum và thông tin chữ ký thực tế.
Đạt: dùng được không cần terminal, nâng cấp không xóa dữ liệu; không yêu cầu tắt phần mềm bảo vệ máy.

## Mẫu báo lỗi

- Phiên bản và commit:
- Windows:
- Mã test: Txx
- Các bước đã làm:
- Mong đợi:
- Thực tế:
- Thời điểm và múi giờ:
- Mã lỗi/job ID:
- Ảnh hoặc log đã che bí mật:

## Bảng ghi nghiệm thu

| Test | Version/commit | PASS/FAIL/BLOCKED/NOT RUN | Bằng chứng và ghi chú |
|---|---|---|---|
| T00–T17 (ghi từng test một dòng khi thực hiện) | Chưa có | NOT RUN | Tài liệu kế hoạch, chưa chạy |

CI xanh chỉ xác nhận các check được cấu hình. Test đăng nhập, Telegram thật và bộ cài Windows phải có kết quả riêng.
