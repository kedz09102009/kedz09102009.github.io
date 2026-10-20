# Nhật ký học tập V18 — phương án miễn phí

V18 giữ trang web và dữ liệu nhật ký cá nhân của V17.3, nhưng **không sử dụng Firebase Cloud Functions**. Mục tiêu là có thể tiếp tục dùng các gói miễn phí:

- **GitHub Pages:** phục vụ giao diện tĩnh.
- **Firebase Spark:** đăng nhập Google và lưu/synchronise nhật ký cá nhân trong Firestore.
- **Cloudflare Workers Free + D1 Free:** API tính XP chính thức, bảng xếp hạng, lịch sử thay đổi điểm, hàng đợi duyệt, tạm giữ và thu hồi XP.

Không cần triển khai V17.3 trước. Không chạy `firebase deploy --only functions`, không bật Blaze, và không thêm thông tin thanh toán để làm theo hướng dẫn này. Hãy giữ các tài khoản ở gói miễn phí; hạn mức miễn phí có thể khiến yêu cầu tạm thời thất bại khi dùng quá nhiều, nhưng sẽ không tự chuyển thành hoá đơn nếu bạn không nâng cấp sang gói trả phí.

## Nội dung trong gói

- Các tệp giao diện web ở thư mục gốc.
- `cloud.js`: Firebase cho hồ sơ riêng; API điểm gọi Cloudflare Worker.
- `config.js`: cấu hình Firebase hiện tại và chỗ điền địa chỉ Worker.
- `cloudflare/worker.js`: backend tính XP.
- `cloudflare/migrations/0001_initial.sql`: lược đồ D1.
- `cloudflare/wrangler.toml`: cấu hình Worker.
- `tests/score-logic.test.mjs`: kiểm tra công thức XP và quy tắc ngày/tuần.
- `README-TRIEN-KHAI.md`: hướng dẫn từng bước.

## Điều quan trọng về dữ liệu

1. V18 tiếp tục dùng collection Firestore `users/{UID}` cho nhật ký cá nhân; không xóa hoặc ghi đè các hồ sơ cũ trong quá trình chuyển đổi.
2. Bảng điểm chính thức mới được lưu trong D1 và chỉ được Worker cập nhật. Thành viên cần đăng nhập V18 ít nhất một lần để tạo hồ sơ bảng điểm mới.
3. Điểm xếp hạng cũ do trình duyệt ghi không được tự nhập vào D1. Việc này có chủ đích để không xem điểm cũ chưa kiểm chứng là điểm chính thức. Dữ liệu nhật ký cá nhân vẫn ở Firestore/localStorage.
4. Bản nhập tay và phiên đồng hồ dài hơn 6 giờ được tạm giữ. Cần cấu hình `ADMIN_UIDS` để người quản trị có thể duyệt hoặc thu hồi.

## Giới hạn trung thực

Worker đo thời lượng dựa trên phiên đồng hồ và nhịp xác nhận từ trình duyệt; câu hỏi và số câu đúng vẫn do người học tự khai rồi được giới hạn theo thời lượng. Không có hệ thống tự báo cáo nào chứng minh tuyệt đối rằng người học thực sự tập trung vào bài học. V18 tăng khả năng kiểm soát, chống sửa trực tiếp XP ở trình duyệt, chống gửi trùng, và lưu vết thay đổi; nó không phải hệ thống giám sát hành vi.
