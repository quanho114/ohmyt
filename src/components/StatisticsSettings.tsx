import React, { useEffect, useState } from 'react';
import { Activity, CalendarDays, Clock3, MessageSquare, RotateCw } from 'lucide-react';
import { api } from '../api.ts';
import type { Statistics } from '../types.ts';
import type { SettingsLocale } from '../appearance.ts';
import type { SettingsTextKey } from '../settingsLocale.ts';
import { settingsText } from '../settingsLocale.ts';

type Metric = 'runs' | 'messages';
const formats = { vi: new Intl.NumberFormat('vi-VN'), en: new Intl.NumberFormat('en-US') };
const dates = {
  vi: new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' }),
  en: new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'numeric', year: 'numeric' })
};
const months = {
  vi: new Intl.DateTimeFormat('vi-VN', { month: 'short' }),
  en: new Intl.DateTimeFormat('en-US', { month: 'short' })
};
const shortDate = (date: string, locale: SettingsLocale) => dates[locale].format(new Date(`${date}T12:00:00`));

function MetricToggle({ value, onChange, locale }: { value: Metric; onChange: (metric: Metric) => void; locale: SettingsLocale }) {
  return <div className="stats-switch" role="group" aria-label={settingsText(locale, 'Chỉ số hiển thị')}>
    {(['runs', 'messages'] as const).map(metric => <button key={metric} type="button" aria-pressed={value === metric} onClick={() => onChange(metric)}>{settingsText(locale, metric === 'runs' ? 'Lượt chạy' : 'Tin nhắn')}</button>)}
  </div>;
}

function Heatmap({ days, metric, locale }: { days: Statistics['activity']['daily']; metric: Metric; locale: SettingsLocale }) {
  const padding = days.length ? new Date(`${days[0].date}T12:00:00`).getDay() : 0;
  const cells = [...Array(padding).fill(null), ...days] as Array<(typeof days)[number] | null>;
  const peak = Math.max(1, ...days.map(day => day[metric]));
  const monthLabels = days.reduce<Array<{ label: string; column: number }>>((result, day, index) => {
    if (index === 0 || day.date.slice(0, 7) !== days[index - 1].date.slice(0, 7)) {
      const column = Math.floor((index + padding) / 7);
      if (!result.some(item => item.column === column)) result.push({ label: months[locale].format(new Date(`${day.date}T12:00:00`)), column });
    }
    return result;
  }, []);
  const metricLabel = settingsText(locale, metric === 'runs' ? 'lượt chạy' : 'tin nhắn');
  return <div className="stats-heatmap-scroll">
    <div className="stats-heatmap" role="group" aria-label={`${settingsText(locale, 'Lịch hoạt động')}: ${days.length} ${settingsText(locale, 'ngày')}, ${metricLabel}`}>
      <div className="stats-months">{monthLabels.map(month => <span key={month.column} style={{ gridColumn: month.column + 1 }}>{month.label}</span>)}</div>
      <div className="stats-cells">{cells.map((day, index) => day ? <span key={day.date} className={`stats-cell stats-level-${day[metric] ? Math.max(1, Math.ceil(day[metric] / peak * 4)) : 0}`} title={`${shortDate(day.date, locale)}: ${formats[locale].format(day[metric])} ${metricLabel}`} aria-label={`${shortDate(day.date, locale)}: ${formats[locale].format(day[metric])} ${metricLabel}`} tabIndex={day[metric] ? 0 : -1} /> : <span key={`empty-${index}`} />)}</div>
    </div>
  </div>;
}

