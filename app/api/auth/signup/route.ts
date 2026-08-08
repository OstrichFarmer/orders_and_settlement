import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getUsersCollection } from '@/lib/db';
import { signup } from '@/lib/services/auth';
import { AUTH_COOKIE_NAME, authCookieOptions } from '@/lib/auth';
import { toErrorResponse, ValidationError } from '@/lib/errors';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid signup payload', { issues: parsed.error.issues });
    }

    const users = await getUsersCollection();
    const { token } = await signup(users, parsed.data);

    const res = NextResponse.json({}, { status: 201 });
    res.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions());
    return res;
  } catch (err) {
    return toErrorResponse(err);
  }
}
