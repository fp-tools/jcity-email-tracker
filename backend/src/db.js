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
addColumnIfNotExists('campaigns', 'send_time', "TEXT DEFAULT ''");
addColumnIfNotExists('email_events', 'device_type', 'TEXT');
addColumnIfNotExists('email_events', 'os', 'TEXT');
addColumnIfNotExists('email_events', 'cv_point', 'TEXT');

// ファネル（経路）定義
db.exec(`
  CREATE TABLE IF NOT EXISTS funnels (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    steps TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_funnels_owner ON funnels (scope, owner_id);
  CREATE INDEX IF NOT EXISTS idx_email_events_cv_point ON email_events (cv_point);
`);

// LINE Messaging API 連携（プロジェクト単位の設定 + クリック推定紐付け）
db.exec(`
  CREATE TABLE IF NOT EXISTS line_config (
    project_id TEXT PRIMARY KEY,
    channel_secret TEXT DEFAULT '',
    channel_access_token TEXT DEFAULT '',
    add_friend_url TEXT DEFAULT '',
    attribution_window_min INTEGER DEFAULT 60,
    count_unfollow INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS line_clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    email_id TEXT NOT NULL,
    link_id TEXT,
    ip_address TEXT,
    consumed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS line_follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    line_user_id TEXT,
    event_type TEXT,
    attributed_campaign_id TEXT,
    attributed_email_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_line_clicks_pending
    ON line_clicks (project_id, consumed, created_at);
`);

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
  INSERT INTO campaigns (id, name, subject, jcity_id, total_sent, project_id, html_content, send_time)
  VALUES (@id, @name, @subject, @jcity_id, @total_sent, @project_id, @html_content, @send_time)
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
  SET name = @name, subject = @subject, jcity_id = @jcity_id, total_sent = @total_sent, html_content = @html_content, send_time = @send_time
  WHERE id = @id
`);

const deleteCampaignStmt = db.prepare('DELETE FROM campaigns WHERE id = ?');

const insertEventStmt = db.prepare(`
  INSERT INTO email_events (campaign_id, email_id, event_type, link_id, ip_address, user_agent, device_type, os, cv_point)
  VALUES (@campaign_id, @email_id, @event_type, @link_id, @ip_address, @user_agent, @device_type, @os, @cv_point)
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
    CAST(strftime('%H', created_at, '+9 hours') AS INTEGER) AS hour,
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

