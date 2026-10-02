import { useId, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Check, Monitor, Sun, Moon, Zap, Waves, Ban, HardDrive, Link, GitFork as Github, Sparkles } from 'lucide-react';
import type { Appearance, SettingsLocale } from '../appearance.ts';
import { appearanceOptions } from '../appearance.ts';
import { settingsText } from '../settingsLocale.ts';
import { ContentBlock } from './ContentBlock.tsx';

interface Props {
  appearance: Appearance;
  onChangeAppearance: (patch: Partial<Appearance>) => void;
  activeTheme: 'light' | 'dark';
  locale: SettingsLocale;
  saveState: 'saved' | 'failed';
}

function Card({ title, children, status }: { title: string; children: ReactNode; status: string }) {
  return <section className="appearance-card"><header><h2>{title}</h2><span className="appearance-save" role="status"><HardDrive size={12} />{status}</span></header>{children}</section>;
}
function Row({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return <div className="appearance-row"><div className="appearance-row-label"><span>{label}</span>{description && <p>{description}</p>}</div><div className="appearance-row-control">{children}</div></div>;
}
function Segments({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string; icon?: ReactNode }>; onChange: (value: string) => void }) {
  const id = useId();
  return <div className="appearance-segments" role="radiogroup" aria-label={label}>{options.map(option => <label key={option.value} data-selected={value === option.value}><input type="radio" name={id} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />{option.icon}<span>{option.label}</span></label>)}</div>;
}

const accentColors = ['transparent', '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#06b6d4', '#0ea5e9', '#3b82f6', '#a855f7', '#d946ef', '#fb7185'];
const accentNames = ['Mặc định', 'Đỏ', 'Cam', 'Vàng', 'Lime', 'Xanh lá', 'Cyan', 'Xanh trời', 'Xanh dương', 'Tím', 'Magenta', 'Coral'];
const codePreview = `const person = {\n  name: 'Alice',\n  age: 30,\n  hobbies: ['reading', 'coding'],\n};\n\ntype PersonType = typeof person;\n\n// Describe your data with confidence\nconst greeting = (name: string): string => {\n  return \`Hello, \${name}!\`;\n};\n`;
const diagramPreview = 'sequenceDiagram\n    Alice->>John: Hello John, how are you?\n    John-->>Alice: Great!\n    Alice->>John: See you later!\n';

