import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/mock-auth.js';

export default async function DashboardLayout({ children }) {
  const cookieStore = await cookies();
  const session = readSession(cookieStore);
  if (!session) redirect('/login');
  return (
    <section>
      <header>
        <h2>Dashboard</h2>
        <p>Signed in as {session.user.email}</p>
      </header>
      {children}
    </section>
  );
}
