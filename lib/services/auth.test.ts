import { getDb, getClient } from '@/lib/db';
import { ensureIndexes } from '@/scripts/ensureIndexes';
import { signup, login } from './auth';
import { verifyJwt } from '@/lib/auth';
import type { Collection } from 'mongodb';
import type { User } from '@/types/models';

let users: Collection<User>;

beforeAll(async () => {
  const db = await getDb();
  await ensureIndexes(db);
  users = db.collection<User>('users');
});

afterEach(async () => {
  await users.deleteMany({});
});

afterAll(async () => {
  const client = await getClient();
  await client.close();
});

describe('signup', () => {
  it('creates a user and returns a token', async () => {
    const { token } = await signup(users, { email: 'a@example.com', password: 'password123' });
    expect(token).toBeTruthy();
    const payload = verifyJwt(token);
    expect(payload?.email).toBe('a@example.com');

    const stored = await users.findOne({ email: 'a@example.com' });
    expect(stored).toBeTruthy();
    expect(stored?.passwordHash).not.toBe('password123');
  });

  it('rejects a duplicate email with EMAIL_TAKEN', async () => {
    await signup(users, { email: 'dup@example.com', password: 'password123' });
    await expect(signup(users, { email: 'dup@example.com', password: 'password456' })).rejects.toMatchObject({
      code: 'EMAIL_TAKEN',
      status: 409,
    });
  });
});

describe('login', () => {
  it('logs in with correct credentials', async () => {
    await signup(users, { email: 'b@example.com', password: 'password123' });
    const { token } = await login(users, { email: 'b@example.com', password: 'password123' });
    expect(verifyJwt(token)?.email).toBe('b@example.com');
  });

  it('rejects an unknown email with a generic Unauthorized error', async () => {
    await expect(login(users, { email: 'nobody@example.com', password: 'x' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
  });

  it('rejects a wrong password with the same generic Unauthorized error', async () => {
    await signup(users, { email: 'c@example.com', password: 'password123' });
    await expect(login(users, { email: 'c@example.com', password: 'wrong' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
  });
});
