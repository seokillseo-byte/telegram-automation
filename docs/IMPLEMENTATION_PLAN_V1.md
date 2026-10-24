# Implementation Plan V1 — Telegram Automation

Ngày: 23/10/2026. Trạng thái: kế hoạch triển khai, chưa có code ứng dụng hoặc kết quả test.
Repository: https://github.com/seokillseo-byte/telegram-automation

## 1. Mục tiêu và phạm vi

Ứng dụng Windows x64, giao diện tiếng Việt, cài bằng .exe, không yêu cầu người dùng chạy Node, Python, Docker hoặc mở localhost.
V1 vận hành một tài khoản người dùng Telegram và một bot độc lập; mô hình dữ liệu có account_id để mở rộng nhiều tài khoản sau này.
Luồng chính: cài đặt → kết nối → tìm username → lưu kết quả → quản lý liên hệ → hộp thư → gửi thử → lên lịch → theo dõi kết quả.

Bao gồm:
- Đăng nhập tài khoản người dùng, xác minh mã/2FA khi được yêu cầu; kết nối bot bằng token.
- Tìm username chính xác hoặc theo từ khóa, lọc kết quả công khai Telegram trả về, lưu và xuất CSV.
- Danh sách nghiên cứu, danh bạ và trạng thái đồng ý nhận tin tách biệt.
- Hộp thư cá nhân, nhóm/kênh theo quyền; văn bản, ảnh và tài liệu.
- Mẫu tin, lịch gửi một lần, hàng đợi bền vững và nhật ký.
- Bot nhận đăng ký/hủy nhận tin và gửi thông báo cho người đủ điều kiện.
- Backup dữ liệu nghiệp vụ, khôi phục, bộ cài và GitHub Releases.

Không thuộc V1:
- Cam kết tìm mọi username chứa từ khóa, quét toàn bộ Telegram hoặc suy đoán số điện thoại.
- Thu gom người lạ rồi gửi quảng cáo hàng loạt; tự thêm người hàng loạt vào nhóm; vượt giới hạn bằng xoay tài khoản/proxy.
- Chiến dịch nhiều bước, CRM bán hàng đầy đủ, AI, workflow kéo thả, cộng tác nhiều nhân viên.
- Cuộc gọi, secret chat, Stories, thanh toán, kiểm duyệt nhóm nâng cao, tự cập nhật ứng dụng.
- Gửi theo lịch khi máy tắt/ứng dụng đóng: cần hạ tầng chạy liên tục ở phiên bản khác.

## 2. Kiến trúc dự kiến và quyết định kỹ thuật

Đề xuất Electron + React + TypeScript, SQLite local, electron-builder tạo NSIS .exe trên GitHub Actions Windows.
Lý do: UI và tầng điều phối dùng TypeScript; đóng gói runtime cho người dùng Windows; không phụ thuộc terminal khi sử dụng.
Adapter tài khoản người dùng dự kiến dùng GramJS (MTProto); adapter bot dùng Telegram Bot API qua long polling.
Đây là quyết định dự kiến: Phase 0 phải xác minh tương thích, giấy phép, bảo trì, đăng nhập và đóng gói trên Windows trước khi khóa phiên bản. Nếu không đạt, ghi ADR thay thế trước Phase 1.

Ranh giới:
- Renderer không giữ token/session, không gọi Telegram trực tiếp.
- Main process xác thực IPC, quản lý SQLite, bí mật, tác vụ và lifecycle.
- Telegram chạy trong worker/process phù hợp để tránh treo giao diện.
- contextIsolation bật, nodeIntegration tắt, sandbox bật khi khả thi; allowlist IPC, CSP, kiểm tra đường dẫn file và URL ngoài.
- Không có HTTP server công khai. Adapter dùng kết nối outbound.
- Session, api_hash, token mã hóa bằng cơ chế Windows được kiểm tra thực tế; không chấp nhận fallback lưu plaintext.
- Người dùng tự nhập api_id/api_hash của ứng dụng Telegram; không commit credential dùng chung.
- Không gửi mã OTP, mật khẩu 2FA hoặc session vào log, analytics hoặc GitHub.

