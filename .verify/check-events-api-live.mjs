// Post-deploy check: the deployed /admin/api/events must answer 200 with
// a real admin session (it 500'd with PGRST200 before 14709d8 because the
// embed name `registrations` does not exist). Also checks the detail
// route against a non-existent id (404, not 500) to cover loadEvent.
import { adminLogin } from './lib-auth.mjs';

const ORIGIN = process.env.ADMIN_BASE ?? 'https://cra7ty-hub-admin.vercel.app';

const cookie = await adminLogin(ORIGIN);

const list = await fetch(`${ORIGIN}/admin/api/events`, {
  headers: { cookie },
});
const listBody = await list.text();
console.log(`GET /admin/api/events -> HTTP ${list.status} ${listBody.slice(0, 200)}`);

const detail = await fetch(
  `${ORIGIN}/admin/api/events/00000000-0000-4000-8000-000000000000`,
  { headers: { cookie } },
);
const detailBody = await detail.text();
console.log(`GET /admin/api/events/[missing-id] -> HTTP ${detail.status} ${detailBody.slice(0, 150)}`);

const ok = list.status === 200 && detail.status === 404;
console.log(ok ? 'PASS: events API loads on production' : 'FAIL');
process.exit(ok ? 0 : 1);
