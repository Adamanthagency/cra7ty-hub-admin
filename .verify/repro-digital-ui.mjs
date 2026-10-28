// Reproduces product-editor.tsx uploadDigitalFile() exactly:
//   1. POST /admin/api/digital-files {action:'sign',productId,filename,sizeBytes}
//   2. PUT  sign.uploadUrl  with ONLY Content-Type header, body = file bytes
//   3. POST {action:'confirm', path}
import { adminLogin } from './lib-auth.mjs';

const BASE = 'http://localhost:3005';
const cookie = await adminLogin(BASE);
console.log('session cookie:', cookie ? 'yes' : 'NO');

const cases = [
  { name: 'report.pdf', type: 'application/pdf', body: '%PDF-1.4\n% test\n' },
  { name: 'Poster Print.png', type: 'image/png', body: '\x89PNG\r\n\x1a\n test' },
  { name: 'Cra7ty Pack (v2).zip', type: 'application/zip', body: 'PK\x03\x04 test' },
  { name: 'lesson one.mp4', type: 'video/mp4', body: '\x00\x00\x00\x18ftypmp42 test' },
  { name: 'audiobook.mp3', type: 'audio/mpeg', body: 'ID3\x04 test' },
  { name: 'cover.webp', type: 'image/webp', body: 'RIFF\x24\x00\x00\x00WEBPVP8 test' },
  { name: 'book.epub', type: 'application/epub+zip', body: 'PK\x03\x04 test' },
];

const productId = 'product-repro-test-1234';

for (const c of cases) {
  console.log(`\n--- ${c.name} (${c.type}) ---`);
  const signRes = await fetch(`${BASE}/admin/api/digital-files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ action: 'sign', productId, filename: c.name, sizeBytes: c.body.length }),
  });
  const sign = await signRes.json().catch(() => null);
  if (!signRes.ok) { console.log('SIGN FAILED', signRes.status, JSON.stringify(sign)); continue; }
  console.log('sign ok. path =', sign.path);
  console.log('uploadUrl =', sign.uploadUrl);
  console.log('contentType =', sign.contentType);

  // exactly what the editor sends: Content-Type only, no x-upsert, no auth
  const put = await fetch(sign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': sign.contentType ?? c.type },
    body: c.body,
  });
  const putBody = await put.text();
  console.log(`PUT -> ${put.status} ${put.status === 200 ? '' : putBody.slice(0, 300)}`);

  if (put.ok) {
    const conf = await fetch(`${BASE}/admin/api/digital-files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ action: 'confirm', path: sign.path }),
    });
    const confBody = await conf.json().catch(() => null);
    console.log(`confirm -> ${conf.status}`, JSON.stringify(confBody).slice(0, 200));
    // cleanup object
    await fetch(`${BASE}/admin/api/digital-files?path=${encodeURIComponent(sign.path)}`, {
      method: 'DELETE', headers: { Cookie: cookie },
    });
  }
}
