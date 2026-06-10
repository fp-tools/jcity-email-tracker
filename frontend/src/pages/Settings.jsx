import { useEffect, useState } from 'react';
import { Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../api.js';

export default function Settings() {
  const [form, setForm] = useState({ measurement_id: '', api_secret: '' });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [ga4, setGa4] = useState(null);

  function applyStatus(data) {
    setGa4(data);
    if (data.config) setForm((current) => ({ ...current, measurement_id: data.config.measurement_id || '' }));
  }

  useEffect(() => {
    api.getGa4().then(applyStatus).catch((err) => setError(err.message));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setStatus('');
    setError('');
    try {
      const data = await api.saveGa4(form);
      applyStatus(data);
      setStatus('GA4設定を保存しました');
      setForm((current) => ({ ...current, api_secret: '' }));
    } catch (err) {
      setError(err.message);
    }
  }

  const sourceLabel = ga4?.source === 'env' ? '環境変数' : ga4?.source === 'db' ? 'ダッシュボード' : '';

  return (
    <section className="panel settings-panel">
      <div className="panel-heading">
        <h2>GA4 Measurement Protocol設定</h2>
        {ga4 && (
          ga4.configured ? (
            <span className="status-pill on" title={`設定済み（${sourceLabel}）`}>
              <CheckCircle2 size={16} />
              <span>設定済み{sourceLabel && `（${sourceLabel}）`}</span>
            </span>
          ) : (
            <span className="status-pill off" title="測定IDとAPIシークレットが未設定です">
              <AlertCircle size={16} />
              <span>未設定</span>
            </span>
          )
        )}
      </div>
      {error && <div className="alert">{error}</div>}
      {status && <div className="success">{status}</div>}
      <form className="form" onSubmit={submit}>
        <label>
          <span>測定ID</span>
          <input value={form.measurement_id} onChange={(event) => setForm({ ...form, measurement_id: event.target.value })} placeholder="G-XXXXXXXXXX" required />
        </label>
        <label>
          <span>APIシークレット</span>
          <input value={form.api_secret} onChange={(event) => setForm({ ...form, api_secret: event.target.value })} placeholder="Measurement Protocol APIシークレット" required />
        </label>
        <button className="primary">
          <Save size={18} />
          <span>GA4設定を保存</span>
        </button>
      </form>
    </section>
  );
}