Cấu trúc đề xuất:
- apps/desktop/src/renderer: UI.
- apps/desktop/src/main: IPC, repositories, queue, secrets.
- packages/telegram-user: adapter MTProto.
- packages/telegram-bot: Bot API adapter.
- packages/shared: DTO, validation, error codes.
- docs: kế hoạch, test, ADR, release notes.
- .github/workflows: kiểm tra, build Windows, release.

Hợp đồng adapter: connect, disconnect, getCapabilities, getIdentity, searchPublic, resolveUsername, listDialogs, listMessages, sendMessage, sendAttachment, subscribeUpdates.
Bot trả unsupported cho thao tác không được hỗ trợ. Bot không thay thế tìm kiếm toàn cục hay đọc hộp thư cá nhân.
Mỗi chức năng UI phải dựa trên capability, không dùng dữ liệu giả để báo thành công.

## 3. Mô hình dữ liệu tối thiểu

| Bảng | Trường/điều kiện chính |
|---|---|
| accounts | id, kind(user/bot), telegram_id(TEXT), display_name, secret_ref, connection_state |
| peers | id, account_id, telegram_id(TEXT), type, username nullable, display_name, last_seen_at; unique(account_id, telegram_id) |
| search_runs | id, account_id, query, status, started_at, completed_at, error_code |
| search_results | run_id, peer_id, discovered_at; unique(run_id, peer_id) |
| contacts | id, account_id, peer_id, notes, tags, source; unique(account_id, peer_id) |
| consent_events | id, account_id, peer_id, purpose, event(opt_in/opt_out), source, occurred_at |
| suppressions | account_id, peer_id, reason, created_at; unique(account_id, peer_id) |
| dialogs/messages | account_id, peer_id, remote_message_id, direction, body, timestamps, status; remote ID unique trong phạm vi peer |
| templates | id, name, body, allowed_variables, updated_at |
| jobs | id, account_id, peer_id, transport, purpose, payload, scheduled_at_utc, state, attempt, next_attempt_at, dedupe_key, remote_id |
| job_events | id, job_id, previous_state, next_state, reason, created_at |
| settings | key, value; không chứa bí mật plaintext |
| schema_migrations | version, applied_at |

ID Telegram lưu dạng chuỗi để tránh mất chính xác số nguyên JavaScript.
Username có thể đổi hoặc trống; ID là định danh chính. Thông tin phục vụ truy cập peer phải giữ trong cache phiên/adapter bảo vệ phù hợp; CSV username không đủ để bảo đảm gửi được.
Lưu UTC; hiển thị theo múi giờ IANA cấu hình, mặc định Asia/Ho_Chi_Minh.
Không lưu OTP/2FA. Lịch sử tin chỉ đồng bộ phạm vi cần thiết; cho phép xóa dữ liệu local.

## 4. Quy tắc gửi và trạng thái

Search result không tự trở thành subscriber. Tin marketing chỉ được tạo/gửi khi có opt-in phù hợp và không nằm trong suppression.
Đánh giá lại điều kiện ngay lúc thực thi, không chỉ lúc tạo lịch. Thêm danh bạ không đồng nghĩa với đồng ý quảng cáo.
Tin hỗ trợ do người dùng chủ động soạn phải chọn người nhận cụ thể và xác nhận; không có nút gửi quảng cáo toàn bộ kết quả tìm kiếm.

Job: pending → running → sent / failed / uncertain.
pending hoặc retry_wait có thể → paused / cancelled; running không được hứa hủy nếu request đã gửi.
Lỗi thời gian chờ → retry_wait theo thời điểm server yêu cầu; lỗi quyền → failed; mất phản hồi sau gửi → uncertain.
Không tự gửi lại job uncertain: đối soát bằng ID/idempotency của transport nếu có; nếu chưa rõ, yêu cầu kiểm tra thủ công.
SQLite transaction claim job, một dispatcher/account, chống thực thi trùng khi khởi động lại.
Không tự gửi bù lịch quá hạn khi mở lại: đánh dấu needs_review, cho người dùng quyết định.
App cần mở, máy có mạng; Windows sleep/đóng ứng dụng sẽ làm ngừng tác vụ.

