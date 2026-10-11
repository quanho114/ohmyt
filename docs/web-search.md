# Tìm kiếm web

Agent dùng công cụ `web_search` với DuckDuckGo Instant Answer, không cần API key
hoặc máy chủ tìm kiếm riêng. Không có trang cấu hình nguồn tìm kiếm.
Kết quả là tóm tắt tức thì và chủ đề liên quan, không phải danh sách tìm kiếm web đầy đủ.

Công cụ trả tối đa 5 kết quả gồm tiêu đề, đoạn trích và URL HTTP/HTTPS;
loại link trùng và không hợp lệ. Timeout 12 giây, giới hạn phản hồi 2 MiB,
hủy tác vụ sẽ hủy tìm kiếm. Quyền gọi công cụ vẫn theo chính sách của agent.
Mở và thao tác trang web tiếp tục dùng công cụ trình duyệt riêng.

Cấu hình nguồn cũ được xoá khi khởi động, bao gồm tham chiếu khóa trong kho bí mật.
`npm run test:web-search` kiểm tra kết quả, lỗi, hủy yêu cầu, chuyển đổi cấu hình
cũ, công cụ theo phạm vi và API có xác thực.
