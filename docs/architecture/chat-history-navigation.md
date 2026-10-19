# Chat history navigation

The chat displays a small rail inside its left edge once the visible transcript
contains at least three user messages. Each user message is one section;
assistant responses, tool activity and system messages do not add marks.

Hovering or focusing a mark previews the user's text and the opening of the
first nonempty assistant response before the next user message. The whole card
is clickable; it has no section counter or action footer. Document context is removed
using the same display helper as the message renderer. Image-only messages have
an attachment label. Preview content is rendered as text, never as HTML.
Clicking a mark jumps to that user message and briefly highlights its bubble.
Arrow keys, Home and End select marks; Enter jumps and focuses the target;
Escape dismisses the preview. The rail has one tab stop among its marks.

Navigation goes through `useChatFollow`: it cancels the active follow animation
before moving the scroller and keeps following paused while incoming content
grows. Jumping to latest enables following under the existing setting.
There is no return arrow in the history rail. The latest-message arrow sits
centered eight pixels above the composer and follows its height. Session changes clear transient previews. Existing per-session
scroll restoration remains in place.

`ChatHistoryRail` derives marks from the displayed messages, caches their measured
positions and updates the active section on a scheduled scroll callback. A resize
observer refreshes positions when content or the chat viewport changes. Long rails
scroll independently. Below 420 CSS pixels of chat width, a Sections button opens
a text list constrained to that chat's width. Files resizing uses the chat viewport,
not the window width. The rail stays above the measured composer boundary.

No backend endpoint, model request or persisted history copy is added.

Validation:

- `node test/ui/test_chat_history_ui.js`: long history, preview without scrolling,
  keyboard navigation, Escape, streaming growth, absence of a return arrow and session reset,
  narrow layout.
- `node test/ui/test_chat_motion.ts`: existing follow animation calculations.
- `xvfb-run -a npx electron --no-sandbox --ozone-platform=x11 test/ui/test_chat_history_app.cjs`:
  actual application with temporary data and database, message targets, Files
  layout and composer clearance. Requires a current frontend build.
- `npx tsc --noEmit` and `npm run build`.

## Clearing chat history

Settings → Profile provides “Xóa toàn bộ lịch sử chat” with irreversible-action
confirmation in an application modal dialog and a disabled button while deletion
is in progress. Opening the dialog sends no deletion requests. Cancel and Escape
dismiss it; only “Xóa vĩnh viễn” starts deletion. Focus initially lands on Cancel
and stays within the modal until it closes. Native `window.confirm` is not used. The client
fetches the authoritative session list and calls the existing session deletion
endpoint for each chat, including project chats. That endpoint interrupts and
drains session work before removal. Successful deletions clear local message
caches, stream subscriptions and session list entries. A partial failure keeps
remaining chats and shows an error so the user can retry. Chats created after
the initial list was fetched are outside that operation.

Regression: `xvfb-run -a node_modules/.bin/electron --no-sandbox --ozone-platform=x11 test/ui/test_clear_chat_history.cjs`
requires a current frontend build and uses an in-memory database.
