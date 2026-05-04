// examples/node-api/routes/auth.js
//
// POST /api/auth/login   — returns a literal mock JWT on any non-empty input.
// POST /api/auth/logout  — returns 204.
//
// This is intentionally a *mock* auth — TestAtlas explorers map this and
// surface findings about it (e.g. "mock JWT secret in .env.example looks
// real" — see _testatlas/to_fix/).

import { Router } from 'express';

const router = Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email_and_password_required' });
  }
  return res.status(200).json({ token: 'mock-jwt-token' });
});

router.post('/logout', (_req, res) => {
  res.status(204).end();
});

export default router;
