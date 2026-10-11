# Third-party notices

## Browser Use (optional Python integration)

- Project: https://github.com/browser-use/browser-use
- Version: 0.13.11
- License: MIT
- Copyright (c) 2024 Gregor Zunic
- Full license: `integrations/browser-use/LICENSE.browser-use`

Preserve this notice and the full MIT license when distributing Browser Use
with ohmyt. This document covers this optional integration, not an exhaustive
inventory of all application dependencies. Bundled transitive dependencies need
their respective license notices as well.

## DeepSeek Cordis plugin runtime

- Package: `@deepseek-ai/cordis`, pinned at 4.0.4
- Source: https://github.com/deepseek-ai/deepseek-harness/tree/master/vendor/cordis
- License: MIT
- Package copyright: Copyright (c) 2021-present Shigma
- Full package license: `integrations/cordis/LICENSE.cordis`

The harness integration adapts the architectural seams documented by DeepSeek;
its ohmyt services, SQLite transcript store and compatibility layer are local
implementations. The DeepSeek application/core packages are not bundled.

## Harness dependencies

| Package | Pinned version | License text |
|---|---|---|
| ajv | 8.20.0 | integrations/harness-licenses/LICENSE.ajv |
| yaml | 2.9.1 | integrations/harness-licenses/LICENSE.yaml |
| undici | 7.30.0 | integrations/harness-licenses/LICENSE.undici |
| @modelcontextprotocol/sdk | 1.32.1 | integrations/harness-licenses/LICENSE.mcp-sdk |

These packages use MIT licenses; preserve their full copyright notices above.
This is a direct dependency notice, not a complete transitive distribution audit.


## Radix Icons

Source: https://github.com/radix-ui/icons

Icons used in the work status indicators.

MIT License

Copyright (c) 2022 WorkOS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
