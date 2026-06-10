import express from 'express';
import { getGa4Config, saveGa4Config, getGa4SecretConfig } from '../db.js';

const router = express.Router();

function ga4Status() {
  const effective = getGa4SecretConfig();
  const configured = Boolean(effective?.measurement_id && effective?.api_secret);
  const envSet = Boolean(process.env.GA4_MEASUREMENT_ID && process.env.GA4_API_SECRET);
  return {
    config: getGa4Config(),
    configured,
    source: configured ? (envSet ? 'env' : 'db') : null,
    measurement_id: effective?.measurement_id || ''
  };
}

router.get('/config/ga4', (req, res) => {
  res.json(ga4Status());
});

router.post('/config/ga4', (req, res, next) => {
  try {
    saveGa4Config(req.body || {});
    res.json(ga4Status());
  } catch (error) {
    next(error);
  }
});

export default router;
