# Validation cho harness alignment

Ngày: 11/10/2026. **Phạm vi được duyệt S1–S9 đã triển khai và qua regression gates.** Live v2 đạt 18/18 criteria trong fixtures giới hạn; xem [live report](deepseek-harness-live-validation.md). Phần baseline và S1–S8 là lịch sử; các gap live/S9 tại mốc cũ đã được xử lý ở phần cuối.

ohmyt: `main` / `8de067e1ba8437b43c25cdc6c396a4762a42ab50`. DeepSeek source checkout/remote HEAD: `d743267388641bc76f17c45ce8b4c231aed1d32c`. Linux, Node `v26.8.1`, Electron/Xvfb có sẵn.

## Thay đổi của lượt review

Chỉ thêm ba tài liệu `deepseek-harness-conformance.md`, `deepseek-harness-upgrade-plan.md`, `deepseek-harness-validation.md`. Không sửa server/frontend/test source, package/dependencies hoặc DB sản phẩm. Build ghi lại `dist/` ignored. Các fixtures dùng SQLite in-memory và workspace tạm.

Untracked baseline được giữ: `.superpowers/sdd/2026-10-09-harness-full/`, `.superpowers/sdd/2026-10-11-harness-upgrade/`, `nul`, `output/`.

## Commands thực sự đã chạy

| Command | Kết quả | Giới hạn |
|---|---|---|
| `git status --short`, `git rev-parse HEAD`, remote HEAD queries | Đã ghi nhận baseline, remote main cùng SHA | Working tree vẫn là source of truth |
| `npm test` | PASS, exit 0 | Bao gồm `npm run test:harness`, và nested `npm run test:harness:upgrade`; không chạy độc lập lặp lại hai scripts này |
| Nested `test:harness:upgrade` | PASS; 10 architecture acceptance scenarios | Offline fixtures: invocation, delegation, quiescence, migration, atomic completion, plugin ownership, context budget, scoped MCP, child cancellation, steering; usage = null |
| `npm run build` | PASS, exit 0 | Existing warning chunks lớn hơn 500 kB; build không thay thế typecheck |
| `./node_modules/.bin/tsc --noEmit` | PASS, exit 0 | `tsconfig.json` include `src`; không typecheck server JS |
| `npm run test:browser-use` | PASS, exit 0 | CDP children, network/egress, evaluate, lifecycle, integration/API, Browser Use/settings/files. Không chứng minh live native browser multi-step task |
| `xvfb-run -a ./node_modules/.bin/electron --no-sandbox test/harness/test_harness_controls_ui.cjs` | FAIL, exit 1 | Renderer `executeJavaScript` failure. Đây là baseline vì không có runtime edit |
| Electron diagnostic copy của controls test trong `/tmp` | FAIL, exit 1; xác định selector không tồn tại | Copy chỉ thêm diagnostics, import absolute và output path tạm; không sửa test repo |
| `node /tmp/ohmyt-review-20261011/probes.mjs` | PASS, exit 0; assertions xác nhận **bugs tồn tại** | Production daemon/host/driver/invocation với mock model/browser, không dùng live provider hoặc website |
| In-memory `ToolPipeline` abort-after-body-start probe | Signal aborted nhưng `status:success` | Isolated pipeline contract, chưa phải full external mutation failure injection |
| `git diff --check` | PASS trước và sau khi viết docs | Docs mới untracked nên kiểm tra riêng whitespace/newline/code fences: PASS; không thay cho behavior tests |

Logs audit tại `/tmp/ohmyt-review-20261011/`: `npm-test.log`, `build.log`, `typecheck.log`, `browser-use.log`, `controls-ui.log`, `controls-diagnostic.log`, `probes.log`. Đây là đường dẫn tạm, không cam kết retention; kết luận và kết quả chính được lưu trong tài liệu này.

Diagnostic Electron xác định script lỗi đầu tiên truy vấn `button[aria-label="Gửi yêu cầu"]` rồi đọc `.disabled`. Trong trạng thái đang chạy, `src/components/Composer.tsx:826` đổi label thành `Gửi tin nhắn tiếp theo`, nên selector cũ trả null. Đây là lỗi test selector đã xác định; không kết luận controls sản phẩm bị hỏng từ failure này. Assertions tiếp theo, gồm assumptions send-now/steering, chưa được chạy tới và vẫn cần kiểm chứng khi cập nhật test.

## Probe observations

