import { useEffect, useState } from 'react';
import { Globe2, ShieldCheck, Loader2 } from 'lucide-react';
import { api, type BrowserUseConfig } from '../api.ts';
import type { SettingsLocale } from '../appearance.ts';

export function BrowserUseSettings({ locale }: { locale: SettingsLocale }) {
  const t = (vi: string, en: string) => locale === 'en' ? en : vi;
  const [config, setConfig] = useState<BrowserUseConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [domains, setDomains] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const apply = (value: BrowserUseConfig) => { setConfig(value); setEnabled(value.enabled); setDomains(value.domains.join(', ')); };
  useEffect(() => { void api.getBrowserUseConfig().then(apply).catch(error => setNotice(error.message)); }, []);
  const save = async () => {
    setBusy(true); setNotice('');
    try { apply(await api.saveBrowserUseConfig({ enabled, domains: domains.split(',') })); setNotice(t('Đã lưu. Áp dụng cho tác vụ tiếp theo.', 'Saved. Applies to the next task.')); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <section className="web-search-settings browser-use-settings" aria-label="Browser Use">
    <div className="web-search-intro"><span className="integration-icon"><Globe2 size={22} /></span><div><h2>{t('Điều khiển trình duyệt', 'Browser control')}</h2><p>{t('Cho phép AI đọc và tương tác với website trong Chrome của ohmyt.', 'Let AI read and interact with websites in ohmyt Chrome.')}</p></div><span className="integration-tag">Chrome</span></div>
    {config && <div className="web-search-config">
      <div className="browser-enable-row"><div><h3 id="browser-enable-label">Browser Use</h3><p>{enabled ? t('Đã bật · AI có thể thao tác trên miền được cho phép', 'Enabled · AI can act on allowed domains') : t('Đang tắt · bật để giao tác vụ trên website', 'Disabled · enable to run website tasks')}</p></div><input className="integration-switch" type="checkbox" role="switch" aria-labelledby="browser-enable-label" checked={enabled} disabled={busy || !config.desktop} onChange={e => setEnabled(e.target.checked)} /></div>
      <label htmlFor="browser-use-domains">{t('Tên miền được phép', 'Allowed domains')}</label>
      <input id="browser-use-domains" value={domains} disabled={busy} onChange={e => setDomains(e.target.value)} placeholder="example.com, www.example.com" />
      <p className="domain-hint">{t('Ngăn cách các tên miền bằng dấu phẩy. Ví dụ: github.com, docs.google.com', 'Separate domains with commas. Example: github.com, docs.google.com')}</p>
      <p className="browser-runtime-note">{!config.desktop ? t('Cần bản desktop để điều khiển khung Chrome.', 'The desktop app is required.') : config.installed ? t('Python runtime đã có. Mở website thuộc tên miền đã chọn trong khung Chrome trước khi giao tác vụ.', 'Python runtime found. Open an allowed website in the browser pane before starting a task.') : t('Chạy npm run setup:browser-use trong thư mục ohmyt để cài runtime.', 'Run npm run setup:browser-use in the ohmyt directory to install the runtime.')}</p>
      <p className="browser-permission-note"><ShieldCheck size={15} />{t('Sử dụng trong chat độc lập. Quyền thao tác theo chế độ cấp quyền của chat; bạn có thể bấm Dừng hoặc tự click để giành lại điều khiển.', 'Use in standalone chats. Actions follow chat approvals; click Stop or take control with your mouse.')}</p>
      <div className="web-search-actions"><button disabled={busy} onClick={() => void save()}>{busy && <Loader2 size={15} className="animate-spin" />}{busy ? t('Đang lưu…', 'Saving…') : t('Lưu Browser Use', 'Save Browser Use')}</button></div>
    </div>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
