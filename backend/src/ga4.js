import { getGa4SecretConfig } from './db.js';

const GA4_ENDPOINT = 'https://www.google-analytics.com/mp/collect';

function toGa4EventName(type) {
  return {
    open: 'email_open',
    click: 'email_click',
    conversion: 'email_conversion'
  }[type];
}

function clientIdFromEmail(campaignId, emailId) {
  const source = `${campaignId}:${emailId}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${Math.abs(hash >>> 0)}.1`;
}

export function sendGa4Event(event, campaign) {
  const config = getGa4SecretConfig();
  if (!config?.measurement_id || !config?.api_secret) return;

  const clientId = event.client_id || clientIdFromEmail(event.campaign_id, event.email_id);
  const url = `${GA4_ENDPOINT}?measurement_id=${encodeURIComponent(config.measurement_id)}&api_secret=${encodeURIComponent(config.api_secret)}`;
  const body = {
    client_id: clientId,
    events: [
      {
        name: toGa4EventName(event.event_type),
        params: {
          campaign_id: event.campaign_id,
          campaign_name: campaign?.name || '',
          email_id: event.email_id,
          client_id: clientId,
          link_id: event.link_id || undefined,
          engagement_time_msec: 1
        }
      }
    ]
  };

  setImmediate(() => {
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).catch((error) => {
      console.error('GA4 Measurement Protocol request failed:', error.message);
    });
  });
}