| Probe | Kết quả quan sát |
|---|---|
| Batch: `fixture_read({})` + valid sibling | `requests=1`, `bodies=[]`, canonical receipts 0, run failed `Missing required argument "value"`. Valid sibling không chạy, model không được correction request |
| Required fixture failure + unrelated success | `requests=2`, hai receipts, run `completed`; `RunCompleted.summary = Tác vụ hoàn thành thành công` dù final mock text nói chưa được xác minh |
| Browser observe failure ba lần | `requests=3`, bodies 3, receipts 3; run failed `conclusionRequested is not defined` |
| Compaction cùng source input hai lần | `summaries=2`; function không reuse. Production host cũng không đọc checkpoint để reuse ở request kế tiếp |
| Tool abort trong body rồi return normally | `aborted=true`, result `success`; thiếu post-body cancellation check |

Initial audit fixture setup cần sửa mock browser lifecycle và bổ sung field avatar trước khi probe đạt đúng đường chạy. Các setup failures này không được tính là bugs sản phẩm hoặc kết quả probes thành công.

## Guarantees đã có / chưa có

- Đã có tests cho canonical invocation scope/policy/identity, body drain, SQLite semantic log, migration backups, atomic final settlement, plugin ownership, request envelope accounting, connectors và child cancellation. Giữ implementations này.
- Existing deterministic pass không phủ những bugs probes vừa tái hiện. Chưa chứng minh toàn bộ crash cuts, oversized result live/replay equality, objective retention qua reusable compaction hoặc completion verification độc lập.
- Chưa chạy `npm run test:harness:ui` đầy đủ, live coding/research/browser/subagent benchmark hoặc upstream test suite. Không dùng số benchmark lịch sử để khẳng định chất lượng agent hiện tại.
- Không có paid provider calls trong audit fixtures; actual usage/cost và cải thiện tốc độ/chất lượng chưa đo. Không báo unknown thành 0.
- Migration code đã đọc: initial populated DB backup `.before-harness-v1.backup`; history import `.before-harness-history-v1.backup`, mode 0600; dry-run và migration/cascade tests đã chạy qua nested suite. Không migrate/restore DB sản phẩm thủ công.
- Rollback lượt này: bỏ ba docs mới nếu không dùng; không cần restore DB. Runtime bugs chưa được sửa và được đưa vào plan từng slice.

Không công nhận full validation xanh: baseline desktop controls test đang fail và các correctness probes chứng minh contracts còn thiếu.


## Implementation validation S1–S8 — lịch sử trước phần S9/live

Đã triển khai S1–S8. Thay đổi là working tree trên HEAD baseline; acceptance runner ghi `workingTreeDirty:true` và fingerprint source thay vì coi HEAD cũ là bản code đã sửa. Fingerprint của acceptance cuối: `fb3b222ceca715e533931c6a4d7ea4c8f459dd7e4b670c2ba231c07f38d1d32c`. Không commit, không thay runtime bằng upstream và không tuyên bố full DeepSeek parity.

| Kiểm tra đã chạy | Kết quả cuối |
|---|---|
| `npm test` | PASS, exit 0; gồm nested harness và upgrade gates |
| `npm run test:harness:upgrade` | PASS, exit 0; 22/22 architecture scenarios, fixture version 2 |
| `npm run build` | PASS, exit 0; vẫn có cảnh báo chunk lớn hơn 500 kB |
| `npx --no-install tsc --noEmit` | PASS, exit 0 |
| `npm run test:approvals` | PASS, exit 0 |
| `npm run test:browser-use` | PASS, exit 0; CDP/network/egress/evaluate/lifecycle/integration/API/settings/files |
| `npm run test:browser:vision` | PASS, exit 0; gồm Electron computer use, Unicode/drag/snapshots/cancel |
| `npm run test:harness:ui` | PASS, exit 0; actual settings, queue/send-now, artifacts/connectors/presets, VI/EN, light/dark, viewports, PTC |
| `git diff --check` | PASS |

Sau các sửa cuối về recovery khi run đã aborted và phân loại read-only, đã chạy lại acceptance đầy đủ và focused atomic completion/invocation/quiescence/child cancellation. Khi tiếp tục phiên làm việc, đã chạy lại toàn bộ npm test, build, typecheck, approvals, browser-use, browser vision và Electron harness UI trên working tree hiện tại; tất cả exit 0. Không cộng số lần rerun hoặc nested scripts thành số test khác nhau.

### Bằng chứng bổ sung

