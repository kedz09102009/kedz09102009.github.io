# Nhật ký thay đổi V18

- Thay Firebase Cloud Functions bằng Cloudflare Worker + D1 để tránh bắt buộc bật gói Firebase Blaze.
- Giữ Firebase Google Auth và Firestore cho đồng bộ nhật ký cá nhân đa thiết bị.
- Chuyển nguồn chính thức của bảng xếp hạng sang D1; trình duyệt không tự ghi tổng XP.
- Thêm xác minh Firebase ID token trong Worker, ràng buộc UID, API kiểm soát phiên và hạn chế thao tác chỉ trên dữ liệu của tài khoản đang đăng nhập.
- Thêm lược đồ D1 cho người học, khoá phiên hoạt động, phiên tính điểm và sổ cái sự kiện.
- Giữ công thức XP, ngưỡng 15 phút/30 XP mỗi ngày đủ chuẩn, tuần từ thứ Hai theo UTC+7, tạm giữ phiên trên 6 giờ và bản ghi nhập tay.
- Thêm thao tác quản trị `hold`, `release`, `revoke` qua biến `ADMIN_UIDS`.
- Chuyển bảng xếp hạng sang polling 20 giây thay vì Firestore onSnapshot.
- Không chuyển các tổng XP cũ chưa xác minh vào bảng mới; không xóa hồ sơ học cá nhân.
- Thêm 11 kiểm thử logic đơn vị cho công thức XP, lịch Việt Nam, ID ổn định và các chuyển trạng thái xét duyệt.
