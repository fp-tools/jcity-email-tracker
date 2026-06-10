import express from 'express';
import {
  createFunnel,
  deleteFunnel,
  getFunnel,
  getFunnelResults,
  listFunnels,
  updateFunnel
} from '../db.js';

const router = express.Router();

// 一覧（scope=project|campaign & owner_id 指定）。結果も同梱
router.get('/funnels', (req, res) => {
  const { scope, owner_id } = req.query;
  if (!scope || !owner_id) {
    return res.status(400).json({ error: 'scope and owner_id are required' });
  }
  const funnels = listFunnels(scope, owner_id).map((f) => ({ ...f, results: getFunnelResults(f) }));
  return res.json({ funnels });
});

router.post('/funnels', (req, res, next) => {
  try {
    const funnel = createFunnel(req.body || {});
    res.status(201).json({ funnel: { ...funnel, results: getFunnelResults(funnel) } });
  } catch (error) {
    next(error);
  }
});

router.put('/funnels/:id', (req, res, next) => {
  try {
    const funnel = updateFunnel(req.params.id, req.body || {});
    if (!funnel) return res.status(404).json({ error: 'Funnel not found' });
    return res.json({ funnel: { ...funnel, results: getFunnelResults(funnel) } });
  } catch (error) {
    return next(error);
  }
});

router.get('/funnels/:id/results', (req, res) => {
  const funnel = getFunnel(req.params.id);
  if (!funnel) return res.status(404).json({ error: 'Funnel not found' });
  return res.json({ funnel, results: getFunnelResults(funnel) });
});

router.delete('/funnels/:id', (req, res) => {
  const deleted = deleteFunnel(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Funnel not found' });
  return res.json({ ok: true });
});

export default router;
