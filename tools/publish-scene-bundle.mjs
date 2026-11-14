import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { getSupabaseServer } from '../lib/supabaseServer.js';
import { SCENE_INDEX, MOCK_SCENE_INDEX, IMAGE_NAMES, parseMetadata, readSceneIndex, parseSceneIndex } from '../lib/sceneBundle.js';

export function validateBundle(input, images, options = {}) {
  const metadata = parseMetadata(input, options);
  for (const name of IMAGE_NAMES) {
    const bytes = images[name];
    if (!Buffer.isBuffer(bytes) || bytes.length < 45 ||
        !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
        bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR' ||
        !bytes.readUInt32BE(16) || !bytes.readUInt32BE(20) || bytes.toString('ascii', bytes.length - 8, bytes.length - 4) !== 'IEND') {
      throw new Error(`Invalid or missing PNG: ${name}`);
    }
  }
  return metadata;
}
export async function publishSceneBundle(client, input, images, options = {}) {
  const metadata = validateBundle(input, images, options);
  const check = await client.storage.getBucket('sarscope-data');
  if (check.error || check.data?.public !== false) throw new Error('Private sarscope-data bucket required');
  const bucket = client.storage.from('sarscope-data');
  const indexPath = metadata.synthetic ? MOCK_SCENE_INDEX : SCENE_INDEX;
  const rows = await readSceneIndex(bucket, { allowMock: !!metadata.synthetic, indexPath });
  if (rows.some(row => row.metadata.id === metadata.id)) throw new Error('Result ID already exists; use a new ID');
  const index = { version: 1, results: [...rows, { published: true, metadata }] };
  parseSceneIndex(index, { allowMock: true });
  const indexBytes = Buffer.from(JSON.stringify(index, null, 2));
  if (indexBytes.length > 8000000) throw new Error('Scene index too large');
  const prefix = `results/${metadata.id}`;
  // Single publisher only. Incomplete uploads remain unlisted; never delete existing files.
  for (const name of [...IMAGE_NAMES, 'metadata.json']) {
    const bytes = name === 'metadata.json' ? Buffer.from(JSON.stringify(metadata, null, 2)) : images[name];
    const result = await bucket.upload(`${prefix}/${name}`, bytes, {
      contentType: name.endsWith('.png') ? 'image/png' : 'application/json', upsert: false,
    });
    if (result.error) throw new Error(`Upload failed: ${name}. Index unchanged. Inspect partial files; retry with a new ID.`);
  }
  const saved = await bucket.upload(indexPath, indexBytes, { contentType: 'application/json', upsert: true });
  if (saved.error) throw new Error('Files uploaded but index update failed. Inspect files before retrying with a new ID.');
  return metadata.id;
}
async function main() {
  const { values } = parseArgs({ options: { dir: { type: 'string' }, publish: { type: 'boolean', default: false }, 'allow-mock': { type: 'boolean', default: false } } });
  if (!values.dir) throw new Error('Use --dir OUTPUT_FOLDER [--publish]');
  const input = JSON.parse((await fs.readFile(path.join(values.dir, 'metadata.json'), 'utf8')).replace(/^\uFEFF/, ''));
  const images = Object.fromEntries(await Promise.all(IMAGE_NAMES.map(async name => [name, await fs.readFile(path.join(values.dir, name))])));
  const options = { allowMock: values['allow-mock'] };
  const metadata = validateBundle(input, images, options);
  if (!values.publish) { console.log(`Validated ${metadata.id}: 3 PNGs + metadata.json. No upload. Add --publish to publish.`); return; }
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  console.log('Published:', await publishSceneBundle(getSupabaseServer(), input, images, options));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
