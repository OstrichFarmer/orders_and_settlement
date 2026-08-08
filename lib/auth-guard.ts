import type { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { AUTH_COOKIE_NAME, verifyJwt } from '@/lib/auth';
import { UnauthorizedError } from '@/lib/errors';

/** Single chokepoint every route handler calls first to identify the caller. */
export function getUserId(req: NextRequest): ObjectId {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) throw new UnauthorizedError();

  const payload = verifyJwt(token);
  if (!payload) throw new UnauthorizedError();

  return new ObjectId(payload.sub);
}
