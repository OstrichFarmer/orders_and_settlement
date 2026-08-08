import { getClient, getDb } from '@/lib/db';
import { ensureIndexes } from './ensureIndexes';

async function main() {
  const db = await getDb();
  await ensureIndexes(db);
  console.log('Indexes ensured.');
  const client = await getClient();
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