export function AppearanceSettings({ appearance, onChangeAppearance, activeTheme, locale, saveState }: Props) {
  const [previewKey, setPreviewKey] = useState(0);
  const t = (key: string) => settingsText(locale, key);
  const status = t(saveState === 'saved' ? 'Đã lưu trên thiết bị' : 'Chưa lưu được trên thiết bị');
  const choose = <K extends keyof Appearance>(key: K, value: Appearance[K]) => onChangeAppearance({ [key]: value });
  const switchControl = (key: 'antialiasing' | 'autoScroll' | 'autoExpandTools' | 'linkIcons', label: string) => <label className="appearance-switch"><input type="checkbox" role="switch" aria-label={label} checked={appearance[key]} onChange={event => choose(key, event.currentTarget.checked)} /><span /></label>;
  const selectControl = <K extends keyof Appearance>(key: K, label: string, options: Array<[Appearance[K], string]>) => <select aria-label={label} value={String(appearance[key])} onChange={event => choose(key, event.currentTarget.value as Appearance[K])}>{options.map(([value, text]) => <option key={String(value)} value={String(value)}>{text}</option>)}</select>;

  return <div className="appearance-cards">
    <Card title={t('Cài đặt chung')} status={status}>
      <Row label={t('Chủ đề')}><div className="theme-thumbnails" role="radiogroup" aria-label={t('Chủ đề')}>{appearanceOptions.themeMode.map((mode, index) => <label key={mode} data-selected={appearance.themeMode === mode}><input type="radio" name="appearance-theme" checked={appearance.themeMode === mode} onChange={() => choose('themeMode', mode)} /><div className={`theme-thumbnail theme-${mode}`}><i /><div><span /><span /><span /></div>{appearance.themeMode === mode && <Check size={13} />}</div><span>{[<Sun size={13} />, <Moon size={13} />, <Monitor size={13} />][index]}{t(['Sáng', 'Tối', 'Tự động'][index])}</span></label>)}</div></Row>
      <Row label={t('Ngôn ngữ')}>{selectControl('locale', t('Ngôn ngữ'), [['system', t('Theo hệ thống')], ['vi', 'Tiếng Việt'], ['en', 'English']])}</Row>
      <Row label={t('Hoạt ảnh phản hồi')}><Segments label={t('Hoạt ảnh phản hồi')} value={appearance.responseAnimation} options={[{ value: 'off', label: t('Tắt'), icon: <Ban size={13} /> }, { value: 'snappy', label: t('Nhanh nhẹn'), icon: <Zap size={13} /> }, { value: 'elegant', label: t('Thanh lịch'), icon: <Waves size={13} /> }]} onChange={value => choose('responseAnimation', value as Appearance['responseAnimation'])} /></Row>
      <Row label={t('Chế độ menu chuột phải')}><Segments label={t('Chế độ menu chuột phải')} value={appearance.contextMenu} options={[{ value: 'off', label: t('Tắt'), icon: <Ban size={13} /> }, { value: 'default', label: t('Mặc định'), icon: <Zap size={13} /> }]} onChange={value => choose('contextMenu', value as Appearance['contextMenu'])} /></Row>
      <Row label={t('Ngôn ngữ phản hồi')} description={t('Áp dụng từ tác vụ tiếp theo. Model có thể không tuân thủ tuyệt đối.')}>{selectControl('responseLanguage', t('Ngôn ngữ phản hồi'), [['auto', t('Tự động')], ['vi', 'Tiếng Việt'], ['en', 'English']])}</Row>
    </Card>
    <Card title={t('Giao diện ứng dụng')} status={status}>
      <Row label={t('Bảng màu')}><div className="layout-preview" aria-label={t('Bảng màu')}><aside><span /><span /><span /><span /></aside><div><header /><section><i /><span /><span /><span /></section><footer /></div><Check size={13} className="layout-preview-check" /></div></Row>
      <Row label={t('Màu chủ đề')}><div className="appearance-swatches" role="radiogroup" aria-label={t('Màu chủ đề')}>{appearanceOptions.accent.map((color, index) => <label key={color} title={t(accentNames[index])} data-selected={appearance.accent === color} className={color === 'default' ? 'swatch-default' : ''} style={{ '--swatch': accentColors[index] } as CSSProperties}><input type="radio" name="appearance-accent" checked={appearance.accent === color} aria-label={t(accentNames[index])} onChange={() => choose('accent', color)} />{appearance.accent === color && <Check size={13} />}</label>)}</div></Row>
      <Row label={t('Màu trung tính')}><div className="appearance-swatches" role="radiogroup" aria-label={t('Màu trung tính')}>{appearanceOptions.neutral.map((color, index) => <label key={color} title={color === 'default' ? t('Mặc định') : color} data-selected={appearance.neutral === color} className={color === 'default' ? 'swatch-default' : ''} style={{ '--swatch': ['transparent', '#64748b', '#6b7280', '#71717a', '#737373', '#78716c'][index] } as CSSProperties}><input type="radio" name="appearance-neutral" checked={appearance.neutral === color} aria-label={color === 'default' ? t('Mặc định') : color} onChange={() => choose('neutral', color)} />{appearance.neutral === color && <Check size={13} />}</label>)}</div></Row>
    </Card>
    <Card title={t('Phông chữ')} status={status}>
      <Row label={t('Font Antialiasing')} description={t('Làm nét chữ bằng grayscale antialiasing. Chỉ ảnh hưởng macOS; tắt để dùng cách hiển thị mặc định của hệ thống.')}>{switchControl('antialiasing', t('Font Antialiasing'))}</Row>
      <Row label={t('Kích thước chữ')} description={t('Kích thước phông chữ của tin nhắn')}><div className="font-size-control"><div><span>A</span><input type="range" aria-label={t('Kích thước chữ')} min={12} max={20} step={1} value={appearance.fontSize} onChange={event => choose('fontSize', Number(event.currentTarget.value))} /><span>A</span></div><p>{appearance.fontSize === 14 ? t('Chuẩn') : `${appearance.fontSize} px`}</p></div></Row>
      <div className="appearance-preview message-content">{t('Chào mừng đến với ohmyt. Chỉ cần một câu, hãy nêu mục tiêu của bạn.')}</div>
    </Card>
    <Card title={t('Hoạt ảnh chuyển tiếp')} status={status}>
      <div className="transition-choice"><Segments label={t('Hoạt ảnh chuyển tiếp')} value={appearance.transition} options={[{ value: 'none', label: t('Không có') }, { value: 'fade', label: t('Hiện dần') }, { value: 'smooth', label: t('Mượt mà') }]} onChange={value => { choose('transition', value as Appearance['transition']); setPreviewKey(current => current + 1); }} /></div>
      <div className="appearance-preview"><div key={previewKey} className="appearance-enter transition-preview"><h3>{t('Tính năng')}</h3><strong>{t('Điểm nổi bật')}</strong><ul><li><Monitor size={14} />{t('Đa mô hình')}: GPT / Gemini / Ollama</li><li><Sparkles size={14} />Vision: multimodal</li><li><Zap size={14} />{t('Công cụ')}: Function Calling & real-time data</li></ul></div></div>
    </Card>
    <Card title={t('Hành vi trò chuyện')} status={status}>
      <Row label={t('Tự động cuộn khi AI phản hồi')} description={t('Chỉ bám đáy khi bạn không đang đọc lịch sử.')}>{switchControl('autoScroll', t('Tự động cuộn khi AI phản hồi'))}</Row>
      <Row label={t('Mở rộng các bước công cụ khi đang chạy')}>{switchControl('autoExpandTools', t('Mở rộng các bước công cụ khi đang chạy'))}</Row>
      <Row label={t('Hiển thị biểu tượng trong liên kết tin nhắn')}>{switchControl('linkIcons', t('Hiển thị biểu tượng trong liên kết tin nhắn'))}</Row>
      <div className="appearance-preview link-preview">{t('Xem')} <a href="https://lobehub.com" target="_blank" rel="noopener noreferrer">{appearance.linkIcons && <Link size={13} />}lobehub.com</a> {locale === 'vi' ? 'và' : 'and'} <a href="https://github.com/lobehub/lobehub" target="_blank" rel="noopener noreferrer">{appearance.linkIcons && <Github size={13} />}lobehub/lobehub</a> {t('để biết thêm chi tiết.')}</div>
    </Card>
    <Card title={t('Chủ đề tô sáng mã')} status={status}><Row label={t('Chủ đề tô sáng mã')}>{selectControl('codeTheme', t('Chủ đề tô sáng mã'), [['lobe', 'Lobe Theme'], ['github', 'GitHub'], ['nord', 'Nord']])}</Row><ContentBlock language="typescript" code={codePreview} appearance={appearance} activeTheme={activeTheme} /></Card>
    <Card title={t('Chủ đề Mermaid')} status={status}><Row label={t('Chủ đề Mermaid')}>{selectControl('mermaidTheme', t('Chủ đề Mermaid'), [['lobe', 'Lobe Theme'], ['default', 'Default'], ['neutral', 'Neutral'], ['forest', 'Forest'], ['dark', 'Dark']])}</Row><details className="mermaid-preview" open><summary>{t('Chủ đề Mermaid')}</summary><ContentBlock language="mermaid" code={diagramPreview} appearance={appearance} activeTheme={activeTheme} /></details></Card>
  </div>;
}
