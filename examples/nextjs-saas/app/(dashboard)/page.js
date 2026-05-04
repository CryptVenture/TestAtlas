import Link from 'next/link';

export default function DashboardHome() {
  return (
    <div>
      <h3>Welcome back</h3>
      <p>This is the authenticated dashboard home.</p>
      <ul>
        <li>
          <Link href="/dashboard/settings">Settings</Link>
        </li>
      </ul>
    </div>
  );
}
