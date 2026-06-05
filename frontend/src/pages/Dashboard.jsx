import { MousePointerClick, Target, UsersRound } from 'lucide-react';

function Metric({ label, value, note, icon: Icon }) {
  return (
    <section className="metric">
      <div className="metric-icon"><Icon size={20} /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </section>
  );
}

export default function Dashboard({ campaigns, loading, onOpenCampaign }) {
  const totals = campaigns.reduce((acc, campaign) => {
    acc.sent += campaign.total_sent;
    acc.uniqueOpens += campaign.unique_opens;
    acc.uniqueClicks += campaign.unique_clicks;
    acc.uniqueConversions += campaign.unique_conversions;
    return acc;
  }, { sent: 0, uniqueOpens: 0, uniqueClicks: 0, uniqueConversions: 0 });

  const pct = (value) => (totals.sent ? `${((value / totals.sent) * 100).toFixed(2)}%` : '0.00%');

  return (
    <div className="stack">
      <div className="metrics-grid">
        <Metric label="ユニーク開封率" value={pct(totals.uniqueOpens)} note={`${totals.uniqueOpens} / ${totals.sent} 配信数`} icon={UsersRound} />
        <Metric label="ユニーククリック率" value={pct(totals.uniqueClicks)} note={`${totals.uniqueClicks} クリック`} icon={MousePointerClick} />
        <Metric label="CV率" value={pct(totals.uniqueConversions)} note={`${totals.uniqueConversions} コンバージョン`} icon={Target} />
      </div>

      <section className="panel">
        <div className="panel-heading">
          <h2>キャンペーン成績</h2>
          <span>{loading ? '更新中...' : `${campaigns.length} キャンペーン`}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>キャンペーン名</th>
                <th>配信数</th>
                <th>開封率</th>
                <th>クリック率</th>
                <th>CV率</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id} onClick={() => onOpenCampaign(campaign.id)}>
                  <td>
                    <strong>{campaign.name}</strong>
                    <small>{campaign.subject || campaign.jcity_id || campaign.id}</small>
                  </td>
                  <td>{campaign.total_sent.toLocaleString()}</td>
                  <td>{campaign.open_rate}%</td>
                  <td>{campaign.click_rate}%</td>
                  <td>{campaign.conversion_rate}%</td>
                </tr>
              ))}
              {!campaigns.length && (
                <tr>
                  <td colSpan="5" className="empty">まだキャンペーンがありません</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
