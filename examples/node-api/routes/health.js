// examples/node-api/routes/health.js
//
// GET /api/health → 200 {status: "ok"}. Used by smoke checks.

import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

export default router;
