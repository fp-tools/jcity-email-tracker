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
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

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

function addColumnIfNotExists(table, column, definition) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch {
    // SQLite throws when the column already exists. Startup migrations are idempotent.
  }
}

addColumnIfNotExists('campaigns', 'project_id', 'TEXT REFERENCES projects(id) ON DELETE SET NULL');
addColumnIfNotExists('campaigns', 'html_content', "TEXT DEFAULT ''");
addColumnIfNotExists('email_events', 'device_type', 'TEXT');
addColumnIfNotExists('email_events', 'os', 'TEXT');

const insertProject = db.prepare(`
  INSERT INTO projects (id, name, description)
  VALUES (@id, @name, @description)
`);

const listProjectsStmt = db.prepare(`
  SELECT p.*,
    (
      SELECT COUNT(*)
      FROM campaigns c
      WHERE c.project_id = p.id
    ) AS email_count,
    (
      SELECT COALESCE(SUM(c.total_sent), 0)
      FROM campaigns c
      WHERE c.project_id = p.id
    ) AS total_sent,
    (
      SELECT COUNT(DISTINCT e.email_id)
      FROM email_events e
      JOIN campaigns c ON c.id = e.campaign_id
      WHERE c.project_id = p.id AND e.event_type = 'open'
    ) AS unique_opens,
    (
      SELECT COUNT(DISTINCT e.email_id)
      FROM email_events e
      JOIN campaigns c ON c.id = e.campaign_id
      WHERE c.project_id = p.id AND e.event_type = 'click'
    ) AS unique_clicks,
    (
      SELECT COUNT(DISTINCT e.email_id)
      FROM email_events e
      JOIN campaigns c ON c.id = e.campaign_id
      WHERE c.project_id = p.id AND e.event_type = 'conversion'
    ) AS unique_conversions
  FROM projects p
  ORDER BY p.created_at DESC
`);

const getProjectStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
const deleteProjectStmt = db.prepare('DELETE FROM projects WHERE id = ?');
const clearProjectCampaignsStmt = db.prepare('UPDATE campaigns SET project_id = NULL WHERE project_id = ?');

