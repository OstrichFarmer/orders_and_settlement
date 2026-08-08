import { MongoMemoryReplSet } from 'mongodb-memory-server';

async function main() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await replSet.waitUntilRunning();
  console.log('MONGODB_URI=' + replSet.getUri());
  console.log('Ctrl+C to stop.');
  // Keep process alive.
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
