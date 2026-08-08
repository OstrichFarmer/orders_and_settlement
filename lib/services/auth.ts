import type { Collection } from 'mongodb';
import type { User } from '@/types/models';
import { hashPassword, verifyPassword, signJwt } from '@/lib/auth';
import { ConflictError, UnauthorizedError, isDuplicateKeyError } from '@/lib/errors';

export async function signup(
  users: Collection<User>,
  input: { email: string; password: string }
): Promise<{ token: string }> {
  const passwordHash = await hashPassword(input.password);

  try {
    const result = await users.insertOne({
      email: input.email,
      passwordHash,
      createdAt: new Date(),
    } as User);

    const token = signJwt({ sub: result.insertedId.toString(), email: input.email });
    return { token };
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new ConflictError('EMAIL_TAKEN', 'An account with this email already exists');
    }
    throw err;
  }
}

export async function login(
  users: Collection<User>,
  input: { email: string; password: string }
): Promise<{ token: string }> {
  const user = await users.findOne({ email: input.email });
  if (!user) throw new UnauthorizedError('Invalid credentials');

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  const token = signJwt({ sub: user._id.toString(), email: user.email });
  return { token };
}
