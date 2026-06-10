import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import campaignsRouter from './routes/campaigns.js';
import configRouter from './routes/config.js';
import projectsRouter from './routes/projects.js';
import trackingRouter from './routes/tracking.js';
import { lineApiRouter, lineWebhookRouter } from './routes/line.js';

const app = express();
const port = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '../../frontend/dist');

app.set('trust proxy', true);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean) || true
}));
// LINE Webhook は署名検証のため生ボディが必要。JSONパーサより前に登録する
app.use(lineWebhookRouter);

app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => res.json({ ok: true }));
app.use(trackingRouter);
app.use('/api', projectsRouter);
app.use('/api', campaignsRouter);
app.use('/api', configRouter);
app.use('/api', lineApiRouter);

app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/pixel/') || req.path.startsWith('/click/')) {
    return next();
  }
  return res.sendFile(path.join(frontendDist, 'index.html'), (error) => {
    if (error) next();
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((error, req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
});

app.listen(port, () => {
  console.log(`jcity email tracker listening on ${port}`);
});
