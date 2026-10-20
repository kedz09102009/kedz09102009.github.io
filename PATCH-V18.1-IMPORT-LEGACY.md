# V18 — bản vá nhập thành tích cũ (V18.1)

Bản vá này bổ sung công cụ chuyển **bản chụp tóm tắt thành viên và XP cũ** từ Firestore `rooms/XDU92JXZ/members` sang bảng lưu trữ riêng trong Cloudflare D1. Nó không di chuyển, ghi đè hoặc xóa collection `users` chứa nhật ký học tập cá nhân. Điểm cũ hiển thị dưới mục “Thành tích cũ (lưu trữ)” và KHÔNG được tính vào bảng XP chính thức, vì điểm cũ được tính theo công thức client cũ và không thể xác minh lại đầy đủ chỉ từ summary.

## Tệp trong bản vá
- `cloudflare/worker.js`: thêm API nhập bản lưu trữ có kiểm tra Firebase ID token và `ADMIN_UIDS`.
- `cloudflare/migrations/0002_legacy_member_snapshots.sql`: tạo bảng riêng, không sửa bảng XP chính thức.
- `cloud.js`, `app.js`: tải và hiển thị bảng thành tích cũ.
- `legacy-migration.html`: công cụ trình duyệt để xuất thành viên từ Firebase, tải bản sao lưu JSON và nhập vào D1.

## Thứ tự an toàn
1. Sao lưu dự án V18 hiện tại và giữ nguyên `cloudflare/wrangler.toml` của bạn (đặc biệt `database_id`). Không thay nó bằng bản mẫu.
2. Sao chép các tệp trong bản vá đè/đưa vào đúng vị trí trong thư mục V18. Không chép `.wrangler` hoặc `node_modules`.
3. Tải `legacy-migration.html` lên repository GitHub Pages để có thể đăng nhập bằng cùng Firebase authorized domain.
4. Mở trang công cụ trên GitHub Pages, đăng nhập Google, ghi lại UID hiển thị và xuất bản sao lưu JSON. Kiểm tra số thành viên và giữ JSON ở nơi riêng tư.
5. Mở `cloudflare/wrangler.toml`, đặt `ADMIN_UIDS = "UID_CUA_BAN"` bằng UID tài khoản Google của bạn; không chia sẻ UID công khai trong ảnh nếu không cần.
6. Trong CMD ở thư mục `cloudflare`, chạy `npx wrangler d1 migrations apply nhat-ky-hoc-tap-scores --remote`, xác nhận chỉ migration `0002_legacy_member_snapshots.sql`; sau đó chạy `npx wrangler deploy`.
7. Quay lại trang công cụ, chọn tệp JSON vừa tải và bấm nhập vào D1. Nếu trang bị tải lại, bản JSON vẫn dùng được.
8. Cập nhật `app.js` và `cloud.js` ở repository GitHub Pages; tải lại cứng trang V18 và kiểm tra mục “Thành tích cũ (lưu trữ)”.
9. Sau khi kiểm tra thành công, xóa `legacy-migration.html` khỏi repository công khai. Giữ bản JSON riêng tư làm bản sao lưu.

## Lưu ý quan trọng
- Đây là bản lưu trữ thành tích tổng hợp, không phải nhập các phiên học cũ vào sổ cái XP đã xác minh.
- Không chạy lệnh xóa Firestore, không xóa `localStorage`, không thay `database_id`, không bật Firebase Blaze và không chạy Firebase Cloud Functions.
- Endpoint nhập yêu cầu UID quản trị đã cấu hình; người không nằm trong `ADMIN_UIDS` không thể nhập dữ liệu.
