# Trình duyệt tích hợp desktop

Desktop cũng hỗ trợ [computer use bằng ảnh và chuột ảo](browser-computer-use.md) với model được cấu hình vision + tools.

Bản Electron dùng Chromium có sẵn, không tải extension hoặc ghép mã. Bấm biểu tượng trình duyệt cạnh chia sẻ, chọn **Mở trình duyệt**, mở trang và chia sẻ các tab với cuộc trò chuyện. Có nhiều tab, thanh địa chỉ/tìm kiếm, quay lại, tiến tới, tải lại và đóng tab. AI dùng cùng bộ công cụ đọc/bấm/nhập/cuộn/điều hướng với các tab đã được chọn.

AI cũng có thể gọi `browser_open({url})` để mở website HTTP/HTTPS trong tab mới và tự hiện khung Chrome của chat đang xem, không cần bấm icon trước. Tool trả `tabId` để đọc hoặc điều khiển trang ngay sau khi tải. Chỉ bản desktop có tool này; chat khác đang chạy nền không được tự giành khung của chat hiện tại. Quyền mở trang tuân theo chế độ cấp quyền của chat và các quy tắc từ chối điều hướng. Kiểm thử cả agent loop và UI Electron: `npm run test:browser:auto-open`.

Phiên đăng nhập nằm trong partition riêng `persist:ohmyt-browser`, giữ qua lần khởi động. Không tự nhập cookies hoặc các tab Chrome ngoài app. Chrome extension là phương án riêng cho bản web hoặc các tab bên ngoài.

Trang chạy sandbox, không Node/preload của app; thao tác AI chạy trong isolated world với kiểm tra origin. Đổi tên miền cần chia sẻ lại. Nội dung website không được coi là chỉ dẫn. Quyền và giới hạn theo cuộc trò chuyện giữ nguyên.

Nghiên cứu: https://developers.openai.com/es-419/docs/browser?surface=app và https://www.onorca.dev/docs/browser/overview — cả hai có trình duyệt tích hợp; Orca dùng Chromium và profile riêng. Không triển khai nhập cookies trong thay đổi này.

Kiểm chứng Chromium thật trên trang HTTP cục bộ: `xvfb-run -a node_modules/.bin/electron --no-sandbox test/test_integrated_browser.cjs`. Kiểm tra tải trang, đọc controls, nhập văn bản, từ chối sai origin và tab đã đóng. Chưa kiểm thử đăng nhập dịch vụ bên thứ ba.

---

# Chrome Connect

The Chrome button immediately to the left of Share opens connection setup and per-chat tab access. Share is an icon-only button with an accessible name and tooltip.

## Setup

1. Restart ohmyt after this update.
2. Open a chat and click Chrome in the top-right corner.
3. Download and extract `ohmyt-chrome.zip`.
4. Open `chrome://extensions`, enable Developer mode, choose Load unpacked, and select the extracted folder containing `manifest.json`.
5. In ohmyt, create and copy the connection code. Open the ohmyt Chrome extension, paste the code, and click Connect. Codes expire after ten minutes and work once. Repeat pairing after restarting the local service.
6. On the website to use, open the extension and click Allow this page. Chrome asks for website permission.
7. In ohmyt, select tabs and share them with the current chat.
8. Ask the agent to inspect or interact with those tabs. Normal ohmyt tool approval rules apply. Revocation removes that chat's grants; disconnecting clears all grants.

## Behavior

Tools: `browser_tabs`, `browser_read`, `browser_click`, `browser_type`, `browser_scroll`, and `browser_navigate`. Reading returns visible text and identifiers for up to 200 interactive elements. Click and type use identifiers from the latest read. Navigation stays within the selected site's origin; share the new site again for access across origins. DOM changes require reading again. The Chrome extension handles standard DOM controls and does not implement arbitrary JavaScript evaluation, cookie access, browser history, downloads, screenshot vision, cross-origin frames, or arbitrary desktop clicks.

Permission-sensitive fields (passwords, file uploads, one-time codes and identifiable payment fields) are excluded from element snapshots and cannot be typed into by these tools. Ordinary website text can still contain personal data. The UI tells users that read content may be sent to their configured model provider. Site content is untrusted input; the agent's system prompt explicitly says it cannot authorize actions.

A project run copies only the registered Chrome tools into its scoped registry. The bridge checks session ID and shared tab ID on every action. Explicitly sharing tabs allows these browser tools under LOCAL_ONLY; unrelated network tools remain blocked. Existing tool permission rules still apply. Project deletion/session deletion revoke corresponding grants.

The dedicated bridge binds to loopback on a random port, checks Host and extension Origin, and requires an ephemeral pairing secret or authenticated device token. The token stays in Chrome's local extension storage. The app API keeps its existing runtime authentication. No debugger or Chrome remote-debugging port is enabled. Pending queued operations are canceled on revoke, abort, and disconnect; actions already executed in Chrome cannot be undone by revocation.

## Validation

- Bridge tests cover pairing replay, bad tokens/origins, per-chat and per-tab isolation, revoke/abort, reconnection, API routes, ZIP delivery, and an actual agent loop with a simulated Chrome client.
- Extension tests cover its Chrome API adapter, isolated-world injection, origin checks, sensitive-field filtering, stale elements, scrolling and DOM clicks using a controlled DOM test context.
- UI checks cover setup, code generation, selected tabs, share state and revocation with a simulated extension against an isolated local database.
- Project isolation/migration, local runtime and tool-budget regression tests pass.
- Production build and TypeScript validation pass.
- The extension has not been installed into the user's Chrome profile. A real Chrome end-to-end run needs the installation and pairing steps above.

## Research

- OpenAI browser extension flow: https://learn.chatgpt.com/docs/chrome-extension
- Chrome optional website permissions: https://developer.chrome.com/docs/extensions/reference/api/permissions
- Chrome isolated scripting: https://developer.chrome.com/docs/extensions/reference/api/scripting
- Manifest V3 worker lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle

This is an ohmyt extension; the OpenAI extension does not connect to ohmyt.
