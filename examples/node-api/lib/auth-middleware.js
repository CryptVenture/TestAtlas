// examples/node-api/lib/auth-middleware.js
//
// Mock bearer-token check. Real apps would verify a signed JWT.

export function requireBearer(req, res, next) {
  const auth = req.headers.authorization ?? '';
  if (auth !== 'Bearer mock-jwt-token') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return next();
}
