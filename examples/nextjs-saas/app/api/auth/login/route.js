import { MOCK_TOKEN, setSessionCookieHeader } from '@/lib/mock-auth.js';

// POST /api/auth/login — mock auth: any non-empty email + password returns
// a literal token + Set-Cookie. Exists to demonstrate Route Handler shape.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (!body?.email || !body?.password) {
    return Response.json({ error: 'missing-credentials' }, { status: 400 });
  }
  return Response.json(
    { token: MOCK_TOKEN },
    { status: 200, headers: { 'Set-Cookie': setSessionCookieHeader() } },
  );
}
