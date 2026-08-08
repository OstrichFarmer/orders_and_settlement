import { MongoClient, type Db } from 'mongodb';
import type { User, Order, Payment, AuditLog } from '@/types/models';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'orders_and_settlement';

if (!uri) {
  throw new Error('Missing MONGODB_URI environment variable');
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function createClientPromise(): Promise<MongoClient> {
  const client = new MongoClient(uri as string);
  return client.connect();
}

// Cached on `global` so hot-reload in dev and serverless warm invocations reuse one connection.
const clientPromise: Promise<MongoClient> =
  global._mongoClientPromise ?? (global._mongoClientPromise = createClientPromise());

export async function getClient(): Promise<MongoClient> {
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db(dbName);
}

export async function getUsersCollection() {
  return (await getDb()).collection<User>('users');
}

export async function getOrdersCollection() {
  return (await getDb()).collection<Order>('orders');
}

export async function getPaymentsCollection() {
  return (await getDb()).collection<Payment>('payments');
}

export async function getAuditLogCollection() {
  return (await getDb()).collection<AuditLog>('audit_log');
}
