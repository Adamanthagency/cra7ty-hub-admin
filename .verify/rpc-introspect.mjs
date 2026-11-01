/**
 * One-off READ-ONLY introspection (service role):
 *  1) PostgREST root → exposed tables + every callable RPC, with the
 *     signatures of confirm_paid_order / create_checkout_order.
 *  2) storage bucket list → per-bucket file_size_limit.
 * Calls NO functions. Prints no secrets.
 */
import fs from 'node:fs';

const env = Object.fromEntries(
  fs
    .readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const U = env.NEXT_PUBLIC_SUPABASE_URL;
const K = env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) {
  console.error('missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

/* 1 — PostgREST OpenAPI root */
let root;
try {
  root = await fetch(`${U}/rest/v1/`, {
    headers: { apikey: K, Authorization: `Bearer ${K}`, Accept: 'application/openapi+json' },
  }).then((r) => r.json());
} catch (e) {
  console.error('openapi fetch failed:', e.message);
  process.exit(2);
}
const schemas = root.definitions ?? root.components?.schemas ?? {};
const tables = Object.keys(schemas).sort();
const rpcs = Object.keys(root.paths ?? {})
  .filter((p) => p.startsWith('/rpc/'))
  .map((p) => p.slice(5))
  .sort();

console.log(`TABLES (${tables.length}):`);
console.log('  ' + tables.join(', '));
console.log(`\nRPCs (${rpcs.length}):`);
console.log('  ' + rpcs.join(', '));

for (const fn of ['confirm_paid_order', 'create_checkout_order']) {
  const op = root.paths?.[`/rpc/${fn}`]?.post;
  if (!op) {
    console.log(`\nSIGNATURE ${fn}: NOT exposed via PostgREST (or wrong schema)`);
    continue;
  }
  const params = (op.parameters ?? []).map((p) => ({
    name: p.name,
    in: p.in,
    required: p.required,
    type: p.schema?.type ?? p.type,
    format: p.schema?.format ?? p.format,
  }));
  console.log(`\nSIGNATURE ${fn}:`);
  console.log('  ' + JSON.stringify(params));
}

const execish = rpcs.filter((n) => /(exec|sql|query|run_|eval|raw)/i.test(n));
console.log('\nexec-like RPCs (candidates for running pg_get_functiondef):');
console.log('  ' + (execish.length ? execish.join(', ') : '(none)'));

/* 2 — storage buckets */
const res = await fetch(`${U}/storage/v1/bucket`, {
  headers: { apikey: K, Authorization: `Bearer ${K}` },
});
const buckets = await res.json();
console.log(`\nBUCKETS (HTTP ${res.status}):`);
if (Array.isArray(buckets)) {
  for (const b of buckets) {
    console.log(
      `  ${b.id}  public=${b.public}  file_size_limit=${b.file_size_limit ?? 'null'}  mime=${JSON.stringify(b.allowed_mime_types ?? null)}`,
    );
  }
} else {
  console.log('  ' + JSON.stringify(buckets).slice(0, 400));
}
