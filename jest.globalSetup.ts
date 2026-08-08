import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { writeUriHandoff } from './lib/testUtils/mongoMemoryServer';

// Payments use session.withTransaction(), which requires a replica set —
// a standalone mongodb-memory-server instance cannot run transactions.
export default async function globalSetup(): Promise<void> {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await replSet.waitUntilRunning();
  const uri = replSet.getUri();
  writeUriHandoff(uri);
  // Stored on `global` because globalSetup/globalTeardown run in the same
  // process, so this reference is retrievable in jest.globalTeardown.ts.
  (global as unknown as { __MONGO_REPLSET__: MongoMemoryReplSet }).__MONGO_REPLSET__ = replSet;
}
