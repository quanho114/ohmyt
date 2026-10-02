import React, { useEffect, useState } from 'react';
import { Activity, CalendarDays, Clock3, MessageSquare, RotateCw } from 'lucide-react';
import { api } from '../api.ts';
import type { Statistics } from '../types.ts';

type Metric = 'runs' | 'messages';
const format = new Intl.NumberFormat('vi-VN');
const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' });

function MetricToggle({ value, onChange }: { value: Metric; onChange: (metric: Metric) => void }) {
  return <div className="stats-switch" role="group" aria-label="Chỉ số hiển thị">
    {(['runs', 'messages'] as const).map(metric => <button key={metric} type="button" aria-pressed={value === metric} onClick={() => onChange(metric)}>{metric === 'runs' ? 'Lượt chạy' : 'Tin nhắn'}</button>)}
  </div>;
}

function Heatmap({ days, metric }: { days: Statistics['activity']['daily']; metric: Metric }) {
  const padding = days.length ? new Date(`${days[0].date}T12:00:00`).getDay() : 0;
  const cells = [...Array(padding).fill(null), ...days] as Array<(typeof days)[number] | null>;
  const peak = Math.max(1, ...days.map(day => day[metric]));
  const months = days.reduce<Array<{ label: string; column: number }>>((result, day, index) => {
    if (index === 0 || day.date.slice(0, 7) !== days[index - 1].date.slice(0, 7)) {
      const column = Math.floor((index + padding) / 7);
      if (!result.some(item => item.column === column)) result.push({ label: `Th${Number(day.date.slice(5, 7))}`, column });
    }
    return result;
  }, []);
  return <div className="stats-heatmap-scroll">
    <div className="stats-heatmap" role="group" aria-label={`Lịch hoạt động ${days.length} ngày, ${metric === 'runs' ? 'lượt chạy' : 'tin nhắn'}`}>
      <div className="stats-months">{months.map(month => <span key={month.column} style={{ gridColumn: month.column + 1 }}>{month.label}</span>)}</div>
      <div className="stats-cells">{cells.map((day, index) => day ? <span key={day.date} className={`stats-cell stats-level-${day[metric] ? Math.max(1, Math.ceil(day[metric] / peak * 4)) : 0}`} title={`${shortDate(day.date)}: ${format.format(day[metric])} ${metric === 'runs' ? 'lượt chạy' : 'tin nhắn'}`} aria-label={`${shortDate(day.date)}: ${day[metric]} ${metric === 'runs' ? 'lượt chạy' : 'tin nhắn'}`} tabIndex={day[metric] ? 0 : -1} /> : <span key={`empty-${index}`} />)}</div>
    </div>
  </div>;
}

function Trend({ days, metric }: { days: Statistics['monthly']['daily']; metric: Metric }) {
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected !== null && selected < days.length ? selected : null;
  const max = Math.max(1, ...days.map(day => day[metric]));
  const points = days.map((day, index) => `${(index / Math.max(1, days.length - 1)) * 960},${184 - day[metric] / max * 156}`).join(' ');
  return <div className="stats-trend">
    <div className="stats-trend-detail" aria-live="polite">{active === null ? 'Di chuột hoặc dùng Tab để xem từng ngày' : `${shortDate(days[active].date)} · ${format.format(days[active][metric])} ${metric === 'runs' ? 'lượt chạy' : 'tin nhắn'}`}</div>
    <svg viewBox="0 0 960 220" preserveAspectRatio="none" role="img" aria-label={`Xu hướng ${metric === 'runs' ? 'lượt chạy' : 'tin nhắn'} trong tháng`}>
      {[28, 106, 184].map(y => <line key={y} x1="0" x2="960" y1={y} y2={y} className="stats-gridline" />)}
      {days.some(day => day[metric]) && <polyline points={points} className="stats-trend-line" />}
      {days.map((day, index) => <rect key={day.date} x={Math.max(0, (index - .5) / days.length * 960)} y="0" width={960 / days.length} height="204" className="stats-trend-hit" onMouseEnter={() => setSelected(index)} onFocus={() => setSelected(index)} onBlur={() => setSelected(null)} tabIndex={0} aria-label={`${shortDate(day.date)}: ${day[metric]} ${metric === 'runs' ? 'lượt chạy' : 'tin nhắn'}`}><title>{shortDate(day.date)}: {day[metric]}</title></rect>)}
      {active !== null && <line x1={active / Math.max(1, days.length - 1) * 960} x2={active / Math.max(1, days.length - 1) * 960} y1="16" y2="184" className="stats-crosshair" />}
    </svg>
    <div className="stats-axis"><span>{days[0]?.date}</span><span>{days[Math.floor(days.length / 2)]?.date}</span><span>{days.at(-1)?.date}</span></div>
    <details className="stats-table-details"><summary>Xem dữ liệu từng ngày</summary><div className="stats-table-scroll"><table><thead><tr><th>Ngày</th><th>Lượt chạy</th><th>Tin nhắn</th></tr></thead><tbody>{days.map(day => <tr key={day.date}><td>{shortDate(day.date)}</td><td>{format.format(day.runs)}</td><td>{format.format(day.messages)}</td></tr>)}</tbody></table></div></details>
  </div>;
}