## 5. Phase/Task và nghiệm thu

Mỗi phase có PR riêng, cập nhật test guide và ghi PASS/FAIL/BLOCKED kèm bằng chứng.
Phase 0 đang triển khai: xem PHASE0_STATUS.md để biết bằng chứng và các cổng chưa đạt. Phase 1–7: TODO. Hoàn thành tài liệu hoặc CI xanh không đồng nghĩa nghiệm thu kết nối thật đã hoàn thành.

### Phase 0 — Xác minh nền tảng
Phụ thuộc: không.
- P0.1 Tạo workspace pnpm, chọn phiên bản Node/Electron/SDK và commit lockfile sau kiểm tra nguồn chính thức.
- P0.2 Ghi ADR-001 về framework, adapter, storage, giấy phép và kích thước bộ cài.
- P0.3 Spike trên Windows: mở app, kết nối tài khoản thử, restart và khôi phục phiên; spike bot getMe.
- P0.4 Xác minh public search, resolve username, FloodWait/error mapping và khả năng adapter; không tải danh sách hàng loạt.
- P0.5 Xác minh mã hóa phiên và đóng gói bộ cài.
Nghiệm thu: có kết quả spike thật, phiên không plaintext, app khởi động trên Windows; ghi rõ blocker và quyết định. Không chuyển Phase 1 nếu adapter/packaging chưa chứng minh được.
Test người dùng: T00.

### Phase 1 — Khung ứng dụng và dữ liệu
Phụ thuộc: Phase 0.
- P1.1 Màn Tổng quan, Tài khoản, Tìm kiếm, Danh bạ, Hộp thư, Mẫu tin, Lịch gửi, Nhật ký, Cài đặt, Hướng dẫn.
- P1.2 SQLite migrations, repositories, đường dẫn AppData; dữ liệu mẫu chỉ trong chế độ demo có nhãn rõ.
- P1.3 Secret store, IPC validation, xử lý lỗi và log đã che bí mật.
- P1.4 CI lint/typecheck/unit test/build; Windows smoke và gói preview.
Nghiệm thu: mở app không trắng, điều hướng được, settings giữ sau restart, migration không xóa dữ liệu; chức năng chưa làm có nhãn chưa khả dụng.
Test: T01–T02.

### Phase 2 — Kết nối Telegram thật
Phụ thuộc: Phase 1.
- P2.1 Form api_id/api_hash, điện thoại, mã xác minh và 2FA.
- P2.2 State machine đăng nhập: disconnected, connecting, awaiting_code, awaiting_password, connected, error; xử lý mã hết hạn và yêu cầu chờ.
- P2.3 Khôi phục phiên, mất mạng, reconnect, logout và xóa session local.
- P2.4 Kết nối bot, getMe, long polling lưu offset, một poller/token; hướng dẫn xử lý xung đột webhook/poller mà không tự xóa cấu hình bên ngoài.
- P2.5 Capability UI và ánh xạ lỗi tiếng Việt.
Nghiệm thu: hiển thị đúng danh tính, restart giữ phiên, logout không tự kết nối lại; bot token sai báo lỗi; bot không hiện chức năng user-only.
Test: T03–T04.

### Phase 3 — Tìm kiếm và danh bạ
Phụ thuộc: Phase 2.
- P3.1 Resolve username chính xác và tìm theo từ khóa do người dùng nhập.
- P3.2 Hiển thị kết quả thực, loại peer, trạng thái rỗng/lỗi/giới hạn; hủy không phát sinh request tiếp theo.
- P3.3 Lọc substring cục bộ, loại trùng ID, lịch sử tìm kiếm và nguồn.
- P3.4 Lưu hồ sơ nghiên cứu, thêm danh bạ có xác nhận, tag/ghi chú; không tự gán opt-in.
- P3.5 CSV UTF-8, nhập có preview/validation/loại trùng; chống formula injection khi xuất.
Nghiệm thu: không hứa toàn bộ kết quả, không mở rộng/quét từ khóa tự động; tìm lặp không tạo liên hệ trùng; lỗi server không hiện như kết quả rỗng thành công.
Test: T05–T07.