function Trend({ days, metric, locale }: { days: Statistics['monthly']['daily']; metric: Metric; locale: SettingsLocale }) {
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected !== null && selected < days.length ? selected : null;
  const max = Math.max(1, ...days.map(day => day[metric]));
  const points = days.map((day, index) => `${(index / Math.max(1, days.length - 1)) * 960},${184 - day[metric] / max * 156}`).join(' ');
  const t = (key: SettingsTextKey) => settingsText(locale, key);
  const metricLabel = t(metric === 'runs' ? 'lượt chạy' : 'tin nhắn');
  return <div className="stats-trend" onMouseLeave={() => setSelected(null)}>
    <div className="stats-trend-detail" aria-live="polite">{active === null ? t('Di chuột hoặc dùng Tab để xem từng ngày') : `${shortDate(days[active].date, locale)} · ${formats[locale].format(days[active][metric])} ${metricLabel}`}</div>
    <svg viewBox="0 0 960 220" preserveAspectRatio="none" role="img" aria-label={`${t('Xu hướng trong tháng')}: ${metricLabel}`}>
      {[28, 106, 184].map(y => <line key={y} x1="0" x2="960" y1={y} y2={y} className="stats-gridline" />)}
      {days.some(day => day[metric]) && <polyline points={points} className="stats-trend-line" />}
      {days.map((day, index) => <rect key={day.date} x={Math.max(0, (index - .5) / days.length * 960)} y="0" width={960 / days.length} height="204" className="stats-trend-hit" onMouseEnter={() => setSelected(index)} onFocus={() => setSelected(index)} onBlur={() => setSelected(null)} tabIndex={0} aria-label={`${shortDate(day.date, locale)}: ${formats[locale].format(day[metric])} ${metricLabel}`}><title>{shortDate(day.date, locale)}: {formats[locale].format(day[metric])} {metricLabel}</title></rect>)}
      {active !== null && <line x1={active / Math.max(1, days.length - 1) * 960} x2={active / Math.max(1, days.length - 1) * 960} y1="16" y2="184" className="stats-crosshair" />}
    </svg>
    <div className="stats-axis"><span>{days[0] && shortDate(days[0].date, locale)}</span><span>{days[Math.floor(days.length / 2)] && shortDate(days[Math.floor(days.length / 2)].date, locale)}</span><span>{days.at(-1) && shortDate(days[days.length - 1].date, locale)}</span></div>
    <details className="stats-table-details"><summary>{t('Xem dữ liệu từng ngày')}</summary><div className="stats-table-scroll"><table><thead><tr><th>{t('Ngày')}</th><th>{t('Lượt chạy')}</th><th>{t('Tin nhắn')}</th></tr></thead><tbody>{days.map(day => <tr key={day.date}><td>{shortDate(day.date, locale)}</td><td>{formats[locale].format(day.runs)}</td><td>{formats[locale].format(day.messages)}</td></tr>)}</tbody></table></div></details>
  </div>;
}

function Ranking({ title, rows, locale }: { title: string; rows: Array<{ name: string; count: number }>; locale: SettingsLocale }) {
  return <section className="stats-ranking"><h4>{title}</h4><div className="stats-ranking-head"><span>{settingsText(locale, 'Tên')}</span><span>{settingsText(locale, 'Lượt')}</span></div>{rows.length ? rows.map((row, index) => <div className="stats-ranking-row" key={`${row.name}-${index}`}><span title={row.name}>{row.name}</span><strong>{formats[locale].format(row.count)}</strong></div>) : <p className="stats-muted">{settingsText(locale, 'Chưa có dữ liệu')}</p>}</section>;
}