function Ranking({ title, rows }: { title: string; rows: Array<{ name: string; count: number }> }) {
  return <section className="stats-ranking"><h4>{title}</h4><div className="stats-ranking-head"><span>Tên</span><span>Lượt</span></div>{rows.length ? rows.map((row, index) => <div className="stats-ranking-row" key={`${row.name}-${index}`}><span title={row.name}>{row.name}</span><strong>{format.format(row.count)}</strong></div>) : <p className="stats-muted">Chưa có dữ liệu</p>}</section>;
}

export function StatisticsSettings() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [stats, setStats] = useState<Statistics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [activityMetric, setActivityMetric] = useState<Metric>('runs');
  const [monthMetric, setMonthMetric] = useState<Metric>('runs');

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
    <div className="stats-page-title"><h3 id="settings-section-title">Thống kê</h3><p>Tổng quan hoạt động trong không gian làm việc của bạn</p></div>
    {loading && !data && <p className="stats-feedback" role="status">Đang tải thống kê…</p>}
    {error && <div className="stats-feedback" role="alert">Không thể tải thống kê: {error} <button type="button" onClick={() => setRetry(value => value + 1)}><RotateCw size={14} /> Thử lại</button></div>}
    {data && <div className={`stats-stack${loading ? ' stats-refreshing' : ''}`}>
      <section className="stats-panel stats-overview" aria-label="Tổng quan hoạt động">
        <div className="stats-intro"><h4>{data.firstActivity ? `Bạn đã hoạt động ${Math.max(1, Math.floor((Date.now() - data.firstActivity) / 86_400_000) + 1)} ngày cùng ohmyt` : 'Chào mừng bạn đến với ohmyt'}</h4><p><Clock3 size={13} /> {data.firstActivity ? `Bắt đầu ${new Date(data.firstActivity).toLocaleDateString('vi-VN')}` : 'Chưa có hoạt động được ghi nhận'} <span>·</span> <RotateCw size={13} /> Cập nhật {shortDate(data.today)}</p></div>
        <div className="stats-inner">
          <div className="stats-kpis">
            {([['Agents', data.totals.agents, 'Đã tạo'], ['Hội thoại', data.totals.sessions, 'Đã tạo'], ['Tin nhắn', data.totals.messages, `${data.previous.messages} tháng trước`], ['Lượt chạy', data.totals.runs, `${data.previous.runs} tháng trước`]] as const).map(([label, value, caption]) => <div key={label}><span>{label}</span><strong>{format.format(value)}</strong><small>{caption}</small></div>)}
          </div>
          <div className="stats-section-heading"><h4>Hoạt động trong năm qua</h4><MetricToggle value={activityMetric} onChange={setActivityMetric} /></div>
          <div className="stats-milestones">
            <div><strong>{format.format(activityMetric === 'runs' ? data.activity.peakRuns : data.activity.peakMessages)}</strong><span>Cao nhất trong một ngày</span></div>
            <div><strong>{data.activity.longestRunMs === null ? '—' : `${Math.round(data.activity.longestRunMs / 1000)}s`}</strong><span>Lượt chạy lâu nhất</span></div>
            <div><strong>{data.activity.currentStreak} ngày</strong><span>Chuỗi hiện tại</span></div>
            <div><strong>{data.activity.longestStreak} ngày</strong><span>Chuỗi dài nhất</span></div>
          </div>
          <Heatmap days={data.activity.daily} metric={activityMetric} />
          <div className="stats-legend"><span>Ít hoạt động</span>{[0, 1, 2, 3, 4].map(level => <i key={level} className={`stats-cell stats-level-${level}`} />)}<span>Nhiều hoạt động</span></div>
          {!hasActivity && <p className="stats-muted stats-empty-note">Chưa có hoạt động; lịch sẽ tự cập nhật khi bạn bắt đầu trò chuyện.</p>}
          <div className="stats-rankings"><Ranking title="Xếp hạng sử dụng Agent" rows={data.rankings.agents} /><Ranking title="Hội thoại nhiều tin nhắn" rows={data.rankings.conversations} /><section className="stats-ranking"><h4>Xếp hạng sử dụng mô hình</h4><p className="stats-muted">Chưa ghi nhận mô hình theo lượt chạy</p></section></div>
        </div>
      </section>
      <section className="stats-panel stats-usage" aria-label="Thống kê sử dụng"><div className="stats-usage-header"><h4>Thống kê sử dụng</h4><label className="stats-month-label"><CalendarDays size={14} /><span className="sr-only">Chọn tháng</span><input type="month" value={month} onChange={event => { if (event.target.value) setMonth(event.target.value); }} /></label></div>
        <div className="stats-inner"><div className="stats-usage-kpis"><div><span>Chi phí hôm nay</span><strong>—</strong><small>Chưa ghi nhận chi phí</small></div><div><span>Chi phí tháng này</span><strong>—</strong><small>Chưa ghi nhận chi phí</small></div><div><span>Mô hình đang bật</span><strong>{data.monthly.activeModels}</strong><small>Mô hình đã cấu hình</small></div></div>
          <div className="stats-chart-heading"><div><Activity size={15} /><span>Hoạt động · {data.month}</span></div><MetricToggle value={monthMetric} onChange={setMonthMetric} /></div>
          <Trend days={data.monthly.daily} metric={monthMetric} />
          <div className="stats-month-summary"><span><Activity size={14} /> {format.format(data.monthly.runs)} lượt chạy</span><span><MessageSquare size={14} /> {format.format(data.monthly.messages)} tin nhắn</span><span>Token: Chưa ghi nhận</span></div>
        </div>
      </section>
    </div>}
  </div>;
}
