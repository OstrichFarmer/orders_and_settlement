import type { MongoMemoryReplSet } from 'mongodb-memory-server';
import { clearUriHandoff } from './lib/testUtils/mongoMemoryServer';

export default async function globalTeardown(): Promise<void> {
  const replSet = (global as unknown as { __MONGO_REPLSET__?: MongoMemoryReplSet }).__MONGO_REPLSET__;
  if (replSet) {
    await replSet.stop();
  }
  clearUriHandoff();
}
