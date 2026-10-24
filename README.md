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
