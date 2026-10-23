# ADR-001 — Nền tảng Phase 0

Trạng thái: đề xuất đã có spike; chưa thông qua cổng Windows/live UAT.

## Quyết định
- Node 24, pnpm workspace với lockfile; Electron 45.0.0, React 19.3.1, TypeScript 5.9.3, esbuild 0.25.12.
- electron-builder 26.15.3, NSIS x64, Windows CI. Chưa ký số; artifact thử nghiệm, không phải release production.
- GramJS telegram 2.26.22 chỉ cho spike; cần chứng minh đăng nhập/search hoạt động với API hiện tại trước Phase 1. Chưa coi SDK là lựa chọn đã chốt dài hạn.
- Bot dùng HTTPS getMe trực tiếp; chưa chạy long polling ở phase này.
- Worker thread giữ kết nối Telegram để tránh block renderer/main. Main kiểm soát IPC và vault; renderer không nhận session.
- safeStorage async trên Windows; từ chối lưu khi không có encryption. Windows dùng DPAPI, không bảo vệ khỏi chương trình độc hại chạy cùng tài khoản Windows.
- SQLite để Phase 1; chưa thêm dependency native trước khi hoàn tất kiểm chứng runtime.

## Rủi ro và đánh đổi
GramJS bản npm 2.26.22 cũ; API Telegram thay đổi có thể làm login/search không tương thích. Không khắc phục bằng dữ liệu giả. Nếu live UAT thất bại, lập ADR thay adapter (đánh giá TDLib hoặc fork được bảo trì), kiểm tra giấy phép và test lại.
Electron làm bộ cài lớn hơn ứng dụng native. Kích thước thực tế ghi trong summary Windows Actions sau build; hiện chưa đo và không đưa số ước lượng thành kết quả.
Bộ cài chưa ký có thể hiện cảnh báo nhà phát hành; không yêu cầu người dùng tắt bảo vệ Windows.

## Giấy phép trực tiếp
Electron MIT; React MIT; TypeScript Apache-2.0; esbuild MIT; electron-builder MIT; GramJS MIT; pnpm MIT. Xác nhận lại metadata và tập hợp notice/transitive license trước phát hành thương mại. Dự án chưa lựa chọn giấy phép phân phối mã nguồn; không tự gán giấy phép dự án.

## Tài liệu đã tham khảo
- https://releases.electronjs.org/
- https://www.electronjs.org/docs/latest/api/safe-storage
- https://www.electronjs.org/docs/latest/tutorial/security
- https://gram.js.org/beta/classes/TelegramClient.html
- https://www.npmjs.com/package/telegram
- https://core.telegram.org/method/contacts.search
- https://core.telegram.org/method/contacts.resolveUsername
- https://core.telegram.org/bots/api#getme
- https://www.electron.build/v26/docs/cli/

## Cổng phê duyệt kỹ thuật
Chỉ đổi trạng thái ADR thành Accepted khi Windows build/smoke + DPAPI roundtrip + live login/restart/getMe/search có bằng chứng. CI không có credential; live UAT do chủ tài khoản thực hiện trên máy riêng.
