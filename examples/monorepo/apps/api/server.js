// apps/api/server.js
//
// Express 5 ESM API. Distinct from examples/node-api/ — the domain here is
// "items" (uses @repo/shared.validateItem) instead of "tasks" (auth-gated
// per-row CRUD). Same kind of in-memory store; smaller surface.

import express from 'express';
import { itemsRouter } from './routes/items.js';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/items', itemsRouter);

  return app;
}

const port = Number(process.env.PORT) || 3000;
if (process.argv[1]?.endsWith('server.js')) {
  createApp().listen(port, () => {
    console.log(`@repo/api listening on http://localhost:${port}`);
  });
}

export default createApp();
