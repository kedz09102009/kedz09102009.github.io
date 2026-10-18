# Nhật ký học tập — Đường đua chung V13

## Thay đổi
- Khi đăng nhập Google, ứng dụng tự chuyển tài khoản vào một đường đua chung; không còn nút tạo phòng, nhập mã phòng, sao chép mã hoặc rời phòng.
- Giữ cách tính XP, cấp độ, chuỗi ngày, xếp hạng tuần trước và lịch sử học hiện có.
- Mã nội bộ `XDU92JXZ` được giữ làm namespace kỹ thuật của đường đua chung để bảo toàn danh sách thành viên đang ở đó; mã này không còn được hiển thị như mã phòng trong giao diện.
- Các hồ sơ đang ở các phòng cũ sẽ chuyển sang đường đua chung khi họ mở bản V13, đăng nhập và đồng bộ. Không xóa dữ liệu cũ khỏi Firebase.

## Cách triển khai
1. Sao lưu thư mục website và dữ liệu hiện tại.
2. Cập nhật đồng thời tất cả tệp trong ZIP lên cùng thư mục website. Giữ nguyên `config.js` nếu nó trỏ đến Firebase project hiện tại.
3. Tất cả người tham gia cần mở bản mới và đăng nhập Google ít nhất một lần để hồ sơ của họ được đăng ký trong đường đua chung.
4. Thử trên điện thoại và máy tính, đảm bảo cùng một tài khoản chỉ xuất hiện một lần.

## Nếu hiện lỗi `permission-denied`
Mã website không thể tự thay đổi Firestore Security Rules. Trong Firebase Console, mở Firestore Database → Rules, rồi **bổ sung** rule phù hợp vào bên trong `match /databases/{database}/documents`; đừng thay thế toàn bộ rules hiện có mà chưa rà soát. Ví dụ giới hạn cho đường đua chung:

```text
match /rooms/{roomId}/members/{memberId} {
  allow read: if request.auth != null && roomId == "XDU92JXZ";
  allow create, update: if request.auth != null
    && roomId == "XDU92JXZ"
    && request.auth.uid == memberId;
}
```

Rule này cho phép tài khoản đã đăng nhập đọc bảng đua chung và chỉ ghi hồ sơ có ID đúng bằng UID của chính mình. Hãy kiểm tra các rule hiện tại vì các rule khớp nhau được kết hợp theo phép OR trong Firestore.
