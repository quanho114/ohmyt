# sky release tooling

This is one npm package. The directory layout follows the separation of concerns
in OpenAI Codex's `bazel/`: build metadata, platform selection, packaging rules,
tools and tests. These are local npm/Electron implementations, not copied Codex
Bazel rules and not a claim that this project uses Bazel.

| Directory | Responsibility |
|---|---|
| `build-info/` | Git revision, dirty state, lockfile digest, build environment |
| `platforms/` | Native host and archive format |
| `rules/` | Runtime input allowlist, staging and Electron packaging |
| `tools/` | Prerequisites, Vite build, isolated npm install, package and checksums |
| `testing/` | Packaging boundaries and real packaged Linux smoke |

## Build locally

Use Node 24 or newer and npm. Run `npm ci`, then:

```sh
npm run release:check
npm run test:release
npm run release:dir
node release/testing/smoke.mjs  # Linux: needs xvfb-run and Electron system libraries
npm run release:build
```

`release:dir` creates an unpacked desktop application for inspection. The full
build additionally creates `sky-<version>-<os>-<arch>.tar.gz` (Linux) or `.zip`
(Windows/macOS), `SHA256SUMS` and `build-info.json` under
`output/release/artifacts/`. Run `sha256sum -c SHA256SUMS` there on Linux.
The archive includes Electron, production dependencies, daemon and built UI;
end users do not need npm. Extract the archive and launch `sky` / `sky.exe` or
open `sky.app` on macOS. Linux users must preserve executable bits and have the normal Electron system libraries (GTK, NSS, ALSA and GBM) and a graphical session installed.

Build on the target OS and architecture. Native modules are rebuilt for the
pinned Electron version in `output/release/app`, separate from the developer's
node_modules. No cross-platform native compatibility is implied. Archive compression defaults to level 3 to keep local builds practical; override with `ELECTRON_BUILDER_COMPRESSION_LEVEL` (0–9). Every build
uses package-lock.json; build timestamps and unsigned archives are not promised
to be byte-identical. For a release candidate, commit the intended changes first
and inspect `dirty:false` in the manifest. Dirty builds are allowed for previews.
Do not distribute leftovers from an older version alongside the current archive.

The manual GitHub Actions workflow builds native archives on Linux, Windows and
macOS and uploads CI artifacts. It does not publish a GitHub Release. macOS and
Windows archives are unsigned, unnotarized preview builds; OS trust prompts may
apply. Installer formats, auto-update and signing are not configured.

## Runtime boundaries

Application data remains in the existing Electron user profile's `runtime/`
directory, and the default workspace is `Documents/ohmyt`. Packaging never reads
the user's `data/`, local skills or credentials. The runtime allowlist also
excludes Python environments, caches, logs and `.env` files and rejects source
symlinks. The Python Browser Use sidecar remains optional and is not installed by
release tooling. Offline speech models are downloaded on demand as before.

Project filesystem/shell tools still require a supported sandbox. Linux requires
system bubblewrap and a working kernel configuration. A Windows/macOS archive
does not add sandbox support; unavailable project execution must fail closed.
The smoke test uses `--no-sandbox` only for headless CI Chromium startup, never
as a packaged application default, and uses temporary profiles/workspaces.

## Validation limits and rollback

`test:release` checks staging exclusions, symlink rejection, the entry point and
hashing. The Linux smoke launches the actual package and checks UI, authenticated
daemon and external SQLite location. It does not test live model services, all
tools, sandbox equivalence or Windows/macOS launch. Keep the last known good
archive and back up the user profile before upgrading; restoring an older binary
does not undo database migrations and can be incompatible with newer data.

Layout reference: [Codex build tooling](https://github.com/openai/codex/tree/main/bazel).
Packaging uses pinned electron-builder 26 configuration; see its
[application contents documentation](https://www.electron.build/v26/docs/contents/).
