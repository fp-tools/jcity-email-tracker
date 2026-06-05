import express from 'express';
import {
  createProject,
  deleteProject,
  getProject,
  getProjectStats,
  listEmailsByProject,
  listProjects
} from '../db.js';

const router = express.Router();

router.get('/projects', (req, res) => {
  res.json({ projects: listProjects() });
});

router.post('/projects', (req, res, next) => {
  try {
    const project = createProject(req.body || {});
    res.status(201).json({ project });
  } catch (error) {
    next(error);
  }
});

router.get('/projects/:id', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  return res.json({ project, emails: listEmailsByProject(req.params.id) });
});

router.get('/projects/:id/stats', (req, res) => {
  const stats = getProjectStats(req.params.id);
  if (!stats) return res.status(404).json({ error: 'Project not found' });
  return res.json({ project: stats });
});

router.delete('/projects/:id', (req, res) => {
  const deleted = deleteProject(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Project not found' });
  return res.json({ ok: true });
});

export default router;
