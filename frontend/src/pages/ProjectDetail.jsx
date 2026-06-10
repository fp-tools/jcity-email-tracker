import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Link as LinkIcon, MailPlus, MessageCircle, RefreshCcw, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import HtmlEditor from '../components/HtmlEditor.jsx';
import LinkTrackModal from '../components/LinkTrackModal.jsx';
import ConvertedLinks from '../components/ConvertedLinks.jsx';
import FunnelManager from '../components/FunnelManager.jsx';

const emptyForm = {
  name: '',
  subject: '',
  jcity_id: '',
  send_time: '',
  total_sent: '',
  html_content: ''
};

// クライアント側でキャンペーンIDを採番（新規作成時の計測リンク変換に使用。createCampaignはidを受け付ける）
function generateId(length = 10) {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let id = '';
  for (let i = 0; i < length; i += 1) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
}

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { projects, loadAll } = useOutletContext();
  const fallback = projects.find((item) => item.id === projectId);
  const onBack = () => navigate('/projects');
  const onOpenEmail = (campaignId) => navigate(`/campaigns/${campaignId}`);
  const onChanged = loadAll;
  const [project, setProject] = useState(fallback);
  const [emails, setEmails] = useState([]);
  const [activeTab, setActiveTab] = useState('list');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [draftId, setDraftId] = useState(() => generateId());
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [convertedLinks, setConvertedLinks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lineConfig, setLineConfig] = useState(null);
  const [lineStats, setLineStats] = useState(null);
  const [lineForm, setLineForm] = useState({
    channel_secret: '',
    channel_access_token: '',
    add_friend_url: '',
    attribution_window_min: 60,
    count_unfollow: false
  });
  const [lineLoading, setLineLoading] = useState(false);
  const [lineSaving, setLineSaving] = useState(false);
  const [lineCopied, setLineCopied] = useState('');

  const webhookUrl = `${window.location.origin}/webhook/line/${projectId}`;

  async function loadLineConfig() {
    if (!projectId) return;
    setLineLoading(true);
    setError('');
    try {
      const data = await api.projects.lineConfig(projectId);
      setLineConfig(data.config);
      setLineStats(data.stats);
      setLineForm({
        channel_secret: '',
        channel_access_token: '',
        add_friend_url: data.config.add_friend_url || '',
        attribution_window_min: data.config.attribution_window_min || 60,
        count_unfollow: Boolean(data.config.count_unfollow)
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLineLoading(false);
    }
  }

  async function saveLineConfig(event) {
    event.preventDefault();
    setLineSaving(true);
    setError('');
    try {
      const payload = {
        add_friend_url: lineForm.add_friend_url,
        attribution_window_min: lineForm.attribution_window_min,
        count_unfollow: lineForm.count_unfollow
      };
      // 秘密値は入力された時だけ送る（空欄は既存維持）
      if (lineForm.channel_secret) payload.channel_secret = lineForm.channel_secret;
      if (lineForm.channel_access_token) payload.channel_access_token = lineForm.channel_access_token;
      const data = await api.projects.saveLineConfig(projectId, payload);
      setLineConfig(data.config);
      setLineStats(data.stats);
      setLineForm((current) => ({ ...current, channel_secret: '', channel_access_token: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLineSaving(false);
    }
  }

  async function copyLine(text, key) {
    await navigator.clipboard.writeText(text);
    setLineCopied(key);
    window.setTimeout(() => setLineCopied(''), 1400);
  }

  const updateLine = (key) => (event) =>
    setLineForm((current) => ({ ...current, [key]: event.target.value }));

  async function loadProject() {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.projects.get(projectId);
      setProject(data.project);
      setEmails(data.emails || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setProject(fallback);
    setEmails([]);
    setActiveTab('list');
    setShowForm(false);
    setShowLinkModal(false);
    setConvertedLinks([]);
    loadProject();
  }, [projectId]);

  useEffect(() => {
    if (activeTab === 'line') loadLineConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, projectId]);

  const comparisonEmails = useMemo(() => emails.slice(0, 3), [emails]);

  function toggleForm() {
    setShowForm((value) => {
      const next = !value;
      if (next) {
        setDraftId(generateId());
        setConvertedLinks([]);
      }
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createCampaign({ ...form, id: draftId, project_id: projectId });
      if (convertedLinks.length) {
        try {
          await api.saveLinkLabels(draftId, convertedLinks.map((l) => ({ link_id: l.linkId, label: l.label })));
        } catch {
          /* ラベル保存失敗は致命的でないため無視 */
        }
      }
      setForm(emptyForm);
      setShowForm(false);
      setConvertedLinks([]);
      await loadProject();
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeProject() {
    if (!window.confirm('このプロジェクトを削除しますか？メールは削除されず、プロジェクト未設定になります。')) return;
    setError('');
    try {
      await api.projects.delete(projectId);
      await onChanged();
      onBack();
    } catch (err) {
      setError(err.message);
    }
  }

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  if (!projectId) {
    return <section className="panel"><p className="empty">プロジェクトを選択してください</p></section>;
  }

  return (
    <div className="stack">
      <div className="detail-actions">
        <button className="ghost" onClick={onBack}><ArrowLeft size={18} /> 戻る</button>
        <button className="ghost danger" onClick={removeProject}><Trash2 size={16} /> 削除</button>
      </div>
      {error && <div className="alert">{error}</div>}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{project?.name || 'プロジェクト詳細'}</h2>
            {project?.description && <p className="panel-note">{project.description}</p>}
          </div>
          <button className="ghost" onClick={loadProject} disabled={loading}>
            <RefreshCcw size={16} /> {loading ? '更新中...' : '更新'}
          </button>
        </div>
        <div className="metrics-grid compact">
          <section className="metric"><span>メール数</span><strong>{project?.email_count || emails.length}</strong><small>登録済みメール</small></section>
          <section className="metric"><span>配信数</span><strong>{(project?.total_sent || 0).toLocaleString()}</strong><small>合計</small></section>
          <section className="metric"><span>開封率</span><strong>{project?.open_rate || 0}%</strong><small>{project?.unique_opens || 0} 開封</small></section>
          <section className="metric"><span>クリック率</span><strong>{project?.click_rate || 0}%</strong><small>{project?.unique_clicks || 0} クリック</small></section>
        </div>
      </section>

      <div className="tabs">
        <button className={activeTab === 'list' ? 'active' : ''} onClick={() => setActiveTab('list')}>メール一覧</button>
        <button className={activeTab === 'comparison' ? 'active' : ''} onClick={() => setActiveTab('comparison')}>メール比較</button>
        <button className={activeTab === 'line' ? 'active' : ''} onClick={() => setActiveTab('line')}>
          <MessageCircle size={15} /> LINE連携
        </button>
        <button className={activeTab === 'funnel' ? 'active' : ''} onClick={() => setActiveTab('funnel')}>ファネル</button>
      </div>

      {activeTab === 'funnel' && <FunnelManager scope="project" ownerId={projectId} />}

      {activeTab === 'list' && (
        <section className="panel">
          <div className="panel-heading">
            <h2>メール一覧</h2>
            <button className="primary" onClick={toggleForm}>
              <MailPlus size={18} />
              <span>メール追加</span>
            </button>
          </div>

          {showForm && (
            <form className="form email-form" onSubmit={submit}>
              <label>
                <span>キャンペーン名</span>
                <input value={form.name} onChange={update('name')} placeholder="6月15日 本配信" required />
              </label>
              <label>
                <span>件名（管理用）</span>
                <input value={form.subject} onChange={update('subject')} placeholder="jcityのメール件名" />
              </label>
              <label>
                <span>配信日</span>
                <input value={form.jcity_id} onChange={update('jcity_id')} type="date" />
              </label>
              <label>
                <span>配信時間</span>
                <input value={form.send_time} onChange={update('send_time')} type="time" />
              </label>
              <label>
                <span>配信数</span>
                <input value={form.total_sent} onChange={update('total_sent')} type="number" min="0" placeholder="12000" />
              </label>
              <div className="full field">
                <span className="field-label">メール本文</span>
                <HtmlEditor
                  value={form.html_content}
                  onChange={(html) => setForm((current) => ({ ...current, html_content: html }))}
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
              <button className="primary" disabled={saving}>
                <MailPlus size={18} />
                <span>{saving ? '保存中...' : 'メールを保存'}</span>
              </button>
            </form>
          )}

          {showForm && <ConvertedLinks links={convertedLinks} />}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>メール名</th>
                  <th>配信日</th>
                  <th>配信数</th>
                  <th>開封率</th>
                  <th>クリック率</th>
                  <th>CV率</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((email) => (
                  <tr key={email.id} onClick={() => onOpenEmail(email.id)}>
                    <td><strong>{email.name}</strong><small>{email.subject || email.id}</small></td>
                    <td>{email.jcity_id || '-'}</td>
                    <td>{email.total_sent.toLocaleString()}</td>
                    <td>{email.open_rate}%</td>
                    <td>{email.click_rate}%</td>
                    <td>{email.conversion_rate}%</td>
                  </tr>
                ))}
                {!emails.length && (
                  <tr><td colSpan="6" className="empty">このプロジェクトにはまだメールがありません</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'comparison' && (
        <section className="panel">
          <div className="panel-heading">
            <h2>メール比較</h2>
            <span>最大3件を表示</span>
          </div>
          <div className="comparison-grid">
            {comparisonEmails.map((email) => (
              <article className="comparison-card" key={email.id}>
                <div className="comparison-card-header">
                  <strong>{email.name}</strong>
                  <small>{email.jcity_id || '配信日未設定'}</small>
                </div>
                <div className="comparison-stats">
                  <span>開封率 <strong>{email.open_rate}%</strong></span>
                  <span>クリック率 <strong>{email.click_rate}%</strong></span>
                </div>
                {email.html_content ? (
                  <iframe
                    srcDoc={email.html_content}
                    title={`${email.name} プレビュー`}
                    sandbox="allow-same-origin"
                  />
                ) : (
                  <div className="preview-placeholder">HTMLが未設定です</div>
                )}
              </article>
            ))}
            {!comparisonEmails.length && <p className="empty">比較できるメールがありません</p>}
          </div>
        </section>
      )}

      {activeTab === 'line' && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>LINE連携（友だち追加をCV計測）</h2>
                <p className="panel-note">
                  メールのLINE誘導リンクを計測リンクに変換し、友だち追加（follow）をクリックから推定してCVに計上します。
                </p>
              </div>
              {lineConfig?.configured && <span className="status-pill on">設定済み</span>}
            </div>

            {lineStats && (
              <div className="metrics-grid compact">
                <section className="metric"><span>友だち追加(CV)</span><strong>{lineStats.follows}</strong><small>うち紐付け {lineStats.attributed_follows}</small></section>
                <section className="metric"><span>紐付け済み</span><strong>{lineStats.attributed_follows}</strong><small>メールに割当</small></section>
                <section className="metric"><span>ブロック解除</span><strong>{lineStats.unfollows}</strong><small>記録時のみ</small></section>
              </div>
            )}

            <div className="snippet">
              <div>
                <strong>Webhook URL（LINE Developersに登録）</strong>
                <button className="icon-button" onClick={() => copyLine(webhookUrl, 'webhook')} title="コピー">
                  {lineCopied === 'webhook' ? <Check size={17} /> : <Copy size={17} />}
                </button>
              </div>
              <pre>{webhookUrl}</pre>
              {lineCopied === 'webhook' && <small>コピーしました</small>}
            </div>

            <form className="form email-form" onSubmit={saveLineConfig}>
              <label className="full">
                <span>Channel Secret {lineConfig?.has_channel_secret && <em className="field-hint">（設定済み・変更時のみ入力）</em>}</span>
                <input
                  type="password"
                  value={lineForm.channel_secret}
                  onChange={updateLine('channel_secret')}
                  placeholder={lineConfig?.has_channel_secret ? '********（変更する場合のみ入力）' : 'LINEのChannel Secret'}
                  autoComplete="off"
                />
              </label>
              <label className="full">
                <span>友だち追加URL</span>
                <input
                  value={lineForm.add_friend_url}
                  onChange={updateLine('add_friend_url')}
                  placeholder="https://lin.ee/xxxxxxx"
                />
              </label>
              <label>
                <span>Channel Access Token <em className="field-hint">（任意）</em></span>
                <input
                  type="password"
                  value={lineForm.channel_access_token}
                  onChange={updateLine('channel_access_token')}
                  placeholder={lineConfig?.has_channel_access_token ? '********' : '自動返信を使う場合のみ'}
                  autoComplete="off"
                />
              </label>
              <label>
                <span>紐付け時間窓（分）</span>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={lineForm.attribution_window_min}
                  onChange={updateLine('attribution_window_min')}
                />
              </label>
              <label className="full lc-split">
                <input
                  type="checkbox"
                  checked={lineForm.count_unfollow}
                  onChange={(event) => setLineForm((current) => ({ ...current, count_unfollow: event.target.checked }))}
                />
                ブロック解除(unfollow)も記録する
              </label>
              <button className="primary" disabled={lineSaving || lineLoading}>
                {lineSaving ? '保存中...' : 'LINE設定を保存'}
              </button>
            </form>
          </section>

          <section className="panel guide">
            <div className="panel-heading"><h2>📋 設定手順</h2></div>
            <ol className="guide-steps">
              <li>
                <strong>① LINE Developersでチャネルを用意</strong>
                <span>Messaging APIチャネルを作成（既存の公式アカウントでも可）。</span>
              </li>
              <li>
                <strong>② Channel Secret を上のフォームに登録</strong>
                <span>チャネル基本設定の Channel Secret をコピーして保存します（Webhook署名検証に使用）。</span>
              </li>
              <li>
                <strong>③ Webhook URL を登録</strong>
                <span>上の Webhook URL を LINE の Messaging API設定に貼り、「Webhookの利用」をオン・「検証」で疎通確認します。</span>
              </li>
              <li>
                <strong>④ 友だち追加URLを登録</strong>
                <span>LINEの友だち追加URL（lin.ee等）を上のフォームに登録します。</span>
              </li>
              <li>
                <strong>⑤ メールのLINEリンクを計測リンクに変換</strong>
                <span>各メールで、LINE誘導リンクの遷移先を友だち追加URLにして計測リンクに変換します。クリック後に友だち追加されると、そのメールのCVとして紐付きます。</span>
              </li>
            </ol>
          </section>
        </>
      )}

      {showLinkModal && (
        <LinkTrackModal
          html={form.html_content}
          baseUrl={window.location.origin}
          campaignId={draftId}
          onClose={() => setShowLinkModal(false)}
          onApply={(html, links) => {
            setForm((current) => ({ ...current, html_content: html }));
            setConvertedLinks(links || []);
            setShowLinkModal(false);
          }}
        />
      )}
    </div>
  );
}
