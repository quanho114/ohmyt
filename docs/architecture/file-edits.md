# Guarded text edits

`fs_read` returns `sha256` computed from the bytes actually read. `fs_edit`
accepts `path`, `expectedHash`, nonempty `oldText`, literal `newText`, and optional
`replaceAll` / `dryRun`. It edits an existing regular UTF-8 file up to 2 MiB.
Unlike `fs_write`, it does not create a file or accept an unconditional rewrite.

The caller reads first, copies the observed hash and supplies an exact matching
text span. Whitespace and line endings are significant. A stale version returns
`success:false, code:FILE_CHANGED`; absent and ambiguous matches return
`EDIT_NOT_FOUND` / `EDIT_AMBIGUOUS`. No target write occurs for these results.
`replaceAll:true` explicitly replaces all nonoverlapping matches. Replacement
strings are literal, including `$` and backslashes. Untouched bytes retain their
line endings and UTF-8 BOM; supplied new text is not normalized.

`dryRun:true` computes the same checks and bounded diff without writing. Its
`sha256` describes the proposed result; `previousHash` is the current version.
Preview does not reserve a version. A later edit must still use the current
observed hash and can fail if another writer changed the file.

## Execution and authorization

Scoped project edits execute in the existing sandbox service. Only trusted
program source is serialized into the Node worker; input travels as JSON over
stdin. There is no host fallback. Root identity, path/secret rules, unavailable
providers, cancellation and output limits retain their existing enforcement.
Symlinks (including parent components), hardlinks, invalid UTF-8 and binary NUL
content are rejected. Shared run registries serialize `fs_edit` calls for a path,
so two in-process editors starting from one hash cannot both overwrite it.

Canonical invocation records intent and actual receipts, consumes tool budget,
and preserves unknown-outcome fences. `fs_edit` is an effectful tool even when
`dryRun` is requested: guided workflows retain their human approval requirement.
Project defaults match ordinary workspace writes; explicit `fs_write` DENY also
denies `fs_edit`. Effective write ASK rules cover edits; an existing write ALLOW
does not become a new edit grant. Approval is bound to the actual tool and input.

The replacement is staged beside the target, fsynced, checked against the current
hash/inode/mode and renamed over the target. Normal completion/failure removes
the temporary file. Permission bits are preserved; ACLs, xattrs, ownership changes
and special mode bits are not promised. A killed worker can leave a `.sky-edit-*`
temporary file. Cancellation or errors after body start retain the canonical
uncertain outcome semantics; never replay automatically.

This is not a filesystem compare-and-swap against arbitrary external processes.
An external writer can still race between the final check and rename; another
daemon, shell writes or an editor do not participate in the in-process queue.
The sandbox is the project boundary, not a defense against malicious concurrent
filesystem changes by the host user. There is no multi-file transaction or undo
history in this change.

## Review surface

Approval displays the requested old/new spans with a truncation notice above
4,000 characters; full parameters remain in technical details. Completed tool
activity shows a bounded diff, distinguishes preview from applied edits, and
renders all content as escaped text. The diff is for inspection, not a patch
application protocol: it uses one changed span with three context lines, caps at
200 content lines / roughly 16 KiB, and reports `diffTruncated` explicitly.
Normal canonical output truncation/artifact retention can apply independently.

`fs_write` remains for new files and explicitly requested complete replacements.
The agent prompt prefers guarded edits on existing source and instructs against
using write/shell to bypass conflict or denial. This preference is model guidance;
ordinary tool permissions remain the enforcement boundary.

## Validation

- `node test/sandbox/test_file_edits.js`: real files and Linux sandbox, hashes,
  conflict/ambiguity, previews, CRLF/Unicode/BOM, executable permissions, staging
  races, concurrent callers, path/secret/symlink/hardlink boundaries and cleanup.
- `node test/harness/test_file_edit_pipeline.js`: production admission and
  invocation, successful receipts, DENY, human-review race, cancellation and
  avoiding false task verification. Only the model is scripted.
- `node test/ui/test_file_edit_ui.js`: real Chrome, visible before/after approval,
  literal HTML in diff, preview/applied/conflict states, truncation and narrow UI.
- `npm run test:sandbox` runs file edits in both Node and Electron Node mode on
  Linux; the pipeline joins `test:harness`, UI joins `test:harness:ui`.

These checks prove the exercised control paths. They do not establish live model
editing quality or atomic conflict protection on every filesystem/platform.
