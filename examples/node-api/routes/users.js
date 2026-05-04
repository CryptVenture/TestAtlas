// examples/node-api/routes/users.js
//
// GET /api/users/me — requires `Authorization: Bearer mock-jwt-token`.

import { Router } from 'express';
import { requireBearer } from '../lib/auth-middleware.js';

const router = Router();

router.get('/me', requireBearer, (_req, res) => {
  res.json({ id: 'user-1', email: 'user@example.test' });
});

export default router;
