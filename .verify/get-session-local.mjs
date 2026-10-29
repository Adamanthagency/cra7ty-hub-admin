/** Fresh admin session for the local dev server → .verify/test-session-local.json */
import { writeFileSync } from 'node:fs';
import { adminLogin } from './lib-auth.mjs';

const ORIGIN = process.argv[2] ?? 'http://localhost:52710';
const cookie = await adminLogin(ORIGIN);
writeFileSync(new URL('./test-session-local.json', import.meta.url), JSON.stringify({ cookie }));
console.log('session acquired for', ORIGIN, '(length', cookie.length + ')');
