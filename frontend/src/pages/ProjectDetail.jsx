import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, MailPlus, RefreshCcw, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import HtmlEditor from '../components/HtmlEditor.jsx';

const emptyForm = {
  name: '',
  subject: '',
  jcity_id: '',
  send_time: '',
  total_sent: '',
  html_content: ''
};

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
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    loadProject();
  }, [projectId]);

  const comparisonEmails = useMemo(() => emails.slice(0, 3), [emails]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createCampaign({ ...form, project_id: projectId });
      setForm(emptyForm);
      setShowForm(false);
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
      </div>

      {activeTab === 'list' && (
        <section className="panel">
          <div className="panel-heading">
            <h2>メール一覧</h2>
            <button className="primary" onClick={() => setShowForm((value) => !value)}>
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
              </div>
              <button className="primary" disabled={saving}>
                <MailPlus size={18} />
                <span>{saving ? '保存中...' : 'メールを保存'}</span>
              </button>
            </form>
          )}

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
    </div>
  );
}
