import { adminLogin } from './lib-auth.mjs';
import { writeFileSync } from 'node:fs';
const cookie = await adminLogin('http://127.0.0.1:3999');
writeFileSync(new URL('./test-session.json', import.meta.url), JSON.stringify({ cookie }));
console.log('session acquired (length', cookie.length + ')');
