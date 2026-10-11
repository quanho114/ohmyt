# Harness đầy đủ và trải nghiệm desktop

Ngày: 09/10/2026. Baseline: [integration hiện tại](harness-integration.md). Tham chiếu kiến trúc: [nghiên cứu DeepSeek Harness](deepseek-harness-research.md), source cố định tại commit d743267388641bc76f17c45ce8b4c231aed1d32c.

## Mục tiêu và nghĩa của “full”

Hoàn thiện các lớp còn thiếu: agent handles/driver, semantic session log/projections, request attempts, context compaction, inbox/steering, tools pipeline/scheduler, profiles/bundles, UI extension points, subagents, MCP/connectors và PTC. Có UI dùng được cho từng khả năng, migration cho dữ liệu cũ, kiểm chứng transport/recovery và đánh giá tác vụ thật.

Đây là ohmyt có kiến trúc theo DeepSeek, không hứa cài nguyên mọi package DSH. Binary/package compatibility, marketplace công khai, ACP/Codex/Claude providers và teams DAG experimental là các extension tiếp theo; release này phải có in-process subagent provider và general MCP. Không thay React/SQLite/SSE/Electron để bắt chước stack của upstream.

## Invariants

- Một writer thực thi trên mỗi session; các session khác vẫn chạy độc lập. Duplicate submission không tạo turn thứ hai.
- Durable semantic events là nguồn model history; live deltas là tạm thời; UI projection có version. Không dùng activity cards làm model input.
- Persist tool intent trước execution. Crash với outcome chưa rõ tạo unknown result, không replay mutation. Resume là turn tiếp theo trên checkpoint coherent, không tua lại body tool.
- Policy deny không bị hook đảo ngược; approval đã dùng không tái sử dụng; mọi child/MCP/PTC call đi qua cùng policy và budgets.
- Quiescence phải đạt trước dispose; unload trong lúc resource đang dùng bị từ chối với lý do cụ thể.
- Quyền theo scope/project; child chỉ có tập quyền nhỏ hơn hoặc bằng parent. Skill/plugin content không tự cấp quyền.
- Giữ hiện trạng xóa/branch/forward chat: không phục hồi dữ liệu đã xóa; bản sao không mang quyền, pending approvals hoặc live handles.
- Giữ secrets trong secret store; logs/export mặc định redacted. Screenshot browser vẫn transient. Không ghi reasoning riêng tư ngoài dữ liệu provider đã công khai cho ứng dụng.
- Context giữ policy, yêu cầu hiện tại, native metadata phù hợp provider và call/result groups; count chưa hỗ trợ phải hiện estimated.

## UI: thông tin ở đúng nơi sử dụng

Bám `src/index.css`, typography hệ thống, theme light/dark và appearance settings. Giữ sidebar/chat/settings/browser pane hiện có. Dùng danh sách có hàng, phân cấp chữ, spacing nhất quán; không thêm hero, gradient trang trí, kính mờ, biểu đồ giả, badge hàng loạt hoặc dashboard agent chỉ để lấp chỗ trống.

| Nhu cầu | Vị trí | Hành vi |
|---|---|---|
| Điều chỉnh tác vụ đang chạy | Composer | Khi bận, hai hành động có nhãn rõ: “Gửi sau” và “Điều chỉnh tác vụ”; mặc định gửi sau. Hiện item chờ, cho sửa/hủy trước khi consumed. “Dừng” vẫn dừng toàn turn. |
| Tạm dừng/tiếp tục | ResponseActivity | Pause ở boundary an toàn; trong mutation hiện “Đang chờ thao tác hiện tại kết thúc”. Resume không tự replay action unknown. |
| Hiểu lỗi/recovery | Activity của chính response | Một thông báo với nguyên nhân và hành động “Tiếp tục từ trạng thái hiện tại” khi đủ điều kiện; action unknown hiện “Kiểm tra trạng thái trước khi tiếp tục”. Không toast liên tục. |
| Chọn cấu hình agent | Composer, gần model selector | Một menu preset khi có từ hai preset; model/approval hiện hữu vẫn dễ thấy. Chi tiết cấu hình ở Settings. |
| Quản lý extension | Settings → Tiện ích | Hàng name/status/scope; mở detail xem nguồn, capabilities, dependencies, config, lỗi, enable/disable. Builtins tách nhãn rõ nhưng cùng layout. Không marketplace giả. |
| Kết nối dịch vụ | Settings → Kết nối | Add MCP bằng form stdio hoặc URL; kiểm tra kết nối, khai báo quyền, redacted errors, disconnect. Browser settings giữ phần riêng hiện có. |
| Theo dõi subagent | ResponseActivity | Nhóm công việc con, tên/mục tiêu/status, expand xem kết quả; không tự mở nhiều chat/window. Cancel child độc lập và cancel parent toàn cây. |
| Xem artifacts | Side pane hiện có | Render theo artifactId, phiên bản và mime; generic fallback có Download/Copy. Chỉ một pane chính; không auto giật focus mỗi update. |
| Debug | Settings nâng cao → Chẩn đoán | Attempt/context/usage/plugin state, export redacted. UI thường dùng câu dễ hiểu, không lộ Cordis fibers hoặc sequence ids. |

Extension slots hữu hạn: settings.section, activity.renderer, artifact.renderer, sidepanel.view. Không cho extension thay toàn sidebar, đè Composer, modal phủ màn hình hoặc arbitrary executable remote UI. V1 UI contributions được build cùng ứng dụng; backend local extensions không tự biến thành trusted frontend code. Mở rộng phân phối client sau khi có signing/version policy.

Mỗi màn hình phải có loading, empty, error có retry, pending save, success, disabled có lý do; persisted state chỉ đổi sau server acknowledgement. Focus/keyboard/Escape/focus return, tên accessible, reduced-motion, localization VI/EN phải được kiểm tra. Không toast thay cho field errors.

Kiểm tra ở 1280×800, 1440×900, 1920×1080 và cửa sổ 768×700; Settings dưới 768px dùng navigation hiện có. Dùng screenshot thật của app trước/sau, light/dark và đoạn tiếng Việt dài. Wireframe không đủ để nghiệm thu UI.

## Tiêu chí hoàn thành

Toàn bộ chặng trong plan có checks và migration đạt; existing suites không regression; các critical user flows được chạy trên Electron thật. Benchmark baseline và ứng viên cùng model, fixtures, budgets và repeated trials; công khai success/time/cost/failures. Không gọi “full” khi connector/PTC chỉ là stub hoặc UI dùng static/mock data.
