# Hộp thư cập nhật trực tiếp — 0.6.0

Bước P4.2: nhận cập nhật, hợp nhất không trùng, đối chiếu sau khi kết nối lại. Không bổ sung gửi tin, kết bạn hoặc tham gia nhóm trong bước này.

## Hành vi

- Sau khi tải danh sách: nhận tin mới ở hội thoại đã tải; cập nhật xem trước. Hội thoại đang mở tự thêm tin mới, sửa hoặc loại bỏ tin bị xóa trong phần đã giữ tạm.
- Không tăng số chưa đọc bằng sự kiện: đây vẫn là số Telegram trả về lúc tải danh sách. Nhãn “Có cập nhật” cho biết cần tải lại để đối chiếu số mới.
- Tin ở hội thoại chưa tải chỉ bật thông báo có cập nhật ngoài danh sách, không đưa nội dung hoặc người gửi vào danh sách. Người dùng bấm Tải lại hội thoại để lấy danh sách gần nhất.
- Nhập `@username` trong ô lọc được chấp nhận, chỉ lọc danh sách đã tải; không phải tìm toàn cục hoặc mở hội thoại người lạ.
- Hợp nhất theo peer và ID; không lặp khi Telegram gửi lại cùng sự kiện. Tin sửa ngoài phần lịch sử đã tải không tự kéo lịch sử cũ vào màn hình.
- Cập nhật đến trong lúc tải snapshot được đệm và áp dụng lại sau phản hồi, tối đa 300 sự kiện. Nếu tràn bộ đệm, yêu cầu tải lại snapshot.
- Theo dõi pts trong phiên để nhận biết một số khoảng trống, cùng tín hiệu TooLong. Khi cần đối chiếu: tải lại 30 hội thoại gần nhất, rồi 30 mục mới nhất của hội thoại đang mở nếu nó có trong trang này. Xóa phân trang cũ; đây không phải đồng bộ toàn bộ lịch sử hoặc triển khai đầy đủ Telegram GetDifference.
- Khi SDK báo kết nối gián đoạn: tạm dừng nút hộp thư. Khi SDK báo phục hồi hoặc người dùng khôi phục lại cùng phiên: nếu hộp thư đã từng tải, tự tải lại trang gần nhất và mở lại hội thoại cũ nếu có ở trang đầu. Tài khoản khác bắt đầu từ hộp thư trống.
- Không hứa tự nối lại mạng trong mọi trường hợp. Nếu SDK chưa phục hồi, dùng Tài khoản → Khôi phục phiên đã lưu.
- Tự đối chiếu không lặp liên tục: cách nhau tối thiểu 10 giây; FloodWait ngăn tự thử trước thời gian server yêu cầu. Lỗi không tự retry mù; có thể cần tải lại thủ công.
- Vẫn giữ tạm tối đa 300 hội thoại/300 mục lịch sử; ngắt/đổi phiên hoặc đóng app xóa nội dung. Không ghi nội dung xuống SQLite/log, không đánh dấu đã đọc, không gửi/tải tệp.

## Test dễ làm trên Windows

1. Cài 0.6.0. Khôi phục phiên, mở Hộp thư, tải hội thoại và chọn một hội thoại thử. Dùng một tài khoản thứ hai gửi tin từ Telegram chính thức.
2. Không bấm tải lại: tin mới phải xuất hiện một lần; xem trước thay đổi, có nhãn “Có cập nhật”. Số chưa đọc ghi rõ “lúc tải”; tải lại danh sách để đối chiếu.
3. Sửa tin rồi xóa tin đó từ tài khoản thử: nội dung trong tool đổi rồi biến mất, không lẫn sang hội thoại khác có cùng ID tin.
4. Bấm Tải tin cũ hơn đúng lúc gửi vài tin thử: danh sách không trùng và vẫn giữ tin mới nhất. Sắp xếp mới nhất trước.
5. Lọc theo `@username` của một hội thoại đã tải: tìm đúng. Người chưa có trong danh sách không được xem như kết quả tìm toàn Telegram.
6. Nhận tin từ hội thoại chưa tải: có thể thấy thông báo ngoài danh sách. Tải lại để lấy hội thoại gần nhất. Không có quét nhóm/thành viên.
7. Tắt rồi bật mạng: trạng thái cập nhật có thể tạm dừng. Nếu SDK phục hồi sẽ đối chiếu phần gần nhất. Nếu chưa phục hồi, vào Tài khoản → Khôi phục phiên đã lưu: hộp thư đã dùng tự tải lại, hội thoại trước mở lại khi nằm ở trang đầu.
8. Hủy / Xóa phiên trên máy: nội dung biến mất. Đăng nhập tài khoản khác không nhận lại nội dung tài khoản trước. Đóng/mở app vẫn phải kết nối và tải lại; không có cache nội dung offline.
9. Kiểm tra nghiên cứu, mẫu tin, cài đặt và xuất Excel cũ vẫn hoạt động.

Không cố gây FloodWait thật. CI dùng giả lập cho lỗi và khoảng trống cập nhật.

## Bằng chứng và giới hạn

`pnpm check`: compiler/lint, tests adapter/reducer, bundle. Test mới gồm update trùng, sửa/xóa, peer namespace, short update, pts gap, buffer replay, lọc @, subscribe/unsubscribe và trạng thái mạng.
Windows Electron + app đóng gói kiểm tra: bridge chưa kết nối, UI dùng fixture chỉ trong `--smoke-test` để nhận tin/sửa/xóa, lọc @, xóa khi ngắt phiên và tự tải lại sau khôi phục. Fixture không phải đăng nhập hoặc nhận tin Telegram thật. Các bước nghiệm thu tài khoản thật ở trên chưa được CI chứng minh.

Nguồn kỹ thuật: https://core.telegram.org/api/updates; https://gram.js.org/beta/classes/TelegramClient.html#addEventHandler. GramJS khóa phiên bản trong pnpm-lock.yaml; SDK không có catch-up đầy đủ, nên dùng snapshot có giới hạn để đối chiếu và ghi rõ phạm vi.

## Bước tiếp theo theo kế hoạch

P4.3: gửi thủ công cho một người nhận hoặc nhóm cụ thể, xem trước người nhận/nội dung, xác nhận rõ; text trước, sau đó ảnh/tài liệu. P4.4 tiếp theo nối reply và mẫu tin vào hộp thư. Danh bạ/liên hệ theo quyền thuộc P3.4; thao tác tham gia nhóm cần xác định rõ, không đồng nghĩa “kết bạn nhóm”. Queue/lịch gửi chỉ ở Phase 5 sau khi gửi trực tiếp được nghiệm thu.
