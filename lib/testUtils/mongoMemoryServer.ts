import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// jest.globalSetup and each test file's setupFiles run in different processes,
// so the replica-set URI is handed off through a small file on disk.
export const URI_HANDOFF_PATH = path.join(os.tmpdir(), 'orders-and-settlement-jest-mongo-uri.json');

export function writeUriHandoff(uri: string): void {
  fs.writeFileSync(URI_HANDOFF_PATH, JSON.stringify({ uri }));
}

export function readUriHandoff(): string {
  const raw = fs.readFileSync(URI_HANDOFF_PATH, 'utf-8');
  return (JSON.parse(raw) as { uri: string }).uri;
}

export function clearUriHandoff(): void {
  if (fs.existsSync(URI_HANDOFF_PATH)) {
    fs.unlinkSync(URI_HANDOFF_PATH);
  }
}
