# Telegram Automation

Ứng dụng Windows quản lý Telegram, giao diện tiếng Việt.

## Hiện trạng
Phase 0 có mã nguồn spike: đăng nhập tài khoản, lưu/khôi phục phiên mã hóa Windows, kiểm tra bot getMe, thử resolve/search username. Chưa có hộp thư, lưu danh bạ, gửi tin hoặc automation V1.

- [Implementation Plan V1](docs/IMPLEMENTATION_PLAN_V1.md)
- [Test Phase 0 và cách tải bộ cài](docs/PHASE0_TEST.md)
- [Bằng chứng và trạng thái Phase 0](docs/PHASE0_STATUS.md)
- [ADR-001](docs/adr/ADR-001-phase0-stack.md)
- [Hướng dẫn nghiệm thu V1](docs/TEST_GUIDE_V1.md)

## Phát triển
Node 24, pnpm 11.25.0. Chạy lần lượt:

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm desktop:dev
```

Build trên Windows: `pnpm dist:win`. Bộ cài tải trong Actions → Phase 0 Windows → Artifacts sau khi run xanh.
Không commit credential, session hoặc dữ liệu tài khoản thật. Kiểm chứng live thực hiện trên máy chủ tài khoản; CI không giữ token/OTP.

## Module Nghiên cứu ngành 0.1.0
[Hướng dẫn tính năng và nghiệm thu](docs/INDUSTRY_RESEARCH_V0.1.md): phân nguồn, lọc, lưu SQLite, ghi chú, so sánh, xuất Excel/CSV. Không có lặp truy vấn tự động hoặc gửi tin. Tải artifact Telegram-Industry-Research-Windows-x64 từ Windows Desktop Actions trên nhánh industry-research-v0.1.

## Phân tích nhóm/kênh 0.2.0
[Hướng dẫn module](docs/GROUP_CHANNEL_ANALYSIS_V0.2.md): thông tin công khai, mẫu tối đa 100 mục lịch sử, hoạt động ngày UTC, tương tác có dữ liệu, tần suất từ và báo cáo Excel. Không lấy danh sách thành viên hoặc username người gửi. Build trên nhánh group-channel-analysis-v0.2.

## Phase 1 — 0.3.0
[Khung ứng dụng và hướng dẫn T01–T02](docs/PHASE1_FOUNDATION.md): menu đầy đủ, tổng quan dữ liệu thật, cài đặt có lưu, nhật ký không chứa bí mật, SQLite schema migration. Hộp thư/mẫu tin/lịch gửi có nhãn chưa khả dụng. Nhánh phase-1-app-foundation.

## Mẫu tin 0.4.0

Thư viện mẫu tin dùng offline: tạo/sửa/nhân bản/tìm/xóa, xem trước biến và lưu SQLite. Chưa có gửi tin. Xem [hướng dẫn và nghiệm thu](docs/MESSAGE_TEMPLATES_V0.4.md).

## Hộp thư chỉ đọc 0.5.0

Danh sách hội thoại và lịch sử có phân trang, lọc danh sách đã tải, giữ tạm trong bộ nhớ. Chưa gửi tin, tải tệp hoặc cập nhật thời gian thực. Xem [hướng dẫn và nghiệm thu](docs/INBOX_READ_V0.5.md).

## Hộp thư cập nhật trực tiếp 0.6.0

Nhận cập nhật cho hội thoại đã tải, hợp nhất tin mới/sửa/xóa, đối chiếu snapshot gần nhất khi khôi phục kết nối, sửa lọc @username. Chưa có gửi tin. Xem [hướng dẫn nghiệm thu](docs/INBOX_LIVE_V0.6.md).

## Gửi thủ công P4.3 — 0.7.0

Saved Messages, hội thoại hoặc username chính xác; text, ảnh/tài liệu có preview và xác nhận một lần. Lỗi giữ bản soạn, uncertain không tự gửi lại. Xem [hướng dẫn test](docs/MANUAL_SEND_V0.7.md).

## Reply và mẫu tin P4.4 — 0.8.0

Trả lời tin đã tải trong đúng hội thoại; dùng mẫu đã lưu và điền biến trong Composer. Vẫn phải preview/confirm; kiểm tra tin gốc xóa/sửa trước dispatch. Xem [hướng dẫn nghiệm thu](docs/REPLY_TEMPLATES_V0.8.md).

## Quyền và lỗi gửi P4.5 — 0.9.0

Kiểm tra quyền theo người nhận và loại nội dung, giữ trạng thái chưa xác định khi thiếu dữ liệu; mã/hướng xử lý lỗi và FloodWait đếm ngược không tự retry. Xem [hướng dẫn nghiệm thu](docs/SEND_RIGHTS_V0.9.md).

## Lịch văn bản một lần — 0.10.0

Bước đầu Phase 5: xác nhận lịch từ preview, lưu SQLite với payload mã hóa Windows, pause/resume/cancel và review lịch lỡ giờ. App cần mở và kết nối đúng tài khoản. Chưa có tự retry/lịch media/reply/marketing. Xem [hướng dẫn nghiệm thu](docs/ONE_TIME_QUEUE_V0.10.md).

## P5.3 · Thử lại có phân loại · 0.11.0
[Hướng dẫn và test](docs/QUEUE_RETRY_V0.11.md): tối đa 3 lần thử cho lịch văn bản cá nhân, chờ theo Telegram, lưu thời điểm thử lại, tạm dừng/hủy. Không tự thử lại khi chưa rõ kết quả gửi. Build nhánh `queue-retry-v0.11`; schema 6 không hạ về phiên bản cũ.
