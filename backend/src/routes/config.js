import express from 'express';
import { getGa4Config, saveGa4Config } from '../db.js';

const router = express.Router();

router.get('/config/ga4', (req, res) => {
  res.json({ config: getGa4Config() });
});

router.post('/config/ga4', (req, res, next) => {
  try {
    const config = saveGa4Config(req.body || {});
    res.json({ config });
  } catch (error) {
    next(error);
  }
});

export default router;
