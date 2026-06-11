import { useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { MousePointerClick, Target, UsersRound } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

function Metric({ label, value, note, icon: Icon }) {
  return (
    <section className="metric">
      <div className="metric-icon"><Icon size={20} /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </section>
  );
}

const rateLabels = {
  open_rate: '開封率(延べ)',
  click_rate: 'クリック率(延べ)',
  conversion_rate: 'CV率(延べ)'
};

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const SLOT_ORDER = ['早朝 5-9時', '午前 9-12時', '昼 12-15時', '午後 15-18時', '夜 18-21時', '深夜 21-5時'];

function parseSendDate(campaign) {
  if (!campaign.jcity_id) return null;
  const date = new Date(`${campaign.jcity_id}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hourSlot(sendTime) {
  if (!sendTime) return null;
  const hour = Number.parseInt(String(sendTime).split(':')[0], 10);
  if (Number.isNaN(hour)) return null;
  if (hour >= 5 && hour < 9) return SLOT_ORDER[0];
  if (hour >= 9 && hour < 12) return SLOT_ORDER[1];
  if (hour >= 12 && hour < 15) return SLOT_ORDER[2];
  if (hour >= 15 && hour < 18) return SLOT_ORDER[3];
  if (hour >= 18 && hour < 21) return SLOT_ORDER[4];
  return SLOT_ORDER[5];
}

function aggregate(campaigns, keyFn, order) {
  const map = new Map();
  for (const campaign of campaigns) {
    const key = keyFn(campaign);
    if (key == null) continue;
    const cur = map.get(key) || { name: key, sent: 0, opens: 0, clicks: 0, conversions: 0, count: 0 };
    cur.sent += campaign.total_sent;
    cur.opens += campaign.opens;
    cur.clicks += campaign.clicks;
    cur.conversions += campaign.conversions;
    cur.count += 1;
    map.set(key, cur);
  }
  const rate = (count, sent) => (sent ? Number(((count / sent) * 100).toFixed(2)) : 0);
  const rows = Array.from(map.values()).map((row) => ({
    ...row,
    open_rate: rate(row.opens, row.sent),
    click_rate: rate(row.clicks, row.sent),
    conversion_rate: rate(row.conversions, row.sent)
  }));
  rows.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  return rows;
}

function TimingChart({ title, hint, data }) {
  return (
    <div className="timing-chart">
      <h3>{title}</h3>
      {data.length ? (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" />
            <YAxis unit="%" allowDecimals={false} />
            <Tooltip
              formatter={(value, name) => [`${value}%`, rateLabels[name] || name]}
              labelFormatter={(label) => {
                const row = data.find((item) => item.name === label);
                return row ? `${label}（${row.count}通分・配信${row.sent.toLocaleString()}）` : label;
              }}
            />
            <Legend formatter={(value) => rateLabels[value] || value} />
            <Bar dataKey="open_rate" fill="#0d9488" name="open_rate" />
            <Bar dataKey="click_rate" fill="#6366f1" name="click_rate" />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="empty">{hint}</p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { campaigns, projects, loading } = useOutletContext();
  const navigate = useNavigate();

  const [periodMode, setPeriodMode] = useState('all');
  const [monthVal, setMonthVal] = useState('');
  const [fromVal, setFromVal] = useState('');
  const [toVal, setToVal] = useState('');
  const [sort, setSort] = useState({ key: null, dir: 'desc' });

  const totals = campaigns.reduce((acc, campaign) => {
    acc.sent += campaign.total_sent;
    acc.opens += campaign.opens;
    acc.clicks += campaign.clicks;
    acc.conversions += campaign.conversions;
    acc.uniqueOpens += campaign.unique_opens;
    acc.uniqueClicks += campaign.unique_clicks;
    acc.uniqueConversions += campaign.unique_conversions;
    return acc;
  }, { sent: 0, opens: 0, clicks: 0, conversions: 0, uniqueOpens: 0, uniqueClicks: 0, uniqueConversions: 0 });

  const pct = (value) => (totals.sent ? `${((value / totals.sent) * 100).toFixed(2)}%` : '0.00%');

  // プロジェクト比較（配信実績があるものを上位順に表示）
  const comparison = projects
    .filter((project) => project.total_sent > 0 || project.email_count > 0)
    .sort((a, b) => b.open_rate_total - a.open_rate_total);

  const projectChart = comparison.map((project) => ({
    name: project.name.length > 8 ? `${project.name.slice(0, 8)}…` : project.name,
    open_rate: project.open_rate_total,
    click_rate: project.click_rate_total,
    conversion_rate: project.conversion_rate_total
  }));

  const weekdayData = useMemo(
    () => aggregate(campaigns, (c) => {
      const date = parseSendDate(c);
      return date ? WEEKDAYS[date.getDay()] : null;
    }, WEEKDAYS),
    [campaigns]
  );

  const slotData = useMemo(
    () => aggregate(campaigns, (c) => hourSlot(c.send_time), SLOT_ORDER),
    [campaigns]
  );

  // メール成績: 期間フィルタ + ソート
  const filtered = useMemo(() => campaigns.filter((campaign) => {
    if (periodMode === 'all') return true;
    if (!campaign.jcity_id) return false;
    if (periodMode === 'month') return monthVal ? campaign.jcity_id.slice(0, 7) === monthVal : true;
    if (periodMode === 'range') {
      if (fromVal && campaign.jcity_id < fromVal) return false;
      if (toVal && campaign.jcity_id > toVal) return false;
      return true;
    }
    return true;
  }), [campaigns, periodMode, monthVal, fromVal, toVal]);

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    const factor = sort.dir === 'asc' ? 1 : -1;
    const textKeys = new Set(['name', 'jcity_id']);
    return [...filtered].sort((a, b) => {
      if (textKeys.has(sort.key)) {
        return (a[sort.key] || '').localeCompare(b[sort.key] || '') * factor;
      }
      return (Number(a[sort.key] || 0) - Number(b[sort.key] || 0)) * factor;
    });
  }, [filtered, sort]);

  function toggleSort(key) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
  }

  const arrow = (key) => (sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
  const Th = ({ label, k }) => (
    <th className="sortable" onClick={() => toggleSort(k)}>{label}{arrow(k)}</th>
  );

  return (
    <div className="stack">
      <div className="metrics-grid">
        <Metric label="通算開封率（延べ）" value={pct(totals.opens)} note={`${totals.opens.toLocaleString()} 開封 / ${totals.sent.toLocaleString()} 配信（ユニーク ${totals.uniqueOpens.toLocaleString()}）`} icon={UsersRound} />
        <Metric label="通算クリック率（延べ）" value={pct(totals.clicks)} note={`${totals.clicks.toLocaleString()} クリック（ユニーク ${totals.uniqueClicks.toLocaleString()}）`} icon={MousePointerClick} />
        <Metric label="通算CV率（延べ）" value={pct(totals.conversions)} note={`${totals.conversions.toLocaleString()} CV（ユニーク ${totals.uniqueConversions.toLocaleString()}）`} icon={Target} />
      </div>

      <section className="panel">
        <div className="panel-heading">
          <h2>プロジェクト比較</h2>
          <span>{loading ? '更新中...' : `${comparison.length} プロジェクト`}</span>
        </div>
        {comparison.length ? (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={projectChart} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis unit="%" allowDecimals={false} />
                <Tooltip formatter={(value, name) => [`${value}%`, rateLabels[name] || name]} />
                <Legend formatter={(value) => rateLabels[value] || value} />
                <Bar dataKey="open_rate" fill="#0d9488" name="open_rate" />
                <Bar dataKey="click_rate" fill="#6366f1" name="click_rate" />
                <Bar dataKey="conversion_rate" fill="#f59e0b" name="conversion_rate" />
              </BarChart>
            </ResponsiveContainer>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>プロジェクト</th>
                    <th>メール数</th>
                    <th>配信数</th>
                    <th>開封率(延べ)</th>
                    <th>クリック率(延べ)</th>
                    <th>CV率(延べ)</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((project) => (
                    <tr key={project.id} onClick={() => navigate(`/projects/${project.id}`)}>
                      <td><strong>{project.name}</strong></td>
                      <td>{project.email_count}</td>
                      <td>{project.total_sent.toLocaleString()}</td>
                      <td>{project.open_rate_total}%</td>
                      <td>{project.click_rate_total}%</td>
                      <td>{project.conversion_rate_total}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="empty">配信実績のあるプロジェクトがまだありません</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>配信タイミング別パフォーマンス</h2>
          <span>配信日・配信時間を登録したメールが対象</span>
        </div>
        <div className="timing-grid">
          <TimingChart
            title="曜日別"
            hint="配信日を登録すると曜日別に集計されます"
            data={weekdayData}
          />
          <TimingChart
            title="配信時間帯別"
            hint="配信時間を登録すると時間帯別に集計されます"
            data={slotData}
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>全メール成績</h2>
          <span>{loading ? '更新中...' : `${sorted.length} / ${campaigns.length} メール`}</span>
        </div>

        <div className="filter-bar">
          <label>
            <span>集計期間</span>
            <select value={periodMode} onChange={(event) => setPeriodMode(event.target.value)}>
              <option value="all">すべて</option>
              <option value="month">月別</option>
              <option value="range">期間指定</option>
            </select>
          </label>
          {periodMode === 'month' && (
            <label>
              <span>対象月</span>
              <input type="month" value={monthVal} onChange={(event) => setMonthVal(event.target.value)} />
            </label>
          )}
          {periodMode === 'range' && (
            <>
              <label>
                <span>開始日</span>
                <input type="date" value={fromVal} onChange={(event) => setFromVal(event.target.value)} />
              </label>
              <label>
                <span>終了日</span>
                <input type="date" value={toVal} onChange={(event) => setToVal(event.target.value)} />
              </label>
            </>
          )}
          {periodMode !== 'all' && (
            <small className="filter-note">配信日が未登録のメールは期間指定では除外されます</small>
          )}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <Th label="メール名" k="name" />
                <Th label="配信日" k="jcity_id" />
                <Th label="配信数" k="total_sent" />
                <Th label="開封率(延べ)" k="open_rate_total" />
                <Th label="クリック率(延べ)" k="click_rate_total" />
                <Th label="CV率(延べ)" k="conversion_rate_total" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((campaign) => (
                <tr key={campaign.id} onClick={() => navigate(`/campaigns/${campaign.id}`)}>
                  <td>
                    <strong>{campaign.name}</strong>
                    <small>{campaign.subject || campaign.id}</small>
                  </td>
                  <td>{campaign.jcity_id || '-'}{campaign.send_time ? ` ${campaign.send_time}` : ''}</td>
                  <td>{campaign.total_sent.toLocaleString()}</td>
                  <td>{campaign.open_rate_total}%</td>
                  <td>{campaign.click_rate_total}%</td>
                  <td>{campaign.conversion_rate_total}%</td>
                </tr>
              ))}
              {!sorted.length && (
                <tr>
                  <td colSpan="6" className="empty">該当するメールがありません</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
