# P5.5 · Đồng ý nhận tin và chặn gửi · 0.13.0

Phạm vi: ghi nhận đồng ý marketing và chặn gửi theo tài khoản + ID/loại người nhận, áp dụng khi tạo lịch và trước mỗi lượt gửi. Một người nhận/lần; không có chiến dịch, gửi hàng loạt, nhập danh sách hay tự thu thập đồng ý. Marketing hiện chỉ hỗ trợ văn bản, không tệp/reply.

## Chức năng

- **Danh bạ** có mục đồng ý/chặn gửi. Chọn loại người nhận, nhập ID số và tên nhận diện; không dùng username làm khóa. Có thể xem ID/loại ở bản Xem trước trong Hộp thư. Hồ sơ nghiên cứu đã lưu vẫn mở được từ Danh bạ.
- **Ghi nhận đồng ý marketing**: cần nguồn đồng ý cụ thể và tick xác nhận đã có sự đồng ý. Tool lưu lời ghi nhận của người dùng, **không xác minh độc lập** người nhận thực sự đồng ý. Việc tìm thấy username, là bạn bè hoặc cùng nhóm không tự cấp đồng ý.
- **Rút đồng ý marketing**: ngăn lịch marketing của đúng người nhận/tài khoản đó. Tin trao đổi cá nhân không tự bị chặn bởi thao tác này.
- **Chặn mọi tin gửi từ tool**: ưu tiên cao nhất, áp dụng cả cá nhân và marketing; đồng thời thu hồi trạng thái đồng ý marketing.
- **Bỏ chặn** chỉ bỏ chặn; không khôi phục đồng ý marketing. Cần ghi nhận lại khi người nhận đã đồng ý lại. Không tự khôi phục lịch đã bị hủy.
- Mọi thay đổi cần nguồn/lý do và xác nhận. Lưu lịch sử UTC, loại sự kiện và nguồn; hiển thị 50 sự kiện gần nhất/người nhận, 200 quy tắc sửa gần nhất. Có thể tra ID để xem quy tắc cũ hơn. Dữ liệu đồng ý/nguồn là SQLite local plaintext, không nằm trong nhật ký hỗ trợ; chỉ lưu thông tin cần thiết.
- Trong ô soạn, chọn mục đích **Trao đổi / hỗ trợ cá nhân** hoặc **Marketing**. Mục đích được ghim vào bản xem trước và lịch. Ứng dụng không phân loại nội dung quảng cáo tự động; phải chọn đúng mục đích, không đổi sang cá nhân để thay thế đồng ý còn thiếu.

## Điểm kiểm tra

| Thời điểm | Cách kiểm tra |
|---|---|
| Xem trước / xuất lịch từ preview | Đọc quy tắc hiện tại cho đúng ID người nhận và mục đích |
| Tạo lịch sau khi mã hóa | Main đọc lại quy tắc trước khi ghi SQLite; rút đồng ý trong lúc mã hóa vẫn chặn |
| Tiếp tục / đổi giờ lịch | Kiểm tra quy tắc hiện tại trước khi cập nhật |
| Mỗi lượt thực thi, sau giải mã | QueueRunner đọc lại; đối chiếu purpose trong payload mã hóa và metadata |
| Trong worker | Kết nối SQLite chỉ đọc, truy vấn mới trước lookup và ngay trước SendMessage; không dùng snapshot consent ở thời điểm tạo lịch |
| Gửi thủ công | Kiểm tra trước gửi, trước upload và sau upload; danh sách chặn vẫn có hiệu lực |

Rút đồng ý/chặn gửi hủy các lịch đang chờ, paused, retry_wait hoặc needs_review tương ứng. Nếu lượt đã chuyển sang worker, ứng dụng dừng worker và đánh dấu **Chưa rõ kết quả**, không tự gửi lại. Yêu cầu đã tới Telegram có thể đã được thực hiện; thay đổi quy tắc không thu hồi tin đã gửi. Nếu đang gửi thủ công cùng người nhận, ứng dụng cũng dừng kết nối và yêu cầu kiểm tra kết quả. Khi cần, vào Tài khoản → Khôi phục phiên.

