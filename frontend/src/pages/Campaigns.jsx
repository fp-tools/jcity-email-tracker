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
          <h2>Create campaign</h2>
        </div>
        {error && <div className="alert">{error}</div>}
        <form className="form" onSubmit={submit}>
          <label>
            <span>Name</span>
            <input value={form.name} onChange={update('name')} placeholder="June newsletter" required />
          </label>
          <label>
            <span>Subject</span>
            <input value={form.subject} onChange={update('subject')} placeholder="Subject line in jcity" />
          </label>
          <label>
            <span>jcity campaign ID</span>
            <input value={form.jcity_id} onChange={update('jcity_id')} placeholder="JCT-2026-06" />
          </label>
          <label>
            <span>Total sent</span>
            <input value={form.total_sent} onChange={update('total_sent')} type="number" min="0" placeholder="12000" />
          </label>
          <button className="primary" disabled={saving}>
            <Plus size={18} />
            <span>{saving ? 'Creating...' : 'Create campaign'}</span>
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Campaigns</h2>
          <span>{campaigns.length} total</span>
        </div>
        <div className="campaign-list">
          {campaigns.map((campaign) => (
            <button key={campaign.id} onClick={() => onOpenCampaign(campaign.id)}>
              <strong>{campaign.name}</strong>
              <span>{campaign.total_sent.toLocaleString()} sent · {campaign.open_rate}% open · {campaign.click_rate}% click</span>
            </button>
          ))}
          {!campaigns.length && <p className="empty">Create a campaign to generate jcity snippets.</p>}
        </div>
      </section>
    </div>
  );
}
