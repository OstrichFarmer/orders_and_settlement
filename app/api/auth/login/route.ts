import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getUsersCollection } from '@/lib/db';
import { login } from '@/lib/services/auth';
import { AUTH_COOKIE_NAME, authCookieOptions } from '@/lib/auth';
import { toErrorResponse, ValidationError } from '@/lib/errors';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid login payload', { issues: parsed.error.issues });
    }

    const users = await getUsersCollection();
    const { token } = await login(users, parsed.data);

    const res = NextResponse.json({}, { status: 200 });
    res.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions());
    return res;
  } catch (err) {
    return toErrorResponse(err);
  }
}