Không đọc được quy tắc thì chặn gửi (`POLICY_UNAVAILABLE`). Các lỗi `CONSENT_REQUIRED`, `CONSENT_REVOKED`, `RECIPIENT_SUPPRESSED` không được tự retry. Đồng ý thuộc một tài khoản gửi không chuyển sang tài khoản khác hoặc bot khác. Nhóm cơ bản và nhóm lớn/kênh có namespace khác nhau dù cùng số ID.

## Cài và test dễ làm

Cài nâng cấp trên cùng máy/tài khoản Windows. DB lên **schema 7**; các bản cũ sẽ từ chối mở DB mới. Không hạ về 0.12 hoặc cũ hơn, không xóa dữ liệu để chữa lỗi. Phiên, nghiên cứu, mẫu tin và lịch cũ được giữ; lịch cũ mặc định mục đích cá nhân, nhưng danh sách chặn mới vẫn áp dụng.

Chỉ dùng **Saved Messages của chính bạn** để test:

1. Hộp thư → mục đích Cá nhân → soạn `Test P5.5` → Xem trước, ghi ID người nhận và loại `user`.
2. Đổi mục đích Marketing → Xem trước. Khi chưa ghi đồng ý phải báo `CONSENT_REQUIRED`, không có lịch hoặc tin mới.
3. Danh bạ → Cá nhân/bot → nhập ID của bạn và tên → Xem quy tắc. Nhập nguồn `Tự đồng ý gửi kiểm thử vào Saved Messages`, tick xác nhận, bấm Ghi nhận đồng ý marketing và xác nhận.
4. Quay lại Hộp thư, chọn Marketing, Xem trước → hẹn sau 3–5 phút → xác nhận lưu. Lịch hiển thị đúng mục đích Marketing.
5. **Trước giờ hẹn**, vào Danh bạ, xem cùng ID, nhập lý do `Rút đồng ý trong kiểm thử`, bấm Rút đồng ý marketing. Lịch phải chuyển **Đã hủy · CONSENT_REVOKED**; qua giờ không có tin.
6. Ghi nhận đồng ý lại, tạo lịch mới nếu muốn test gửi thành công. Lịch đã hủy không tự chạy lại.
7. Chặn người nhận ID của bạn: cả xem trước Cá nhân lẫn Marketing phải bị chặn. Bỏ chặn: Cá nhân được phép, Marketing vẫn báo `CONSENT_REVOKED` cho đến khi ghi nhận đồng ý lại.
8. Đóng/mở app rồi tra lại ID: quy tắc và lịch sử còn giữ. Không cần gây FloodWait hoặc nhắn người lạ để test.

Ghi nhận đồng ý trong tài khoản người dùng không đăng ký người nhận với bot. V1 này chưa tự nghe `/stop` hoặc sự kiện rút đồng ý qua bot; ghi nhận thủ công trong Danh bạ. P6 sẽ triển khai luồng bot riêng với nguồn/purpose riêng, không tự suy diễn quyền gửi bot từ các bản ghi này.

## Bằng chứng phát triển và nghiệm thu

`pnpm check` chạy lint/TypeScript, unit/integration và bundle. Các test dùng SQLite thật và transport giả để kiểm tra thiếu/rút đồng ý, chặn ưu tiên, bỏ chặn không phục hồi consent, account/peer isolation, nguồn bắt buộc, read-only worker thấy commit mới, rút đồng ý giữa mã hóa/giải mã/lookup/upload, không gửi/không retry khi bị chặn, purpose bị sửa và vô hiệu hóa lượt đang chạy.

Windows smoke dùng UI Electron/preload/DPAPI/SQLite với fixture: chưa có đồng ý bị từ chối, ghi nhận consent, tạo lịch marketing, rút đồng ý hủy lịch, suppress/unsuppress, chặn ghi nhầm tài khoản. Marker `SEND_CONSENT_SUPPRESSION_PASS` ở dev và packaged. Không có credential hay gửi Telegram thật trong CI. Nghiệm thu live P5.5 trên máy người dùng vẫn cần thực hiện trước khi coi toàn Phase 5 được chấp nhận.

Bước tiếp theo theo kế hoạch: **P6.1 — bot /start và lựa chọn đăng ký nhận nội dung**, không mặc định /start là đồng ý mọi quảng cáo.
