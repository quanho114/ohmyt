# TOKENS — Vật liệu cho chatbot

## Những điều giữ và điều chỉnh

Giữ bảy màu gốc, stack font, scale 13/16/18/22/28/48px và spacing bội số 4. Thêm body 17px/1.65 cho hội thoại. Tách primitive (giá trị gốc) khỏi semantic (vai trò UI) để dark mode không cần sửa từng component.

`32-64px` và `12-16px` trong nguồn là mô tả khoảng, không phải giá trị CSS dùng cho gap. Bản này chốt section-gap 40px và element-gap 12px; mobile section-gap 32px.

Đổi tên spacing riêng sang `--space-*`. Giữ đơn vị Tailwind `--spacing: 4px`: như vậy `p-4` vẫn là 16px. Nếu đưa `--spacing-4: 4px` vào `@theme`, utility theo token đó sẽ dùng 4px và có thể làm lệch stylesheet hiện tại. Xem [Tailwind theme variables](https://tailwindcss.com/docs/theme).

## Màu theo vai trò

| Vai trò | Light | Dark | Ghi chú |
|---|---|---|---|
| Canvas | Paper `#ffffff` | `#0c0c0d` | Vùng đọc chính |
| Sidebar | Whisper phủ Paper `#f5f5f5` | `#111112` | Một bước phân vùng nhẹ |
| Raised surface | Paper | `#161617` | Dialog, form |
| Hover | Whisper | `#202022` | Hover row/button |
| Selected / user bubble | Ash `#f1f1f1` | `#29292c` | Selected kèm font/aria |
| Text primary | Obsidian `#000000` | `#f2f2f3` | Nội dung |
| Text secondary | Graphite `#666666` | `#a1a1a7` | Nhãn, metadata, placeholder |
| Border decorative | Hairline `#0000001f` | `#ffffff1f` | Không dùng làm focus |
| Control outline | Graphite | `#a1a1a7` | Field cần outline để nhận biết |
| Primary action | Obsidian / Paper | `#f2f2f3` / `#0c0c0d` | Background / text |
| Danger | `#b4232b` | `#ee7777` | Lỗi/phá hủy; luôn kèm chữ |
| Warning | `#96620b` | `#e1b35c` | Cảnh báo quyền; không phải brand |

Smoke `#8f8f8f` chỉ dùng cho disabled/decorative ở light. Nó không đủ tương phản cho chữ nhỏ trên nền trắng. Timestamp, placeholder và icon thao tác phải dùng Graphite. Hairline chỉ dùng phân cách trang trí; input có nhãn, nền rõ và outline mạnh hơn khi cần xác định boundary. Xem [W3C contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) và [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Appearance đã áp dụng trong `src/index.css`: neutral default/slate/gray/zinc/neutral/stone
dùng OKLCH semantic surfaces light/dark; accent có cặp light/dark riêng. Warning/danger/success
giữ vai trò riêng. Mặc định monochrome, focus/link/control dùng accent đang chọn.
Code Lobe/GitHub theo theme, Nord giữ nền tối; Mermaid Lobe lấy palette thực đã đổi sang sRGB.

Tin nhắn dùng `--message-font-size` 12–20px (mặc định 14); heading theo tỷ lệ, inline code
theo em, metadata/control không bị phóng cùng. Settings sidebar 260px/content 960px/card
12px thay geometry modal cũ; bảng và snippet dưới đây là định hướng thiết kế rộng hơn,
không phải toàn bộ giá trị hiện đang dùng.

## Typography

| Role | Size desktop / mobile | Weight | Line-height | Tracking |
|---|---|---|---|---|
| Caption / metadata | 13 / 13px | 400–500 | 1.51 | -0.13px |
| Navigation | 14 / 14px | 500 | 1.5 | -0.14px |
| Input / form | 16 / 16px | 400 | 1.5 | -0.16px |
| Chat body | `--message-font-size`, mặc định 14px, tùy chỉnh 12–20px | 400 | 1.65 | -0.01em |
| Short card heading | 18 / 18px | 500 | 1.32 | -0.18px |
| Section heading | 22 / 22px | 500 | 1.26 | -0.22px |
| Dialog heading | 28 / 28px | 600 | 1.21 | 0.31px |
| Home greeting | 48 / 28px | 500 | 1.16 / 1.21 | -1.44px / 0.31px |
| Code | Theo cỡ tin nhắn trong chat; preview 13px | 400 | 1.65 | 0 |

Không áp dụng display size cho tiêu đề cuộc trò chuyện trong header. Font size viết bằng rem trong CSS để theo kích thước chữ gốc của người dùng; bảng px là quy đổi tại root 16px.

## Geometry

| Element | Giá trị |
|---|---|
| Sidebar rộng | 260px desktop lớn; 240px tablet |
| Sidebar row | Min-height 44px; padding ngang 12px |
| Header | Min-height 56px |
| Home content | Max-width 960px |
| Transcript và composer active | Max-width 768px |
| Gutter | 32px desktop; 24px tablet; 16px mobile |
| Message gap | 32px giữa lượt; 12px giữa đoạn |
| Composer | Radius 24px; padding 16px |
| User bubble | Radius 24px; padding 12px 20px |
| Tool/code/card | Radius 6px; padding 12px |
| Dialog | Radius 24px desktop; 0 khi full-screen mobile |
| Chip / text button | Pill; min-height 44px |
| Icon button | Target 44×44px; icon 18–20px |
| Focus ring | 2px primary, offset 2px |

## CSS nền và alias cho repo

Đây là snippet bàn giao, chưa được áp dụng vào app. Đặt primitive/semantic trong base stylesheet; alias bên dưới khớp tên đang được các component sử dụng. Giữ các rule layout hiện có cho đến khi triển khai SCREENS.md.

```css
:root {
  color-scheme: light;
  --color-obsidian: #000000;
  --color-graphite: #666666;
  --color-smoke: #8f8f8f;
  --color-paper: #ffffff;
  --color-ash: #f1f1f1;
  --color-hairline: #0000001f;
  --color-whisper: #0000000a;

  --font-openai-sans: 'OpenAI Sans', ui-sans-serif, system-ui,
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-code: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  --text-caption: 0.8125rem;
  --leading-caption: 1.51;
  --tracking-caption: -0.13px;
  --text-input: 1rem;
  --leading-input: 1.5;
  --tracking-input: -0.16px;
  --text-chat: 1.0625rem;
  --leading-chat: 1.65;
  --tracking-chat: -0.01em;
  --text-body-lg: 1.125rem;
  --leading-body-lg: 1.32;
  --tracking-body-lg: -0.18px;
  --text-subheading: 1.375rem;
  --leading-subheading: 1.26;
  --tracking-subheading: -0.22px;
  --text-heading: 1.75rem;
  --leading-heading: 1.21;
  --tracking-heading: 0.31px;
  --text-display: 3rem;
  --leading-display: 1.16;
  --tracking-display: -1.44px;

  --space-4: 4px;
  --space-8: 8px;
  --space-12: 12px;
  --space-16: 16px;
  --space-20: 20px;
  --space-24: 24px;
  --space-32: 32px;
  --space-40: 40px;
  --space-52: 52px;
  --space-64: 64px;
  --space-80: 80px;
  --space-120: 120px;
  --page-max-width: 1200px;
  --home-max-width: 960px;
  --chat-max-width: 768px;
  --section-gap: 40px;
  --element-gap: 12px;
  --card-padding: 12px;

  --radius-md: 4px;
  --radius-md-2: 6.08px;
  --radius-3xl: 24px;
  --radius-3xl-2: 40px;
  --radius-full: 9999px;
  --radius-cards: 6px;
  --radius-inputs: 6px;
  --radius-buttons: var(--radius-full);
  --radius-tags: var(--radius-full);
  --radius-links: var(--radius-md);
  --shadow-sm: 0 4px 6px rgba(0, 0, 0, 0.02),
    0 0 2px rgba(0, 0, 0, 0.05);

  --background: var(--color-paper);
  --sidebar: #f5f5f5;
  --surface: var(--color-paper);
  --surface-secondary: var(--color-ash);
  --surface-hover: var(--color-whisper);
  --surface-active: var(--color-ash);
  --surface-elevated: var(--color-paper);
  --user-bubble: var(--color-ash);
  --border: var(--color-hairline);
  --border-subtle: var(--color-whisper);
  --border-strong: var(--color-graphite);
  --text-primary: var(--color-obsidian);
  --text-secondary: var(--color-graphite);
  --text-tertiary: var(--color-graphite);
  --text-disabled: var(--color-smoke);
  --accent: var(--color-obsidian);
  --accent-hover: #262626;
  --accent-contrast: var(--color-paper);
  --success: var(--color-graphite);
  --warning: #96620b;
  --danger: #b4232b;
  --danger-contrast: #ffffff;
  --info: var(--text-primary);
  --input-background: var(--surface);
  --overlay: rgb(0 0 0 / 40%);
  --selection: rgb(0 0 0 / 12%);
  --code-background: var(--color-ash);
  --control-background: var(--color-ash);
  --shadow-subtle: none;

  /* Alias cho những tên đã xuất hiện trong component hiện tại. */
  --bg-surface: var(--surface);
  --input-bg: var(--input-background);
  --badge-bg: var(--control-background);
  --surface-paper: var(--color-paper);
  --surface-ash: var(--color-ash);
  --surface-whisper: var(--color-whisper);
}

[data-theme='dark'] {
  color-scheme: dark;
  --background: #0c0c0d;
  --sidebar: #111112;
  --surface: #161617;
  --surface-secondary: #202022;
  --surface-hover: #202022;
  --surface-active: #29292c;
  --surface-elevated: #161617;
  --user-bubble: #29292c;
  --border: #ffffff1f;
  --border-subtle: #ffffff0a;
  --border-strong: #a1a1a7;
  --text-primary: #f2f2f3;
  --text-secondary: #a1a1a7;
  --text-tertiary: #a1a1a7;
  --text-disabled: #67676d;
  --accent: #f2f2f3;
  --accent-hover: #ddddde;
  --accent-contrast: #0c0c0d;
  --success: #a1a1a7;
  --warning: #e1b35c;
  --danger: #ee7777;
  --danger-contrast: #0c0c0d;
  --overlay: rgb(0 0 0 / 62%);
  --selection: rgb(255 255 255 / 18%);
  --code-background: #111112;
  --control-background: #202022;
}

body {
  font-family: var(--font-openai-sans);
  font-feature-settings: 'calt' 1, 'liga' 1;
}

button:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible,
a:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--text-primary);
  outline-offset: 2px;
}

@media (max-width: 767px) {
  :root {
    --text-chat: 1rem;
    --text-display: 1.75rem;
    --leading-display: 1.21;
    --tracking-display: 0.31px;
    --section-gap: 32px;
  }
}
```

`--surface-paper/ash/whisper` là primitive tương thích nguồn, không dùng trực tiếp cho component cần đổi theme. Dùng `--surface`, `--surface-active`, `--surface-hover` cho các vai trò đó. Composer dùng `--radius-3xl`; `--radius-inputs` ở đây dành cho field trong form.

## Bridge Tailwind v4

Trong stylesheet Tailwind hiện có, giữ `@import "tailwindcss"` ở đầu. Bridge semantic tạo utility cho theme mà không ghi đè các spacing số của repo. Dùng typography theo bảng hoặc custom property; không kỳ vọng mọi biến `:root` tự tạo utility.

```css
@theme inline {
  --font-chat: var(--font-openai-sans);
  --color-canvas: var(--background);
  --color-panel: var(--surface);
  --color-ink: var(--text-primary);
  --color-muted: var(--text-secondary);
  --color-action: var(--accent);
  --color-action-contrast: var(--accent-contrast);
  --radius-composer: var(--radius-3xl);
}
```

Ví dụ: `bg-canvas text-ink font-chat`, `bg-panel rounded-composer`, `bg-action text-action-contrast`. Giữ `p-4` = 16px; cần chính xác 4px thì dùng `p-1` hoặc `padding: var(--space-4)`. Không thêm dependency cho bộ token này.
