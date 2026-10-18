# Nhật ký học tập V16 — Bỏ giới hạn 300 XP/ngày

## Thay đổi
- Bảng xếp hạng tuần hiện tính toàn bộ XP của các buổi học trong tuần, cộng 30 XP cho mỗi ngày đạt số phút học tối thiểu. Không còn trần 300 XP/ngày.
- Cùng hàm tính được dùng cho tổng kết tuần trước, nên cả tuần hiện tại và tuần đã kết thúc đều theo quy tắc mới.
- Công thức XP của từng buổi học không thay đổi; chỉ bỏ mức trần tổng XP theo ngày khi tính điểm đua tuần.
- Đã tăng mã phiên bản ứng dụng/CSS và mã bộ nhớ đệm Service Worker.

## Cập nhật
1. Sao lưu phiên bản hiện tại.
2. Triển khai đồng thời tất cả tệp trong gói này vào cùng thư mục website. Giữ nguyên `config.js` nếu nó đã trỏ đến dự án Firebase đúng.
3. Các thành viên cần mở/tải lại bản V16 ít nhất một lần để hồ sơ điểm tuần của họ được tính và gửi lại theo công thức mới. Nếu thành viên chưa mở bản mới, điểm họ đang lưu trên Firebase có thể tạm thời vẫn là điểm cũ bị giới hạn.
4. Kiểm tra bảng đua tuần hiện tại và mục xếp hạng tuần trước trên cả điện thoại và máy tính.

## Lưu ý
Mã đã được kiểm tra cú pháp và các tham chiếu phiên bản trong gói. Chưa thử trực tiếp trên Firebase hoặc website production.
