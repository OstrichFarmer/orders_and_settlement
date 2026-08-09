'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { login, signup, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/Toast';

export default function Home() {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => (mode === 'login' ? login({ email, password }) : signup({ email, password })),
    onSuccess: () => {
      toast.success(mode === 'login' ? 'Welcome back!' : 'Account created!');
      router.push('/orders');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong');
    },
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <main className="card" style={{ width: '100%', maxWidth: 400, padding: '2rem 2rem 2.25rem 2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #6366f1 0%, #38bdf8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '1.125rem',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.35)',
            }}
          >
            O
          </div>
          <div>
            <h1 style={{ fontSize: '1.35rem', lineHeight: 1.2 }}>Orders &amp; Settlements</h1>
            <p className="hint" style={{ fontSize: '0.8125rem', marginTop: '0.125rem' }}>
              {mode === 'login' ? 'Log in to view your orders' : 'Create an account to get started'}
            </p>
          </div>
        </div>

        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="field">
            <label htmlFor="auth-email">Email address</label>
            <input
              id="auth-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={mode === 'signup' ? 8 : undefined}
              required
            />
          </div>
          <button type="submit" disabled={mutation.isPending} style={{ marginTop: '0.5rem', width: '100%' }}>
            {mutation.isPending ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
          <button
            type="button"
            className="secondary"
            style={{ width: '100%', fontSize: '0.8125rem' }}
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          >
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
          </button>
        </div>
      </main>
    </div>
  );
}
