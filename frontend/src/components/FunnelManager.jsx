import { useEffect, useState } from 'react';
import { Check, Copy, GitBranch, Plus, Trash2 } from 'lucide-react';
import { api } from '../api.js';

const STEP_TYPES = [
  { value: 'line', label: 'LINE登録（自動）' },
  { value: 'tag', label: '計測タグCV（KPI/最終ページに設置）' },
  { value: 'click', label: 'クリック（linkId・タグ不要の代用）' }
];

const emptyStep = () => ({ label: '', type: 'tag', key: '' });

function snippetFor(baseUrl, cvPoint) {
  const base = (baseUrl || '').replace(/\/$/, '');
  return `<script>
(function () {
  var p = new URLSearchParams(window.location.search);
  fetch("${base}/api/conversions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      campaign_id: p.get("jcity_campaign_id"),
      email_id: p.get("jcity_email_id"),
      link_id: p.get("jcity_link_id"),
      cv_point: ${JSON.stringify(cvPoint || 'cv_point_key')}
    })
  });
})();
</script>`;
}

export default function FunnelManager({ scope, ownerId }) {
  const baseUrl = window.location.origin;
  const [funnels, setFunnels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null); // 'new' | funnelId | null
  const [draft, setDraft] = useState({ name: '', steps: [] });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState('');
  const [lineInfo, setLineInfo] = useState(null); // { addFriendUrl, campaignId, configured }

  async function loadLineInfo() {
    try {
      let projectId = scope === 'project' ? ownerId : null;
      const campaignId = scope === 'campaign' ? ownerId : null;
      if (scope === 'campaign') {
        const cs = await api.campaignStats(ownerId);
        projectId = cs.campaign?.project_id || null;
      }
      if (!projectId) {
        setLineInfo({ addFriendUrl: '', campaignId, configured: false });
        return;
      }
      const lc = await api.projects.lineConfig(projectId);
      setLineInfo({
        addFriendUrl: lc.config?.add_friend_url || '',
        campaignId,
        configured: Boolean(lc.config?.add_friend_url)
      });
    } catch {
      setLineInfo({ addFriendUrl: '', campaignId: scope === 'campaign' ? ownerId : null, configured: false });
    }
  }

  // メール単位（campaignId あり）のときに、任意URLを計測リンク化する
  function buildTrackingUrl(linkId, destUrl) {
    if (!lineInfo?.campaignId || !destUrl) return null;
    const base = baseUrl.replace(/\/$/, '');
    return `${base}/click/${lineInfo.campaignId}/{{EMAIL_ID}}/${encodeURIComponent(linkId || 'link')}?url=${encodeURIComponent(destUrl)}`;
  }

  // LINE登録ステップ用の計測リンク（クリック→友だち追加URL）
  function lineTrackingUrl(linkId) {
    if (!lineInfo?.addFriendUrl) return null;
    return buildTrackingUrl(linkId || 'line', lineInfo.addFriendUrl);
  }

  async function load() {
    if (!ownerId) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.funnels.list(scope, ownerId);
      setFunnels(data.funnels || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadLineInfo();
    setEditingId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, ownerId]);

  function startNew() {
    setDraft({
      name: '',
      steps: [
        { label: 'LINE登録', type: 'line', key: '' },
        { label: '最終CV', type: 'tag', key: 'final' }
      ]
    });
    setEditingId('new');
  }

  function startEdit(funnel) {
    setDraft({ name: funnel.name, steps: funnel.steps.map((s) => ({ ...s })) });
    setEditingId(funnel.id);
  }

  function patchStep(index, patch) {
    setDraft((d) => ({ ...d, steps: d.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  }

  function addStep() {
    setDraft((d) => ({ ...d, steps: [...d.steps, emptyStep()] }));
  }

  function removeStep(index) {
    setDraft((d) => ({ ...d, steps: d.steps.filter((_, i) => i !== index) }));
  }

  function moveStep(index, dir) {
    setDraft((d) => {
      const steps = [...d.steps];
      const target = index + dir;
      if (target < 0 || target >= steps.length) return d;
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return { ...d, steps };
    });
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const payload = { scope, owner_id: ownerId, name: draft.name, steps: draft.steps };
      if (editingId === 'new') await api.funnels.create(payload);
      else await api.funnels.update(editingId, { name: draft.name, steps: draft.steps });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(funnel) {
    if (!window.confirm(`ファネル「${funnel.name}」を削除しますか？`)) return;
    setError('');
    try {
      await api.funnels.delete(funnel.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function copy(text, key) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(''), 1400);
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2><GitBranch size={18} /> ファネル（経路）分析</h2>
          <p className="panel-note">
            複数のCV/到達ポイントを順番に並べ、各ステップの到達数と離脱を集計します。
            判定キーは <code>email_id</code> で、URLに引き継がれている間だけ経路が繋がります。
          </p>
        </div>
        {editingId === null && (
          <button className="primary" onClick={startNew}><Plus size={16} /> ファネルを追加</button>
        )}
      </div>

      {error && <div className="alert">{error}</div>}

      {editingId !== null && (
        <div className="funnel-editor">
          <label className="lc-name">
            <span>ファネル名</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="例: LINE登録→KPI→最終CV"
            />
          </label>

          <div className="funnel-steps-edit">
            {draft.steps.map((step, index) => (
              <div className="funnel-step-edit" key={index}>
                <div className="fse-row">
                  <span className="fse-no">{index + 1}</span>
                  <input
                    className="fse-label"
                    value={step.label}
                    onChange={(e) => patchStep(index, { label: e.target.value })}
                    placeholder="ステップ名（例: KPIサイトA）"
                  />
                  <select value={step.type} onChange={(e) => patchStep(index, { type: e.target.value })}>
                    {STEP_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <div className="fse-actions">
                    <button className="icon-button" onClick={() => moveStep(index, -1)} title="上へ" disabled={index === 0}>↑</button>
                    <button className="icon-button" onClick={() => moveStep(index, 1)} title="下へ" disabled={index === draft.steps.length - 1}>↓</button>
                    <button className="icon-button" onClick={() => removeStep(index)} title="削除"><Trash2 size={15} /></button>
                  </div>
                </div>

                {step.type === 'tag' && (
                  <div className="fse-detail">
                    <label className="lc-name">
                      <span>計測ポイントのキー（半角英数）</span>
                      <input
                        value={step.key}
                        onChange={(e) => patchStep(index, { key: e.target.value })}
                        placeholder="例: kpi1 / final"
                      />
                    </label>
                    {step.key && (
                      <div className="snippet">
                        <div>
                          <strong>このページに貼る計測タグ</strong>
                          <button className="icon-button" onClick={() => copy(snippetFor(baseUrl, step.key), `snip-${index}`)} title="コピー">
                            {copied === `snip-${index}` ? <Check size={16} /> : <Copy size={16} />}
                          </button>
                        </div>
                        <pre>{snippetFor(baseUrl, step.key)}</pre>
                      </div>
                    )}
                  </div>
                )}

                {step.type === 'click' && (
                  <div className="fse-detail">
                    <label className="lc-name">
                      <span>遷移先URL（KPIサイト等。タグを置けないページ向け）</span>
                      <input
                        value={step.dest || ''}
                        onChange={(e) => patchStep(index, { dest: e.target.value })}
                        placeholder="https://example.com/kpi"
                      />
                    </label>
                    <div className="fse-row">
                      <button
                        type="button"
                        className="ghost"
                        disabled={!step.dest}
                        onClick={() =>
                          patchStep(index, { key: step.key || `kpi-${Math.random().toString(36).slice(2, 6)}` })
                        }
                      >
                        計測リンクを発行
                      </button>
                      <span className="field-hint">linkId: {step.key || '（未発行）'}</span>
                    </div>
                    {step.key && step.dest && buildTrackingUrl(step.key, step.dest) && (
                      <div className="snippet">
                        <div>
                          <strong>メールに貼る計測リンク</strong>
                          <button className="icon-button" onClick={() => copy(buildTrackingUrl(step.key, step.dest), `clk-${index}`)} title="コピー">
                            {copied === `clk-${index}` ? <Check size={16} /> : <Copy size={16} />}
                          </button>
                        </div>
                        <pre>{buildTrackingUrl(step.key, step.dest)}</pre>
                      </div>
                    )}
                    {step.key && step.dest && !lineInfo?.campaignId && (
                      <p className="fse-hint">
                        プロジェクト単位ではメール個別の計測リンクは発行できません。メール単位のファネルで発行するか、
                        各メールで linkId「{step.key}」の計測リンクに変換してください。
                      </p>
                    )}
                  </div>
                )}

                {step.type === 'line' && (
                  <div className="fse-detail">
                    <label className="lc-name">
                      <span>linkId（任意）</span>
                      <input
                        value={step.key}
                        onChange={(e) => patchStep(index, { key: e.target.value })}
                        placeholder="line"
                      />
                    </label>
                    {!lineInfo?.configured && (
                      <p className="fse-hint">
                        LINEの友だち追加URLが未登録です。「LINE連携」タブで登録すると、ここに計測リンクが表示されます。
                      </p>
                    )}
                    {lineTrackingUrl(step.key) && (
                      <div className="snippet">
                        <div>
                          <strong>メールに貼るLINE計測リンク（クリック→友だち追加）</strong>
                          <button className="icon-button" onClick={() => copy(lineTrackingUrl(step.key), `line-${index}`)} title="コピー">
                            {copied === `line-${index}` ? <Check size={16} /> : <Copy size={16} />}
                          </button>
                        </div>
                        <pre>{lineTrackingUrl(step.key)}</pre>
                      </div>
                    )}
                    {lineInfo?.configured && !lineInfo?.campaignId && (
                      <p className="fse-hint">
                        プロジェクト単位ではメール個別の計測リンクは発行できません。メール単位のファネルで発行してください
                        （友だち追加URL: <code>{lineInfo.addFriendUrl}</code> を各メールで計測リンクに変換）。
                      </p>
                    )}
                    <p className="fse-hint">友だち追加(follow)は自動でこのステップに集計されます。</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button className="ghost" onClick={addStep}><Plus size={15} /> ステップを追加</button>

          <div className="form-actions">
            <button className="primary" onClick={save} disabled={saving || !draft.name}>
              {saving ? '保存中...' : 'ファネルを保存'}
            </button>
            <button className="ghost" onClick={() => setEditingId(null)} disabled={saving}>キャンセル</button>
          </div>
        </div>
      )}

      {editingId === null && (
        <div className="funnel-list">
          {loading && <p className="empty">読み込み中...</p>}
          {!loading && funnels.length === 0 && (
            <p className="empty">ファネルがまだありません。「ファネルを追加」で作成してください。</p>
          )}
          {funnels.map((funnel) => {
            const first = funnel.results?.[0];
            return (
              <div className="funnel-card" key={funnel.id}>
                <div className="funnel-card-head">
                  <strong>{funnel.name}</strong>
                  <div className="form-actions">
                    <button className="ghost" onClick={() => startEdit(funnel)}>編集</button>
                    <button className="ghost danger" onClick={() => remove(funnel)}><Trash2 size={15} /> 削除</button>
                  </div>
                </div>
                {funnel.results?.length ? (
                  <div className="funnel-steps">
                    {funnel.results.map((step, i) => {
                      const prev = funnel.results[i - 1];
                      const widthPct = first?.unique ? Math.max((step.unique / first.unique) * 100, 2) : 0;
                      const fromPrev = prev?.unique ? ((step.unique / prev.unique) * 100).toFixed(1) : null;
                      const fromFirst = first?.unique ? ((step.unique / first.unique) * 100).toFixed(1) : null;
                      return (
                        <div className="funnel-step" key={i}>
                          <div className="funnel-step-top">
                            <span className="funnel-step-name">{i + 1}. {step.label}</span>
                            <span className="funnel-step-counts">
                              ユニーク <strong>{step.unique}</strong> / 延べ {step.total}
                            </span>
                          </div>
                          <div className="funnel-bar-wrap">
                            <div className="funnel-bar" style={{ width: `${widthPct}%` }} />
                          </div>
                          <div className="funnel-step-rates">
                            {fromPrev !== null && <span>前ステップから {fromPrev}%</span>}
                            {fromFirst !== null && <span>開始から {fromFirst}%</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="empty">ステップが未設定です。「編集」から追加してください。</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
