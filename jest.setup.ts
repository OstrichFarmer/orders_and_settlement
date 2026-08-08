import { readUriHandoff } from './lib/testUtils/mongoMemoryServer';

process.env.MONGODB_URI = readUriHandoff();
process.env.MONGODB_DB = `test_${process.pid}_${Date.now()}`;
process.env.JWT_SECRET = 'test-secret';
