import { MOCK_TOKEN, setSessionCookieHeader } from '@/lib/mock-auth.js';

// POST /api/auth/signup — mock signup: any non-empty email + password creates
// a session and returns 201. NO password-strength validation (intentional —
// this is one of the seeded findings).
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (!body?.email || !body?.password) {
    return Response.json({ error: 'missing-credentials' }, { status: 400 });
  }
  return Response.json(
    { token: MOCK_TOKEN, user: { email: body.email } },
    { status: 201, headers: { 'Set-Cookie': setSessionCookieHeader() } },
  );
}
