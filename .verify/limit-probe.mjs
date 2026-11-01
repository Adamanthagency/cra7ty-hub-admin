/**
 * v4 — Final precision probes:
 *  1) 50MiB + 1 byte → pins the exact global limit boundary
 *     (v3: 50MiB accepted, 51MiB rejected → limit in [50MiB, 51MiB)).
 *  2) TUS resumable creation with Content-Type: application/json
 *     (v3's "Bucket name invalid" was the missing JSON content type).
 *     201 + Location = resumable path available for this project.
 *  3) Leftover check on both buckets — probes must leave nothing.
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
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const K = env.SUPABASE_SERVICE_ROLE_KEY;
const HDR = { apikey: K, Authorization: `Bearer ${K}` };
const MiB = 1024 * 1024;

/* 1 — exact boundary: 50MiB + 1 byte */
{
  const bytes = 50 * MiB + 1;
  const body = Buffer.alloc(bytes, 0x20);
  body.write('%PDF-1.4\n% probe\n', 0, 'ascii');
  const res = await fetch(`${BASE}/storage/v1/object/digital-files/_probe-boundary.bin`, {
    method: 'POST',
    headers: { ...HDR, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body,
  });
  const text = await res.text();
  if (res.ok) {
    const del = await fetch(`${BASE}/storage/v1/object/digital-files/_probe-boundary.bin`, {
      method: 'DELETE',
      headers: HDR,
    });
    console.log(`BOUNDARY 50MiB+1: ACCEPTED | cleaned up DELETE ${del.status}`);
    console.log('=> limit >50MiB (not the stock 50MiB number)');
  } else {
    console.log(`BOUNDARY 50MiB+1: REJECTED — HTTP ${res.status} ${text.slice(0, 160)}`);
    console.log('=> GLOBAL LIMIT = exactly 50 MiB (52,428,800 bytes, Supabase Free tier default)');
  }
}

/* 2 — TUS resumable creation, JSON content type */
{
  const meta = [
    `bucketId ${Buffer.from('digital-files').toString('base64')}`,
    `name ${Buffer.from('_probe-tus.bin').toString('base64')}`,
  ].join(',');
  const res = await fetch(`${BASE}/storage/v1/upload/resumable`, {
    method: 'POST',
    headers: {
      ...HDR,
      'Content-Type': 'application/json',
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(1 * MiB),
      'upload-metadata': meta,
      'x-upsert': 'false',
    },
    body: JSON.stringify({ bucketId: 'digital-files', name: '_probe-tus.bin' }),
  });
  const text = await res.text();
  const loc = res.headers.get('location');
  console.log(`TUS creation: HTTP ${res.status} location=${loc ? 'yes' : 'no'} ${text.slice(0, 160)}`);
  if (loc) console.log('  (upload URL only — no object stored; URL expires in 24h)');
}

/* 3 — leftovers */
for (const bucket of ['digital-files', 'media']) {
  const res = await fetch(`${BASE}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: { ...HDR, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 1000, offset: 0 }),
  });
  const j = await res.json();
  const probes = Array.isArray(j) ? j.filter((o) => (o.name || '').startsWith('_probe')) : [];
  console.log(`LEFTOVERS ${bucket}: ${probes.length ? probes.map((p) => p.name).join(', ') : 'none'}`);
}
