# Approval checkpoint presentation

`src/components/PermissionModal.tsx` presents tool approvals; backend policy,
scope and decision semantics remain in the canonical authorization pipeline.

HTML preview approvals show the operation, requested file name and UTF-8 payload
size. The summary explains that this tool creates a preview card in chat; the
approval dialog does not execute HTML or write a file. Full target/input parameters
and the backend description remain available under the collapsed details section.
HTML source is directly readable in a keyboard-scrollable code block; the original
parameters and description sit in a nested details section. All are escaped text,
never rendered as HTML inside an approval.

Unknown tools display their tool name and at most 240 target characters in the
summary, with an explicit truncation notice and full parameters in details. Shell
commands remain visible in a bounded, scrollable code block. File edits preserve
their old/new span review. The dialog fits the viewport; its content scrolls while
the heading and decision buttons remain available.

Run `node test/ui/test_approval_checkpoint_ui.js` for decisions, remembered scope,
keyboard dismissal, long HTML, escaped full parameters and responsive layout.
Run `node test/ui/test_file_edit_ui.js` for file edit review. Both require the
installed Playwright Chrome channel; no live model or user data is needed.