### Phase 4 — Hộp thư và gửi thủ công
Phụ thuộc: Phase 3.
- P4.1 Đồng bộ danh sách hội thoại và phân trang tin; chỉ cache phạm vi cấu hình.
- P4.2 Nhận cập nhật và hợp nhất không trùng; tải lại khi reconnect.
- P4.3 Gửi text, ảnh, tài liệu; xem trước người nhận, nội dung, kích thước file.
- P4.4 Reply và mẫu tin; giữ bản soạn nếu gửi lỗi.
- P4.5 Capability và kiểm tra quyền nhóm/kênh; lỗi gửi hiển thị chính xác.
Nghiệm thu: người nhận thử nhận đúng nội dung một lần; trạng thái sent chỉ khi có xác nhận API, không coi đó là đã đọc; không gửi khi chỉ mở preview.
Test: T08–T09.

### Phase 5 — Lịch gửi và hàng đợi
Phụ thuộc: Phase 4.
- P5.1 Lịch gửi một lần, múi giờ, preview và xác nhận.
- P5.2 SQLite durable jobs, transactional claim, dedupe và trạng thái theo mục 4.
- P5.3 Pause/resume/cancel, retry có phân loại, FloodWait; không xoay tài khoản để né giới hạn.
- P5.4 Recovery sau crash/sleep/restart và màn review lịch quá hạn/uncertain.
- P5.5 Consent/suppression check lúc tạo và lúc gửi marketing.
Nghiệm thu: pause/cancel trước dispatch không gửi; restart không tạo trùng; uncertain không retry mù; rút đồng ý sau khi lập lịch vẫn chặn gửi.
Test: T10–T12.

### Phase 6 — Bot đăng ký và CRM cơ bản
Phụ thuộc: Phase 5.
- P6.1 /start hiển thị lựa chọn đăng ký nhận nội dung; không mặc định /start là đồng ý mọi quảng cáo.
- P6.2 Nút opt-in theo chủ đề, /stop opt-out, xác nhận và lưu consent event.
- P6.3 Danh bạ nhãn nhu cầu, ghi chú, trạng thái tư vấn đơn giản.
- P6.4 Thông báo cho subscriber đủ điều kiện qua queue; lưu source và purpose.
- P6.5 Xử lý bot bị chặn, người nhận hủy đăng ký, update trùng.
Nghiệm thu: /stop có hiệu lực ngay tại xử lý local và chặn job chưa gửi; chỉ tìm username không khiến bot nhắn được; opt-in user account không tự suy thành quyền bot gửi.
Test: T13–T14.

### Phase 7 — Backup, QA và phát hành V1
Phụ thuộc: Phase 6.
- P7.1 Backup nhất quán SQLite; loại session/token/credential khỏi backup mặc định; cho biết dữ liệu hội thoại có thể nhạy cảm.
- P7.2 Restore kiểm tra phiên bản/schema và tạo bản sao trước thay thế; chỉ thực hiện khi worker đã dừng.
- P7.3 Windows CI build/test, NSIS, checksum SHA-256, version và release notes.
- P7.4 Release theo tag v1.0.0; artifact preview ở các phase trước; chữ ký số nếu chưa có phải ghi rõ thực trạng.
- P7.5 UAT trên Windows sạch không có Node/Python; nâng cấp giữ dữ liệu; gỡ cài đặt giải thích giữ/xóa dữ liệu.
Nghiệm thu: toàn bộ test bắt buộc PASS, không có lỗi nghiêm trọng chưa xử lý; có link .exe/checksum và hướng dẫn; nếu chưa kiểm thử Windows thật thì chưa gọi production-ready.
Test: T15–T17 và chạy lại T03, T05, T08, T10, T13.

