import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';

const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'email-tracker.sqlite');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subject TEXT,
    jcity_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_sent INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS email_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT NOT NULL,
    email_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('open', 'click', 'conversion')),
    link_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ga4_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    measurement_id TEXT,
    api_secret TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_email_events_campaign_type
    ON email_events (campaign_id, event_type, created_at);

  CREATE INDEX IF NOT EXISTS idx_email_events_unique
    ON email_events (campaign_id, email_id, event_type);
`);

const insertCampaign = db.prepare(`
  INSERT INTO campaigns (id, name, subject, jcity_id, total_sent)
  VALUES (@id, @name, @subject, @jcity_id, @total_sent)
`);

const listCampaignsStmt = db.prepare(`
  SELECT
    c.*,
    COUNT(CASE WHEN e.event_type = 'open' THEN 1 END) AS opens,
    COUNT(DISTINCT CASE WHEN e.event_type = 'open' THEN e.email_id END) AS unique_opens,
    COUNT(CASE WHEN e.event_type = 'click' THEN 1 END) AS clicks,
    COUNT(DISTINCT CASE WHEN e.event_type = 'click' THEN e.email_id END) AS unique_clicks,
    COUNT(CASE WHEN e.event_type = 'conversion' THEN 1 END) AS conversions,
    COUNT(DISTINCT CASE WHEN e.event_type = 'conversion' THEN e.email_id END) AS unique_conversions,
    COUNT(DISTINCT e.email_id) AS unique_recipients
  FROM campaigns c
  LEFT JOIN email_events e ON e.campaign_id = c.id
  GROUP BY c.id
  ORDER BY c.created_at DESC
`);

const getCampaignStmt = db.prepare('SELECT * FROM campaigns WHERE id = ?');

const insertEventStmt = db.prepare(`
  INSERT INTO email_events (campaign_id, email_id, event_type, link_id, ip_address, user_agent)
  VALUES (@campaign_id, @email_id, @event_type, @link_id, @ip_address, @user_agent)
`);

const statsStmt = db.prepare(`
  SELECT
    c.*,
    COUNT(CASE WHEN e.event_type = 'open' THEN 1 END) AS opens,
    COUNT(DISTINCT CASE WHEN e.event_type = 'open' THEN e.email_id END) AS unique_opens,
    COUNT(CASE WHEN e.event_type = 'click' THEN 1 END) AS clicks,
    COUNT(DISTINCT CASE WHEN e.event_type = 'click' THEN e.email_id END) AS unique_clicks,
    COUNT(CASE WHEN e.event_type = 'conversion' THEN 1 END) AS conversions,
    COUNT(DISTINCT CASE WHEN e.event_type = 'conversion' THEN e.email_id END) AS unique_conversions,
    COUNT(DISTINCT e.email_id) AS unique_recipients
  FROM campaigns c
  LEFT JOIN email_events e ON e.campaign_id = c.id
  WHERE c.id = ?
  GROUP BY c.id
`);

const recentEventsStmt = db.prepare(`
  SELECT id, campaign_id, email_id, event_type, link_id, ip_address, user_agent, created_at
  FROM email_events
  WHERE campaign_id = ?
  ORDER BY created_at DESC, id DESC
  LIMIT ?
`);

const emailBreakdownStmt = db.prepare(`
  SELECT
    email_id,
    MAX(CASE WHEN event_type = 'open' THEN 1 ELSE 0 END) AS opened,
    MAX(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) AS clicked,
    MAX(CASE WHEN event_type = 'conversion' THEN 1 ELSE 0 END) AS converted,
    MAX(created_at) AS last_event_at
  FROM email_events
  WHERE campaign_id = ?
  GROUP BY email_id
  ORDER BY last_event_at DESC
`);

const saveGa4Stmt = db.prepare(`
  INSERT INTO ga4_config (id, measurement_id, api_secret, updated_at)
  VALUES (1, @measurement_id, @api_secret, CURRENT_TIMESTAMP)
  ON CONFLICT(id) DO UPDATE SET
    measurement_id = excluded.measurement_id,
    api_secret = excluded.api_secret,
    updated_at = CURRENT_TIMESTAMP
`);

const getGa4Stmt = db.prepare('SELECT id, measurement_id, api_secret, updated_at FROM ga4_config WHERE id = 1');

function withRates(row) {
  const sent = Number(row.total_sent || 0);
  const rate = (count) => (sent > 0 ? Number(((Number(count || 0) / sent) * 100).toFixed(2)) : 0);
  return {
    ...row,
    total_sent: sent,
    opens: Number(row.opens || 0),
    unique_opens: Number(row.unique_opens || 0),
    clicks: Number(row.clicks || 0),
    unique_clicks: Number(row.unique_clicks || 0),
    conversions: Number(row.conversions || 0),
    unique_conversions: Number(row.unique_conversions || 0),
    unique_recipients: Number(row.unique_recipients || 0),
    open_rate: rate(row.unique_opens),
    click_rate: rate(row.unique_clicks),
    conversion_rate: rate(row.unique_conversions)
  };
}

export function createCampaign(input) {
  const campaign = {
    id: input.id || nanoid(10),
    name: input.name?.trim(),
    subject: input.subject?.trim() || '',
    jcity_id: input.jcity_id?.trim() || '',
    total_sent: Math.max(0, Number.parseInt(input.total_sent || 0, 10) || 0)
  };

  if (!campaign.name) {
    const error = new Error('Campaign name is required');
    error.status = 400;
    throw error;
  }

  insertCampaign.run(campaign);
  return getCampaignStmt.get(campaign.id);
}

export function listCampaigns() {
  return listCampaignsStmt.all().map(withRates);
}

export function getCampaign(id) {
  return getCampaignStmt.get(id);
}

export function recordEvent(event) {
  insertEventStmt.run({
    campaign_id: event.campaign_id,
    email_id: event.email_id,
    event_type: event.event_type,
    link_id: event.link_id || null,
    ip_address: event.ip_address || null,
    user_agent: event.user_agent || null
  });
}

export function getCampaignStats(id, limit = 100) {
  const stats = statsStmt.get(id);
  if (!stats) return null;
  return {
    ...withRates(stats),
    recent_events: recentEventsStmt.all(id, Math.min(Math.max(Number(limit) || 100, 1), 500))
  };
}

export function getEmailBreakdown(campaignId) {
  return emailBreakdownStmt.all(campaignId).map((row) => ({
    ...row,
    opened: Boolean(row.opened),
    clicked: Boolean(row.clicked),
    converted: Boolean(row.converted)
  }));
}

export function saveGa4Config(config) {
  if (!config.measurement_id || !config.api_secret) {
    const error = new Error('measurement_id and api_secret are required');
    error.status = 400;
    throw error;
  }
  saveGa4Stmt.run({
    measurement_id: config.measurement_id.trim(),
    api_secret: config.api_secret.trim()
  });
  return getGa4Config();
}

export function getGa4Config({ includeSecret = false } = {}) {
  const row = getGa4Stmt.get();
  if (!row) return null;
  return includeSecret ? row : { ...row, api_secret: row.api_secret ? '********' : '' };
}

export function getGa4SecretConfig() {
  const envMeasurementId = process.env.GA4_MEASUREMENT_ID;
  const envApiSecret = process.env.GA4_API_SECRET;
  if (envMeasurementId && envApiSecret) {
    return { measurement_id: envMeasurementId, api_secret: envApiSecret };
  }
  return getGa4Config({ includeSecret: true });
}
