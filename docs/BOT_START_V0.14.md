# P6.1 · Bot /start và lựa chọn nội dung · 0.14.0

## Phạm vi

Mục Bot trong **Tài khoản** thay phần kiểm tra getMe đơn thuần bằng: kiểm tra token, xem/sửa lời chào, bật/dừng bộ lắng nghe, khôi phục hoặc xóa token bot. Bot dùng long polling khi app mở và có mạng; không cần localhost, máy chủ hoặc webhook.

Bước này chỉ giới thiệu lựa chọn nội dung. `/start` và việc bấm nút **không tạo đăng ký hoặc đồng ý marketing**. Chưa có subscriber, chiến dịch hoặc gửi thông báo tự động. P6.2 sẽ bổ sung xác nhận opt-in theo chủ đề và /stop lưu consent event riêng cho bot. Không kế thừa consent từ tài khoản Telegram cá nhân.

## Luồng sử dụng

1. Chuẩn bị bot riêng cho tool. Nếu chưa có, mở [BotFather](https://t.me/BotFather), gửi `/newbot` và làm theo hướng dẫn để lấy token. Không dán token vào chat hỗ trợ/GitHub.
2. Cài 0.14.0, vào **Tài khoản → 2. Bot · Giới thiệu và lựa chọn nội dung**. Không cần đăng nhập tài khoản Telegram cá nhân để chạy bot.
3. Nhập token, chọn lưu mã hóa Windows nếu muốn, bấm **Kiểm tra token · chưa bật trả lời**. Bước này chỉ gọi getMe/getWebhookInfo, chưa nhận update hoặc trả lời ai.
4. Kiểm tra đúng `@username` và ID bot. Sửa lời chào nếu cần, bấm **Lưu giới thiệu**. Xem trước luôn có thông báo chưa đăng ký; thông báo này không bị bỏ khi đổi lời chào.
5. Bấm **Bật trả lời /start** và xác nhận. App bắt đầu nhận update; không tự nhắn từ danh sách username hoặc danh bạ.
6. Trong Telegram, mở chat riêng với đúng bot, gửi `/start`. Bot trả lời lời chào và ba nút: **Nội dung: Sản phẩm**, **Nội dung: Hướng dẫn**, **Chưa đăng ký**.
7. Bấm từng nút: bot giải thích lựa chọn bằng thông báo, nói rõ bạn chưa đăng ký. Số người đăng ký được tạo luôn là 0 ở P6.1.
8. Bấm **Dừng bot** để ngừng nhận update/trả lời. Sau khi app mở lại hoặc máy sleep, bot không tự bật: khôi phục/kiểm tra token rồi chủ động bấm Bật trả lời /start.

## Token và dữ liệu

- Mặc định token chỉ ở bộ nhớ. Nếu chọn lưu, token nằm trong `bot-token.enc` bằng Windows DPAPI, riêng với `user-session.enc` của tài khoản Telegram. Không lưu plaintext hoặc hiển thị lại token trong UI/log.
- Bỏ chọn lưu khi kiểm tra một token mới thành công sẽ xóa token bot đã lưu trước đó. Dừng bot không xóa token; **Xóa token bot** dừng, xóa token bot trên máy nhưng giữ phiên tài khoản cá nhân.
- **Khôi phục token bot** chỉ kiểm tra và tải cấu hình, không tự bật trả lời.
- Lời chào, offset và sự kiện xử lý lưu SQLite local theo bot ID. Không lưu ID người tương tác, username, nội dung chat, callback payload hoặc token vào bảng sự kiện giới thiệu. Tối đa 1000 sự kiện gần nhất trên máy; các số đếm không phải CRM/subscriber đầy đủ.
- DB lên **schema 8**; giữ dữ liệu nghiên cứu, mẫu tin, lịch và consent cũ. Không hạ về 0.13 hoặc cũ hơn sau khi mở dữ liệu mới.

## Giới hạn và xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| Bot có webhook | Báo `BOT_WEBHOOK_ACTIVE`, không tự xóa/thay webhook |
| Bot bị nơi khác nhận update bằng polling | Báo `BOT_POLL_CONFLICT`, dừng; dùng bot riêng hoặc dừng nơi kia |
| Mất mạng / token sai | Dừng và hiển thị lỗi an toàn; người dùng chủ động bật lại |
| Telegram yêu cầu chờ | Dừng, hiện thời gian chờ; không tự retry ở mốc hết giờ |
| App đóng/sleep hoặc bấm Dừng | Hủy poll; vô hiệu hóa phản hồi muộn; bot không tự bật khi quay lại |
| Update đã claim nhưng kết quả gửi không rõ | Lưu uncertain, không tự trả lời lại update đó; người dùng có thể gửi một lệnh /start mới |
| Lệnh trong group/kênh, tin chuyển tiếp, bot khác, sai @botname | Bỏ qua |
| Lệnh đã cũ hơn 5 phút khi xử lý | Bỏ qua, không gửi bù hàng loạt lệnh cũ |

Bot chỉ nhận `message` và `callback_query`, xử lý lệnh trực tiếp trong chat riêng và nút thuộc menu của chính bot. `/stop` ở bước này chỉ trả lời rằng chưa có đăng ký/thông báo tự động; chưa phải luồng opt-out có lưu sự kiện của P6.2. Nếu dùng cùng bot với một hệ thống khác, tool có thể tiêu thụ update của hệ thống đó; nên tạo bot riêng.

Offset/claim được lưu **trước** khi chuyển trả lời sang mạng để giảm nguy cơ trả lời trùng sau crash. Đổi lại, gián đoạn có thể khiến một lệnh không có phản hồi; tool không thử lại mù. Dừng không thu hồi được phản hồi đã đến Telegram. Chưa cam kết xử lý mọi trường hợp dài hạn của P6.5, ví dụ thay đổi luồng update sau thời gian bot không hoạt động kéo dài.

## Test dễ làm

- **A — Kiểm tra chưa bật:** nhập token và kiểm tra. Trạng thái phải là Đã kiểm tra, chưa bật trả lời; app không tự gửi lời chào.
- **B — Menu:** bật bot, dùng tài khoản của bạn gửi `/start` trong chat riêng. Phải có đúng một menu cho lệnh này; bấm nút chỉ thấy mô tả và thông báo chưa đăng ký. Không có người đăng ký mới trong Danh bạ tài khoản cá nhân.
- **C — Dừng:** bấm Dừng bot. Gửi `/start` khi bot dừng: app không trả lời lúc dừng. Lệnh mới hơn 5 phút có thể được xử lý nếu bạn chủ động bật lại; lệnh quá cũ bị bỏ qua.
- **D — Lưu/khôi phục:** chọn lưu token khi kiểm tra, đóng/mở app. Khôi phục token: đúng bot nhưng chưa tự bật. Sau đó bấm Bật và gửi /start mới.
- **E — Tách phiên:** đang có phiên tài khoản cá nhân thì Xóa token bot; khôi phục phiên cá nhân vẫn hoạt động.
- **F — Lời chào:** dừng bot, đổi lời chào và lưu, bật lại rồi gửi /start mới. Lời chào đổi, thông báo chưa đăng ký và ba lựa chọn vẫn còn.

Không cần cố tạo FloodWait hoặc nhắn người lạ để test. Nghiệm thu live bot P6.1 trên máy người dùng vẫn cần thực hiện.

## Kiểm chứng phát triển

`pnpm check`: TypeScript/lint, unit/integration, bundle. Test API mock kiểm tra private command, callback, webhook, polling conflict, 429, mất ACK/HTTP 5xx, dừng và phản hồi muộn. SQLite thật kiểm tra claim/offset/dedup, phục hồi và tách bot ID. Vault kiểm tra tách token bot khỏi phiên người dùng.

Windows smoke dùng renderer/preload, runtime/store thật, DPAPI thật và transport giả. Kiểm tra token chưa bật thì không poll/gửi, lưu lời chào, bật menu, update trùng không trả lời trùng, không sinh consent, dừng/khôi phục không tự gửi, xóa token giữ phiên cá nhân. Marker `BOT_START_MENU_UI_PASS` và `BOT_TOKEN_DPAPI_ISOLATION_PASS` ở dev và packaged. CI không giữ token thật và không gửi Telegram thật.

Tham chiếu giao thức: [Bot API: getUpdates](https://core.telegram.org/bots/api#getupdates), [getWebhookInfo](https://core.telegram.org/bots/api#getwebhookinfo), [answerCallbackQuery](https://core.telegram.org/bots/api#answercallbackquery), [Hướng dẫn lấy token chính thức](https://core.telegram.org/bots/tutorial#obtain-your-bot-token).

Bước tiếp theo: **P6.2 — xác nhận opt-in theo chủ đề, /stop opt-out và lưu consent event cho bot**.
