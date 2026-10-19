# Goal: nâng cấp hành vi theo DeepSeek Harness

## Tích hợp source runtime — 13/10/2026

Đã nhập mã service vòng đời, strict fold, prompt vòng tiếp tục/lời kết và parser
lệnh từ commit upstream nêu dưới. Giấy phép và provenance ở
`server/vendor/deepseek-goal/README.md`; dùng adapter cho SQLite và AgentRegistry
của ohmyt, không cài toàn bộ ứng dụng DeepSeek.

- Goal phase, process activation và trạng thái thực thi được đọc riêng. Activation
  không lưu trong snapshot; cold reader, restart và unload không tự cấp quyền chạy.
- `complete`, `await_input`, pause và blocker cuối chuyển sang lượt kết luận không
  có tool; invocation fence chặn cả tool cùng batch được phát sau lệnh kết thúc.
- Bộ xét kết thúc dùng unresolvedCallIds sau xử lý recovery, không chặn lại lỗi
  tham số/revision đã sửa. `finish:true` không tự hoàn thành checklist còn bước dở.
- Spinner checklist chỉ chạy khi Goal active và runtime có lượt chạy thực tế.
  Paused/blocked/idle giữ bước dở thành trạng thái chờ trên UI, không sửa lịch sử bước.
- `/goal pause`, `/goal resume`, `/goal clear`, `/goal edit ...` đi qua command API
  trực tiếp; composer không biến lệnh đang gõ thành một objective mới.
- Quyền, project scope, shared budgets và phân biệt model-reported/verified giữ
  nguyên. Vòng human adoption vẫn tính là vòng 1 để tương thích dữ liệu cũ.

Kiểm tra bằng `npm run test:goal`, `npm run test:goal:ui`, `npm test`, types và build.
Fixtures không chứng nhận chất lượng kế hoạch của model thật; prompt đã yêu cầu
không tạo Goal chỉ để chào hỏi, giới thiệu tính năng hoặc chờ nhiệm vụ mới.

Tham chiếu source DeepSeek Harness tại commit `d743267388641bc76f17c45ce8b4c231aed1d32c`, các package `goal`, `tool-goal`, `goal-round-driver`. Đây là triển khai thích nghi vào runtime ohmyt, không phải thay toàn bộ runtime bằng Cordis của DeepSeek. Giấy phép MIT được lưu tại `src/vendor/deepseek-goal/LICENSE`.

## Hai cách dùng

1. Bấm Goal trong menu nhập tin nhắn hoặc gõ `/goal ...`: mục tiêu được ghim trước lần gọi model đầu tiên.
2. Gửi yêu cầu dài bình thường: model có thể gọi `create_goal`, lập checklist và thực hiện ngay. Câu hỏi đơn giản và lời chào không cần Goal. Khả năng nhận diện và chất lượng kế hoạch phụ thuộc model đang chọn.

Trong cả hai cách, các vòng sau chạy trong cùng chat, giữ mục tiêu và trạng thái mới nhất. Nút tạm dừng, tiếp tục, sửa và xóa vẫn hoạt động. Người dùng gửi yêu cầu mới hoặc dừng chạy sẽ ngắt chuỗi tự động.

## Hành vi đã triển khai

| Phần | Hành vi ohmyt |
|---|---|
| Công cụ | `get_goal`, `create_goal`, `update_goal`; giữ `goal_start`, `goal_progress` để tương thích |
| Kế hoạch | Model lập, cập nhật và điều chỉnh checklist; hoàn thành bị từ chối khi còn bước chưa xong |
| Đọc trạng thái | Đọc id/revision mới trước cập nhật; lỗi revision có thể sửa bằng đọc lại rồi cập nhật, không bị coi là tác động ngoài app chưa rõ kết quả |
| Tiếp tục | Prompt mỗi vòng yêu cầu xem trạng thái thực, làm việc cụ thể và kiểm tra kết quả |
| Số vòng | Mặc định 256 như source DeepSeek thay cho 3; vẫn giới hạn request/tool chung và cấu hình từng lượt |
| Admission | Vòng tự động chỉ tăng bộ đếm khi thực sự được nhận vào lịch sử, không tăng lúc đặt chỗ |
| Trở ngại | `blocked` đếm cùng nội dung qua 3 vòng liên tiếp; gọi nhiều lần trong một vòng chỉ tính một lần. Vòng không báo lại hoặc đổi trở ngại bắt đầu chuỗi mới |
| Cần trả lời | `await_input` tạm dừng ngay, lưu câu hỏi và hiển thị cạnh Goal; người dùng trả lời rồi yêu cầu tiếp tục hoặc bấm tiếp tục |
| Hoàn thành | `complete` yêu cầu kết thúc sau khi lượt chạy đã lưu kết quả; `reason=model_reported` phân biệt với xác minh độc lập |
| Xác minh | Chỉ verifier do host quản lý được ghi `verified` và evidence; model không tự cấp chứng nhận xác minh |
| Điều khiển | Pause từ UI hủy lượt đang chạy; pause từ model cho phép kết thúc lời trả lời của chính nó |
| Phục hồi | Restart không tự chạy lại; phải tiếp tục từ người dùng. Child agent không nhận công cụ điều khiển Goal của chat cha |
| Đọc nhanh hơn | Truy vấn riêng event Goal bằng index, không tải và phân tích toàn bộ transcript ở mỗi lần đọc |

## Khác biệt và giới hạn cần giữ rõ

- Không có bằng chứng để chấm tương đương 99–100% hoặc tốc độ tương đương DeepSeek. Chưa benchmark bằng cùng model/provider và cùng tác vụ thực.
- ohmyt giữ shared request/tool budgets, hàng đợi, project scope và chính sách tool hiện tại. Giới hạn 256 vòng không đồng nghĩa có thể gọi model vô hạn; giới hạn nhỏ hơn có thể kết thúc trước.
- Lượt người dùng đầu tiên được nhận làm vòng 1 trong ohmyt. DeepSeek đếm riêng vòng tiếp tục tự động. ohmyt giới hạn cấu hình cap tối đa 1024 vòng.
- Denial, cancellation, kết quả tác động bên ngoài không rõ và lượt chạy lỗi vẫn dừng ngay. Quy tắc 3 vòng chỉ áp dụng trở ngại do model báo; không tự thử lại hành động bị từ chối hoặc kết quả chưa rõ.
- `goal_progress finish:true` vẫn giữ luồng review cũ cho kết quả chưa xác minh. `update_goal complete` theo luồng hoàn thành do model báo của DeepSeek, không đổi TaskOutcome thành verified.
- Hành vi tự tạo Goal và chất lượng công việc cần kiểm tra trên model thật; kiểm thử giả lập chỉ chứng minh logic điều phối.

## Kiểm thử

`node test/goals/test_goal_deepseek_runtime.js` kiểm tra công cụ canonical, nhiều vòng nối tiếp, kế hoạch, xung đột revision và phục hồi, giới hạn, trạng thái hoàn thành, trở ngại lặp, chờ người dùng/tiếp tục, quyền mặc định và giới hạn top-level.

`node test/goals/test_harness_goals.js` và `node test/goals/test_harness_goal_api.js` bảo vệ điều khiển UI/API, pause/drain, shared budget, interruption, denial/unknown, restart và project scope.

`node test/goals/test_goal_deepseek_ui.js` kiểm tra renderer trong Chrome. Native Electron và chất lượng với provider thật chưa được nghiệm thu.
