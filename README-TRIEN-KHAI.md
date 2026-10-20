# Hướng dẫn triển khai V18 (không cần bật thanh toán)

Làm theo đúng thứ tự. Bạn **chưa triển khai V17.3** nên không cần gỡ hay di chuyển Cloud Functions. V18 dùng backend khác và không cần Firebase Blaze.

## Phần A — tạo API miễn phí trên Cloudflare

### 1. Cài công cụ cần thiết

- Máy tính Windows có Node.js bản LTS.
- Một tài khoản Cloudflare ở gói Free.
- Mã nguồn V18 đã giải nén.

Mở thư mục `cloudflare` bên trong gói V18 bằng Terminal/Command Prompt. Bạn có thể nhấn vào thanh địa chỉ thư mục, gõ `cmd`, rồi nhấn Enter. Chạy:

```bash
npm install
npx wrangler login
```

Lệnh đăng nhập sẽ mở trình duyệt để bạn cho phép Wrangler truy cập tài khoản Cloudflare.

### 2. Tạo cơ sở dữ liệu D1

Trong Terminal đang ở thư mục `cloudflare`, chạy:

```bash
npx wrangler d1 create nhat-ky-hoc-tap-scores
```

Cloudflare sẽ trả về một `database_id`. Mở `cloudflare/wrangler.toml`, tìm dòng:

```toml
database_id = "REPLACE_WITH_D1_DATABASE_ID"
```

Thay phần `REPLACE_WITH_D1_DATABASE_ID` bằng đúng mã do Cloudflare trả về. Giữ nguyên tên `database_name = "nhat-ky-hoc-tap-scores"`.

### 3. Tạo các bảng dữ liệu

Vẫn trong thư mục `cloudflare`, chạy:

```bash
npx wrangler d1 migrations apply nhat-ky-hoc-tap-scores --remote
```

Khi công cụ hỏi xác nhận chạy migration trên cơ sở dữ liệu từ xa, hãy kiểm tra tên cơ sở dữ liệu đúng rồi đồng ý. Migration chỉ tạo bảng cần cho điểm thi đấu; nó không chạm vào nhật ký Firestore.

### 4. Triển khai Worker

Chạy:

```bash
npx wrangler deploy
```

Kết quả sẽ hiện địa chỉ tương tự:

```text
https://nhat-ky-hoc-tap-score-api.<ten-tai-khoan>.workers.dev
```

Tên thật có thể khác. Lưu lại địa chỉ được in ra. Mở địa chỉ đó và thêm `/api/health`, ví dụ:

```text
https://<dia-chi-worker>/api/health
```

Kết quả cần có JSON với `"ok":true` và `"database":"connected"`. Endpoint sức khỏe không yêu cầu đăng nhập.

## Phần B — cấu hình quyền quản trị bảng điểm

Nếu chưa cấu hình người quản trị thì người học vẫn có thể tính XP cho buổi học đồng hồ, nhưng bản nhập tay và phiên dài cần kiểm tra sẽ nằm trong hàng đợi; không ai có quyền duyệt chúng qua giao diện.

1. Mở Firebase Console → dự án `kietphan-7da93` → Authentication → Users.
2. Tìm tài khoản Google bạn dùng đăng nhập nhật ký học tập và sao chép UID của tài khoản.
3. Mở `cloudflare/wrangler.toml`, tìm `ADMIN_UIDS = ""` rồi đặt UID vào giữa hai dấu nháy. Ví dụ cấu trúc:

```toml
ADMIN_UIDS = "UID_TAI_KHOAN_CUA_BAN"
```

4. Trong Terminal tại thư mục `cloudflare`, chạy lại `npx wrangler deploy`.

UID không phải mật khẩu, nhưng chỉ nên cấp quyền quản trị cho người mà bạn thực sự tin tưởng. Có thể chỉ định nhiều quản trị viên bằng cách phân cách UID bằng dấu phẩy.

## Phần C — kết nối giao diện V18 với Worker

