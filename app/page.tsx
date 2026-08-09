'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { login, signup, ApiError } from '@/lib/api-client';

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => (mode === 'login' ? login({ email, password }) : signup({ email, password })),
    onSuccess: () => router.push('/orders'),
  });

  return (
    <main style={{ maxWidth: 380, margin: '4rem auto', padding: '0 1rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Orders &amp; Settlements</h1>
      <p className="hint" style={{ marginBottom: '1.5rem' }}>
        {mode === 'login' ? 'Log in to view your orders.' : 'Create an account to get started.'}
      </p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="field">
          <label htmlFor="auth-email">Email</label>
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
            placeholder={mode === 'signup' ? 'At least 8 characters' : 'Password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={mode === 'signup' ? 8 : undefined}
            required
          />
        </div>
        <button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
        </button>
        {mutation.isError && (
          <p className="error-text">
            {mutation.error instanceof ApiError ? mutation.error.message : 'Something went wrong'}
          </p>
        )}
      </form>
      <button
        style={{ marginTop: '1rem', border: 'none' }}
        onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
      >
        {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
      </button>
    </main>
  );
}
