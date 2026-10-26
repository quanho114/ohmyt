# ohmyt CLI

CLI dùng chung daemon/harness với ứng dụng, hỗ trợ chat trong terminal và chạy
tác vụ từ script. Cần Node hỗ trợ `node:sqlite` như backend hiện tại; chạy
`npm install` theo lockfile nếu chưa có dependencies.

## Chạy từ repo

```sh
npm run cli -- --help
npm run cli -- -C /duong/dan/project
npm run cli -- exec -C /duong/dan/project --create-project "Giải thích project"
npm run cli -- exec --json -C /duong/dan/project "Kiểm tra build"
cat task.txt | node bin/ohmyt.js exec - -C /duong/dan/project
```

Để có tên lệnh `ohmyt` trong PATH khi phát triển, chạy `npm link` một lần tại
repo. Sau đó dùng `ohmyt`, `ohmyt exec`, `ohmyt resume --last`.
Tên npm package vẫn là `sky`; tên executable là `ohmyt`.

CLI tự attach desktop runtime nếu có đúng một instance được phát hiện.
Desktop cần được khởi động lại sau khi cập nhật code để publish discovery và
hỗ trợ API CLI. Nếu chưa có runtime, CLI tự start headless với dataDir mặc
định `~/.ohmyt/data`, token/discovery ở `~/.ohmyt/runtimes`.
Đây là profile riêng: CLI không sao chép provider credentials từ profile khác.
Cách thuận tiện để dùng cấu hình model của desktop là mở desktop trước rồi
chạy CLI. `/model` chọn model đã được cấu hình trong runtime đó.

```sh
ohmyt daemon start --data-dir /duong/dan/profile
ohmyt -C /duong/dan/project --data-dir /duong/dan/profile
ohmyt daemon stop --data-dir /duong/dan/profile
ohmyt status
ohmyt doctor
```

Có nhiều runtime thì chọn `--data-dir` hoặc endpoint cụ thể, CLI không tự chọn
profile khác. Thư mục project phải nằm ngoài dataDir của runtime; backend từ
chối project chứa cơ sở dữ liệu. Nếu dùng profile development có `data/` trong
repo ohmyt, hãy chọn project khác hoặc một profile có dataDir bên ngoài repo.

Attach daemon tự quản lý:

```sh
ohmyt --endpoint http://127.0.0.1:3188 --token-file /private/runtime.token
# Chỉ với daemon development không xác thực:
ohmyt --endpoint http://127.0.0.1:3188 --dev
```

CLI chỉ nhận HTTP loopback; token đọc từ private file (POSIX mode 0600).
Không đặt token vào URL hoặc arguments. `OHMYT_RUNTIME_DIR` cho phép đổi
thư mục discovery, hữu ích cho môi trường test. Headless ghi log vào
`DATA_DIR/daemon.log`; log và token là dữ liệu người dùng, không commit.

## Chat trong terminal

Enter gửi, Alt+Enter xuống dòng; Shift+Enter hoạt động khi terminal gửi được
modifier đó. Paste nhiều dòng qua bracketed paste không tự gửi. Left/right,
Home/End, Backspace/Delete chỉnh nội dung; up/down xem lịch sử hoặc chọn slash
command. Menu model/chat/quyền hỗ trợ gõ để lọc, up/down và Enter. Ctrl+O hiện
chi tiết tool gần nhất với preview giới hạn 32 KiB. Tab hoàn thành command.
Output model/tool được lọc control sequences;
NO_COLOR tắt định dạng màu Markdown cơ bản.

| Lệnh | Hành vi |
| --- | --- |
| `/help` | Danh sách lệnh |
| `/new` | Chat mới trong project hiện tại |
| `/resume [ID]` | Chọn hoặc mở chat đã lưu trong cùng project |
| `/model [PROVIDER_ID/MODEL_ID]` | Chọn session model từ runtime |
| `/permissions [ask/auto/full]` | Đổi preference cho run tiếp theo; full cần xác nhận riêng |
| `/status` | Context usage, run state và hàng đợi |
| `/diff` | Nhờ agent đọc và trình bày git diff qua công cụ project |
| `/review [TEXT]` | Chat code-review mới, giữ yêu cầu duyệt mutation của workflow |
| `/fork` | Branch chat bằng session branch API hiện có |
| `/steer TEXT` | Gửi chỉ dẫn vào tác vụ CLI đang chạy |
| `/stop` | Dừng tác vụ hiện tại do CLI khởi tạo, chờ cleanup |
| `/exit` | Thoát; khi đang chạy có lựa chọn dừng hoặc detach |

