'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { logout } from '@/lib/api-client';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <div>
      <nav className="row" style={{ padding: '1rem', borderBottom: '1px solid #8884', justifyContent: 'space-between' }}>
        <Link href="/orders" className="nav-brand" style={{ fontWeight: 600 }}>
          Orders &amp; Settlements
        </Link>
        <button
          onClick={async () => {
            await logout();
            router.push('/');
          }}
        >
          Log out
        </button>
      </nav>
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem' }}>{children}</main>
    </div>
  );
}
