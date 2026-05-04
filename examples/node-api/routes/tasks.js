// examples/node-api/routes/tasks.js
//
// CRUD against an in-memory Map. Intentionally seeded with two findings
// (catalogued in _testatlas/to_fix/):
//
//   ISSUE-001 — DELETE /api/tasks/:id missing ownership check (medium)
//   ISSUE-002 — In-memory store loses state on restart (enhancement)
//
// The DELETE handler is the seeded NO-AUTH-ON-DELETE-TASK finding and is
// intentionally kept un-fixed to anchor the example workspace.

import { Router } from 'express';
import { tasks } from '../lib/store.js';

const router = Router();

let nextId = 1;

router.get('/', (_req, res) => {
  res.json([...tasks.values()]);
});

router.post('/', (req, res) => {
  const { title } = req.body ?? {};
  if (!title) return res.status(400).json({ error: 'title_required' });
  const id = String(nextId++);
  const task = { id, title, status: 'open', owner: req.body.owner ?? null };
  tasks.set(id, task);
  res.status(201).json(task);
});

router.get('/:id', (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'not_found' });
  res.json(task);
});

router.patch('/:id', (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'not_found' });
  Object.assign(task, req.body ?? {});
  tasks.set(req.params.id, task);
  res.json(task);
});

// Seeded finding NO-AUTH-ON-DELETE-TASK: this handler does NOT verify that
// the requester owns the task. Documented in _testatlas/to_fix/.
router.delete('/:id', (req, res) => {
  if (!tasks.has(req.params.id)) return res.status(404).json({ error: 'not_found' });
  tasks.delete(req.params.id);
  res.status(204).end();
});

export default router;