- Per-call invalid args/unknown name có receipt và correction detail; valid siblings vẫn chạy; policy denial không gọi body; cached result không vượt scope; changed arguments trên same ID bị chặn.
- Browser observation errors và identical action/image dừng ở ba lần; progress reset counter; skipped calls vẫn có result. Exception của thao tác có thể ghi dữ liệu được giữ unknown và chặn các thao tác tiếp theo.
- Hủy trước body là not-started; hủy sau body dù return normally là unknown. Reviewer timeout phải chờ physical request drain; JSON allow đến muộn không cấp quyền.
- Outcome tách protocol/task/verification, commit cùng final/UI mirror. Required failure không bị unrelated read che; independent oracle thất bại không để final answer tự nhận success. Child partial/blocked không trở thành verified parent result.
- Request attempts dùng budget root, gồm retry/title/summary/approval/browser planner/browser extraction/children. Actual reported usage và input accounting được giữ tách; thiếu usage hoặc pricing thì null. Usage trong fixtures là số giả lập, không phải đo provider live.
- Canonical tool observation live và replay giống receipt; output dài có full-text artifact/hash/bytes theo scope, cascade khi xóa message. Browser pixels giữ ephemeral; context envelope vẫn có quyền cắt thêm observation khi request vượt budget. Artifact vượt giới hạn store hoặc lỗi ghi có marker “full output unavailable”, không đổi outcome body thành success mới hay retry.
- Bảy process-kill cuts: intent, body start, effect trước receipt, abort sau effect, receipt trước checkpoint, trước terminal UI insert và sau terminal commit. SQLite integrity qua; recovery không gọi body; not-started/unknown/committed receipt được phân biệt; legacy snapshot không được nâng giả lên guarantee body tracking mới.
- Compaction: ba main requests trên cùng old span chỉ dùng một summary request; reuse qua reconstructed store. Source edits invalidate; aborted summary không commit. Facts/decisions/openTasks/permission boundaries/artifact refs được đọc từ structured summary, không hardcode fields rỗng. Summary vẫn là untrusted model context; không cấp permissions.
- Independent offline task trials: coding file có hidden input checks, research claim/citation đối chiếu source fixture và browser-server state đối chiếu HTTP state. 3/3 positive được verified, 3/3 negative bị đánh dấu failed, **false success 0/3 negative**. Đây là scripted stream contracts, không phải phép đo khả năng coding/research/browser của model thật.

Kết quả machine-readable: offline results (`deepseek-harness-offline-results.json`, artifact không có trong repo). Logs tạm: `/tmp/ohmyt-implementation-20261011/` (`npm-test-final.log`, `build-final.log`, `tsc-final.log`, `browser-use-final.log`, `vision-final.log`, `ui-final.log`, `task-oracles.json`; approvals exit 0 được ghi nhận trực tiếp trong phiên).

### Những lỗi test/giao diện đã xử lý

Controls test cũ dùng selector của trạng thái idle và hiểu send-now là steering. Test mới kiểm tra replacement theo contract thực tế và chờ body drain. Settings routes connectors/extensions bị whitelist loại bỏ; đã nối menu/route với components sẵn có. Các assertions navigation cập nhật từ 6 lên 8 mục.

Surface reload từng có timing failure `document.lang=''` khi renderer chưa mount; thay wait cố định bằng bounded readiness predicate. Computer screenshot có thể đổi revision trong lúc capture; test chỉ retry observation tối đa ba lần cho đúng lỗi transient, không retry click/type/drag. Tests settings/surfaces ghi vào thư mục tạm, không ghi đè `output/` hoặc `.superpowers/` của người dùng.

### Giới hạn và rollback

- Chưa chạy provider live, upstream full suite hoặc benchmark model intelligence; live token/cost/cache-hit/performance improvement vẫn chưa đo. Không dùng kết quả fixtures làm % improvement.
- Verifier là callback phía host/test, không lấy từ request API hoặc model text. Không thêm evaluator LLM sau mọi task; tác vụ có tools mặc định vẫn unverified khi thiếu oracle.
- S9 durable goals/auto continuation và redesign lớn vẫn deferred theo plan. Không chạy migration/restore trên DB sản phẩm. Event types/receipt/outcome/checkpoint thêm theo hướng additive; legacy transport vẫn hoạt động.
- Workspace có thay đổi DocumentWorkspace/dependencies/Electron từ công việc khác trong lúc triển khai. Không stage/revert hoặc chỉnh các phần đó; các hunk route settings trong App.tsx giữ cùng các hunk document workspace. Build/typecheck đánh giá working tree chung tại thời điểm chạy.
- Khi rollback, giữ semantic events/artifacts đã ghi và không replay external mutations. Tắt/revert checkpoint reuse không làm mất history gốc. Unknown external effects cần kiểm tra trạng thái trước thao tác mới.


