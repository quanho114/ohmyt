import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Check, Monitor, Sun, Moon, Zap, Waves, Ban, HardDrive, ChevronDown, Sparkles } from 'lucide-react';
import { useSmoothedText } from '../streamAnimation.ts';
import type { Appearance, SettingsLocale } from '../appearance.ts';
import { appearanceOptions } from '../appearance.ts';
import { settingsText } from '../settingsLocale.ts';
import type { SettingsTextKey } from '../settingsLocale.ts';
import { mascots } from '../mascots.ts';
import { chatBackgrounds, chatBackgroundPaint } from '../chatBackgrounds.ts';
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
interface SelectControlProps<T extends string> {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}
function SelectControl<T extends string>({ label, value, options, onChange }: SelectControlProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find(([v]) => v === value);
  return (
    <div ref={rootRef} className="appearance-select-wrap">
      <button
        type="button"
        className="appearance-select"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(was => !was)}
        onBlur={event => {
          if (!rootRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
        }}
        onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}
      >
        <span className="truncate">{current?.[1] ?? String(value)}</span>
        <ChevronDown size={14} className={`appearance-select-chevron${open ? ' is-open' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="appearance-select-pop" role="listbox" aria-label={label}>
          {options.map(([v, text]) => {
            const active = v === value;
            return (
              <button
                key={String(v)}
                type="button"
                role="option"
                aria-selected={active}
                className="appearance-select-option"
                data-active={active}
                onClick={() => { onChange(v); setOpen(false); }}
              >
                <span className="truncate">{text}</span>
                {active && <Check size={14} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const DEMO_STREAM_TEXT = 'Chào bạn! Mình là ohmyt, trợ lý chạy ngay trên máy của bạn. Mình có thể đọc ghi file, chạy lệnh terminal và tra cứu thông tin giúp bạn.';

function DemoStreamText({ animated, granularity, preset, onDone }: {
  animated: boolean;
  granularity: 'char' | 'word';
  preset: 'balanced' | 'silky';
  onDone: () => void;
}) {
  const [go, setGo] = useState(false);
  const [input, setInput] = useState('');
  useEffect(() => {
    if (!animated) return;
    const timer = window.setTimeout(() => setGo(true), 350);
    return () => window.clearTimeout(timer);
  }, [animated]);
  // Giả lập model xả token: nhỏ giọt kèm burst, để thấy rõ nhịp theo kịp/trễ.
  useEffect(() => {
    if (!go) { setInput(''); return; }
    let i = 0;
    let n = 0;
    const timer = window.setInterval(() => {
      n += 1;
      i += n % 4 === 0 ? 14 : 3;
      if (i >= DEMO_STREAM_TEXT.length) {
        i = DEMO_STREAM_TEXT.length;
        window.clearInterval(timer);
      }
      setInput(DEMO_STREAM_TEXT.slice(0, i));
    }, 110);
    return () => window.clearInterval(timer);
  }, [go]);
  const text = useSmoothedText(input, animated && go, preset);
  const shown = animated ? text : DEMO_STREAM_TEXT;
  const typing = animated && go && shown.length < DEMO_STREAM_TEXT.length;
  const done = animated && go && input === DEMO_STREAM_TEXT && shown === DEMO_STREAM_TEXT;
  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(onDone, 2200);
    return () => window.clearTimeout(timer);
  }, [done, onDone]);
  const renderFaded = () => {
    if (!animated || !typing) return shown;
    if (granularity === 'word') {
      let segments: string[];
      try {
        const Segmenter = (Intl as unknown as { Segmenter?: new (l: undefined, o: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
        segments = Segmenter
          ? [...new Segmenter(undefined, { granularity: 'word' }).segment(shown)].map(s => s.segment)
          : (shown.match(/\s+|\S+/g) ?? []);
      } catch {
        segments = shown.match(/\s+|\S+/g) ?? [];
      }
      const cut = Math.max(0, segments.length - 10);
      return (
        <>
          {segments.slice(0, cut).join('')}
          {segments.slice(cut).map((seg, k) => (
            <span key={`w${cut + k}`} className="stream-char" style={{ animationDelay: `${Math.min(150, k * 20)}ms` }}>
              {seg}
            </span>
          ))}
        </>
      );
    }
    const cut = Math.max(0, shown.length - 30);
    return (
      <>
        {shown.slice(0, cut)}
        {[...shown.slice(cut)].map((ch, k) => (
          <span key={`c${cut + k}`} className="stream-char" style={{ animationDelay: `${Math.min(120, k * 12)}ms` }}>
            {ch}
          </span>
        ))}
      </>
    );
  };
  return (
    <>
      <span>{renderFaded()}</span>
      {typing && <span className="response-cursor" />}
    </>
  );
}

function TransitionDemo({ transition, animated, playKey }: {
  transition: Appearance['transition']; animated: boolean; playKey: string;
}) {
  const [loop, setLoop] = useState(0);
  useEffect(() => {
    setLoop(0);
  }, [playKey]);
  const nextLoop = useCallback(() => setLoop(l => l + 1), []);
  const loopKey = `${playKey}-${loop}`;
  return (
    <div className="transition-demo" aria-hidden="true">
      <div
        key={`demo-user-${loopKey}`}
        className={transition === 'none' ? undefined : 'message-enter'}
        data-message-transition={transition}
      >
        <div className="transition-demo-user">Chào bạn nha</div>
      </div>
      <div
        key={`demo-assistant-${loopKey}`}
        className={transition === 'none' ? undefined : 'message-enter'}
        data-message-transition={transition}
      >
        <div className="transition-demo-assistant">
          <DemoStreamText key={`demo-text-${loopKey}`} animated={animated} granularity={transition === 'smooth' ? 'word' : 'char'} preset={transition === 'smooth' ? 'silky' : 'balanced'} onDone={nextLoop} />
        </div>
      </div>
    </div>
  );
}

const accentColors = ['transparent', '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#06b6d4', '#0ea5e9', '#3b82f6', '#a855f7', '#d946ef', '#fb7185'];
const accentNames: SettingsTextKey[] = ['Mặc định', 'Đỏ', 'Cam', 'Vàng', 'Lime', 'Xanh lá', 'Cyan', 'Xanh trời', 'Xanh dương', 'Tím', 'Magenta', 'Coral'];
const themeNames: SettingsTextKey[] = ['Sáng', 'Tối', 'Tự động'];
const codePreview = `const person = {\n  name: 'Alice',\n  age: 30,\n  hobbies: ['reading', 'coding'],\n};\n\ntype PersonType = typeof person;\n\n// Describe your data with confidence\nconst greeting = (name: string): string => {\n  return \`Hello, \${name}!\`;\n};\n`;
const diagramPreview = 'sequenceDiagram\n    Alice->>John: Hello John, how are you?\n    John-->>Alice: Great!\n    Alice->>John: See you later!\n';

export function AppearanceSettings({ appearance, onChangeAppearance, activeTheme, locale, saveState }: Props) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const uploadVersion = useRef(0);
  const bgText = (vi: string, en: string) => locale === 'vi' ? vi : en;
  const uploadBackground = async (file?: File) => {
    if (!file) return;
    const version = ++uploadVersion.current;
    setUploadError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
      setUploadError(bgText('Chọn ảnh PNG, JPG hoặc WebP dưới 20 MB.', 'Choose a PNG, JPG or WebP image under 20 MB.'));
      return;
    }
    setUploading(true);
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', 0.82);
      if (data.length >= 3000000) throw new Error('Image too large');
      if (version === uploadVersion.current) onChangeAppearance({ chatBackground: 'custom', chatBackgroundImage: data });
    } catch {
      if (version === uploadVersion.current) setUploadError(bgText('Không đọc được ảnh. Hãy thử ảnh khác.', 'Could not read the image. Try another image.'));
    } finally {
      URL.revokeObjectURL(url);
      if (version === uploadVersion.current) setUploading(false);
    }
  };
  const [previewKey, setPreviewKey] = useState(0);
  const [mermaidExpanded, setMermaidExpanded] = useState(true);
  const t = (key: SettingsTextKey) => settingsText(locale, key);
  const status = t(saveState === 'saved' ? 'Đã lưu trên thiết bị' : 'Chưa lưu được trên thiết bị');
  const choose = <K extends keyof Appearance>(key: K, value: Appearance[K]) => onChangeAppearance({ [key]: value });
  const switchControl = (key: 'antialiasing' | 'autoScroll' | 'autoExpandTools' | 'linkIcons', label: string) => <label className="appearance-switch"><input type="checkbox" role="switch" aria-label={label} checked={appearance[key]} onChange={event => choose(key, event.currentTarget.checked)} /><span /></label>;
  const selectControl = <K extends string>(key: keyof Appearance, label: string, options: Array<[K, string]>) => (
    <SelectControl label={label} value={String(appearance[key]) as K} options={options} onChange={value => choose(key, value as Appearance[keyof Appearance])} />
  );

  return <div className="appearance-cards">
    <Card title={t('Cài đặt chung')} status={status}>
      <Row label={t('Chủ đề')}>
        <div className="theme-thumbnails" role="radiogroup" aria-label={t('Chủ đề')}>
          {appearanceOptions.themeMode.map((mode, index) => (
            <label key={mode} data-selected={appearance.themeMode === mode}>
              <input
                type="radio"
                name="appearance-theme"
                checked={appearance.themeMode === mode}
                onChange={() => choose('themeMode', mode)}
              />
              <div className={`theme-thumbnail theme-${mode}`}>
                {mode === 'system' ? (
                  <div className="theme-thumbnail-split">
                    <div className="theme-split-half theme-split-light">
                      <div className="theme-window-header"><span /><span /><span /></div>
                      <div className="theme-window-body"><i /><div><span /><span /></div></div>
                    </div>
                    <div className="theme-split-half theme-split-dark">
                      <div className="theme-window-header"><span /><span /><span /></div>
                      <div className="theme-window-body"><i /><div><span /><span /></div></div>
                    </div>
                  </div>
                ) : (
                  <div className="theme-window">
                    <div className="theme-window-header"><span /><span /><span /></div>
                    <div className="theme-window-body"><i /><div><span /><span /></div></div>
                  </div>
                )}
              </div>
              <span>
                {[<Sun size={13} />, <Moon size={13} />, <Monitor size={13} />][index]}
                {t(themeNames[index])}
              </span>
            </label>
          ))}
        </div>
      </Row>
      <Row label={t('Ngôn ngữ')}>{selectControl('locale', t('Ngôn ngữ'), [['system', t('Theo hệ thống')], ['vi', t('Tiếng Việt')], ['en', 'English']])}</Row>
      <Row label={t('Hoạt ảnh phản hồi')}><Segments label={t('Hoạt ảnh phản hồi')} value={appearance.responseAnimation} options={[{ value: 'off', label: t('Tắt'), icon: <Ban size={13} /> }, { value: 'snappy', label: t('Nhanh nhẹn'), icon: <Zap size={13} /> }, { value: 'elegant', label: t('Thanh lịch'), icon: <Waves size={13} /> }]} onChange={value => choose('responseAnimation', value as Appearance['responseAnimation'])} /></Row>
      <Row label={t('Chế độ menu chuột phải')}><Segments label={t('Chế độ menu chuột phải')} value={appearance.contextMenu} options={[{ value: 'off', label: t('Tắt'), icon: <Ban size={13} /> }, { value: 'default', label: t('Mặc định'), icon: <Zap size={13} /> }]} onChange={value => choose('contextMenu', value as Appearance['contextMenu'])} /></Row>
      <Row label={t('Ngôn ngữ phản hồi')} description={t('Áp dụng từ tác vụ tiếp theo. Model có thể không tuân thủ tuyệt đối.')}>{selectControl('responseLanguage', t('Ngôn ngữ phản hồi'), [['auto', t('Tự động')], ['vi', t('Tiếng Việt')], ['en', 'English']])}</Row>
    </Card>
    <Card title={t('Giao diện ứng dụng')} status={status}>
      <Row label={t('Bảng màu')}><div className="layout-preview" role="img" aria-label={t('Bảng màu')}><aside><span /><span /><span /><span /></aside><div><header /><section><i /><span /><span /><span /></section><footer /></div><Check size={13} className="layout-preview-check" /></div></Row>
      <Row label={t('Màu chủ đề')}><div className="appearance-swatches" role="radiogroup" aria-label={t('Màu chủ đề')}>{appearanceOptions.accent.map((color, index) => <label key={color} title={t(accentNames[index])} data-selected={appearance.accent === color} className={color === 'default' ? 'swatch-default' : ''} style={{ '--swatch': accentColors[index] } as CSSProperties}><input type="radio" name="appearance-accent" checked={appearance.accent === color} aria-label={t(accentNames[index])} onChange={() => choose('accent', color)} />{appearance.accent === color && <Check size={13} />}</label>)}</div></Row>
      <Row label={t('Màu trung tính')}><div className="appearance-swatches" role="radiogroup" aria-label={t('Màu trung tính')}>{appearanceOptions.neutral.map((color, index) => <label key={color} title={color === 'default' ? t('Mặc định') : color} data-selected={appearance.neutral === color} className={color === 'default' ? 'swatch-default' : ''} style={{ '--swatch': ['transparent', '#64748b', '#6b7280', '#71717a', '#737373', '#78716c'][index] } as CSSProperties}><input type="radio" name="appearance-neutral" checked={appearance.neutral === color} aria-label={color === 'default' ? t('Mặc định') : color} onChange={() => choose('neutral', color)} />{appearance.neutral === color && <Check size={13} />}</label>)}</div></Row>
    </Card>
    <Card title={bgText('Nhân vật Trang chủ', 'Homepage mascot')} status={status}>
      <p className="chat-background-description">{bgText('Chọn một người bạn nhỏ cho lời chào trên Trang chủ.', 'Choose a little companion for your homepage greeting.')}</p>
      <div className="mascot-picker" role="radiogroup" aria-label={bgText('Nhân vật Trang chủ', 'Homepage mascot')}>
        {mascots.map(item => <label key={item.id} className="mascot-choice" data-selected={appearance.mascot === item.id}>
          <input type="radio" name="homepage-mascot" checked={appearance.mascot === item.id} onChange={() => choose('mascot', item.id)} />
          <span className="mascot-choice-preview"><img src={item.image} alt="" loading="lazy" width={80} height={80} />{appearance.mascot === item.id && <span className="chat-background-check"><Check size={13} /></span>}</span>
          <span>{bgText(item.vi, item.en)}</span>
        </label>)}
      </div>
    </Card>
    <Card title={bgText('Nền khung chat' , 'Chat background')} status={status}>
      <p className="chat-background-description">{bgText('Chọn một nền cho khung chat. Sidebar giữ nguyên giao diện hiện tại.', 'Choose a background for your chat. The sidebar keeps its current appearance.')}</p>
      <div className="chat-background-grid" role="radiogroup" aria-label={bgText('Nền khung chat', 'Chat background')}>
        {[{ id: 'none', vi: 'Mặc định', en: 'Default', paint: 'none' }, ...chatBackgrounds,
          ...(appearance.chatBackgroundImage ? [{ id: 'custom', vi: 'Ảnh của bạn', en: 'Your image', paint: chatBackgroundPaint({ ...appearance, chatBackground: 'custom' }) }] : [])].map(item => (
          <label className="chat-background-option" key={item.id} data-selected={appearance.chatBackground === item.id}>
            <input type="radio" name="chat-background" checked={appearance.chatBackground === item.id} onChange={() => choose('chatBackground', item.id as Appearance['chatBackground'])} />
            <span className="chat-background-thumb" style={{ backgroundImage: item.paint }}><span className="chat-background-mini-message" /><span className="chat-background-mini-line" />{appearance.chatBackground === item.id && <span className="chat-background-check"><Check size={13} /></span>}</span>
            <span>{bgText(item.vi, item.en)}</span>
          </label>
        ))}
      </div>
      <Row label={bgText('Độ đậm của nền', 'Background intensity')}>
        <div className="chat-background-range"><input type="range" min={0} max={100} step={1} value={appearance.chatBackgroundOpacity} disabled={appearance.chatBackground === 'none'} aria-label={bgText('Độ đậm của nền', 'Background intensity')} aria-valuetext={`${appearance.chatBackgroundOpacity}%`} onChange={event => choose('chatBackgroundOpacity', Number(event.currentTarget.value))} /><output>{appearance.chatBackgroundOpacity}%</output></div>
      </Row>
      <div className="chat-background-preview" style={{ backgroundColor: 'var(--surface)' }} aria-label={bgText('Xem trước nền chat', 'Chat background preview')}>
        <div className="chat-background-layer" style={{ backgroundImage: chatBackgroundPaint(appearance), opacity: appearance.chatBackgroundOpacity / 100 }} />
        <span className="chat-background-preview-label">{bgText('Xem trước', 'Preview')}</span><div className="chat-background-preview-bubble">{bgText('Chào bạn nha', 'Hello there')}</div><p>{bgText('Hôm nay mình có thể giúp gì cho bạn?', 'How can I help you today?')}</p>
      </div>
      <div className="chat-background-upload"><input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => { void uploadBackground(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} /><button type="button" className="appearance-select" disabled={uploading} onClick={() => uploadRef.current?.click()}>{uploading ? bgText('Đang xử lý ảnh…', 'Processing…') : bgText('Tải ảnh của bạn lên', 'Upload your image')}</button><span>PNG, JPG, WebP · {bgText('tối đa', 'up to')} 20 MB</span>{appearance.chatBackgroundImage && <button type="button" className="chat-background-remove" disabled={uploading} onClick={() => onChangeAppearance({ chatBackgroundImage: '', ...(appearance.chatBackground === 'custom' ? { chatBackground: 'none' as const } : {}) })}>{bgText('Xóa ảnh', 'Remove image')}</button>}</div>
      {uploadError && <p className="chat-background-error" role="alert">{uploadError}</p>}
    </Card>
    <Card title={t('Phông chữ')} status={status}>
      <Row label={t('Font Antialiasing')} description={t('Làm nét chữ bằng grayscale antialiasing. Chỉ ảnh hưởng macOS; tắt để dùng cách hiển thị mặc định của hệ thống.')}>{switchControl('antialiasing', t('Font Antialiasing'))}</Row>
      <Row label={t('Kích thước chữ')} description={t('Kích thước phông chữ của tin nhắn')}><div className="font-size-control"><div><span title={t('Nhỏ')} aria-hidden="true">A</span><input type="range" aria-label={t('Kích thước chữ')} aria-valuetext={`${appearance.fontSize} px`} min={12} max={20} step={1} value={appearance.fontSize} onChange={event => choose('fontSize', Number(event.currentTarget.value))} /><span title={t('Lớn')} aria-hidden="true">A</span></div><p>{appearance.fontSize} px{appearance.fontSize === 14 && ` · ${t('Chuẩn')}`}</p></div></Row>
      <div className="appearance-preview message-content">{t('Chào mừng đến với ohmyt. Chỉ cần một câu, hãy nêu mục tiêu của bạn.')}</div>
    </Card>
    <Card title={t('Hoạt ảnh chuyển tiếp')} status={status}>
      <div className="transition-choice"><Segments label={t('Hoạt ảnh chuyển tiếp')} value={appearance.transition} options={[{ value: 'none', label: t('Không có') }, { value: 'fade', label: t('Hiện dần') }, { value: 'smooth', label: t('Mượt mà') }]} onChange={value => { choose('transition', value as Appearance['transition']); setPreviewKey(current => current + 1); }} /></div>
      <div className="appearance-preview"><div key={previewKey} className="appearance-enter transition-preview"><h3>{t('Tính năng')}</h3><strong>{t('Điểm nổi bật')}</strong><ul><li><Monitor size={14} />{t('Đa mô hình')}: GPT / Gemini / Ollama</li><li><Sparkles size={14} />{t('Thị giác')}: {t('Đa phương thức')}</li><li><Zap size={14} />{t('Công cụ')}: {t('Gọi hàm và dữ liệu thời gian thực')}</li></ul></div>
      <TransitionDemo transition={appearance.transition} animated={appearance.responseAnimation !== 'off' && appearance.transition !== 'none'} playKey={`${previewKey}-${appearance.responseAnimation}`} />
      </div>
    </Card>
    <Card title={t('Hành vi trò chuyện')} status={status}>
      <Row label={t('Tự động cuộn khi AI phản hồi')} description={t('Chỉ bám đáy khi bạn không đang đọc lịch sử.')}>{switchControl('autoScroll', t('Tự động cuộn khi AI phản hồi'))}</Row>
      <Row label={t('Mở rộng các bước công cụ khi đang chạy')}>{switchControl('autoExpandTools', t('Mở rộng các bước công cụ khi đang chạy'))}</Row>
      <Row label={t('Hiển thị biểu tượng trong liên kết tin nhắn')}>{switchControl('linkIcons', t('Hiển thị biểu tượng trong liên kết tin nhắn'))}</Row>
    </Card>
    <Card title={t('Chủ đề tô sáng mã')} status={status}><Row label={t('Chủ đề tô sáng mã')}>{selectControl('codeTheme', t('Chủ đề tô sáng mã'), [['lobe', 'Lobe Theme'], ['github', 'GitHub'], ['nord', 'Nord']])}</Row><ContentBlock language="typescript" code={codePreview} appearance={appearance} activeTheme={activeTheme} /></Card>
    <Card title={t('Chủ đề Mermaid')} status={status}><Row label={t('Chủ đề Mermaid')}>{selectControl('mermaidTheme', t('Chủ đề Mermaid'), [['lobe', 'Lobe Theme'], ['default', 'Default'], ['neutral', 'Neutral'], ['forest', 'Forest'], ['dark', 'Dark']])}</Row><details className="mermaid-preview" open={mermaidExpanded} onToggle={event => setMermaidExpanded(event.currentTarget.open)}><summary>{t('Xem trước Mermaid')}</summary><ContentBlock language="mermaid" code={diagramPreview} appearance={appearance} activeTheme={activeTheme} /></details></Card>
  </div>;
}