## 6. Chiến lược test cho lập trình viên

- Unit: consent/suppression, normalize username, ID strings, CSV escaping, timezone, error classifier.
- Integration SQLite: migrations trên DB cũ, unique constraints, atomic claim, restart recovery, restore.
- Contract adapter bằng fake: mất mạng, rate limit, quyền bị từ chối, timeout sau gửi; CI không cần tài khoản Telegram thật.
- Electron smoke/E2E: app start, navigation, form validation, settings persistence, IPC rejection.
- Live test thủ công: tài khoản của chủ dự án, Saved Messages và nhóm thử riêng; bot thử riêng. Không cố gây FloodWait thật; dùng fault injection trong bản dev.
- Windows build và live Telegram là hai bằng chứng khác nhau; CI xanh không chứng minh OTP, tìm kiếm và gửi thực tế đã PASS.

## 7. Quy tắc phát triển và bàn giao

Một PR/phase; PR lớn tách task nhưng giữ thứ tự phụ thuộc. Mỗi PR ghi thay đổi, test đã chạy, test chưa chạy và hướng dẫn test đúng phiên bản.
Chỉ merge sau các check bắt buộc; phát hành chỉ từ commit đã kiểm tra.
Không commit .env, AppData, SQLite thật, session, token, số điện thoại hoặc ảnh chụp chứa mã.
Nếu tính năng bị Telegram hạn chế: hiển thị lỗi rõ, ghi limitation và cập nhật tiêu chí; không giả lập thành công.
Bàn giao mỗi phase: mã nguồn, PR/commit, artifact Windows khi có, release notes, checklist và bằng chứng.
V1 chỉ hoàn tất khi người dùng đi hết luồng chính trên bộ cài và dữ liệu còn đúng sau restart.

## 8. Nguồn kỹ thuật cần đọc lại khi triển khai

- https://core.telegram.org/api/obtaining_api_id
- https://core.telegram.org/api/auth
- https://core.telegram.org/method/contacts.search
- https://core.telegram.org/method/contacts.resolveUsername
- https://core.telegram.org/bots/api
- https://core.telegram.org/bots/faq
- https://telegram.org/faq_spam
- https://www.electronjs.org/docs/latest/tutorial/security
- https://www.electronjs.org/docs/latest/api/safe-storage

Các liên kết là tài liệu tham chiếu cho implementation; chưa phải xác nhận mọi SDK/cấu hình trong kế hoạch đã được kiểm chứng.

## Điều chỉnh phạm vi theo yêu cầu nghiên cứu ngành
Bản 0.1.0 đưa một phần SQLite và tìm kiếm/lưu/xuất của Phase 1/3 lên trước, dựa trên Phase 0 đã có đăng nhập/khôi phục/tìm kiếm thật do người dùng kiểm tra. Không bao gồm campaign hoặc gửi tin. Xem INDUSTRY_RESEARCH_V0.1.md để biết tiêu chí và giới hạn; không coi toàn bộ Phase 1–3 đã hoàn thành.

## Module phân tích nhóm/kênh công khai 0.2.0
Theo phạm vi được người dùng chấp nhận: bổ sung thống kê nhóm/kênh ở cấp tổng hợp, mẫu tối đa 100 mục lịch sử, lưu snapshot và xuất Excel; không thu danh sách thành viên hoặc người tương tác. Xem GROUP_CHANNEL_ANALYSIS_V0.2.md. Đây là phần mở rộng nghiên cứu, không đánh dấu hoàn thành các phase automation/marketing.

## Phase 1 implementation — 0.3.0
Đã triển khai khung 11 màn, cấu hình SQLite, nhật ký sự kiện allowlist, quản lý schema và kiểm tra compiler/test/Windows. Hộp thư/mẫu tin/lịch gửi chưa khả dụng theo phase đã định. Xem PHASE1_FOUNDATION.md để nghiệm thu T01–T02 trước khi coi Phase 1 hoàn tất.
