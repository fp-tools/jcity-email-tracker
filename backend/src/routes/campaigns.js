import express from 'express';
import { createCampaign, getCampaign, getCampaignStats, getEmailBreakdown, listCampaigns } from '../db.js';

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

export default router;
