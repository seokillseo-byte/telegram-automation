# Phase 1 — Khung ứng dụng và dữ liệu · 0.3.0

## Phạm vi
Theo yêu cầu tạm dừng mở rộng thu thập username, quay lại Phase 1 của Implementation Plan V1. Giữ phần kết nối và nghiên cứu đã có; không bổ sung gửi tin hoặc tăng quy mô tìm kiếm.

- Menu 11 màn: Tổng quan, Tài khoản, Nghiên cứu, Phân tích nhóm/kênh, Danh bạ, Hộp thư, Mẫu tin, Lịch gửi, Nhật ký, Cài đặt, Hướng dẫn.
- Tổng quan có số hồ sơ lưu, lần tìm thành công và báo cáo thật thuộc tài khoản nghiên cứu gần nhất. Không chèn dữ liệu mẫu vào chế độ dùng thật.
- Tài khoản/phiên và nghiên cứu/báo cáo từ bản trước giữ nguyên. Danh bạ dẫn tới hồ sơ nghiên cứu đã lưu; chưa phải đồng bộ danh bạ Telegram đầy đủ.
- Hộp thư và mẫu tin ghi Chưa khả dụng — Phase 4; Lịch gửi ghi Chưa khả dụng — Phase 5. Không có nút gửi giả.
- Cài đặt: múi giờ IANA, giao diện gọn, trang mở đầu. Lưu SQLite và áp dụng sau restart. Thời điểm hiển thị trong nghiên cứu, báo cáo và nhật ký dùng múi giờ chọn. Bảng hoạt động ngày UTC và các cột Excel ghi UTC vẫn giữ UTC.
- Nhật ký: sự kiện theo allowlist và thời điểm; lưu tối đa 1.000, UI/xuất hỗ trợ tối đa 200 gần nhất. Không nhận raw log từ renderer/Telegram, không lưu OTP/token/API Hash/số điện thoại/nội dung hội thoại. Tên sự kiện không hợp lệ thành other. Có lọc mức lỗi/thông tin, làm mới, xuất JSON hỗ trợ, xóa riêng nhật ký.
- SQLite thêm app_settings, app_events, schema_migrations; schema version 3. Không xóa bảng nghiên cứu/báo cáo cũ. Có chặn mở DB phiên bản tương lai để không hạ schema âm thầm.
- Secret store Windows vẫn mã hóa phiên riêng như trước; cài đặt không nhận trường bí mật. Nghiên cứu/ghi chú/nhật ký không mã hóa như phiên.
- Cổng IPC app:action kiểm tra sender và allowlist, không nhận đường dẫn file từ renderer. Xuất nhật ký dùng hộp thoại lưu native.

## Test dễ làm (T01–T02)
1. Đóng ứng dụng cũ, giải nén artifact và cài Telegram-Industry-Research-0.3.0-x64-Setup.exe. Tên Windows có thể còn Telegram Automation Phase 0 để giữ tương thích dữ liệu/phiên.
2. Mở app: phải thấy Tổng quan và menu bên trái, version 0.3.0. Bấm qua đủ 11 menu, không có màn trắng/crash.
3. Vào Hộp thư, Mẫu tin, Lịch gửi: phải ghi chưa khả dụng và phase, chưa có gửi tin thật.
4. Vào Cài đặt → múi giờ UTC → trang mở đầu Tài khoản → chọn Giao diện gọn → Lưu cài đặt.
5. Đóng hẳn và mở lại: phải mở tại Tài khoản, múi giờ và giao diện gọn vẫn giữ. Có thể đổi lại Tổng quan và Việt Nam sau test.
6. Bấm Khôi phục phiên đã lưu. Xác nhận đúng tài khoản; xem hồ sơ/ghi chú/báo cáo cũ vẫn còn.
7. Vào Danh bạ → Mở hồ sơ đã lưu: mở đúng tab Hồ sơ đã lưu trong Nghiên cứu.
8. Vào Nhật ký: phải có sự kiện mở app/cài đặt/kết nối; lọc Lỗi có thể rỗng nếu chưa lỗi. Xuất JSON, mở bằng Notepad để kiểm tra chỉ có version và sự kiện/thời điểm.
9. Xóa nhật ký sau khi đọc xác nhận: chỉ còn sự kiện đánh dấu xóa. Hồ sơ, báo cáo, cài đặt và phiên không bị xóa.
10. Kiểm tra thời điểm trong Nhật ký/Nghiên cứu/Báo cáo đổi theo múi giờ. Bảng ngày UTC giữ nhãn UTC.

## Kiểm chứng phát triển
- pnpm lint: TypeScript typecheck + noUnusedLocals/noUnusedParameters. Đây là kiểm tra bằng compiler, không phải bộ quy tắc ESLint.
- pnpm test: gồm hồi quy các bản trước, cài đặt sau reopen, timezone, từ chối trường bí mật, allowlist log, nâng schema giữ ghi chú và từ chối DB tương lai.
- pnpm build: bundle main/preload/worker/renderer.
- Windows smoke dev + packaged: điều hướng đủ 11 màn, bridge, DPAPI, worker, SQLite/XLSX cũ và cài đặt/nhật ký sau reopen.
- Cần người dùng nghiệm thu bộ cài, phiên thật và T01–T02; CI không tự xác nhận toàn bộ hành vi live Telegram.

## Trạng thái kế hoạch
P1.1–P1.4 đã có implementation và check tự động; nghiệm thu người dùng chờ T01–T02. Không coi Phase 2/4/5 hoàn tất chỉ vì có menu. Những phần nghiên cứu/báo cáo đã làm trước vẫn là phạm vi mở rộng riêng được ghi trong tài liệu các bản 0.1/0.2.