export function StatisticsSettings({ locale }: { locale: SettingsLocale }) {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [stats, setStats] = useState<Statistics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [activityMetric, setActivityMetric] = useState<Metric>('runs');
  const [monthMetric, setMonthMetric] = useState<Metric>('runs');
  const t = (key: SettingsTextKey) => settingsText(locale, key);
  const format = formats[locale];

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    api.getStatistics(month).then(data => { if (live) setStats(data); }).catch(err => { if (live) setError(err instanceof Error ? err.message : String(err)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [month, retry]);

  const data = stats;
  const hasActivity = data && (data.totals.runs > 0 || data.totals.messages > 0);
  return <div className="settings-scroll-area stats-page">
    <div className="stats-page-title"><h2>{t('Thống kê')}</h2><p>{t('Tổng quan hoạt động trong không gian làm việc của bạn')}</p></div>
    {loading && !data && <p className="stats-feedback" role="status">{t('Đang tải thống kê…')}</p>}
    {error && <div className="stats-feedback" role="alert">{t('Không thể tải thống kê')}: {error} <button type="button" onClick={() => setRetry(value => value + 1)}><RotateCw size={14} /> {t('Thử lại')}</button></div>}
    {data && <div className={`stats-stack${loading ? ' stats-refreshing' : ''}`} aria-busy={loading}>
      <section className="stats-panel stats-overview" aria-label={t('Tổng quan hoạt động')}>
        <div className="stats-intro"><h3>{data.firstActivity ? `${t('Bạn đã hoạt động cùng ohmyt')}: ${format.format(Math.max(1, Math.floor((Date.now() - data.firstActivity) / 86_400_000) + 1))} ${t('ngày')}` : t('Chào mừng bạn đến với ohmyt')}</h3><p><Clock3 size={13} /> {data.firstActivity ? `${t('Bắt đầu')} ${dates[locale].format(new Date(data.firstActivity))}` : t('Chưa có hoạt động được ghi nhận')} <span>·</span> <RotateCw size={13} /> {t('Cập nhật')} {shortDate(data.today, locale)}</p></div>
        <div className="stats-inner">
          <div className="stats-kpis">
            {([[t('Agents'), data.totals.agents, t('Đã tạo')], [t('Hội thoại'), data.totals.sessions, t('Đã tạo')], [t('Tin nhắn'), data.totals.messages, `${format.format(data.previous.messages)} ${t('tháng trước')}`], [t('Lượt chạy'), data.totals.runs, `${format.format(data.previous.runs)} ${t('tháng trước')}`]] as const).map(([label, value, caption]) => <div key={label}><span>{label}</span><strong>{format.format(value)}</strong><small>{caption}</small></div>)}
          </div>
          <div className="stats-section-heading"><h3>{t('Hoạt động trong năm qua')}</h3><MetricToggle value={activityMetric} onChange={setActivityMetric} locale={locale} /></div>
          <div className="stats-milestones">
            <div><strong>{format.format(activityMetric === 'runs' ? data.activity.peakRuns : data.activity.peakMessages)}</strong><span>{t('Cao nhất trong một ngày')}</span></div>
            <div><strong>{data.activity.longestRunMs === null ? '—' : `${format.format(Math.round(data.activity.longestRunMs / 1000))} ${t('giây')}`}</strong><span>{t('Lượt chạy lâu nhất')}</span></div>
            <div><strong>{format.format(data.activity.currentStreak)} {t('ngày')}</strong><span>{t('Chuỗi hiện tại')}</span></div>
            <div><strong>{format.format(data.activity.longestStreak)} {t('ngày')}</strong><span>{t('Chuỗi dài nhất')}</span></div>
          </div>
          <Heatmap days={data.activity.daily} metric={activityMetric} locale={locale} />
          <div className="stats-legend"><span>{t('Ít hoạt động')}</span>{[0, 1, 2, 3, 4].map(level => <i key={level} className={`stats-cell stats-level-${level}`} />)}<span>{t('Nhiều hoạt động')}</span></div>
          {!hasActivity && <p className="stats-muted stats-empty-note">{t('Chưa có hoạt động; lịch sẽ tự cập nhật khi bạn bắt đầu trò chuyện.')}</p>}
          <div className="stats-rankings"><Ranking title={t('Xếp hạng sử dụng Agent')} rows={data.rankings.agents} locale={locale} /><Ranking title={t('Hội thoại nhiều tin nhắn')} rows={data.rankings.conversations} locale={locale} /><section className="stats-ranking"><h4>{t('Xếp hạng sử dụng mô hình')}</h4><p className="stats-muted">{t('Chưa ghi nhận mô hình theo lượt chạy')}</p></section></div>
        </div>
      </section>
      <section className="stats-panel stats-usage" aria-label={t('Thống kê sử dụng')}><div className="stats-usage-header"><h3>{t('Thống kê sử dụng')}</h3><label className="stats-month-label"><CalendarDays size={14} /><span className="sr-only">{t('Chọn tháng')}</span><input type="month" value={month} onChange={event => { if (event.target.value) setMonth(event.target.value); }} /></label></div>
        <div className="stats-inner"><div className="stats-usage-kpis"><div><span>{t('Chi phí hôm nay')}</span><strong>—</strong><small>{t('Chưa ghi nhận chi phí')}</small></div><div><span>{t('Chi phí tháng này')}</span><strong>—</strong><small>{t('Chưa ghi nhận chi phí')}</small></div><div><span>{t('Mô hình đang bật')}</span><strong>{format.format(data.monthly.activeModels)}</strong><small>{t('Mô hình đã cấu hình')}</small></div></div>
          <div className="stats-chart-heading"><div><Activity size={15} /><span>{t('Hoạt động')} · {data.month}</span></div><MetricToggle value={monthMetric} onChange={setMonthMetric} locale={locale} /></div>
          <Trend days={data.monthly.daily} metric={monthMetric} locale={locale} />
          <div className="stats-month-summary"><span><Activity size={14} /> {format.format(data.monthly.runs)} {t('lượt chạy')}</span><span><MessageSquare size={14} /> {format.format(data.monthly.messages)} {t('tin nhắn')}</span><span>{t('Token chưa được ghi nhận')}</span></div>
        </div>
      </section>
    </div>}
  </div>;
}
