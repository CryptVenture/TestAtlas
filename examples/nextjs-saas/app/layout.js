import Nav from '@/components/nav.js';

export const metadata = {
  title: 'TestAtlas Example — Next.js SaaS',
  description: 'Minimal Next.js 15 App Router + React 19 SaaS shell',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  );
}
