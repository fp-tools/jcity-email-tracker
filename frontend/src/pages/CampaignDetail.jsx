import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Copy, RefreshCcw } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { api } from '../api.js';

function currentOrigin() {
  return window.location.origin;
}

const eventLabels = {
  open: '開封',
  click: 'クリック',
  conversion: 'コンバージョン'
};

const metricLabels = {
  opens: '開封',
  clicks: 'クリック',
  conversions: 'コンバージョン'
};

const COLORS = ['#0d9488', '#6366f1', '#f59e0b', '#ef4444', '#64748b'];

export default function CampaignDetail({ campaignId, fallback, onBack }) {
  const [campaign, setCampaign] = useState(fallback);
  const [baseUrl, setBaseUrl] = useState(currentOrigin());
  const [destinationUrl, setDestinationUrl] = useState('https://your-site.com/lp');
  const [linkId, setLinkId] = useState('main-cta');
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('stats');
  const [emailBreakdown, setEmailBreakdown] = useState([]);
  const [emailsLoading, setEmailsLoading] = useState(false);

  async function loadStats() {
    if (!campaignId) return;
    try {
      const data = await api.campaignStats(campaignId);
      setCampaign(data.campaign);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadEmailBreakdown() {
    if (!campaignId) return;
    setEmailsLoading(true);
    try {
      const data = await api.emailBreakdown(campaignId);
      setEmailBreakdown(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setEmailsLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
    const interval = window.setInterval(loadStats, 10000);
    return () => window.clearInterval(interval);
  }, [campaignId]);

  useEffect(() => {
    setActiveTab('stats');
    setEmailBreakdown([]);
  }, [campaignId]);

  useEffect(() => {
    if (activeTab === 'emails') loadEmailBreakdown();
  }, [activeTab, campaignId]);

  const snippets = useMemo(() => {
    if (!campaign) return { pixel: '', link: '', conversion: '' };
    const cleanBase = baseUrl.replace(/\/$/, '');
    const pixel = `<img src="${cleanBase}/pixel/${campaign.id}/{{EMAIL_ID}}" width="1" height="1" alt="" style="display:none">`;
    const link = `<a href="${cleanBase}/click/${campaign.id}/{{EMAIL_ID}}/${encodeURIComponent(linkId)}?url=${encodeURIComponent(destinationUrl)}">こちらをクリック</a>`;
    const conversion = `<script>
(function () {
  var params = new URLSearchParams(window.location.search);
  fetch("${cleanBase}/api/conversions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      campaign_id: params.get("jcity_campaign_id") || "${campaign.id}",
      email_id: params.get("jcity_email_id") || "{{EMAIL_ID}}",
      link_id: params.get("jcity_link_id")
    })
  });
})();
</script>`;
    return { pixel, link, conversion };
  }, [campaign, baseUrl, destinationUrl, linkId]);

  async function copy(text, key) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(''), 1400);
  }

  if (!campaignId) {
    return <section className="panel"><p className="empty">メールを選択してください</p></section>;
  }

  return (
    <div className="stack">
      <button className="ghost" onClick={onBack}><ArrowLeft size={18} /> 戻る</button>
      {error && <div className="alert">{error}</div>}
      {campaign && (
        <>
          <div className="tabs">
            <button className={activeTab === 'stats' ? 'active' : ''} onClick={() => setActiveTab('stats')}>概要</button>
            <button className={activeTab === 'emails' ? 'active' : ''} onClick={() => setActiveTab('emails')}>メール別詳細</button>
          </div>

          <div className="metrics-grid">
            <section className="metric"><span>ユニーク開封率</span><strong>{campaign.open_rate}%</strong><small>{campaign.unique_opens} / {campaign.total_sent}</small></section>
            <section className="metric"><span>ユニーククリック率</span><strong>{campaign.click_rate}%</strong><small>{campaign.unique_clicks} 件</small></section>
            <section className="metric"><span>コンバージョン率</span><strong>{campaign.conversion_rate}%</strong><small>{campaign.unique_conversions} 件</small></section>
            <section className="metric"><span>ユニークメール数</span><strong>{campaign.unique_recipients}</strong><small>イベント発生メールID</small></section>
          </div>

          {activeTab === 'stats' && (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <h2>jcityスニペット</h2>
                  <span>{campaign.id}</span>
                </div>
                <div className="snippet-controls">
                  <label>
                    <span>トラッキングドメイン</span>
                    <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
                  </label>
                  <label>
                    <span>リンクID</span>
                    <input value={linkId} onChange={(event) => setLinkId(event.target.value)} />
                  </label>
                  <label>
                    <span>遷移先URL</span>
                    <input value={destinationUrl} onChange={(event) => setDestinationUrl(event.target.value)} />
                  </label>
                </div>
                {[
                  ['開封トラッキングPixel', snippets.pixel, 'pixel'],
                  ['クリックトラッキングリンク', snippets.link, 'link'],
                  ['CVスクリプト', snippets.conversion, 'conversion']
                ].map(([title, value, key]) => (
                  <div className="snippet" key={key}>
                    <div>
                      <strong>{title}</strong>
                      <button className="icon-button" onClick={() => copy(value, key)} title={`${title}をコピー`}>
                        <Copy size={17} />
                      </button>
                    </div>
                    <pre>{value}</pre>
                    {copied === key && <small>コピーしました</small>}
                  </div>
                ))}
              </section>

              {campaign.html_content && (
                <section className="panel">
                  <div className="panel-heading"><h2>メールプレビュー</h2></div>
                  <iframe
                    srcDoc={campaign.html_content}
                    className="email-preview"
                    sandbox="allow-same-origin"
                    title="メールプレビュー"
                  />
                </section>
              )}

              <section className="panel chart-section">
                <div className="panel-heading">
                  <h2>時間帯別分析</h2>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={campaign.time_of_day || []}>
                    <XAxis dataKey="hour" tickFormatter={(hour) => `${hour}時`} />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(value, name) => [value, metricLabels[name] || name]} />
                    <Legend formatter={(value) => metricLabels[value] || value} />
                    <Bar dataKey="opens" fill="#0d9488" name="opens" />
                    <Bar dataKey="clicks" fill="#6366f1" name="clicks" />
                  </BarChart>
                </ResponsiveContainer>
              </section>

              <section className="panel chart-section">
                <div className="panel-heading">
                  <h2>デバイス分析</h2>
                </div>
                <div className="device-charts">
                  <div>
                    <h3>デバイス</h3>
                    <PieChart width={320} height={230}>
                      <Pie
                        data={campaign.devices || []}
                        dataKey="count"
                        nameKey="device_type"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ device_type, percent }) => `${device_type} ${(percent * 100).toFixed(0)}%`}
                      >
                        {campaign.devices?.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </div>
                  <div>
                    <h3>OS</h3>
                    <PieChart width={320} height={230}>
                      <Pie
                        data={campaign.os_breakdown || []}
                        dataKey="count"
                        nameKey="os"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ os, percent }) => `${os} ${(percent * 100).toFixed(0)}%`}
                      >
                        {campaign.os_breakdown?.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <h2>リアルタイムイベント</h2>
                  <button className="ghost" onClick={loadStats}><RefreshCcw size={16} /> 更新</button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>日時</th><th>種別</th><th>メールID</th><th>リンク</th><th>デバイス</th><th>OS</th><th>IPアドレス</th></tr>
                    </thead>
                    <tbody>
                      {campaign.recent_events?.map((event) => (
                        <tr key={event.id}>
                          <td>{new Date(event.created_at).toLocaleString('ja-JP')}</td>
                          <td>{eventLabels[event.event_type] || event.event_type}</td>
                          <td>{event.email_id}</td>
                          <td>{event.link_id || '-'}</td>
                          <td>{event.device_type || '-'}</td>
                          <td>{event.os || '-'}</td>
                          <td>{event.ip_address || '-'}</td>
                        </tr>
                      ))}
                      {!campaign.recent_events?.length && <tr><td colSpan="7" className="empty">まだイベントがありません</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {activeTab === 'emails' && (
            <section className="panel">
              <div className="panel-heading">
                <h2>メール別詳細</h2>
                <button className="ghost" onClick={loadEmailBreakdown} disabled={emailsLoading}>
                  <RefreshCcw size={16} /> {emailsLoading ? '更新中...' : '更新'}
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>メールID</th>
                      <th>開封</th>
                      <th>クリック</th>
                      <th>コンバージョン</th>
                      <th>最終アクション日時</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emailBreakdown.map((row) => (
                      <tr key={row.email_id}>
                        <td>{row.email_id}</td>
                        <td>{row.opened ? 'あり' : '-'}</td>
                        <td>{row.clicked ? 'あり' : '-'}</td>
                        <td>{row.converted ? 'あり' : '-'}</td>
                        <td>{row.last_event_at ? new Date(row.last_event_at).toLocaleString('ja-JP') : '-'}</td>
                      </tr>
                    ))}
                    {!emailBreakdown.length && (
                      <tr><td colSpan="5" className="empty">{emailsLoading ? '更新中...' : 'まだイベントがありません'}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
