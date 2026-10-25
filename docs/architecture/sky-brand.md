# sky identity

sky is the product's displayed name. The user-supplied galaxy artwork in
[`public/sky.png`](../../public/sky.png) is copied byte for byte from the uploaded
1254 × 1254 PNG. Its bright ivory spiral, stellar dust and dark rounded tile are
preserved without recoloring or redrawing as the source asset.

[`public/sky.svg`](../../public/sky.svg) is a portable SVG wrapper embedding the
same unchanged PNG as a data URI, cropped to the tile and clipped to rounded
corners. It is raster-backed, not a pure-vector tracing; it has no scripts or
external asset dependencies. `npm run desktop:icon` exports this SVG geometry to
[`public/sky-icon.png`](../../public/sky-icon.png), a 512px RGBA asset with genuinely
transparent corners. The artwork occupies 90% of the icon canvas, centered with
5% transparent padding on each side. It updates the avatar/favicon content hashes as well.

The assistant avatar adds no tile shadow and rounds the displayed image corners
at 38% of its size. Avatars, favicon and desktop use the cropped `sky-icon.png`,
so the original image's opaque exterior does not become a second square frame.
Avatar and favicon URLs include the
same PNG content-hash query; refresh both hashes after changing the asset, since
static files have a long cache lifetime.

Desktop window icons use this RGBA PNG through `electron/branding.cjs`. Linux
sets `io.sky.Desktop.desktop` before readiness so X11/Wayland window identity
matches the launcher. Run `npm run desktop:install` after installing dependencies
to register the local checkout in the Linux application menu and dock. The
launcher points to this checkout, so rerun it after moving the repository.
The installer copies the RGBA icon to a content-addressed filename in the user's
icon directory and updates the launcher, so GNOME cannot reuse a stale icon from
the previous asset path. Relaunch Electron after updating native branding.
On macOS the runtime Dock icon is also set when Electron becomes ready. This
does not replace application-bundle icons in a future packaged distribution.
`npm run test:desktop:branding` checks the shared icon asset, native X11 icon
property and window class under Xvfb without touching the user's profile.

The desktop app name, page title, Chrome extension, interface copy and default
assistant use sky. The chat welcome view follows a quiet layout: centered mark,
one regular-weight question and a bottom composer. This changes presentation,
not model capabilities, tool permissions or approval behavior.

Compatibility identifiers retain `ohmyt`: local/session storage, IPC and document
messages, environment variables, browser partitions, existing workspace/profile
directories and skill source IDs. Electron explicitly preserves the old profile
directory (or an explicit `--user-data-dir`) so renaming the npm package does not
create a fresh profile or lose packaged runtime data.

Database startup upgrades only the legacy stock name/avatar and the exact stock
system prompt of `default-assistant`. Customized fields, other agents, provider
settings, session IDs and messages are retained. `node test/core/test_branding.js`
checks this with a temporary database across restarts.
