import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Copy, RefreshCcw } from 'lucide-react';
import { api } from '../api.js';

function currentOrigin() {
  return window.location.origin;
}

const eventLabels = {
  open: '開封',
  click: 'クリック',
  conversion: 'コンバージョン'
};

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
    return <section className="panel"><p className="empty">キャンペーンを選択してください</p></section>;
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
            <section className="metric"><span>ユニーク開封</span><strong>{campaign.open_rate}%</strong><small>{campaign.unique_opens} / {campaign.total_sent}</small></section>
            <section className="metric"><span>ユニーククリック</span><strong>{campaign.click_rate}%</strong><small>{campaign.unique_clicks} 件</small></section>
            <section className="metric"><span>コンバージョン</span><strong>{campaign.conversion_rate}%</strong><small>{campaign.unique_conversions} 件</small></section>
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
                    {copied === key && <small>コピー済み</small>}
                  </div>
                ))}
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <h2>リアルタイムイベント</h2>
                  <button className="ghost" onClick={loadStats}><RefreshCcw size={16} /> 更新</button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>日時</th><th>種別</th><th>メールID</th><th>リンク</th><th>IPアドレス</th></tr>
                    </thead>
                    <tbody>
                      {campaign.recent_events?.map((event) => (
                        <tr key={event.id}>
                          <td>{new Date(event.created_at).toLocaleString('ja-JP')}</td>
                          <td>{eventLabels[event.event_type] || event.event_type}</td>
                          <td>{event.email_id}</td>
                          <td>{event.link_id || '-'}</td>
                          <td>{event.ip_address || '-'}</td>
                        </tr>
                      ))}
                      {!campaign.recent_events?.length && <tr><td colSpan="5" className="empty">まだイベントがありません</td></tr>}
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
                        <td>{row.opened ? '✓' : '-'}</td>
                        <td>{row.clicked ? '✓' : '-'}</td>
                        <td>{row.converted ? '✓' : '-'}</td>
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