Gõ prompt khi run đang chạy sẽ enqueue. CLI theo dõi các submission do chính
nó gửi, không dùng “run mới nhất” làm kết quả. Resume giữ project scope; đổi
cwd không đổi quyền session. Resume một run do client khác khởi tạo là chế độ
quan sát: interrupt chỉ detach, không tự abort tác vụ của client đó.

Approval chỉ có allow once hoặc deny, mặc định deny. Câu hỏi hỗ trợ lựa chọn,
free text và `/skip`. Nếu desktop đã trả lời, terminal đóng câu hỏi hết hạn.
Ctrl+C/Escape dừng run do CLI khởi tạo; lúc mở menu Escape đóng menu trước.
CLI không dừng shared daemon khi thoát; `daemon stop` chỉ áp dụng headless owner.

`ohmyt review`, `ohmyt fork ID`, `ohmyt sessions list` và
`ohmyt resume ID|--last` cũng có thể dùng trực tiếp ngoài chat.
`/diff` và review dùng model/tool hiện có, không phải git viewer độc lập.

## Dùng trong script

```sh
ohmyt exec --session SESSION_ID -C /project "Chạy kiểm tra"
ohmyt exec --enqueue --session SESSION_ID -C /project "Tác vụ kế tiếp"
ohmyt exec -m provider/model -o answer.txt -C /project "Giải thích mã"
ohmyt exec --json -C /project "Kiểm tra lỗi" > events.jsonl
```

Text mode: stdout chỉ final answer, progress trên stderr. `--json` xuất JSONL
version 1 với submission/run IDs, assistant deltas/reset, tool activity,
interaction và kết quả cuối. `run.completed` bao gồm `answer`, `outcome` và
`settled`; consumer phải dùng final answer, vì delta có thể thuộc bước trung gian.
Không coi reconnect/crash là exactly-once output. Final output file chỉ được
ghi khi chỉ định `-o`/`--output-last-message`.

| Exit | Ý nghĩa |
| --- | --- |
| 0 | Run completed, outcome không báo task failed/blocked/partial/unknown |
| 1 | Tác vụ lỗi, bị chặn, một phần hoặc chưa xác định thành công |
| 2 | Sai arguments, project scope hoặc session conflict |
| 3 | Cần approval/human input; exec hủy tác vụ của nó và chờ cleanup |
| 4 | Kết nối/protocol lỗi hoặc cleanup/outcome chưa xác nhận |
| 130 | Bị interrupt |

Exec không tương tác và không tự duyệt quyền. Backend vẫn kiểm tra DENY,
scoped grants, sandbox availability và run-bound approvals. Gửi lại submission
sau response bị mất giữ nguyên ID/nội dung; CLI không tự replay tool mutation.
Run completed không đồng nghĩa mục tiêu đã được xác minh: `outcome` giữ nguyên
phân biệt protocol/task/verification của harness.

## Kiểm tra và giới hạn hiện tại

```sh
npm run test:cli
npm run test:cli:coverage
npm run test:cli:desktop   # Linux + xvfb-run + Electron
```

Đã kiểm tra trên Linux với Node, PTY và Electron utility process dùng dữ liệu
tạm. Không có live model eval hay xác nhận tương đương terminal/sandbox trên
Windows/macOS. Windows dùng quyền kế thừa của thư mục profile; chưa bổ sung
trình quản lý ACL riêng. Profile lock là cooperative OS listener trên một cổng
loopback suy từ dataDir; collision/port đang bị chiếm báo lỗi, không mở DB thứ hai.
Daemon được mở qua executable development cũ chưa tham gia lock/discovery này.

Composer hiện có scrollback, status, slash completion, các picker model/chat/quyền
và Markdown cơ bản;
chưa có đầy đủ code highlighting, interactive diff viewer, file/image picker,
`/compact`, hoặc quản trị MCP/goals trong terminal như các mục tiêu dài hạn
trong [thiết kế](architecture/cli-design.md). Shared harness vẫn cung cấp công
cụ/model đã cấu hình; CLI không đi kèm tài khoản/provider mới.
