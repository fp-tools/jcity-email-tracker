import { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, FolderKanban, RefreshCcw, Settings as SettingsIcon } from 'lucide-react';
import Dashboard from './pages/Dashboard.jsx';
import Projects from './pages/Projects.jsx';
import ProjectDetail from './pages/ProjectDetail.jsx';
import CampaignDetail from './pages/CampaignDetail.jsx';
import Settings from './pages/Settings.jsx';
import { api } from './api.js';

const tabs = [
  { id: 'dashboard', label: 'ダッシュボード', icon: BarChart3 },
  { id: 'projects', label: 'プロジェクト', icon: FolderKanban },
  { id: 'settings', label: 'GA4設定', icon: SettingsIcon }
];

export default function App() {
  const [view, setView] = useState('dashboard');
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadAll() {
    setError('');
    setLoading(true);
    try {
      const [campaignData, projectData] = await Promise.all([
        api.listCampaigns(),
        api.projects.list()
      ]);
      setCampaigns(campaignData.campaigns || []);
      setProjects(projectData.projects || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    const interval = window.setInterval(loadAll, 15000);
    return () => window.clearInterval(interval);
  }, []);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId),
    [campaigns, selectedCampaignId]
  );

  const currentProject = useMemo(
    () => projects.find((project) => project.id === currentProjectId),
    [projects, currentProjectId]
  );

  function openProject(projectId) {
    setCurrentProjectId(projectId);
    setSelectedCampaignId(null);
    setView('project');
  }

  function openEmail(campaignId) {
    setSelectedCampaignId(campaignId);
    setView('email');
  }

  function openTab(tabId) {
    setView(tabId);
    if (tabId !== 'project') setCurrentProjectId(null);
    if (tabId !== 'email') setSelectedCampaignId(null);
  }

  const title = view === 'project'
    ? currentProject?.name || 'プロジェクト詳細'
    : view === 'email'
      ? selectedCampaign?.name || 'メール詳細'
      : tabs.find((tab) => tab.id === view)?.label;

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
              <button
                key={tab.id}
                className={view === tab.id ? 'active' : ''}
                onClick={() => openTab(tab.id)}
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
            <p className="eyebrow">メールトラッキング管理</p>
            <h1>{title}</h1>
          </div>
          <button className="icon-button" onClick={loadAll} disabled={loading} title="統計を更新">
            <RefreshCcw size={18} />
          </button>
        </header>

        {error && <div className="alert">{error}</div>}

        {view === 'dashboard' && (
          <Dashboard campaigns={campaigns} loading={loading} onOpenCampaign={openEmail} />
        )}
        {view === 'projects' && (
          <Projects projects={projects} onCreated={loadAll} onOpenProject={openProject} />
        )}
        {view === 'project' && (
          <ProjectDetail
            projectId={currentProjectId}
            fallback={currentProject}
            onBack={() => setView('projects')}
            onOpenEmail={openEmail}
            onChanged={loadAll}
          />
        )}
        {view === 'email' && (
          <CampaignDetail
            campaignId={selectedCampaignId}
            fallback={selectedCampaign}
            onBack={() => setView(currentProjectId ? 'project' : 'projects')}
          />
        )}
        {view === 'settings' && <Settings />}
      </main>
    </div>
  );
}
