import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Copy, Link as LinkIcon, Pencil, RefreshCcw, Trash2 } from 'lucide-react';
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
import EmailHeatmap from '../components/EmailHeatmap.jsx';
import HtmlEditor from '../components/HtmlEditor.jsx';
import LinkTrackModal from '../components/LinkTrackModal.jsx';
import ConvertedLinks from '../components/ConvertedLinks.jsx';
import FunnelManager from '../components/FunnelManager.jsx';

function currentOrigin() {
  return window.location.origin;
}

// SQLiteのcreated_at(UTC, "YYYY-MM-DD HH:MM:SS")を日本時間で表示する
function formatJst(ts) {
  if (!ts) return '-';
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : `${ts.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
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

export default function CampaignDetail() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { campaigns, loadAll } = useOutletContext();
  const fallback = campaigns.find((item) => item.id === campaignId);
  const [campaign, setCampaign] = useState(fallback);
  const [baseUrl, setBaseUrl] = useState(currentOrigin());
  const [destinationUrl, setDestinationUrl] = useState('https://your-site.com/lp');
  const [linkId, setLinkId] = useState('main-cta');
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('stats');
  const [emailBreakdown, setEmailBreakdown] = useState([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [editingSent, setEditingSent] = useState(false);
  const [sentDraft, setSentDraft] = useState('');
  const [savingSent, setSavingSent] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoDraft, setInfoDraft] = useState({ name: '', subject: '', jcity_id: '', send_time: '', html_content: '' });
  const [savingInfo, setSavingInfo] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [convertedLinks, setConvertedLinks] = useState([]);

  function onBack() {
    if (campaign?.project_id) navigate(`/projects/${campaign.project_id}`);
    else navigate('/');
  }

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
    setEditingInfo(false);
    setShowLinkModal(false);
    setConvertedLinks([]);
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

  function startEditSent() {
    setSentDraft(campaign?.total_sent ? String(campaign.total_sent) : '');
    setEditingSent(true);
  }

  async function saveTotalSent() {
    setSavingSent(true);
    setError('');
    try {
      await api.updateCampaign(campaignId, { total_sent: Number.parseInt(sentDraft, 10) || 0 });
      await loadStats();
      await loadAll();
      setEditingSent(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSent(false);
    }
  }

  function startEditInfo() {
    setInfoDraft({
      name: campaign?.name || '',
      subject: campaign?.subject || '',
      jcity_id: campaign?.jcity_id || '',
      send_time: campaign?.send_time || '',
      html_content: campaign?.html_content || ''
    });
    setEditingInfo(true);
  }

  const updateInfo = (key) => (event) =>
    setInfoDraft((current) => ({ ...current, [key]: event.target.value }));

  async function saveInfo(event) {
    event.preventDefault();
    setSavingInfo(true);
    setError('');
    try {
      await api.updateCampaign(campaignId, infoDraft);
      await loadStats();
      await loadAll();
      setEditingInfo(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingInfo(false);
    }
  }

  async function removeCampaign() {
    if (!window.confirm('このメールを削除しますか？関連する開封・クリック・CVのデータもすべて削除され、元に戻せません。')) return;
    setDeleting(true);
    setError('');
    try {
      const target = campaign?.project_id;
      await api.deleteCampaign(campaignId);
      await loadAll();
      navigate(target ? `/projects/${target}` : '/');
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

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
      <div className="detail-sticky">
        <div className="detail-actions">
          <button className="ghost" onClick={onBack}><ArrowLeft size={18} /> 戻る</button>
          <div className="detail-actions-right">
            <button className="ghost" onClick={editingInfo ? () => setEditingInfo(false) : startEditInfo} disabled={!campaign}>
              <Pencil size={16} /> {editingInfo ? '編集を閉じる' : '件名・本文を編集'}
            </button>
            <button className="ghost danger" onClick={removeCampaign} disabled={deleting || !campaign}>
              <Trash2 size={16} /> {deleting ? '削除中...' : '削除'}
            </button>
          </div>
        </div>
        {campaign && (
          <>
            <div className="tabs">
              <button className={activeTab === 'stats' ? 'active' : ''} onClick={() => setActiveTab('stats')}>概要</button>
              <button className={activeTab === 'emails' ? 'active' : ''} onClick={() => setActiveTab('emails')}>メール別詳細</button>
              <button className={activeTab === 'heatmap' ? 'active' : ''} onClick={() => setActiveTab('heatmap')}>ヒートマップ</button>
              <button className={activeTab === 'funnel' ? 'active' : ''} onClick={() => setActiveTab('funnel')}>ファネル</button>
            </div>

            <section className="panel sent-editor">
              <div className="sent-editor-row">
                <div className="sent-info">
                  <span className="sent-label">配信数</span>
                  {campaign.total_sent > 0 ? (
                    <strong>{campaign.total_sent.toLocaleString()} 通</strong>
                  ) : (
                    <em className="sent-hint">未入力 — 配信後に実際の配信数を入力してください</em>
                  )}
                </div>
                {editingSent ? (
                  <div className="sent-edit-controls">
                    <input
                      type="number"
                      min="0"
                      value={sentDraft}
                      onChange={(event) => setSentDraft(event.target.value)}
                      placeholder="12000"
                      autoFocus
                    />
                    <button className="primary" onClick={saveTotalSent} disabled={savingSent}>
                      {savingSent ? '保存中...' : '保存'}
                    </button>
                    <button className="ghost" onClick={() => setEditingSent(false)} disabled={savingSent}>
                      キャンセル
                    </button>
                  </div>
                ) : (
                  <button className="ghost" onClick={startEditSent}>
                    {campaign.total_sent > 0 ? '配信数を編集' : '配信数を入力'}
                  </button>
                )}
              </div>
            </section>
          </>
        )}
      </div>
      {error && <div className="alert">{error}</div>}
      {campaign && (
        <>
          {editingInfo && (
            <section className="panel">
              <div className="panel-heading"><h2>メール内容の編集</h2></div>
              <form className="form email-form" onSubmit={saveInfo}>
                <label>
                  <span>キャンペーン名</span>
                  <input value={infoDraft.name} onChange={updateInfo('name')} required />
                </label>
                <label>
                  <span>件名（管理用）</span>
                  <input value={infoDraft.subject} onChange={updateInfo('subject')} placeholder="jcityのメール件名" />
                </label>
                <label>
                  <span>配信日</span>
                  <input value={infoDraft.jcity_id} onChange={updateInfo('jcity_id')} type="date" />
                </label>
                <label>
                  <span>配信時間</span>
                  <input value={infoDraft.send_time} onChange={updateInfo('send_time')} type="time" />
                </label>
                <div className="full field">
                  <span className="field-label">メール本文</span>
                  <HtmlEditor
                    value={infoDraft.html_content}
                    onChange={(html) => setInfoDraft((current) => ({ ...current, html_content: html }))}
                    placeholder="文字を入力して書式設定、または「HTML編集」で既存のHTMLを貼り付け"
                  />
                  <button
                    type="button"
                    className="ghost link-convert-trigger"
                    onClick={() => setShowLinkModal(true)}
                  >
                    <LinkIcon size={16} /> 本文内のリンクを計測リンクに一括変換
                  </button>
                </div>
                <div className="form-actions">
                  <button className="primary" disabled={savingInfo}>
                    {savingInfo ? '保存中...' : '変更を保存'}
                  </button>
                  <button type="button" className="ghost" onClick={() => setEditingInfo(false)} disabled={savingInfo}>
                    キャンセル
                  </button>
                </div>
              </form>
            </section>
          )}
          {editingInfo && <ConvertedLinks links={convertedLinks} />}
          <div className="metrics-grid">
            <section className="metric"><span>ユニーク開封率</span><strong>{campaign.open_rate}%</strong><small>{campaign.unique_opens} / {campaign.total_sent}</small></section>
            <section className="metric"><span>ユニーククリック率</span><strong>{campaign.click_rate}%</strong><small>{campaign.unique_clicks} 件</small></section>
            <section className="metric"><span>コンバージョン率</span><strong>{campaign.conversion_rate}%</strong><small>{campaign.unique_conversions} 件</small></section>
            <section className="metric"><span>ユニークメール数</span><strong>{campaign.unique_recipients}</strong><small>イベント発生メールID</small></section>
          </div>

          {activeTab === 'stats' && (
            <>
              <section className="panel guide">
                <button
                  type="button"
                  className="guide-toggle"
                  onClick={() => setShowGuide((current) => !current)}
                  aria-expanded={showGuide}
                >
                  <h2>📋 メールへの埋め込み手順</h2>
                  <ChevronDown size={20} className={`chev${showGuide ? ' open' : ''}`} />
                </button>
                {showGuide && (
                <div className="guide-body">
                <p className="guide-intro">
                  下のスニペットを jcity のHTMLメールに貼るだけで、開封・クリック・コンバージョンを自動計測します。
                  <code>{'{{EMAIL_ID}}'}</code> は jcity が配信時に各受信者ごとのIDへ自動で置き換えます（そのまま貼ってください）。
                </p>
                <ol className="guide-steps">
                  <li>
                    <strong>① トラッキングドメインを設定</strong>
                    <span>下の「トラッキングドメイン」を、このアプリを公開したURL（例: <code>https://your-app.fly.dev</code>）に変更します。ローカルのままだと配信先で計測できません。</span>
                  </li>
                  <li>
                    <strong>② 開封ピクセルを貼る</strong>
                    <span>「開封トラッキングPixel」をコピーし、メールHTMLの <code>&lt;/body&gt;</code> 直前に貼り付けます。透明な1pxの画像なので見た目には影響しません。</span>
                  </li>
                  <li>
                    <strong>③ リンクを差し替える</strong>
                    <span>計測したいリンクを「クリックトラッキングリンク」の形に置き換えます。「リンクID」と「遷移先URL」を変えれば複数のリンクを個別に計測できます。</span>
                  </li>
                  <li>
                    <strong>④ コンバージョンを計測（任意）</strong>
                    <span>申込・購入完了などのLP（遷移先ページ）に「CVスクリプト」を貼ると、成果(CV)まで計測できます。</span>
                  </li>
                  <li>
                    <strong>⑤ 配信後に配信数を入力</strong>
                    <span>配信が完了して実数が確定したら、この画面上部の「配信数を入力」から実際の配信数を入れると開封率・クリック率が正しく計算されます。</span>
                  </li>
                </ol>
                </div>
                )}
              </section>

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
                          <td>{formatJst(event.created_at)}</td>
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
                        <td>{formatJst(row.last_event_at)}</td>
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

          {activeTab === 'heatmap' && <EmailHeatmap campaignId={campaignId} />}

          {activeTab === 'funnel' && <FunnelManager scope="campaign" ownerId={campaignId} />}
        </>
      )}

      {showLinkModal && (
        <LinkTrackModal
          html={infoDraft.html_content}
          baseUrl={baseUrl}
          campaignId={campaignId}
          onClose={() => setShowLinkModal(false)}
          onApply={(html, links) => {
            setInfoDraft((current) => ({ ...current, html_content: html }));
            setConvertedLinks(links || []);
            setShowLinkModal(false);
          }}
        />
      )}
    </div>
  );
}
