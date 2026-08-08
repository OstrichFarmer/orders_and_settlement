import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth-constants';

export function proxy(req: NextRequest) {
  if (!req.cookies.get(AUTH_COOKIE_NAME)) {
    return NextResponse.redirect(new URL('/', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/orders/:path*'],
};