1. Mở `config.js` trong thư mục gốc của V18.
2. Ở cuối tệp, tìm dòng `window.SCORE_API_URL = "";`.
3. Điền địa chỉ Worker đã triển khai, không thêm `/api/health` ở cuối. Ví dụ:

```js
window.SCORE_API_URL = "https://nhat-ky-hoc-tap-score-api.<ten-tai-khoan>.workers.dev";
```

4. Lưu tệp.
5. Đưa các tệp giao diện trong thư mục gốc V18 lên repository GitHub Pages mà bạn đang sử dụng. Ít nhất cần cập nhật `index.html`, `app.js`, `cloud.js`, `config.js`, `style.css`, `sw.js`, `manifest.webmanifest`, `icon-192.png` và `icon-512.png`. Nếu muốn lưu toàn bộ mã backend cạnh giao diện, giữ nguyên thư mục `cloudflare` và `tests` trong repository cũng được.
6. Không cần triển khai Cloudflare bằng GitHub Actions; bạn đã triển khai Worker riêng bằng Wrangler. GitHub Pages chỉ phục vụ phần giao diện.
7. Mở trang web, tải lại cứng (Ctrl+Shift+R), đăng nhập Google và bấm “Đăng ký / thử lại” nếu bảng đua chưa hiện tên bạn.

## Phần D — kiểm tra an toàn trước khi dùng thật

1. Đăng nhập và kiểm tra dữ liệu nhật ký cá nhân cũ còn thấy như trước.
2. Vào “Đường đua chung”: thành viên mới cần xuất hiện với `scorePolicyVersion: 1`.
3. Bắt đầu một buổi học, để chạy hơn 1 phút, tạm dừng, tiếp tục, rồi kết thúc và lưu. XP chỉ hiện sau khi Worker xác nhận.
4. Mở “Lịch sử thay đổi điểm” và xác nhận có giao dịch XP tương ứng.
5. Thử bản nhập tay: nó phải ở trạng thái tạm giữ, chưa cộng vào tổng XP chính thức. Đăng nhập bằng tài khoản UID đã khai báo trong `ADMIN_UIDS` để xem hàng đợi và duyệt thử nếu cần.
6. Mở URL `/api/health` một lần nữa; cần nhận `"ok":true`.

## Không làm các việc này

- Không chạy `firebase deploy --only functions`.
- Không chạy các lệnh bật Blaze hoặc liên kết phương thức thanh toán.
- Không xóa collection `users` hay xoá dữ liệu `localStorage` để “làm mới” bảng điểm.
- Không đặt `ADMIN_UIDS` thành UID của người khác nếu chưa muốn cấp quyền duyệt điểm cho họ.

## Nếu xảy ra lỗi

- `score-api-not-configured`: chưa điền `SCORE_API_URL` trong `config.js`.
- `unauthenticated`: đăng xuất rồi đăng nhập Google lại; kiểm tra Project ID trong Worker và `config.js` cùng là `kietphan-7da93`.
- `database` khác `connected`: kiểm tra database ID trong `wrangler.toml` và chạy lại migration.
- Người quản trị không thấy hàng đợi: UID đăng nhập phải trùng một mục trong `ADMIN_UIDS`; sửa `wrangler.toml` rồi deploy lại.
- GitHub Pages vẫn tải bản cũ: kiểm tra repository đã cập nhật các tệp gốc và tải lại cứng. Worker và giao diện là hai lần triển khai riêng.
- Dùng quá hạn mức miễn phí Cloudflare: yêu cầu có thể tạm thất bại cho đến khi hạn mức được làm mới hoặc dữ liệu được tối ưu. Đừng nâng cấp gói nếu mục tiêu của bạn vẫn là không phát sinh phí.

## Địa chỉ tham khảo chính thức

- Cloudflare D1 Worker API: https://developers.cloudflare.com/d1/worker-api/
- D1 migrations: https://developers.cloudflare.com/d1/reference/migrations/
- Hạn mức và gói D1: https://developers.cloudflare.com/d1/platform/pricing/
- Firebase pricing plans: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
