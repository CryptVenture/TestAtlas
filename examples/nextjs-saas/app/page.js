import Link from 'next/link';

export default function MarketingHome() {
  return (
    <section>
      <h1>TestAtlas Example — Next.js SaaS</h1>
      <p>
        A minimal SaaS shell demonstrating App Router, Server Components, mock auth, and Route
        Handlers. Used by TestAtlas to exercise full-stack web exploration.
      </p>
      <p>
        <Link href="/login">Sign in</Link> <Link href="/signup">Create account</Link>
      </p>
    </section>
  );
}
