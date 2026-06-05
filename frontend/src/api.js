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

export const api = {
  listCampaigns: () => request('/api/campaigns'),
  createCampaign: (payload) => request('/api/campaigns', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  campaignStats: (id) => request(`/api/campaigns/${encodeURIComponent(id)}/stats`),
  emailBreakdown: (id) => request(`/api/campaigns/${encodeURIComponent(id)}/email-breakdown`),
  getGa4: () => request('/api/config/ga4'),
  saveGa4: (payload) => request('/api/config/ga4', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
};