const conversionsByLinkStmt = db.prepare(`
  SELECT
    link_id,
    COUNT(*) AS conversions,
    COUNT(DISTINCT email_id) AS unique_conversions
  FROM email_events
  WHERE campaign_id = ? AND event_type = 'conversion' AND link_id IS NOT NULL AND link_id <> ''
  GROUP BY link_id
  ORDER BY conversions DESC
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

const getLineConfigStmt = db.prepare('SELECT * FROM line_config WHERE project_id = ?');

const saveLineConfigStmt = db.prepare(`
  INSERT INTO line_config (project_id, channel_secret, channel_access_token, add_friend_url, attribution_window_min, count_unfollow, updated_at)
  VALUES (@project_id, @channel_secret, @channel_access_token, @add_friend_url, @attribution_window_min, @count_unfollow, CURRENT_TIMESTAMP)
  ON CONFLICT(project_id) DO UPDATE SET
    channel_secret = excluded.channel_secret,
    channel_access_token = excluded.channel_access_token,
    add_friend_url = excluded.add_friend_url,
    attribution_window_min = excluded.attribution_window_min,
    count_unfollow = excluded.count_unfollow,
    updated_at = CURRENT_TIMESTAMP
`);

const insertLineClickStmt = db.prepare(`
  INSERT INTO line_clicks (project_id, campaign_id, email_id, link_id, ip_address)
  VALUES (@project_id, @campaign_id, @email_id, @link_id, @ip_address)
`);

// 直近の未消費LINEクリック（時間窓内）を新しい順に取得
const recentLineClickStmt = db.prepare(`
  SELECT * FROM line_clicks
  WHERE project_id = ? AND consumed = 0
    AND created_at >= datetime('now', ?)
  ORDER BY created_at DESC, id DESC
  LIMIT 1
`);

const consumeLineClickStmt = db.prepare('UPDATE line_clicks SET consumed = 1 WHERE id = ?');

const insertLineFollowStmt = db.prepare(`
  INSERT INTO line_follows (project_id, line_user_id, event_type, attributed_campaign_id, attributed_email_id)
  VALUES (@project_id, @line_user_id, @event_type, @attributed_campaign_id, @attributed_email_id)
`);

const lineStatsStmt = db.prepare(`
  SELECT
    COUNT(CASE WHEN event_type = 'follow' THEN 1 END) AS follows,
    COUNT(CASE WHEN event_type = 'follow' AND attributed_email_id IS NOT NULL THEN 1 END) AS attributed_follows,
    COUNT(CASE WHEN event_type = 'unfollow' THEN 1 END) AS unfollows,
    MAX(created_at) AS last_event_at
  FROM line_follows
  WHERE project_id = ?
`);

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
    html_content: input.html_content || '',
    send_time: input.send_time?.trim() || ''
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
        : existing.total_sent,
    html_content:
      input.html_content !== undefined ? String(input.html_content) : existing.html_content,
    send_time:
      input.send_time !== undefined ? String(input.send_time).trim() : existing.send_time
  };

  if (!next.name) {
    const error = new Error('Campaign name is required');
    error.status = 400;
    throw error;
  }

  updateCampaignStmt.run(next);
  return getCampaignStmt.get(id);
}

export function deleteCampaign(id) {
  const existing = getCampaignStmt.get(id);
  if (!existing) return false;
  deleteCampaignStmt.run(id);
  return true;
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
    os: parsed.os,
    cv_point: event.cv_point || null
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

export function getConversionsByLink(campaignId) {
  return conversionsByLinkStmt.all(campaignId).map((row) => ({
    link_id: row.link_id,
    conversions: Number(row.conversions || 0),
    unique_conversions: Number(row.unique_conversions || 0)
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

const mask = (value) => (value ? '********' : '');

export function getLineConfig(projectId, { includeSecret = false } = {}) {
  const row = getLineConfigStmt.get(projectId);
  const base = row || {
    project_id: projectId,
    channel_secret: '',
    channel_access_token: '',
    add_friend_url: '',
    attribution_window_min: 60,
    count_unfollow: 0,
    updated_at: null
  };
  const configured = Boolean(base.channel_secret);
  const result = {
    ...base,
    count_unfollow: Boolean(base.count_unfollow),
    configured
  };
  if (!includeSecret) {
    result.channel_secret = mask(base.channel_secret);
    result.channel_access_token = mask(base.channel_access_token);
    result.has_channel_secret = Boolean(base.channel_secret);
    result.has_channel_access_token = Boolean(base.channel_access_token);
  }
  return result;
}

export function saveLineConfig(projectId, input = {}) {
  if (!getProjectStmt.get(projectId)) {
    const error = new Error('Project not found');
    error.status = 404;
    throw error;
  }
  const existing = getLineConfigStmt.get(projectId);
  // 空欄・マスク値('********')がそのまま送られてきた場合は既存の秘密値を維持する
  const keepIfMasked = (incoming, current) =>
    incoming === undefined || incoming === '' || incoming === '********'
      ? current || ''
      : String(incoming).trim();

  saveLineConfigStmt.run({
    project_id: projectId,
    channel_secret: keepIfMasked(input.channel_secret, existing?.channel_secret),
    channel_access_token: keepIfMasked(input.channel_access_token, existing?.channel_access_token),
    add_friend_url:
      input.add_friend_url !== undefined ? String(input.add_friend_url).trim() : existing?.add_friend_url || '',
    attribution_window_min:
      input.attribution_window_min !== undefined
        ? Math.min(Math.max(Number.parseInt(input.attribution_window_min, 10) || 60, 1), 1440)
        : existing?.attribution_window_min || 60,
    count_unfollow:
      input.count_unfollow !== undefined ? (input.count_unfollow ? 1 : 0) : existing?.count_unfollow || 0
  });
  return getLineConfig(projectId);
}

export function getLineSecretConfig(projectId) {
  return getLineConfigStmt.get(projectId) || null;
}

export function recordLineClick({ project_id, campaign_id, email_id, link_id, ip_address }) {
  if (!project_id || !campaign_id || !email_id) return;
  insertLineClickStmt.run({
    project_id,
    campaign_id,
    email_id,
    link_id: link_id || null,
    ip_address: ip_address || null
  });
}

export function getLineStats(projectId) {
  const row = lineStatsStmt.get(projectId) || {};
  return {
    follows: Number(row.follows || 0),
    attributed_follows: Number(row.attributed_follows || 0),
    unfollows: Number(row.unfollows || 0),
    last_event_at: row.last_event_at || null
  };
}

// LINE follow/unfollow を受けてCVを推定紐付け（方式B）
// follow: 直近の未消費クリックを探し、見つかればそのメールにconversionを記録
export function recordLineEvent(projectId, { line_user_id, event_type }) {
  const config = getLineConfigStmt.get(projectId);
  const windowMin = Math.min(Math.max(Number(config?.attribution_window_min) || 60, 1), 1440);

  let attributed = null;
  if (event_type === 'follow') {
    const candidate = recentLineClickStmt.get(projectId, `-${windowMin} minutes`);
    if (candidate) {
      consumeLineClickStmt.run(candidate.id);
      recordEvent({
        campaign_id: candidate.campaign_id,
        email_id: candidate.email_id,
        event_type: 'conversion',
        link_id: candidate.link_id,
        ip_address: candidate.ip_address,
        user_agent: 'line-webhook',
        cv_point: 'line'
      });
      attributed = { campaign_id: candidate.campaign_id, email_id: candidate.email_id };
    }
  }

  insertLineFollowStmt.run({
    project_id: projectId,
    line_user_id: line_user_id || null,
    event_type: event_type || null,
    attributed_campaign_id: attributed?.campaign_id || null,
    attributed_email_id: attributed?.email_id || null
  });

  return { attributed };
}

// ---- ファネル（経路）----
const listFunnelsStmt = db.prepare('SELECT * FROM funnels WHERE scope = ? AND owner_id = ? ORDER BY created_at');
const getFunnelStmt = db.prepare('SELECT * FROM funnels WHERE id = ?');
const insertFunnelStmt = db.prepare(`
  INSERT INTO funnels (id, scope, owner_id, name, steps)
  VALUES (@id, @scope, @owner_id, @name, @steps)
`);
const updateFunnelStmt = db.prepare(`
  UPDATE funnels SET name = @name, steps = @steps, updated_at = CURRENT_TIMESTAMP WHERE id = @id
`);
const deleteFunnelStmt = db.prepare('DELETE FROM funnels WHERE id = ?');

function parseSteps(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps
    .map((s) => ({
      label: String(s.label || '').trim(),
      type: ['line', 'click', 'tag'].includes(s.type) ? s.type : 'tag',
      key: String(s.key || '').trim()
    }))
    .filter((s) => s.label);
}

function hydrateFunnel(row) {
  return { ...row, steps: parseSteps(row.steps) };
}

export function listFunnels(scope, ownerId) {
  return listFunnelsStmt.all(scope, ownerId).map(hydrateFunnel);
}

export function getFunnel(id) {
  const row = getFunnelStmt.get(id);
  return row ? hydrateFunnel(row) : null;
}

export function createFunnel(input = {}) {
  const scope = input.scope === 'project' ? 'project' : 'campaign';
  const owner_id = String(input.owner_id || '').trim();
  const name = String(input.name || '').trim();
  if (!owner_id || !name) {
    const error = new Error('owner_id and name are required');
    error.status = 400;
    throw error;
  }
  const id = nanoid(10);
  insertFunnelStmt.run({ id, scope, owner_id, name, steps: JSON.stringify(normalizeSteps(input.steps)) });
  return getFunnel(id);
}

export function updateFunnel(id, input = {}) {
  const existing = getFunnelStmt.get(id);
  if (!existing) return null;
  updateFunnelStmt.run({
    id,
    name: input.name !== undefined ? String(input.name).trim() : existing.name,
    steps: input.steps !== undefined ? JSON.stringify(normalizeSteps(input.steps)) : existing.steps
  });
  return getFunnel(id);
}

export function deleteFunnel(id) {
  const existing = getFunnelStmt.get(id);
  if (!existing) return false;
  deleteFunnelStmt.run(id);
  return true;
}

// 各ステップの到達数（ユニーク email_id / 延べ）を集計
export function getFunnelResults(funnel) {
  const scopeCond =
    funnel.scope === 'project'
      ? 'campaign_id IN (SELECT id FROM campaigns WHERE project_id = ?)'
      : 'campaign_id = ?';

  return funnel.steps.map((step) => {
    const params = [funnel.owner_id];
    let cond;
    if (step.type === 'click') {
      cond = "event_type = 'click' AND link_id = ?";
      params.push(step.key);
    } else if (step.type === 'line') {
      cond = "event_type = 'conversion' AND cv_point = 'line'";
    } else {
      cond = "event_type = 'conversion' AND cv_point = ?";
      params.push(step.key);
    }
    const row = db
      .prepare(
        `SELECT COUNT(*) AS total, COUNT(DISTINCT email_id) AS uniq
         FROM email_events WHERE ${scopeCond} AND ${cond}`
      )
      .get(...params);
    return {
      ...step,
      total: Number(row?.total || 0),
      unique: Number(row?.uniq || 0)
    };
  });
}
