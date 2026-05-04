// examples/node-api/server.js
//
// TestAtlas example app: a minimal Express 5 ESM API. Runs on Node 20.11+
// with no build step (`node server.js`). The companion `_testatlas/`
// workspace inside this directory is the durable quality intelligence layer
// produced by exploring this codebase with TestAtlas.

import express from 'express';
import authRouter from './routes/auth.js';
import healthRouter from './routes/health.js';
import tasksRouter from './routes/tasks.js';
import usersRouter from './routes/users.js';

const app = express();
app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/users', usersRouter);

// 404 fallback.
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

const port = Number(process.env.PORT) || 3000;
if (process.argv[1]?.endsWith('server.js')) {
  app.listen(port, () => {
    console.log(`example-node-api listening on http://localhost:${port}`);
  });
}

export default app;
