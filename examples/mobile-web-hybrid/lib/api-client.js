// Universal `fetch`-based API client — works on iOS, Android, and web.
// No native modules. The implementation intentionally has no offline / retry
// handling so explorers can map the gap as a finding (see seeded issue
// LOGIN-NO-OFFLINE-HANDLING).

const BASE_URL = 'https://api.example.com';

export async function login({ email, password }) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  return res.json();
}

export async function logout() {
  const res = await fetch(`${BASE_URL}/auth/logout`, { method: 'POST' });
  if (!res.ok) throw new Error(`logout failed: ${res.status}`);
  return true;
}

export async function getProfile() {
  const res = await fetch(`${BASE_URL}/profile`);
  if (!res.ok) throw new Error(`profile failed: ${res.status}`);
  return res.json();
}
