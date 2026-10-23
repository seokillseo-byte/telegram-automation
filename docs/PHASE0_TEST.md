# Phase 0 — Test bản thử nghiệm

## Tải trên GitHub
1. Mở repository → Actions → **Phase 0 Windows**.
2. Chọn run đúng branch/commit. Chờ job xanh.
3. Trong Artifacts tải **Telegram-Automation-Phase0-Windows-x64**, giải nén ZIP.
4. Cài file **Telegram-Automation-Phase0-0.0.1-x64-Setup.exe**. Không cần Node/Python/Docker.
Nếu chưa có artifact hoặc workflow đỏ: gửi link run, chưa coi là build thành công. Artifact có thời hạn 14 ngày và có thể cần đăng nhập GitHub.

## A. Mở ứng dụng và mã hóa
- Mở app, phải thấy tiêu đề Phase 0 và ba khu vực kiểm chứng.
- Dòng Mã hóa Windows phải là Sẵn sàng; nếu không, không cố đăng nhập.
- Windows CI kiểm chứng roundtrip safeStorage thật; UAT kiểm chứng phiên sau restart.

## B. Tài khoản thật
1. Lấy API ID/API Hash của bạn tại https://my.telegram.org → API development tools. Không gửi hai giá trị này lên issue/chat.
2. Nhập API ID, API Hash, điện thoại dạng +84… rồi Bắt đầu đăng nhập.
3. Nhập mã theo kênh Telegram chỉ định. Nếu có 2FA, nhập mật khẩu trong bước tiếp theo.
4. Kết nối thành công phải thấy đúng tên, ID và trạng thái phiên đã lưu mã hóa.
5. Đóng hẳn rồi mở lại; bấm **Khôi phục phiên đã lưu**. Phải nhận diện cùng tài khoản mà không hỏi OTP.
6. Đăng xuất Telegram khi còn kết nối để thu hồi phiên; mở lại rồi khôi phục phải báo chưa có phiên.
**Hủy / Xóa phiên trên máy** chỉ xóa local, không hứa thu hồi phiên từ xa. Có thể thu hồi tại Telegram chính thức → Settings → Devices.
Không có tính năng tự đăng nhập nền ở spike: bước khôi phục chủ động giúp dễ nghiệm thu.

## C. Bot
1. Tạo bot thử qua BotFather trong Telegram chính thức.
2. Dán token vào vùng Bot và bấm Kiểm tra bot.
3. Phải hiện đúng tên/ID/username bot. Token không lưu, cần nhập lại ở lần kiểm tra sau.
4. Token sai phải báo lỗi, không hiện thành công. Spike không thay webhook và không gửi tin.

## D. Tìm kiếm
1. Khôi phục/đăng nhập tài khoản người dùng trước.
2. Nhập username công khai bạn biết, bật Tra username chính xác và tìm.
3. Thử từ khóa seo với checkbox tắt.
4. Chấp nhận kết quả Telegram trả về hoặc lỗi rõ ràng; không yêu cầu đủ mọi username.
5. Không có nút xuất/thu gom/gửi tin trong spike.

## E. Bảo vệ bí mật
Không chia sẻ file user-session.enc. Kiểm tra file được lưu mã hóa không có nghĩa an toàn trước mã độc cùng tài khoản Windows.
Không chụp màn hình OTP, API Hash, token. Nếu báo lỗi chỉ gửi mã lỗi, phiên bản và link run.
Mất mạng/OTP sai/hết hạn có thể yêu cầu bấm Hủy rồi bắt đầu lại. Lỗi chưa phân loại hiện TELEGRAM_ERROR, không phát nội dung lỗi raw có thể chứa bí mật.

## Mẫu kết quả T00
- Windows / version app / commit:
- Mở app: PASS/FAIL
- Mã hóa Windows: PASS/FAIL
- Đăng nhập + 2FA (nếu có): PASS/FAIL/BLOCKED
- Restart + khôi phục: PASS/FAIL
- Logout + xóa phiên: PASS/FAIL
- Bot getMe: PASS/FAIL
- Resolve username: PASS/FAIL
- Search từ khóa: PASS/FAIL
- Mã lỗi (không chứa bí mật):

## Lệnh cho lập trình viên
Node 24 và pnpm 11.25.0:
- pnpm install --frozen-lockfile
- pnpm check
- pnpm desktop:dev
- pnpm smoke (cần desktop Windows hoặc môi trường Electron có display)
- pnpm dist:win (trên Windows)

Bản Linux không được cho phép lưu phiên trong spike Windows này. Không chạy bằng --no-sandbox để né lỗi môi trường.
