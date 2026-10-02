---
name: "safe-terminal"
description: "Thực thi lệnh kiểm thử, kiểm tra cú pháp và build an toàn"
version: "1.0.0"
required_tools: ["shell_exec"]
---

# Quy trình chạy lệnh an toàn:
1. Xác định lệnh cần chạy (ví dụ kiểm tra cú pháp, chạy test hoặc build).
2. Tuyệt đối không chạy các lệnh xóa nguy hiểm như `rm -rf /` hay `format`.
3. Kiểm tra mã thoát (exit code) và tóm tắt kết quả thành công/thất bại rõ ràng cho người dùng.
