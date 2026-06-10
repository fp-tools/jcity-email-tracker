import express from 'express';
import { getCampaign, recordEvent, recordLineClick } from '../db.js';
import { sendGa4Event } from '../ga4.js';

const router = express.Router();

// LINE友だち追加URL（lin.ee / line.me 系）の判定
const LINE_HOST_RE = /(^|\.)(line\.me|lin\.ee)$/i;

const transparentGif = Buffer.from(
  'R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64'
);

function requestMeta(req) {
  return {
    ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress,
    user_agent: req.get('user-agent') || ''
  };
}

function recordAndDispatch(req, eventType, extra = {}) {
  const { campaignId, emailId } = req.params;
  const campaign = getCampaign(campaignId);
  if (!campaign) return false;

  const event = {
    campaign_id: campaignId,
    email_id: emailId,
    event_type: eventType,
    link_id: extra.link_id || null,
    client_id: req.query.client_id,
    ...requestMeta(req)
  };

  try {
    recordEvent(event);
    sendGa4Event(event, campaign);
  } catch (error) {
    console.error('Tracking event failed:', error.message);
  }

  return true;
}

router.get('/pixel/:campaignId/:emailId', (req, res) => {
  recordAndDispatch(req, 'open');
  res
    .status(200)
    .set({
      'Content-Type': 'image/gif',
      'Content-Length': transparentGif.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0'
    })
    .send(transparentGif);
});

router.get('/click/:campaignId/:emailId/:linkId', (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('Missing url parameter');

  let redirectUrl;
  try {
    redirectUrl = new URL(target);
  } catch {
    return res.status(400).send('Invalid url parameter');
  }

  if (!['http:', 'https:'].includes(redirectUrl.protocol)) {
    return res.status(400).send('Only http and https redirects are allowed');
  }

  if (process.env.APPEND_TRACKING_PARAMS !== 'false') {
    redirectUrl.searchParams.set('jcity_campaign_id', req.params.campaignId);
    redirectUrl.searchParams.set('jcity_email_id', req.params.emailId);
    redirectUrl.searchParams.set('jcity_link_id', req.params.linkId);
  }

  recordAndDispatch(req, 'click', { link_id: req.params.linkId });

  // 遷移先がLINE友だち追加URLなら、CV推定紐付け用にクリックを記録する（方式B）
  if (LINE_HOST_RE.test(redirectUrl.hostname)) {
    try {
      const campaign = getCampaign(req.params.campaignId);
      if (campaign?.project_id) {
        recordLineClick({
          project_id: campaign.project_id,
          campaign_id: req.params.campaignId,
          email_id: req.params.emailId,
          link_id: req.params.linkId,
          ip_address: requestMeta(req).ip_address
        });
      }
    } catch (error) {
      console.error('LINE click tracking failed:', error.message);
    }
  }

  return res.redirect(302, redirectUrl.toString());
});

router.post('/api/conversions', express.json(), (req, res, next) => {
  try {
    const { campaign_id, email_id, link_id, client_id } = req.body || {};
    if (!campaign_id || !email_id) {
      return res.status(400).json({ error: 'campaign_id and email_id are required' });
    }

    req.params = { campaignId: campaign_id, emailId: email_id };
    req.query.client_id = client_id;
    const ok = recordAndDispatch(req, 'conversion', { link_id });
    if (!ok) return res.status(404).json({ error: 'Campaign not found' });
    return res.status(202).json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/conversion/:campaignId/:emailId', (req, res) => {
  const ok = recordAndDispatch(req, 'conversion', { link_id: req.query.link_id });
  if (!ok) return res.status(404).json({ error: 'Campaign not found' });
  return res.status(204).send();
});

export default router;
