# P5.4 · Phục hồi hàng đợi · 0.12.0

Phạm vi: lịch văn bản cá nhân một lần đã xác nhận. Không thêm chiến dịch, lịch lặp, tệp/reply hoặc tự đăng nhập lại. P5.3 tiếp tục hoạt động: tối đa 3 lần thử, thời gian chờ theo Telegram, không thử lại mù khi chưa rõ kết quả.

## Khi xảy ra gián đoạn

| Trường hợp | Kết quả |
|---|---|
| Mở lại app sau giờ hẹn | Lịch chưa chạy chuyển `Cần kiểm tra`; không gửi bù |
| App dừng khi bản ghi đang `running` | Khi mở lại chuyển `Chưa rõ kết quả`; không tự gửi lại |
| Sleep/mất kết nối khi đang giải mã, chưa chuyển lượt sang worker | Vô hiệu hóa lượt, chuyển `Cần kiểm tra`, không tính lượt chưa chuyển đi |
| Sleep/mất kết nối khi lượt đã chuyển sang worker | Chuyển `Chưa rõ kết quả`, dừng worker; phản hồi cũ bị bỏ qua |
| Mất mạng/sleep qua giờ hẹn, chưa chạy | Chuyển `Cần kiểm tra`; lịch còn ở tương lai giữ nguyên |
| Đồng hồ hệ thống nhảy hơn 5 giây so với đồng hồ đơn điệu | Dừng lượt hiện tại; tất cả lịch đang chờ cần kiểm tra lại giờ |
| Bộ hẹn giờ bị ngưng trên 5 giây | Dừng lượt hiện tại và đưa các lịch quá giờ sang review |
| Lệnh hết hạn trước khi gửi | Main và worker kiểm tra hạn; lượt không gọi SendMessage chuyển review |

Main kiểm tra tài khoản/kết nối và hạn một lần nữa sau giải mã bất đồng bộ. Worker kiểm tra hạn trước lookup và ngay trước SendMessage. Mỗi lượt có `runId` riêng; kết quả phải khớp cả ID lịch và ID lượt. Payload/peer/randomId vẫn giữ nguyên giữa các retry hợp lệ.

Nếu worker đã nhận lượt, ứng dụng đánh giá bảo thủ: có thể chưa gửi hoặc đã gửi mà chưa lưu ACK. Không thể thu hồi tin đã tới Telegram khi máy vừa gián đoạn. Không cam kết exactly-once trong mọi lỗi truyền tải; không tự retry uncertain nhằm giảm nguy cơ gửi trùng.

Nếu worker bị dừng, người dùng khôi phục phiên trong **Tài khoản**. Không tự nhập OTP hay gửi lại lịch quá giờ. Mất mạng lúc không có lượt đang chạy vẫn có thể được SDK kết nối lại; chỉ lịch còn trong tương lai được chạy tiếp khi đúng tài khoản online.

## Màn hình kiểm tra

Vào **Lịch gửi**:

- Số đếm riêng cho `Cần kiểm tra` và `Chưa rõ kết quả`, theo tài khoản, tính cả bản ghi ngoài 200 dòng đang hiển thị.
- Nút **Chỉ hiện lịch cần kiểm tra**. Tối đa 200 dòng mỗi chế độ, ưu tiên review. Lý do và bước tiếp theo hiển thị ngay tại dòng.
- Lịch chưa chuyển lệnh gửi: **Xem nội dung → Chọn giờ mới → Xác nhận giờ mới**, hoặc **Hủy lịch**. Không tự tạo bản sao.
- Lịch đã có lần thử trước rồi lỡ mốc retry: kiểm tra Telegram, hủy lịch trước khi chủ động tạo lịch khác; không được sửa giờ để vượt giới hạn số lần thử.
- Uncertain: chỉ xem nội dung/lịch sử và kiểm tra hội thoại trên Telegram. Không có nút gửi lại hay đánh dấu “Telegram đã xác nhận” thủ công.

