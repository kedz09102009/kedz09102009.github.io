# Nhật ký học tập V14 — Cuộn dọc thông minh

## Điểm mới
- Giữ trải nghiệm một trang cuộn dọc; không đưa nội dung vào các tab.
- Thêm điều hướng nhanh dạng danh sách thả xuống và nút trở về đầu trang.
- Các khu vực nhiều chi tiết (tổng kết tuần, biểu đồ, phân tích, cấp độ, theo môn, hoạt động, lịch, thành tích, cài đặt, lịch sử) được thu gọn mặc định; mở trực tiếp bằng cách bấm vào tiêu đề hoặc chọn trong “Đi nhanh đến”.
- Mục tiêu chỉ hiện ba mục đầu khi danh sách dài; có nút xem tất cả/thu gọn.
- Giữ nguyên IDs mà app.js đang cập nhật, dữ liệu học tập, cấu hình Firebase, đường đua chung và các công thức thống kê.
- Mã BUILD, CSS build marker, URL tài nguyên và Service Worker cache được tăng đồng bộ.

## Cập nhật
1. Sao lưu dữ liệu và thư mục hiện tại.
2. Cập nhật đồng thời các tệp trong gói này vào cùng thư mục website.
3. Nếu `config.js` của bạn đã được tùy chỉnh, giữ lại cấu hình hiện có của chính dự án Firebase.
4. Mở lại website trên máy tính và điện thoại; kiểm tra bắt đầu/lưu buổi học, mục tiêu, bảng đua và đồng bộ.

## Lưu ý
Giao diện vẫn là một trang cuộn dọc. Danh sách thả xuống chỉ cuộn tới khu vực và mở khu vực chi tiết tương ứng; nó không đổi trang hoặc tạo bản dữ liệu riêng. Mã nguồn có thể kiểm tra tĩnh trong gói, nhưng cần kiểm thử thực tế trên host/Firebase của bạn sau khi triển khai.
