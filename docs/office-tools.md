# Office tools

`office_read`, `office_write` and `office_edit` let the agent create and maintain real `.docx` and `.xlsx` files inside the workspace, with a round-trip verification story instead of preview-only output.

## Behavior

- `office_write` replaces the whole file: `.docx` takes `{title, paragraphs[]}`, `.xlsx` takes `{sheets:[{name, rows[][]}]}` (cell values: text, numbers, booleans). Both produce standard Open XML zip packages (`fflate` for docx, SheetJS for xlsx).
- `office_read` extracts text/paragraphs from `.docx` and the grid of each sheet from `.xlsx` — the same content the agent can then re-verify after editing.
- `office_edit` is deliberately narrow: `.docx` supports `appendParagraphs` only (existing paragraphs are never rewritten in place); `.xlsx` supports one-cell updates via `cell` (A1 notation) plus optional `sheet`, with `null` clearing the cell. After an edit the agent should `office_read` to verify.
- Paths go through the canonical workspace boundary (`resolveWorkspacePath`): outside-workspace and secret paths fail closed; project scope gates the tools like the other workspace tools.
- PowerPoint authoring is not implemented: the viewer can read `.pptx`, but there is no validated writer yet. Treat `.pptx` creation as out of scope rather than producing unverified packages.

## Tests

`test/core/test_office_tools.js` covers docx/xlsx create-read-edit round trips, package validity ([Content_Types].xml and part presence), cell clearing, validation failures, workspace boundaries and project permission gating.
