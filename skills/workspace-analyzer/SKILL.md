---
name: "workspace-analyzer"
description: "Phân tích cấu trúc thư mục, tệp mã nguồn và kiến trúc của dự án hiện tại"
version: "1.0.0"
required_tools: ["fs_list", "fs_read"]
---

# Quy trình phân tích dự án:
1. Dùng `fs_list` tại thư mục gốc để nắm các tệp cấu hình chính (package.json, Cargo.toml, README...).
2. Dùng `fs_read` để đọc các tệp cấu hình quan trọng nhằm xác định framework và dependencies.
3. Tổng hợp bức tranh tổng thể ngắn gọn: công nghệ, mục tiêu dự án, cấu trúc thư mục.
