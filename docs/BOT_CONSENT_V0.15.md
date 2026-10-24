# P6.2 · Xác nhận chủ đề, /stop và lịch sử đồng ý · 0.15.0

Chỉ triển khai P6.2 theo kế hoạch: xác nhận đăng ký theo chủ đề, hủy đăng ký và lưu consent event. Không thêm CRM, danh sách gửi, chiến dịch hoặc thông báo định kỳ. Các mục đó chưa được triển khai ở bản này.

## Cách hoạt động

- `/start` mở đúng hai chủ đề hiện có: **Cập nhật sản phẩm** và **Hướng dẫn sử dụng**. Chỉ mở menu/chọn chủ đề chưa tạo đăng ký.
- Chọn một chủ đề: bot gửi tin nêu nội dung và hai nút **Xác nhận** / **Hủy yêu cầu này**. Xác nhận có hiệu lực 5 phút, gắn đúng bot, người dùng, chủ đề và tin xác nhận đã gửi thành công. Chọn chủ đề khác sẽ thay yêu cầu đang chờ.
- Chỉ bấm Xác nhận hợp lệ mới lưu đồng ý cho chủ đề đó. Muốn nhận cả hai chủ đề, chọn và xác nhận từng chủ đề riêng.
- Hủy yêu cầu chỉ hủy yêu cầu đang chờ; không rút các đăng ký đã có. `/stop` hoặc nút **Hủy nhận tin (/stop)** hủy tất cả chủ đề của người đó với bot.
- `/stop` được ghi local ngay khi app nhận batch update, trước khi chờ trả lời qua mạng. Các yêu cầu xác nhận cũ bị vô hiệu hóa, kể cả khi bấm lại sau `/stop`. Muốn đăng ký lại phải mở `/start`, chọn chủ đề và xác nhận mới.
- Menu giới thiệu v1 từ 0.14 vẫn chỉ mang tính thông tin, không tự trở thành nút đăng ký sau nâng cấp.

Đồng ý của bot tách riêng với đồng ý tài khoản Telegram cá nhân trong Danh bạ. `/stop` không xóa hồ sơ nghiên cứu hoặc thay quy tắc gửi của tài khoản cá nhân. **Dừng bot** trên desktop chỉ dừng bộ lắng nghe, không phải người dùng hủy đăng ký.

## Lịch sử

Trong **Tài khoản → Bot**, bấm **Xem lịch sử đồng ý (100 mới nhất)**. Bảng theo đúng bot đã kiểm tra, gồm thời gian UTC (hiển thị theo múi giờ cài đặt), ID người dùng, chủ đề, đồng ý/hủy, nguồn và update ID. Nguồn: `bot:confirm_callback`, `bot:/stop`, `bot:stop_button`; purpose chỉ là `bot_topic_updates` cho chủ đề đã xác nhận, không phải đồng ý mọi quảng cáo.

Trạng thái và lịch sử giữ trong SQLite khi đóng/mở app. ID người dùng và metadata đồng ý lưu local plaintext; token vẫn mã hóa DPAPI riêng như bản trước. Không lưu nội dung chat hay tên/username vào lịch sử consent. Đếm người đang đăng ký là số người có ít nhất một chủ đề active; một người nhận hai chủ đề vẫn tính một người.

Bản này nâng DB lên **schema 9**. Cài nâng cấp cùng máy; giữ phiên, lịch, quy tắc và dữ liệu cũ. Không hạ về 0.14 hoặc cũ hơn sau khi mở DB mới.

## Test dễ làm với bot riêng của bạn

1. Cài 0.15 → Tài khoản → Bot → Khôi phục/kiểm tra token → Bật trả lời `/start`.
2. Trong chat riêng với bot gửi `/start`, bấm **Đăng ký: Cập nhật sản phẩm**. Khi chưa bấm Xác nhận, số người đang đăng ký vẫn 0 và chưa có opt-in mới trong lịch sử.
3. Bấm **Xác nhận**. Desktop phải có 1 người/1 chủ đề và một dòng **Đồng ý** đúng ID của bạn. Bấm lại nút cũ không tạo thêm consent event. Đăng ký thêm Hướng dẫn bằng xác nhận mới: 1 người/2 chủ đề.
4. Gửi `/stop`. Phải thành 0 người/0 chủ đề và thêm dòng **Hủy đăng ký · Tất cả**. Bấm lại các nút xác nhận cũ không đăng ký lại.
5. Gửi `/start`, chọn chủ đề, bấm Hủy hoặc chờ hơn 5 phút rồi xác nhận: không có đăng ký mới. Chọn lại và xác nhận mới mới được đăng ký.
6. Đóng/mở app, khôi phục token, xem lịch sử: dữ liệu vẫn giữ; bot không tự bật. Có thể test nút Hủy nhận tin thay cho `/stop`.

App phải đang mở, có mạng và lắng nghe để nhận `/stop`. Nếu app đóng, chỉ xử lý được khi nhận lại update. Opt-out không bị bỏ chỉ vì lệnh cũ hơn 5 phút. Không cần gửi tin quảng cáo để test.

Nếu đã lưu đồng ý/hủy nhưng trả lời xác nhận bị mất mạng, quyết định đã lưu không bị đảo ngược. Update trùng hoặc nút hết hạn/sai người/sai bot/sai tin không tạo consent. Yêu cầu đã chuyển tới Telegram có thể không thu hồi được; không tự gửi lại update chưa rõ kết quả.

## Kiểm chứng phát triển

`pnpm check`: lint/TypeScript, unit/integration và bundle. Test dùng SQLite thật, transport giả: chọn không cấp đồng ý, binding/TTL/nonce một lần, hủy, nhiều chủ đề, /stop ưu tiên trước outbound trong batch, nút cũ sau /stop, tách bot/người dùng/tài khoản, giữ quyết định khi mất ACK và mở lại DB. Windows smoke kiểm tra luồng chọn → xác nhận → lịch sử → /stop → bấm lại nút cũ với runtime/store thật, API giả; marker `BOT_TOPIC_CONSENT_STOP_PASS` ở dev và packaged. Không có token thật hoặc gửi Telegram thật trong CI; vẫn cần nghiệm thu live của người dùng.

Bước kế tiếp trong kế hoạch là P6.3. Bản này dừng ở P6.2.
