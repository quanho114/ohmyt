# Nghiên cứu DeepSeek Harness và hướng tích hợp vào ohmyt

Ngày nghiên cứu: 09/10/2026. Nguồn là repository chính thức `deepseek-ai/deepseek-harness`, cố định tại commit [`d743267388641bc76f17c45ce8b4c231aed1d32c`](https://github.com/deepseek-ai/deepseek-harness/tree/d743267388641bc76f17c45ce8b4c231aed1d32c). Package gốc ở commit này khai báo phiên bản `0.2.1-alpha.2`.

Tài liệu này ghi lại nghiên cứu mã nguồn và thiết kế tích hợp. Đây không phải benchmark chất lượng agent, và không khẳng định ohmyt đã có toàn bộ tính năng của DeepSeek Harness. Các hạng mục đang tích hợp cần được đối chiếu với code và kết quả kiểm tra trong cùng thay đổi.

## Quyết định kiến trúc

ohmyt có thể dùng Cordis làm host để chuyển daemon, providers, tools, prompt và loop thành các plugin có lifecycle rõ ràng. Nên tái sử dụng các module hiện có và giữ SQLite, API, SSE, React trong giai đoạn đầu. Việc nhập nguyên agent loop của DeepSeek kéo theo các contracts về session, projection, persistence, LLM và scope; đó là một cuộc chuyển nền tảng lớn hơn mục tiêu tích hợp ban đầu.

DeepSeek dùng **fork `@deepseek-ai/cordis`**, không dùng package `cordis` thông thường. Kiểm tra npm tại thời điểm nghiên cứu cho thấy bản phát hành `@deepseek-ai/cordis@4.0.4`; source commit trên khai báo `4.0.5-alpha.1`. Vì vậy phải pin bản dùng thực tế và kiểm tra API trên package đã cài. Không được suy ra rằng mọi contract ở HEAD đều đã có trong 4.0.4. Loader/include là optional peers, nên host có thể mount plugin bằng code trước khi có profile YAML.

Nguồn: [kiến trúc tổng thể](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/architecture.md), [Cordis primer](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/cordis-primer.md), [fork và các thay đổi vendored](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/vendor/README.md), [manifest Cordis](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/vendor/cordis/package.json).

## 1. Host, services và lifecycle plugin

Plugin đóng góp service trên context, khai báo dependency bằng `inject`, và giao tiếp bằng events. Registrations là reversible effects: `ctx.on()` tự gắn listener với lifecycle; registry dùng `ctx.effect()` để gỡ đúng contribution khi plugin unload. Provider hoặc tool không nên import implementation cụ thể của agent loop.

Các dispatch modes có mục đích khác nhau: `emit` quan sát, `serial` chạy tuần tự và await, `parallel` await các observer độc lập, `bail` dừng tại quyết định đầu tiên, `waterfall` là around middleware. Listener waterfall nhận `next()` và phải gọi nó để delegate; đây không phải waterfall kiểu lần lượt truyền giá trị của Cordis thông thường.

Áp dụng cho ohmyt: host sở hữu cây plugin; bridges công bố các module DB, tools, gateway, permissions, skills và loop. Mỗi registration trả disposer, duplicate name phải có quy tắc rõ ràng. Unload chỉ gỡ tài nguyên của owner, không xóa toàn registry. Stop daemon phải drain công việc trước khi dispose host và đóng DB.

Nguồn: [event implementation](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/vendor/cordis/src/events.ts).

## 2. Agent handle và agent loop

DeepSeek tách `ctx.agents` khỏi `ctx.agentLoop`. Registry quản lý live handles và factory create/resume có thể thay; default driver là plugin. Agent initialization await serial `agent/created`; nếu thất bại phải rollback. Handle disposal dừng, chờ driver, unregister và dọn scope.

Một turn có thể gồm nhiều steps. Một step gồm request model và tools model gọi. Request retry là attempt trong step, không phải admission lại user input. Inbox phân biệt thông điệp đánh thức agent với context được inject cho request tiếp theo.

Áp dụng ban đầu: bọc loop đang có, thêm extension points và budgets cấu hình; chưa tuyên bố đã có đầy đủ inbox, steering, factory resume hoặc request-series của DeepSeek. DeepSeek không có turn budget tích hợp sẵn, nên ohmyt cần giữ giới hạn của mình.

Nguồn: [agent service](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/core/agent/src/index.ts), [loop và giới hạn](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/core/agent-loop/README.md), [turn lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/agent-lifecycle.md).

## 3. Prompt assembly, scope và context

`ctx.systemPrompt` gom named sections theo order, dynamic contexts, variables và tool schemas. Thứ tự deterministic giúp tái lập request và ổn định prefix cache. Scope cho phép agent-specific contribution shadow global contribution. `system-prompt/assemble` là điểm can thiệp cuối vào assembly.

Prompt reusable và runtime facts là các lớp riêng: working directory, sandbox policy hoặc approval policy có thể thay đổi mà không cần trộn tất cả vào một string cố định. Trong DeepSeek, model-visible input được ghi log.

Áp dụng ban đầu: prompt sections có disposer; contributions nhận run scope; tools nhìn thấy phải đúng với tools được phép thực thi. Context budget phải giữ mục tiêu và tool-call/result coherent, không cắt một nửa cặp protocol. Token budget đầy đủ, summary compaction, runtime fact reconciliation và cache-aware prompt history là các bước tiếp theo; giới hạn theo messages/ký tự chỉ là approximation.

Nguồn: [system-prompt registry](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/core/system-prompt/src/index.ts).

## 4. Tools pipeline và approvals

Pipeline DeepSeek gồm pre-execute, monotonic guards, execute, project content, post-execute, normalize/finalize và notification kết quả authoritative. Policy có thể deny hoặc ask trước body. Guards không được middleware phía sau đảo ngược. Around-execute thích hợp cho timeout/metrics; post-execute có thể thay nội dung hoặc block kết quả. Final result được snapshot/freeze trước observer.

Approval là seam một lần: allowed-once mới cấp quyền; rejected, cancelled, unavailable đều deny. Tắt approval provider không được vô tình biến ask thành allow. Hủy công việc phải truyền signal tới tool và chờ body đã bắt đầu đạt trạng thái quiescent; abort promise không chứng minh side effect chưa xảy ra.

Áp dụng ban đầu: lifecycle hooks quanh registry hiện có, giữ validation, PermissionEngine và approval UI làm authoritative policy. Không mở execution song song trước khi phân loại an toàn. DeepSeek cũng ghi rõ classification hiện là unary; tools cần so sánh tài nguyên giữa siblings phải giữ exclusive.

Nguồn: [pipeline](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/tool-execution-pipeline.md), [tools source](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/core/tools/src/index.ts), [approval service](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/interaction/user-approval/src/index.ts).

## 5. LLM adapters và tool protocol

`ctx.llm` có adapter registry theo provider route. Adapter registration là effect và duplicate route bị từ chối. Contract streaming quy định usage trước finish, không có chunk sau finish, arguments của tool calls giữ raw JSON, block indices ổn định và cancellation được truyền tới transport. Native replay metadata chỉ được khôi phục khi adapter sở hữu route phù hợp.

Áp dụng ban đầu: giữ Gateway và adapters đang có, chuẩn hóa assistant tool calls và tool results với call id. Các adapter phải map protocol canonical sang provider wire format tương ứng. Không giả định OpenAI tool messages dùng nguyên dạng cho Anthropic hoặc Google. Feature unsupported cần failure rõ thay vì silently drop.

Nguồn: [adapter cookbook](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/cookbook/adding-an-llm-adapter.md), [LLM runtime](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/llm/llm/src/index.ts).

## 6. Session log, persistence và crash recovery

Session log append-only là nguồn để derive model history. Durable events lưu facts như turn/start, step/start, user/message, assistant/message, tool/call và tool/result. Live agent events phục vụ control/status/streaming. Assistant chunks là transient; một settled message hoặc attempt chứa compact stream. Process crash trước settlement không bảo đảm giữ partial attempt stream.

Persistence contract yêu cầu sequence liên tục, một writer mỗi session trong backend, reads không thấy torn tail, và flush là durability barrier. SQLite có thể phục vụ cùng nguyên tắc mà không chuyển sang JSONL. Log model transcript nên phân biệt với UI activity stream để không ghi TextDelta vào context.

Recovery DeepSeek đóng interrupted step/turn và thêm tool/result lỗi cho calls chưa có kết quả. **Không tự chạy lại mutation chưa rõ outcome.** ohmyt nên đánh dấu run bị gián đoạn, lưu lý do, giữ transcript coherent và để lượt tiếp theo kiểm tra trạng thái thật. Safe interrupted-run closure không đồng nghĩa resume chính xác mọi bước đang dở.

DeepSeek README còn ghi root shutdown có thể thiếu final turn/end trên disk khi agent đang active. Vì vậy ohmyt cần chủ động drain runs, flush và đóng storage sau cùng.

Nguồn: [session subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/subsystems/session.md), [persistence contracts và recovery](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/session/session-persistence/README.md).

## 7. Skills

DeepSeek tách skill providers/catalog khỏi model-facing loader. Agent nhận durable catalog gồm names và mô tả giới hạn độ dài khi tool skill visible; load full body khi cần. `/name` hỗ trợ user invocation. Catalog thay đổi được ghi bằng complete replacement; empty replacement retire catalog cũ. Discovery theo working directory hiện tại.

Áp dụng ban đầu: lazy scoped catalog và loader dùng SkillsManager hiện có; không inject toàn bộ bodies vào mỗi prompt. Catalog visibility và execution visibility phải đồng nhất. Load phải bảo vệ đường dẫn và không vượt scope. Provider priority, runtime providers và slash invocation đầy đủ có thể mở rộng sau.

Nguồn: [skill service](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/skill/skill/src/index.ts), [tool-skill](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/skill/tool-skill/README.md).

## 8. Profiles, bundles và boot

Profile là composition gồm ordered bundles, profile patch, home patch và explicit overlays. Bundle khai báo patch trong package metadata. Patch target row id và thay whole config. Agent presets là scope composition; service isolation cần realm riêng. HMR và plugin manager là các subsystems riêng.

Giai đoạn đầu dùng built-in composition bằng code. Roadmap mới thêm manifest schema, profiles desktop/headless, validation dependency, config overlays và optional hot reload. Không cài plugin từ Internet hoặc cấp quyền tự động chỉ vì có plugin host.

Nguồn: [profiles và launch](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/architecture.md), [app boot](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/boot/app-boot/README.md).

## 9. UI plugins

DeepSeek có client context, slots, conversation definitions và keyed renderers. Business event definitions fold deterministic state theo stable id; chat/trajectory views render snapshots riêng. UI kết hợp durable settlement với live transient events và không tự gán updates cho "tool gần nhất".

Roadmap cho ohmyt: giữ React và SSE trước; thêm renderer registry cho tool/artifact cards, panel slots và settings contributions sau. Cần event ids, replay, reconnect và pagination contracts ổn định trước khi mở frontend plugins. Chưa có client Cordis/plugin transport chỉ từ việc backend dùng Cordis.

Nguồn: [conversation assembly](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/subsystems/conversation.md), [web client](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/subsystems/web-client.md).

## 10. Subagents, connectors và PTC

Subagents là seam có nhiều providers: in-process spawn/fork, ACP, Codex, Claude Code, SDK. Activation manager chịu trách nhiệm lifecycle; child policy không được tùy ý nâng quyền. Teams/task DAG là lớp experimental riêng, không phải yêu cầu cơ bản của plugin host.

PTC tách runtime chạy chương trình khỏi tools và workflow engine. Subcalls vẫn qua tool pipeline; output, approval, cancellation và resource limits phải được audit. Connector/MCP cũng cần provider lifecycle, credentials, scoped tools và disconnect cleanup.

Những phần này để roadmap: trước hết ổn định single-agent, transcript, policy và shutdown. Sau đó triển khai subagent provider đầu tiên với budgets/cancellation/parent lineage; connectors với credentials và tool namespace; cuối cùng PTC với runtime isolation và audit từng subcall. Không quảng bá sandbox chỉ dựa trên plugin boundary.

Nguồn: [capability seams](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/capability-seams.md), [subagents](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/subsystems/subagent.md), [tools pipeline và PTC](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/docs/tool-execution-pipeline.md).

## Phạm vi tích hợp và roadmap

| Chặng | Kết quả cần đạt | Trạng thái trong tài liệu này |
|---|---|---|
| A | Cordis host, services bridges, built-in plugins, lifecycle disposal | Phạm vi tích hợp hiện tại; kiểm chứng trong code/tests |
| B | Prompt contributions, tool hooks, scoped lazy skills, normalized tool protocol | Phạm vi tích hợp hiện tại; kiểm chứng theo provider |
| C | Durable model transcript, safe interrupted-run closure, cấu hình loop/context budgets | Phạm vi tích hợp hiện tại; chưa đồng nghĩa full checkpoint resume |
| D | Token-aware compaction, request attempt tracking, steering/inbox, safe parallel tools | Roadmap |
| E | Profiles, manifests, config overlays, optional HMR/plugin manager | Roadmap |
| F | UI slots/renderers/settings plugins; reconnect/replay contracts | Roadmap |
| G | Subagent providers, connectors/MCP, workflow/PTC | Roadmap |

## Tiêu chí validation

1. Package Cordis pin đúng version; mount/inject/waterfall/dispose được kiểm tra bằng runtime đã cài, không chỉ đọc source HEAD.
2. Tool và prompt registration biến mất khi owner unload; không gỡ contribution của owner khác; reload không nhân listener.
3. Existing daemon API và SSE vẫn chạy; shutdown hủy/drain mọi active run trước DB close.
4. Validation và policy không bị hook bypass. Denied/failed/aborted tool vẫn có đúng một kết quả có call id.
5. Provider adapters nhận canonical assistant/tool history coherent, bao gồm nhiều tool calls, invalid arguments và missing result sau crash.
6. Scoped skills chỉ hiện và load trong scope được phép; agent thấy catalog và gọi loader thay vì nhận mọi body mặc định.
7. Restart không tự replay mutation; run bị gián đoạn có trạng thái terminal rõ và transcript dùng được cho lượt sau.
8. Budgets cấu hình chặn runaway loop; context cropping giữ tool protocol và prompt cần thiết; kiểm tra không dùng credentials hoặc gọi provider thật khi không cần.
9. Tests thực tế bao gồm model → tool → model, approval deny/allow, abort trong streaming/tool, plugin disposal và reopen DB.

Không dùng kết quả build UI để suy ra correctness của agent runtime. Không dùng mock loop thành công để suy ra chất lượng agent trên tác vụ thật. Một bước đánh giá sau tích hợp nên chạy cùng model trên bộ nhiệm vụ đọc repo, sửa lỗi, test, browser và phục hồi gián đoạn để đo completion, tool failures, context loss, thời gian và chi phí.
