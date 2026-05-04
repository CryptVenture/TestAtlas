// apps/api/routes/items.js
//
// In-memory item store. POST validates with @repo/shared.validateItem to
// demonstrate the cross-cut shared-package boundary — both web and api
// import the same validator from packages/shared/.

import { normalizeItem, validateItem } from '@repo/shared';
import { Router } from 'express';

const items = [];

export const itemsRouter = Router();

itemsRouter.get('/', (_req, res) => {
  res.json({ items });
});

itemsRouter.post('/', (req, res) => {
  if (!validateItem(req.body)) {
    res.status(400).json({ error: 'invalid item shape' });
    return;
  }
  const normalized = normalizeItem(req.body);
  items.push(normalized);
  res.status(201).json(normalized);
});
