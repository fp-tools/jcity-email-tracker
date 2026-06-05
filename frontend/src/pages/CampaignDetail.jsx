import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Copy, ExternalLink } from 'lucide-react';
import { api } from '../api.js';

function currentOrigin() {
  return window.location.origin;
}

export default function CampaignDetail({ campaignId, fallback, onBack }) {
  const [campaign, setCampaign] = useState(fallback);
  const [baseUrl, setBaseUrl] = useState(currentOrigin());
  const [destinationUrl, setDestinationUrl] = useState('https://your-site.com/lp');
  const [linkId, setLinkId] = useState('main-cta');
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');

  async function loadStats() {
    if (!campaignId) return;
    try {
      const data = await api.campaignStats(campaignId);
      setCampaign(data.campaign);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadStats();
    const interval = window.setInterval(loadStats, 10000);
    return () => window.clearInterval(interval);
  }, [campaignId]);

  const snippets = useMemo(() => {
    if (!campaign) return { pixel: '', link: '', conversion: '' };
    const cleanBase = baseUrl.replace(/\/$/, '');
    const pixel = `<img src="${cleanBase}/pixel/${campaign.id}/{{EMAIL_ID}}" width="1" height="1" alt="" style="display:none">`;
    const link = `<a href="${cleanBase}/click/${campaign.id}/{{EMAIL_ID}}/${encodeURIComponent(linkId)}?url=${encodeURIComponent(destinationUrl)}">Click Here</a>`;
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
    return <section className="panel"><p className="empty">Select a campaign.</p></section>;
  }

  return (
    <div className="stack">
      <button className="ghost" onClick={onBack}><ArrowLeft size={18} /> Back</button>
      {error && <div className="alert">{error}</div>}
      {campaign && (
        <>
          <div className="metrics-grid">
            <section className="metric"><span>Unique opens</span><strong>{campaign.open_rate}%</strong><small>{campaign.unique_opens} / {campaign.total_sent}</small></section>
            <section className="metric"><span>Unique clicks</span><strong>{campaign.click_rate}%</strong><small>{campaign.unique_clicks} recipients</small></section>
            <section className="metric"><span>Conversions</span><strong>{campaign.conversion_rate}%</strong><small>{campaign.unique_conversions} recipients</small></section>
          </div>

          <section className="panel">
            <div className="panel-heading">
              <h2>jcity snippets</h2>
              <span>{campaign.id}</span>
            </div>
            <div className="snippet-controls">
              <label>
                <span>Tracking domain</span>
                <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
              </label>
              <label>
                <span>Link ID</span>
                <input value={linkId} onChange={(event) => setLinkId(event.target.value)} />
              </label>
              <label>
                <span>Destination URL</span>
                <input value={destinationUrl} onChange={(event) => setDestinationUrl(event.target.value)} />
              </label>
            </div>
            {[
              ['Open Tracking Pixel', snippets.pixel, 'pixel'],
              ['Tracked Link', snippets.link, 'link'],
              ['Conversion Script', snippets.conversion, 'conversion']
            ].map(([title, value, key]) => (
              <div className="snippet" key={key}>
                <div>
                  <strong>{title}</strong>
                  <button className="icon-button" onClick={() => copy(value, key)} title={`Copy ${title}`}>
                    <Copy size={17} />
                  </button>
                </div>
                <pre>{value}</pre>
                {copied === key && <small>Copied</small>}
              </div>
            ))}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>Real-time events</h2>
              <button className="ghost" onClick={loadStats}><ExternalLink size={16} /> Refresh</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Time</th><th>Type</th><th>Email ID</th><th>Link</th><th>IP</th></tr>
                </thead>
                <tbody>
                  {campaign.recent_events?.map((event) => (
                    <tr key={event.id}>
                      <td>{new Date(event.created_at).toLocaleString()}</td>
                      <td>{event.event_type}</td>
                      <td>{event.email_id}</td>
                      <td>{event.link_id || '-'}</td>
                      <td>{event.ip_address || '-'}</td>
                    </tr>
                  ))}
                  {!campaign.recent_events?.length && <tr><td colSpan="5" className="empty">No events recorded yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
