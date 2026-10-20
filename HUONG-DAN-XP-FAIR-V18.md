# Quy tắc XP chính thức — V18

## Nguồn dữ liệu

- XP thi đấu không lấy từ tổng XP phía trình duyệt hoặc nhật ký cũ.
- Mỗi phiên tính điểm phải được mở, nhịp xác nhận, tạm dừng/tiếp tục và kết thúc qua Worker.
- Mỗi phiên được gắn với tài khoản Firebase đã xác thực; D1 ghi nhận một `session_id` ổn định để thử lại không tạo phiên thứ hai.
- Bảng xếp hạng được đọc từ D1, không đọc điểm cạnh tranh từ Firestore và không cho trình duyệt ghi XP chính thức.

## Công thức XP buổi đồng hồ

Đặt `m` là số phút nguyên từ thời lượng do máy chủ xác nhận; `n` là số câu được tính; `c` là số câu đúng được tính:

```text
m = floor(thời lượng xác nhận / 60)
N tối đa = max(10, 2 × m)
n = min(số câu người học khai, N tối đa)
c = min(số câu đúng khai, n)
XP tiềm năng = round(m + 2 × n + c)
```

Buổi phải kéo dài ít nhất 60 giây mới được tính. Một buổi đồng hồ dài hơn 6 giờ được tạm giữ để người quản trị xem xét. Không có trần XP theo ngày.

## Thưởng theo ngày và tuần

- Một ngày đủ chuẩn khi tổng thời lượng của các phiên đồng hồ đã được tính XP và được xác minh trong ngày lịch Việt Nam đạt ít nhất 15 phút.
- Mỗi ngày đủ chuẩn được thưởng thêm 30 XP.
- XP tuần bằng tổng XP của các buổi đã được duyệt kết thúc trong tuần đó, cộng 30 XP cho mỗi ngày đủ chuẩn trong tuần. Tuần bắt đầu vào thứ Hai; ngày theo múi giờ Việt Nam (UTC+7).
- Chỉ các bản ghi đang ở trạng thái `posted` tạo điểm chính thức. Khi bản ghi bị tạm giữ hoặc thu hồi, tổng điểm và thưởng ngày liên quan được tính lại.

## Nhập tay, hàng đợi và nhật ký

- Buổi nhập tay tối đa 12 giờ và ngày kết thúc phải nằm trong 90 ngày gần đây. XP tiềm năng bằng một nửa công thức bình thường và luôn ở trạng thái `held` cho đến khi được quản trị viên duyệt.
- Phiên đồng hồ trên 6 giờ cũng được `held`.
- Quản trị viên có thể duyệt (`release`), tạm giữ (`hold`) hoặc thu hồi (`revoke`). Mọi thay đổi ghi người thực hiện, lý do, thời điểm, trạng thái và chênh lệch XP.
- Người học có thể thu hồi XP bản ghi của chính mình khi xóa/chỉnh sửa bản ghi đã tính.
- Gửi lặp cùng một mã bản ghi không được cộng lại điểm.

## Những gì hệ thống không thể chứng minh

Máy chủ kiểm soát cách tính điểm và thời gian ghi nhận của phiên, nhưng số câu làm và số câu đúng vẫn do người học tự khai. Nhịp xác nhận có thể giới hạn thời gian tính khi trang ngừng phản hồi, nhưng không thể chứng minh tuyệt đối rằng người học thực sự tập trung suốt phiên. Đây là hệ thống tính điểm minh bạch, không phải công cụ giám sát.
