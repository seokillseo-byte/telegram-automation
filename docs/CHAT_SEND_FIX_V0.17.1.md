# Nút gửi tin · 0.17.1

Bản 0.17.0 đặt nút Xem trước ở ô soạn; nút xác nhận nằm phía dưới trong vùng cuộn khiến người dùng khó thấy cách gửi.

Bản sửa đổi nút chính thành **Gửi tin…**. Nhấn sẽ mở cửa sổ kiểm tra người nhận/nội dung, với **Xác nhận gửi** và **Quay lại sửa** ở phía trên, giữ thấy được khi cuộn. Bấm Gửi tin… chưa gửi tới Telegram. Hẹn giờ vẫn nằm trong cửa sổ kiểm tra. Không đổi backend, dữ liệu/schema 9 hoặc thêm tính năng khác.

Test: chọn hội thoại hoặc Saved Messages → nhập nội dung → Gửi tin… → kiểm tra đúng người nhận/nội dung → Xác nhận gửi → kiểm tra tin trên Telegram. Quay lại sửa/Escape trước khi gửi giữ bản soạn. Khi đang xử lý, nút bị khóa để tránh thao tác lặp.

`pnpm check` và Windows dev/packaged smoke kiểm tra cửa sổ mở, nút Xác nhận gửi nằm trong màn hình, nhấn lặp chỉ gửi một lần; giữ kiểm tra reply/mẫu/hẹn giờ hiện có. Test tự động dùng fixture, cần UAT Telegram thật.
