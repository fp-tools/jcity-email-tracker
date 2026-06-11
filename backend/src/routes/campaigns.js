import express from 'express';
import { createCampaign, deleteCampaign, getCampaign, getCampaignStats, getClicksByLink, getClicksByTarget, getConversionsByLink, getEmailBreakdown, getEvents, getLinkLabels, getTargetLabels, listCampaigns, saveLinkLabels, saveTargetLabels, updateCampaign } from '../db.js';

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

router.get('/campaigns/:id/events', (req, res) => {
  const campaign = getCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  const { type, limit, offset } = req.query;
  return res.json({
    ...getEvents(req.params.id, { type, limit, offset }),
    labels: getLinkLabels(req.params.id)
  });
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
    clicks_by_link: getClicksByLink(req.params.id),
    conversions_by_link: getConversionsByLink(req.params.id),
    clicks_by_target: getClicksByTarget(req.params.id),
    labels: getLinkLabels(req.params.id),
    target_labels: getTargetLabels(req.params.id)
  });
});

router.post('/campaigns/:id/link-labels', (req, res, next) => {
  try {
    const labels = saveLinkLabels(req.params.id, (req.body || {}).labels || []);
    res.json({ labels });
  } catch (error) {
    next(error);
  }
});

router.post('/campaigns/:id/target-labels', (req, res, next) => {
  try {
    const target_labels = saveTargetLabels(req.params.id, (req.body || {}).labels || []);
    res.json({ target_labels });
  } catch (error) {
    next(error);
  }
});

export default router;
