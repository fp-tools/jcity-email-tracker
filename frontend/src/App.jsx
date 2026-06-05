import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, MailPlus, RefreshCcw, Settings as SettingsIcon } from 'lucide-react';
import Dashboard from './pages/Dashboard.jsx';
import Campaigns from './pages/Campaigns.jsx';
import CampaignDetail from './pages/CampaignDetail.jsx';
import Settings from './pages/Settings.jsx';
import { api } from './api.js';

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'campaigns', label: 'Campaigns', icon: MailPlus },
  { id: 'settings', label: 'GA4 Settings', icon: SettingsIcon }
];

export default function App() {
  const [view, setView] = useState('dashboard');
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadCampaigns() {
    setError('');
    setLoading(true);
    try {
      const data = await api.listCampaigns();
      setCampaigns(data.campaigns || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCampaigns();
    const interval = window.setInterval(loadCampaigns, 15000);
    return () => window.clearInterval(interval);
  }, []);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId),
    [campaigns, selectedCampaignId]
  );

  function openCampaign(campaignId) {
    setSelectedCampaignId(campaignId);
    setView('detail');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Activity size={22} /></span>
          <div>
            <strong>jcity Tracker</strong>
            <span>GA4 email campaigns</span>
          </div>
        </div>
        <nav className="nav">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={view === tab.id ? 'active' : ''}
                onClick={() => setView(tab.id)}
                title={tab.label}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Email tracking management</p>
            <h1>{view === 'detail' ? selectedCampaign?.name || 'Campaign detail' : tabs.find((tab) => tab.id === view)?.label}</h1>
          </div>
          <button className="icon-button" onClick={loadCampaigns} disabled={loading} title="Refresh stats">
            <RefreshCcw size={18} />
          </button>
        </header>

        {error && <div className="alert">{error}</div>}

        {view === 'dashboard' && (
          <Dashboard campaigns={campaigns} loading={loading} onOpenCampaign={openCampaign} />
        )}
        {view === 'campaigns' && (
          <Campaigns onCreated={loadCampaigns} campaigns={campaigns} onOpenCampaign={openCampaign} />
        )}
        {view === 'detail' && (
          <CampaignDetail campaignId={selectedCampaignId} fallback={selectedCampaign} onBack={() => setView('campaigns')} />
        )}
        {view === 'settings' && <Settings />}
      </main>
    </div>
  );
}
