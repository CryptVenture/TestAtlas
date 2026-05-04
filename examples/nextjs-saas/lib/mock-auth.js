// Mock auth helpers used by the (dashboard) layout and the api/auth route
// handlers. The "session" is a non-cryptographic literal cookie value — this
// example exists to demonstrate App-Router auth flow shape, not real auth.

export const SESSION_COOKIE = 'session';
export const MOCK_TOKEN = 'mock-jwt-token';

export function readSession(cookieStore) {
  const session = cookieStore.get(SESSION_COOKIE);
  if (!session?.value) return null;
  return { user: { email: 'demo@example.com' }, token: session.value };
}

export function setSessionCookieHeader() {
  return `${SESSION_COOKIE}=${MOCK_TOKEN}; Path=/; HttpOnly; SameSite=Lax`;
}
