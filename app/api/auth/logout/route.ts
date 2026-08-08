import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({}, { status: 200 });
  res.cookies.delete(AUTH_COOKIE_NAME);
  return res;
}
