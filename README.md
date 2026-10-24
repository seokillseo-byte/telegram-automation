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
