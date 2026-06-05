import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../api.js';

export default function Campaigns({ campaigns, onCreated, onOpenCampaign }) {
  const [form, setForm] = useState({ name: '', subject: '', jcity_id: '', total_sent: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.createCampaign(form);
      setForm({ name: '', subject: '', jcity_id: '', total_sent: '' });
      await onCreated();
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
          <h2>キャンペーン作成</h2>
        </div>
        {error && <div className="alert">{error}</div>}
        <form className="form" onSubmit={submit}>
          <label>
            <span>キャンペーン名</span>
            <input value={form.name} onChange={update('name')} placeholder="6月ニュースレター" required />
          </label>
          <label>
            <span>件名（管理用メモ）</span>
            <input value={form.subject} onChange={update('subject')} placeholder="jcityのメール件名" />
          </label>
          <label>
            <span>配信日</span>
            <input value={form.jcity_id} onChange={update('jcity_id')} type="date" />
          </label>
          <label>
            <span>配信数</span>
            <input value={form.total_sent} onChange={update('total_sent')} type="number" min="0" placeholder="12000" />
          </label>
          <button className="primary" disabled={saving}>
            <Plus size={18} />
            <span>{saving ? '作成中...' : 'キャンペーン作成'}</span>
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>キャンペーン</h2>
          <span>{campaigns.length} 件</span>
        </div>
        <div className="campaign-list">
          {campaigns.map((campaign) => (
            <button key={campaign.id} onClick={() => onOpenCampaign(campaign.id)}>
              <strong>{campaign.name}</strong>
              <span>{campaign.jcity_id ? `📅 ${campaign.jcity_id} ・` : ''}{campaign.total_sent.toLocaleString()} 配信 / {campaign.open_rate}% 開封 / {campaign.click_rate}% クリック</span>
            </button>
          ))}
          {!campaigns.length && <p className="empty">キャンペーンを作成してスニペットを生成しましょう</p>}
        </div>
      </section>
    </div>
  );
}
