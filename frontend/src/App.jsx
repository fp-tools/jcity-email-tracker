import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { Activity, BarChart3, FolderKanban, RefreshCcw, Settings as SettingsIcon } from 'lucide-react';
import { api } from './api.js';

const tabs = [
  { to: '/', label: 'ダッシュボード', icon: BarChart3, end: true },
  { to: '/projects', label: 'プロジェクト', icon: FolderKanban, end: false },
  { to: '/settings', label: 'GA4設定', icon: SettingsIcon, end: false }
];

export default function App() {
  const [campaigns, setCampaigns] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const location = useLocation();
  const params = useParams();

  const loadAll = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [campaignData, projectData] = await Promise.all([
        api.listCampaigns(),
        api.projects.list()
      ]);
      setCampaigns(campaignData.campaigns || []);
      setProjects(projectData.projects || []);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    const interval = window.setInterval(loadAll, 15000);
    return () => window.clearInterval(interval);
  }, [loadAll]);

  const title = useMemo(() => {
    const path = location.pathname;
    if (path === '/') return 'ダッシュボード';
    if (path.startsWith('/projects/')) {
      const project = projects.find((item) => item.id === params.projectId);
      return project?.name || 'プロジェクト詳細';
    }
    if (path.startsWith('/projects')) return 'プロジェクト';
    if (path.startsWith('/campaigns/')) {
      const campaign = campaigns.find((item) => item.id === params.campaignId);
      return campaign?.name || 'メール詳細';
    }
    if (path.startsWith('/settings')) return 'GA4設定';
    return 'メールトラッキング管理';
  }, [location.pathname, params, projects, campaigns]);

  const context = useMemo(
    () => ({ campaigns, projects, loading, loadAll }),
    [campaigns, projects, loading, loadAll]
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Activity size={22} /></span>
          <div>
            <strong>jcity Tracker</strong>
            <span>メール配信分析</span>
          </div>
        </div>
        <nav className="nav">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) => (isActive ? 'active' : '')}
                title={tab.label}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">メールトラッキング管理</p>
            <h1>{title}</h1>
          </div>
          <div className="topbar-right">
            <span className="last-updated" title="15秒ごとに自動更新されます">
              {loading
                ? '更新中...'
                : lastUpdated
                  ? `最終更新 ${lastUpdated.toLocaleTimeString('ja-JP')}（自動更新中）`
                  : ''}
            </span>
            <button className="icon-button" onClick={loadAll} disabled={loading} title="統計を更新">
              <RefreshCcw size={18} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </header>

        {error && <div className="alert">{error}</div>}

        <Outlet context={context} />
      </main>
    </div>
  );
}
