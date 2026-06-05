import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { api } from '../api.js';

export default function Settings() {
  const [form, setForm] = useState({ measurement_id: '', api_secret: '' });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.getGa4().then((data) => {
      if (data.config) setForm((current) => ({ ...current, measurement_id: data.config.measurement_id || '' }));
    }).catch((err) => setError(err.message));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setStatus('');
    setError('');
    try {
      await api.saveGa4(form);
      setStatus('GA4 config saved');
      setForm((current) => ({ ...current, api_secret: '' }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="panel settings-panel">
      <div className="panel-heading">
        <h2>GA4 Measurement Protocol</h2>
      </div>
      {error && <div className="alert">{error}</div>}
      {status && <div className="success">{status}</div>}
      <form className="form" onSubmit={submit}>
        <label>
          <span>Measurement ID</span>
          <input value={form.measurement_id} onChange={(event) => setForm({ ...form, measurement_id: event.target.value })} placeholder="G-XXXXXXXXXX" required />
        </label>
        <label>
          <span>API Secret</span>
          <input value={form.api_secret} onChange={(event) => setForm({ ...form, api_secret: event.target.value })} placeholder="Measurement Protocol API secret" required />
        </label>
        <button className="primary">
          <Save size={18} />
          <span>Save GA4 settings</span>
        </button>
      </form>
    </section>
  );
}
