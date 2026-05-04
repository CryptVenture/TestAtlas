import Link from 'next/link';

export default function Nav() {
  return (
    <nav>
      <Link href="/">Home</Link> <Link href="/login">Login</Link> <Link href="/signup">Signup</Link>{' '}
      <Link href="/dashboard">Dashboard</Link>
    </nav>
  );
}