Các phản hồi UI cũ bị bỏ qua khi đổi tài khoản, đổi bộ lọc hoặc rời màn hình. Lịch sử sự kiện giữ mã nguyên nhân, không thêm nội dung tin vào log hỗ trợ. Tiếp tục dùng DB schema 6 và Windows DPAPI của 0.11; không xóa dữ liệu. Không hạ về 0.10 hoặc cũ hơn.

## Test dễ làm trên Windows

Chỉ dùng Saved Messages. Mỗi tin ghi số thứ tự khác nhau để dễ đếm. Không cần gây FloodWait hay gửi liên tục.

1. **Bình thường:** hẹn `P5.4-A` sau 3–5 phút; giữ app/kết nối. Phải có đúng một tin và trạng thái `Telegram đã xác nhận`.
2. **Đóng cưỡng bức trước giờ:** hẹn `P5.4-B` sau 3 phút. Mở Task Manager → chọn ứng dụng Telegram Automation → End task. Chờ qua giờ hẹn, mở lại app và khôi phục phiên. B phải ở `Cần kiểm tra`, không tự gửi. Chọn giờ mới và xác nhận nếu muốn gửi; khi tới giờ chỉ một tin B xuất hiện.
3. **Sleep:** hẹn `P5.4-C`, cho Windows Sleep, bật lại sau giờ hẹn. C phải cần kiểm tra, không gửi bù. Tạo thêm một lịch ở xa hơn để kiểm tra lịch chưa tới giờ vẫn được giữ.
4. **Mất mạng:** hẹn `P5.4-D`, tắt Wi-Fi/ngắt mạng trước giờ hẹn và bật lại sau giờ. D phải cần kiểm tra, không gửi bù. Nếu app báo ngắt phiên, vào Tài khoản → Khôi phục phiên.
5. **Review:** nhấn Chỉ hiện lịch cần kiểm tra, Xem nội dung, kiểm tra người nhận/nội dung/lý do. Hủy một lịch; lịch đó biến mất khỏi bộ lọc. Với lịch chưa thử, chọn giờ mới và xác nhận; không gửi ngay khi vừa lưu.
6. **Gián đoạn đúng lúc chạy:** nếu tự nhiên gặp `Chưa rõ kết quả`, kiểm tra Saved Messages. App không được tự thử lại bản ghi đó sau reconnect/restart. Không cần cố tạo điều kiện này bằng việc gửi dồn.

Không chỉnh đồng hồ Windows để test trên máy làm việc: đã có fake-clock test tự động. Chưa có nghiệm thu live sleep/mất mạng của người dùng cho 0.12.

## Kiểm chứng phát triển

`pnpm check`: TypeScript/lint, unit/integration và build bundle. Các test gọi chính QueueRunner của production với SQLite thật, đồng hồ/kết nối/transport giả: gián đoạn lúc decrypt, gián đoạn sau dispatch, deadline, đổi tài khoản, stale runId, retry cùng payload, lệch đồng hồ, timer stall, review/counts và account isolation. Test crash tạo child process thật, commit claim vào SQLite rồi kill tiến trình, mở DB và recover hai lần để kiểm tra idempotency.

Windows smoke dùng UI Electron, preload, DPAPI và DB thật với fixture; kiểm tra review filter, uncertain không có nút gửi lại, chọn giờ mới và không gửi ngay. Marker `QUEUE_RECOVERY_REVIEW_PASS` phải xuất hiện ở dev và packaged. CI không giữ phiên Telegram và không gửi Telegram thật; không thay thế nghiệm thu sleep/mất mạng trên máy người dùng.

Bước tiếp theo trong kế hoạch: **P5.5 — kiểm tra consent/suppression lúc tạo và lúc gửi**, trước khi triển khai lịch marketing. Phase 5 chưa được coi hoàn tất cho tới khi có nghiệm thu tương ứng.
