# Mẫu tin — 0.4.0

Bước triển khai tiếp theo: P4.4 phần thư viện mẫu tin độc lập. Chưa hoàn tất Phase 2–4, chưa có hộp thư, gửi tin hoặc lịch gửi. Không đánh dấu toàn bộ V1 đã hoàn thành.

## Chức năng và phạm vi

- Tạo, sửa, nhân bản, tìm trong tên/nội dung, xóa có xác nhận; tải lại danh sách.
- Tên 1–100 ký tự, nội dung 1–4096 ký tự; tối đa 200 mẫu trên máy, dùng chung các tài khoản.
- Biến: `{{ten}}`, `{{san_pham}}`, `{{cong_ty}}`, `{{lien_ket}}`. Từ chối biến lạ hoặc dấu ngoặc chưa đóng. Xem trước bằng văn bản thuần, giá trị biến không được diễn giải thành HTML hoặc biến lồng nhau.
- Dữ liệu thử để xem trước không lưu cùng mẫu. Trường chưa điền được giữ nguyên biến và có thông báo.
- Lưu SQLite, dùng offline. Nâng schema 3 lên 4 bổ sung bảng, giữ hồ sơ/ghi chú/cấu hình/báo cáo. Phiên đăng nhập giữ riêng.
- Nội dung mẫu không nằm trong nhật ký hỗ trợ; SQLite nội dung không mã hóa. Không lưu bí mật trong mẫu.
- Bản soạn giữ khi chuyển menu trong cùng lần mở ứng dụng; hỏi bỏ thay đổi khi chuyển mẫu. Bản soạn chưa lưu không phục hồi sau khi đóng ứng dụng.

## Test dễ làm trên Windows

1. Cài bản 0.4.0. Không cần đăng nhập; mở Mẫu tin.
2. Tạo tên “Tư vấn”, nội dung “Chào {{ten}}, sản phẩm {{san_pham}} của {{cong_ty}}: {{lien_ket}}”. Điền giá trị xem trước; kiểm tra nội dung thay đúng, không có thao tác gửi.
3. Bấm Lưu; danh sách có một mẫu. Tìm “Tư vấn”; mở Sửa, thay nội dung và lưu. Kiểm tra không tạo thêm bản ghi.
4. Nhân bản, đổi tên và lưu; danh sách có hai mẫu khác ID. Thử đổi mẫu khi đang sửa, chọn Hủy trong hộp hỏi; bản soạn còn nguyên.
5. Thử `{{khong_hop_le}}`, nội dung rỗng và tên trống: không lưu được, không mất bản soạn.
6. Đóng/mở lại: hai mẫu đã lưu vẫn còn. Dữ liệu điền xem trước đã xóa. Hồ sơ/ghi chú/cấu hình cũ và khôi phục phiên còn hoạt động.
7. Xóa một mẫu: chọn Hủy thì còn; xác nhận thì mất; mở lại ứng dụng vẫn đã xóa. Tải lại danh sách và tìm tên đã xóa không có kết quả.
8. Điền giá trị `<script>` hoặc `$& {{ten}}`: xem trước hiển thị nguyên văn, không chạy mã hoặc thay thế lặp.
9. Xuất nhật ký tại Nhật ký: không có nội dung mẫu và giá trị xem trước.

## Bằng chứng kiểm tra

`pnpm check`: compiler/lint, toàn bộ unit/integration tests và bundle. Test mới kiểm tra biến sai, thay giá trị nguyên văn, thiếu biến, migration từ schema 3, CRUD/nhân bản/reopen, giới hạn 200 và nhật ký không chứa nội dung.
Windows CI còn chạy ứng dụng Electron thật và bản đã đóng gói: tạo mẫu qua giao diện, kiểm tra preview, lưu qua IPC và xóa; kiểm tra SQLite mở lại, navigation, DPAPI, worker và export Excel của module cũ.
Kiểm tra tự động không thay thế các bước nghiệm thu thủ công ở trên hoặc xác minh gửi/nhận Telegram thật.
