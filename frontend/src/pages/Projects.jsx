import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { FolderPlus } from 'lucide-react';
import { api } from '../api.js';

export default function Projects() {
  const { projects, loadAll } = useOutletContext();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.projects.create(form);
      setForm({ name: '', description: '' });
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="split">
      <section className="panel">
        <div className="panel-heading">
          <h2>プロジェクト作成</h2>
        </div>
        {error && <div className="alert">{error}</div>}
        <form className="form" onSubmit={submit}>
          <label>
            <span>プロジェクト名</span>
            <input value={form.name} onChange={update('name')} placeholder="6月ニュースレター" required />
          </label>
          <label>
            <span>説明</span>
            <textarea value={form.description} onChange={update('description')} placeholder="目的や対象リストのメモ" rows="5" />
          </label>
          <button className="primary" disabled={saving}>
            <FolderPlus size={18} />
            <span>{saving ? '作成中...' : 'プロジェクト作成'}</span>
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>プロジェクト</h2>
          <span>{projects.length} 件</span>
        </div>
        <div className="project-list">
          {projects.map((project) => (
            <button key={project.id} onClick={() => navigate(`/projects/${project.id}`)}>
              <strong>{project.name}</strong>
              {project.description && <small>{project.description}</small>}
              <span>
                {project.email_count} メール / {project.total_sent.toLocaleString()} 配信 / 開封率 {project.open_rate}%
              </span>
            </button>
          ))}
          {!projects.length && <p className="empty">プロジェクトを作成してメールを整理してください</p>}
        </div>
      </section>
    </div>
  );
}
