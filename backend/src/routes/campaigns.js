import express from 'express';
import { createCampaign, getCampaignStats, listCampaigns } from '../db.js';

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

export default router;
