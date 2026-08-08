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
      <h1 style={{ marginBottom: '1.5rem' }}>Orders &amp; Settlements</h1>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={mode === 'signup' ? 8 : undefined}
          required
        />
        <button type="submit" disabled={mutation.isPending}>
          {mode === 'login' ? 'Log in' : 'Sign up'}
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