const insertCampaign = db.prepare(`
  INSERT INTO campaigns (id, name, subject, jcity_id, total_sent, project_id, html_content)
  VALUES (@id, @name, @subject, @jcity_id, @total_sent, @project_id, @html_content)
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

const listEmailsByProjectStmt = db.prepare(`
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
  WHERE c.project_id = ?
  GROUP BY c.id
  ORDER BY c.created_at DESC
`);

const getCampaignStmt = db.prepare('SELECT * FROM campaigns WHERE id = ?');

const updateCampaignStmt = db.prepare(`
  UPDATE campaigns
  SET name = @name, subject = @subject, jcity_id = @jcity_id, total_sent = @total_sent
  WHERE id = @id
`);

const insertEventStmt = db.prepare(`
  INSERT INTO email_events (campaign_id, email_id, event_type, link_id, ip_address, user_agent, device_type, os)
  VALUES (@campaign_id, @email_id, @event_type, @link_id, @ip_address, @user_agent, @device_type, @os)
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
  SELECT id, campaign_id, email_id, event_type, link_id, ip_address, user_agent, device_type, os, created_at
  FROM email_events
  WHERE campaign_id = ?
  ORDER BY created_at DESC, id DESC
  LIMIT ?
`);

const timeOfDayStmt = db.prepare(`
  SELECT
    CAST(strftime('%H', created_at) AS INTEGER) AS hour,
    COUNT(CASE WHEN event_type = 'open' THEN 1 END) AS opens,
    COUNT(CASE WHEN event_type = 'click' THEN 1 END) AS clicks,
    COUNT(CASE WHEN event_type = 'conversion' THEN 1 END) AS conversions
  FROM email_events
  WHERE campaign_id = ?
  GROUP BY hour
  ORDER BY hour
`);

const devicesStmt = db.prepare(`
  SELECT COALESCE(device_type, 'unknown') AS device_type, COUNT(*) AS count
  FROM email_events
  WHERE campaign_id = ? AND event_type = 'open'
  GROUP BY COALESCE(device_type, 'unknown')
`);

const osBreakdownStmt = db.prepare(`
  SELECT COALESCE(os, 'unknown') AS os, COUNT(*) AS count
  FROM email_events
  WHERE campaign_id = ? AND event_type = 'open'
  GROUP BY COALESCE(os, 'unknown')
`);

const clicksByLinkStmt = db.prepare(`
  SELECT
    link_id,
    COUNT(*) AS clicks,
    COUNT(DISTINCT email_id) AS unique_clicks
  FROM email_events
  WHERE campaign_id = ? AND event_type = 'click' AND link_id IS NOT NULL AND link_id <> ''
  GROUP BY link_id
  ORDER BY clicks DESC
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

function withProjectRates(row) {
  const sent = Number(row.total_sent || 0);
  const rate = (count) => (sent > 0 ? Number(((Number(count || 0) / sent) * 100).toFixed(2)) : 0);
  return {
    ...row,
    email_count: Number(row.email_count || 0),
    total_sent: sent,
    unique_opens: Number(row.unique_opens || 0),
    unique_clicks: Number(row.unique_clicks || 0),
    unique_conversions: Number(row.unique_conversions || 0),
    open_rate: rate(row.unique_opens),
    click_rate: rate(row.unique_clicks),
    conversion_rate: rate(row.unique_conversions)
  };
}

export function parseUserAgent(ua = '') {
  const s = ua.toLowerCase();
  let device = 'desktop';
  if (/ipad|tablet|playbook|silk/.test(s)) device = 'tablet';
  else if (/mobile|iphone|ipod|android.*mobile|blackberry|iemobile|opera mini/.test(s)) device = 'mobile';

  let os = 'unknown';
  if (/iphone|ipad|ipod/.test(s)) os = 'iOS';
  else if (/android/.test(s)) os = 'Android';
  else if (/windows/.test(s)) os = 'Windows';
  else if (/mac os/.test(s)) os = 'Mac';
  else if (/linux/.test(s)) os = 'Linux';

  return { device_type: device, os };
}

export function createProject(input) {
  const project = {
    id: input.id || nanoid(10),
    name: input.name?.trim(),
    description: input.description?.trim() || ''
  };

  if (!project.name) {
    const error = new Error('Project name is required');
    error.status = 400;
    throw error;
  }

  insertProject.run(project);
  return getProject(project.id);
}

export function listProjects() {
  return listProjectsStmt.all().map(withProjectRates);
}

export function getProject(id) {
  const project = listProjectsStmt.all().find((row) => row.id === id);
  return project ? withProjectRates(project) : null;
}

export function getProjectStats(id) {
  return getProject(id);
}

export function deleteProject(id) {
  const existing = getProjectStmt.get(id);
  if (!existing) return false;
  const transaction = db.transaction(() => {
    clearProjectCampaignsStmt.run(id);
    deleteProjectStmt.run(id);
  });
  transaction();
  return true;
}

export function createCampaign(input) {
  const campaign = {
    id: input.id || nanoid(10),
    name: input.name?.trim(),
    subject: input.subject?.trim() || '',
    jcity_id: input.jcity_id?.trim() || '',
    total_sent: Math.max(0, Number.parseInt(input.total_sent || 0, 10) || 0),
    project_id: input.project_id || null,
    html_content: input.html_content || ''
  };

  if (!campaign.name) {
    const error = new Error('Campaign name is required');
    error.status = 400;
    throw error;
  }

  insertCampaign.run(campaign);
  return getCampaignStmt.get(campaign.id);
}

export function updateCampaign(id, input = {}) {
  const existing = getCampaignStmt.get(id);
  if (!existing) return null;

  const next = {
    id,
    name: input.name !== undefined ? String(input.name).trim() : existing.name,
    subject: input.subject !== undefined ? String(input.subject).trim() : existing.subject,
    jcity_id: input.jcity_id !== undefined ? String(input.jcity_id).trim() : existing.jcity_id,
    total_sent:
      input.total_sent !== undefined
        ? Math.max(0, Number.parseInt(input.total_sent, 10) || 0)
        : existing.total_sent
  };

  if (!next.name) {
    const error = new Error('Campaign name is required');
    error.status = 400;
    throw error;
  }

  updateCampaignStmt.run(next);
  return getCampaignStmt.get(id);
}

export function listCampaigns() {
  return listCampaignsStmt.all().map(withRates);
}

export function getCampaign(id) {
  return getCampaignStmt.get(id);
}

export function recordEvent(event) {
  const parsed = parseUserAgent(event.user_agent || '');
  insertEventStmt.run({
    campaign_id: event.campaign_id,
    email_id: event.email_id,
    event_type: event.event_type,
    link_id: event.link_id || null,
    ip_address: event.ip_address || null,
    user_agent: event.user_agent || null,
    device_type: parsed.device_type,
    os: parsed.os
  });
}

export function getCampaignStats(id, limit = 100) {
  const stats = statsStmt.get(id);
  if (!stats) return null;
  const byHour = new Map(timeOfDayStmt.all(id).map((row) => [row.hour, row]));
  return {
    ...withRates(stats),
    time_of_day: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      opens: Number(byHour.get(hour)?.opens || 0),
      clicks: Number(byHour.get(hour)?.clicks || 0),
      conversions: Number(byHour.get(hour)?.conversions || 0)
    })),
    devices: devicesStmt.all(id).map((row) => ({ ...row, count: Number(row.count || 0) })),
    os_breakdown: osBreakdownStmt.all(id).map((row) => ({ ...row, count: Number(row.count || 0) })),
    recent_events: recentEventsStmt.all(id, Math.min(Math.max(Number(limit) || 100, 1), 500))
  };
}

export function listEmailsByProject(projectId) {
  return listEmailsByProjectStmt.all(projectId).map(withRates);
}

export function getClicksByLink(campaignId) {
  return clicksByLinkStmt.all(campaignId).map((row) => ({
    link_id: row.link_id,
    clicks: Number(row.clicks || 0),
    unique_clicks: Number(row.unique_clicks || 0)
  }));
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
