import express from 'express';
import { createCampaign, deleteCampaign, getCampaign, getCampaignStats, getClicksByLink, getEmailBreakdown, listCampaigns, updateCampaign } from '../db.js';

const router = express.Router();

router.get('/campaigns', (req, res) => {
  res.json({ campaigns: listCampaigns() });
});

router.post('/campaigns', (req, res, next) => {
  try {
    const campaign = createCampaign(req.body || {});
    res.status(201).json({ campaign });
  } catch (error) {
    next(error);
  }
});

router.patch('/campaigns/:id', (req, res, next) => {
  try {
    const campaign = updateCampaign(req.params.id, req.body || {});
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ campaign });
  } catch (error) {
    next(error);
  }
});

router.delete('/campaigns/:id', (req, res) => {
  const deleted = deleteCampaign(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Campaign not found' });
  return res.json({ ok: true });
});

router.get('/campaigns/:id/stats', (req, res) => {
  const stats = getCampaignStats(req.params.id, req.query.limit);
  if (!stats) return res.status(404).json({ error: 'Campaign not found' });
  return res.json({ campaign: stats });
});

router.get('/campaigns/:id/email-breakdown', (req, res) => {
  const campaign = getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  return res.json(getEmailBreakdown(req.params.id));
});

router.get('/campaigns/:id/heatmap', (req, res) => {
  const campaign = getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  return res.json({
    html_content: campaign.html_content || '',
    clicks_by_link: getClicksByLink(req.params.id)
  });
});

export default router;
