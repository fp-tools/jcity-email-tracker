const API_BASE = import.meta.env.VITE_API_BASE || '';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'content-type': 'application/json',
      ...options.headers
    },
    ...options
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : null;
  if (!response.ok) {
    throw new Error(data?.error || `Request failed: ${response.status}`);
  }
  return data;
}

const get = (path) => request(path);
const post = (path, payload) => request(path, {
  method: 'POST',
  body: JSON.stringify(payload)
});
const patch = (path, payload) => request(path, {
  method: 'PATCH',
  body: JSON.stringify(payload)
});
const del = (path) => request(path, { method: 'DELETE' });

export const api = {
  projects: {
    list: () => get('/api/projects'),
    create: (data) => post('/api/projects', data),
    get: (id) => get(`/api/projects/${encodeURIComponent(id)}`),
    stats: (id) => get(`/api/projects/${encodeURIComponent(id)}/stats`),
    delete: (id) => del(`/api/projects/${encodeURIComponent(id)}`),
    lineConfig: (id) => get(`/api/projects/${encodeURIComponent(id)}/line-config`),
    saveLineConfig: (id, payload) => post(`/api/projects/${encodeURIComponent(id)}/line-config`, payload)
  },
  listCampaigns: () => get('/api/campaigns'),
  createCampaign: (payload) => post('/api/campaigns', payload),
  updateCampaign: (id, payload) => patch(`/api/campaigns/${encodeURIComponent(id)}`, payload),
  deleteCampaign: (id) => del(`/api/campaigns/${encodeURIComponent(id)}`),
  campaignStats: (id) => get(`/api/campaigns/${encodeURIComponent(id)}/stats`),
  emailBreakdown: (id) => get(`/api/campaigns/${encodeURIComponent(id)}/email-breakdown`),
  campaignHeatmap: (id) => get(`/api/campaigns/${encodeURIComponent(id)}/heatmap`),
  saveLinkLabels: (id, labels) => post(`/api/campaigns/${encodeURIComponent(id)}/link-labels`, { labels }),
  saveTargetLabels: (id, labels) => post(`/api/campaigns/${encodeURIComponent(id)}/target-labels`, { labels }),
  getGa4: () => get('/api/config/ga4'),
  saveGa4: (payload) => post('/api/config/ga4', payload),
  funnels: {
    list: (scope, ownerId) =>
      get(`/api/funnels?scope=${encodeURIComponent(scope)}&owner_id=${encodeURIComponent(ownerId)}`),
    create: (payload) => post('/api/funnels', payload),
    update: (id, payload) => request(`/api/funnels/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
    delete: (id) => del(`/api/funnels/${encodeURIComponent(id)}`)
  }
};