## Final validation S1–S9 và live — 11/10/2026

S9 đã hoàn tất theo yêu cầu tiếp tục của người dùng. DeepSeek HEAD được kiểm tra lại bằng git remote: `d743267388641bc76f17c45ce8b4c231aed1d32c`, giữ nguyên so với source study. ohmyt HEAD vẫn `8de067e1ba8437b43c25cdc6c396a4762a42ab50`; code chưa commit, working tree dirty. Acceptance fingerprint cuối: `7a279e38e7277f86251808a784871bd1337715f9705b1c5d9efb115fb74cc069`; runner hiện hash server/src/electron, fixture/default tests và package manifests, không dùng HEAD cũ thay code đã sửa.

| Command thực sự chạy | Kết quả |
|---|---|
| `npm test` | PASS exit 0, gồm nested `test:harness`, `test:harness:upgrade` và 26/26 acceptance scenarios |
| `node test/evals/harness/architecture_acceptance.js` | PASS 26/26; bản cuối cũng chạy trong npm test |
| `npm run build` | PASS exit 0; còn warning chunk >500 kB |
| `npx --no-install tsc --noEmit` | PASS exit 0 |
| `npm run test:approvals` | PASS exit 0 |
| `npm run test:browser-use` | PASS exit 0 |
| `npm run test:browser:vision` | PASS exit 0, gồm actual Electron computer use |
| `npm run test:harness:ui` | PASS exit 0, actual Electron Settings/controls/surfaces/goal VI/EN |
| `node test/harness/test_harness_task_oracles.js` | PASS 6 scripted trials; 3 positive verified, 3 negative failed, false success 0 |
| opt-in `npm run eval:harness:quality` | PASS runner exit 0, 18 records v2: 15 positive verified + 3 policy denial criteria |
| `git diff --check` | PASS |

Sau cập nhật UI cuối, typecheck phát hiện native input event chưa được khai báo đúng InputEvent cho isComposing; đã sửa kiểu mà giữ kiểm tra IME. Build/typecheck, 26 acceptance scenarios và cả composer/controls Electron UI được kiểm tra lại.

Không có lint script hoặc coverage instrumentation để báo lint/coverage %. Không chạy upstream DeepSeek suite hoặc mọi OS/provider live route; coverage claim chỉ áp dụng các commands trên. Không nhân nested suites hay reruns thành test count.

### Phần bổ sung và files

- `server/harness/goals.js`: semantic event fold/revision, creation/adoption/progress, exact round admission, plan context, bounded same-session continuation, settle và cold recovery. Default request/tool limits áp dụng chung cả child; round mặc định 3, tối đa 20; goal không có permission engine hoặc tool executor mới.
- `server/agent_loop.js`, `driver.js`, `host.js`, `server/index.js`: adopt human turns, root budget, goal-context pinning, child capability fence, human interruption, admission transaction và shutdown/body/request drain.
- `server/api.js`, `src/api.ts`, `contracts.*`: chat-scoped goal API + compatible additive events/types. No new goal table/destructive migration; semantic log vẫn sole durable authority.
- `default_prompt.js`, `permissions.js`, `extensions.js`: model goal guidance + canonical policy; user có thể disable tools/goals trong Extensions. Không tạo planner request phụ cho simple chat. Model instructions từ document/web không được coi là authorization; permission/scope vẫn enforce ở tool pipeline.
- `src/components/MiniGoal.tsx`, Composer/ChatStage/ChatMessage: menu Goal hoặc `/goal` chọn nhãn xanh trước nội dung soạn và giữ màu trong tin nhắn đã gửi. Không mở popup. Mini goal thực tế có icon pause/resume/edit/cancel và human confirmation ở review_required; cập nhật chat khi goal round settle. Chỉnh objective giữ step IDs/status; callback cũ không ghi state của chat mới. Không yêu cầu form/round count để bắt đầu. Plan done vẫn self-reported; human confirmation không giả thành independent oracle. Hai Electron tests kiểm tra chip/mini controls, VI/EN, responsive, draft preservation và completed-state hide persistence. GoalPanel dialog adapter cũ được giữ trong source nhưng không mount vào product flow hiện tại.
- `history_summary.js`, `host.js`: bounded old-history chunks, root accounting, versioned checkpoint method, no partial checkpoint on cancel. Giữ checkpoint v2 additive; key mới invalidates method cũ.
- Tests mới: goals, API, 4 goal process-kill cuts, goal composer/controls Electron UI, oversized summary; live runner + four retained JSONL cohorts. Acceptance tăng từ 22 lên 26 scenarios.

