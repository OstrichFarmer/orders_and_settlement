'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { logout } from '@/lib/api-client';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          background: 'rgba(255, 255, 255, 0.85)',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <nav
          className="row"
          style={{
            maxWidth: 1080,
            margin: '0 auto',
            padding: '0.875rem 1.25rem',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Link href="/orders" className="nav-brand" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #6366f1 0%, #38bdf8 100%)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.875rem',
                boxShadow: '0 2px 8px rgba(99, 102, 241, 0.4)',
              }}
            >
              O
            </span>
            Orders &amp; Settlements
          </Link>
          <button
            type="button"
            className="secondary"
            style={{ fontSize: '0.8125rem', padding: '0.45rem 0.875rem' }}
            onClick={async () => {
              await logout();
              router.push('/');
            }}
          >
            Log out
          </button>
        </nav>
      </header>
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '2rem 1.25rem', width: '100%', flex: 1 }}>{children}</main>
    </div>
  );
}
