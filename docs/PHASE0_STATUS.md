# Phase 0 — Trạng thái và bằng chứng

Trạng thái: code spike đã triển khai; CHƯA nghiệm thu Phase 0, chưa chuyển Phase 1.

| Task | Hiện trạng | Cổng còn lại |
|---|---|---|
| P0.1 Workspace / phiên bản / lockfile | Đã có pnpm workspace, pin dependency, lockfile; frozen install PASS trên Linux | Xác nhận trên Windows CI |
| P0.2 ADR | ADR-001 đã ghi quyết định dự kiến, license, rủi ro SDK và kích thước | Kích thước thực tế trong Actions summary; SDK chỉ chốt sau live UAT |
| P0.3 Login / restore / bot | Code thật qua worker và getMe | Chủ tài khoản chạy T00 trên Windows; không có credential trong môi trường phát triển |
| P0.4 Search / resolve / errors | Có adapter gọi API thật; kiểm thử offline mapping FloodWait và lỗi | Kiểm chứng kết quả Telegram thật; không cố gây FloodWait |
| P0.5 Mã hóa / đóng gói | Vault fail-closed, Windows DPAPI smoke và NSIS workflow | Chờ Windows run và cài .exe, restart/restore trên máy người dùng |

## Đã chạy trong môi trường phát triển Linux
- pnpm install --frozen-lockfile: PASS.
- TypeScript typecheck: PASS.
- Unit tests: PASS (6 test; không gọi Telegram thật).
- Build renderer / main / preload / worker: PASS.
- git diff --check: PASS.

Unit test vault dùng crypto giả để kiểm tra logic; không được dùng làm bằng chứng DPAPI.
Môi trường hiện tại không có Windows hoặc desktop display để nghiệm thu bộ cài và live login. Kết quả Windows chỉ được ghi sau khi run thực sự hoàn tất.

## Windows CI dự kiến kiểm tra
- Frozen install, typecheck, unit tests, build.
- Mở Electron và xác nhận React render, preload bridge có mặt, renderer không có require.
- DPAPI encrypt → ciphertext không chứa chuỗi test → decrypt đúng → xóa file test.
- Build NSIS x64, checksum SHA-256, kích thước trong summary, upload artifact.

## Cần người dùng nghiệm thu
Theo docs/PHASE0_TEST.md: mở app → login → restart/restore → getMe → resolve/search → logout. Ghi PASS/FAIL/BLOCKED từng mục, không gửi token/OTP.
Bộ cài chưa ký số. GramJS 2.26.22 deprecated; chưa coi adapter đạt cho production trước khi live UAT hoàn tất.