### Bằng chứng S9

Goal reservations/revisions ngăn stale round admission. Round mới chờ toàn bộ AgentRegistry ownership/request/tool/child drain. Input mới, pause/cancel, denied/unknown mutation và partial/failed outcome dừng auto chain. Restart đưa active goal về paused, disarm và không refund round/request đã tiêu thụ, không replay mutation. Bốn SIGKILL cuts gồm reservation, external effect, terminal commit và goal settle; cùng bảy cuts S6 thành 11 crash cuts, đều kiểm tra SQLite integrity và không duplicate body.

Repeated abort/recovery trong cùng chat từng tạo `undefined:end` từ compatibility StepStarted payload không có canonical stepId, gây event-ID collision. AgentLoop không append semantic step lần thứ hai từ public UI notifications; driver giữ sole canonical step writer. Driver finally và cold recovery chỉ đóng canonical steps có identity; tests hủy hai live turns và recover hai interrupted turns trong cùng session xác minh không collision, đủ step/end và ownership release. Không rewrite sự kiện cũ.

Adopted human turns đếm cả attempts trước goal_start; resume từ human turn mới rebind đúng driver-held budget, giữ root limit và durable attempt usage qua cold reader. Sửa plan không được thực hiện khi paused human request còn chưa drain; resume không xóa plan nếu model không gửi steps mới. Test disable planning xác nhận không có goal tool/context/model overhead trên direct reply, không start qua API và không tạo goal qua explicit /goal khi plugin/capability bị tắt. Explicit composer goal được host adopt trước model request đầu; semantic events ghi durable goal, user message giữ text sạch/Goal metadata, effects vẫn đi qua canonical tool permissions.

UI của chat khác thay đổi cùng workspace theo yêu cầu của người dùng: Goal là nhãn xanh cùng dòng trước input, không có dấu ×, Backspace đầu dòng bỏ nhãn. Đã giữ nguyên và không mở dialog khi chọn Goal. UI cuối dùng MiniGoal icon controls theo yêu cầu mới, giữ mục tiêu/trạng thái và pause/resume/edit/delete hoạt động thật. Human review confirmation bổ sung riêng; không còn adapter dialog tự bật hoặc status thứ hai. Keyboard/modal focus được kiểm tra ở snapshot adapter trước, không gán nó thành UI cuối. Full Electron suite chạy lại trên MiniGoal sau build current.

### Live evidence, giới hạn và rollback

Kết quả/dataset/config/fingerprints/latency/unknown metrics và toàn bộ failures của cohorts cũ nằm trong [live report](deepseek-harness-live-validation.md); machine-readable trong offline results (`deepseek-harness-offline-results.json`, artifact không có trong repo). Không suy 18/18 nhỏ thành 100% real-world reliability; không có identical baseline comparison để báo improvement. Actual tokens/cost và generalized recovery/tool-error rates chưa có measurement đủ, báo null.

S9 dùng thin objective/step plan; chưa clone upstream separate plan-mode review protocol, dependency DAG/replanning engine, request-series protocol, dynamic plugin execution, OTLP exporter hay full upstream runtime surface. Những phần này vẫn DEFER có chủ ý trong plan; không phải claim parity. Goal model guidance không là bảo đảm rằng model luôn chọn đúng lúc tạo goal; user có thể disable planning và mọi effects vẫn bị policy/scope giới hạn.

Các thay đổi DocumentWorkspace/dependencies/Electron và phần UI khác của workspace được giữ nguyên; không stage/revert hoặc commit công việc khác. Build/types đánh giá working tree chung tại thời điểm chạy. Tests/live effects dùng DB/workspace tạm, không chạy migration/restore trên DB sản phẩm.

Rollback: khi hệ thống idle, tắt extension tools/goals để dừng planning mới; pause active goal và kiểm tra unknown actions trước khi tiếp tục. Muốn revert source, chỉ revert các hunks harness đã review, giữ additive semantic events/artifacts và không replay external mutations. Goal/cache projections có thể đọc lại từ log; không xóa log để rollback. Back up DB trước thay đổi reader/schema ở một rollout riêng.

Logs tạm `/tmp/ohmyt-implementation-20261011/`: s9-tests-complete.log, s9-acceptance-release.jsonl, s9-build-release.log, s9-types-release.log, s9-approvals-release.log, s9-browser-release.log, s9-vision-release.log, s9-ui-release.log, s9-live-quality-v2.log. Durable reports/JSONL trong docs là kết quả giữ lại chính.
