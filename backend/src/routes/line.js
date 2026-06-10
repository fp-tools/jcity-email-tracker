import express from 'express';
import crypto from 'node:crypto';
import { getLineConfig, saveLineConfig, getLineSecretConfig, getLineStats, recordLineEvent } from '../db.js';

// ---- プロジェクト別 LINE設定 API（JSON） ----
export const lineApiRouter = express.Router();

lineApiRouter.get('/projects/:id/line-config', (req, res) => {
  res.json({ config: getLineConfig(req.params.id), stats: getLineStats(req.params.id) });
});

lineApiRouter.post('/projects/:id/line-config', (req, res, next) => {
  try {
    const config = saveLineConfig(req.params.id, req.body || {});
    res.json({ config, stats: getLineStats(req.params.id) });
  } catch (error) {
    next(error);
  }
});

// ---- LINE Messaging API Webhook（生ボディで署名検証） ----
export const lineWebhookRouter = express.Router();

function verifySignature(channelSecret, rawBody, signature) {
  if (!channelSecret || !signature) return false;
  const expected = crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

lineWebhookRouter.post('/webhook/line/:projectId', express.raw({ type: '*/*' }), (req, res) => {
  const { projectId } = req.params;
  const config = getLineSecretConfig(projectId);
  if (!config || !config.channel_secret) {
    return res.status(404).send('LINE not configured for this project');
  }

  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  const signature = req.get('x-line-signature');
  if (!verifySignature(config.channel_secret, raw, signature)) {
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8') || '{}');
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  for (const event of payload.events || []) {
    try {
      if (event.type === 'follow') {
        recordLineEvent(projectId, { line_user_id: event.source?.userId, event_type: 'follow' });
      } else if (event.type === 'unfollow' && config.count_unfollow) {
        recordLineEvent(projectId, { line_user_id: event.source?.userId, event_type: 'unfollow' });
      }
    } catch (error) {
      console.error('LINE event handling failed:', error.message);
    }
  }

  return res.status(200).send('OK');
});
