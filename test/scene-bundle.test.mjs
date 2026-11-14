import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMetadata, containsPoint, SCENE_INDEX } from '../lib/sceneBundle.js';
import { publishSceneBundle, validateBundle } from '../tools/publish-scene-bundle.mjs';
import { getSceneResults } from '../api/scene-results.js';

const metadata = { version: 1, id: 'chicago-run-1', title: 'Fixture only', crs: 'EPSG:4326', bounds: [-88, 41, -87, 42],
  before: { observed_at: '2026-10-01T00:00:00Z', source_scene_id: 'ASF-before' },
  after: { observed_at: '2026-10-13T00:00:00Z', source_scene_id: 'ASF-after' }, model_version: 'fixture-v1' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V8AAAAASUVORK5CYII=', 'base64');
const images = { 'before.png': png, 'after.png': png, 'change_overlay.png': png };
function storage(failPath) {
  const files = new Map(), uploads = [], signed = [];
  const bucket = {
    async download(name) { return files.has(name) ? { data: new Blob([files.get(name)]) } : { error: { statusCode: '404' } }; },
    async upload(name, bytes, options) {
      uploads.push(name);
      if (name === failPath || (files.has(name) && !options.upsert)) return { error: { message: 'failed' } };
      files.set(name, bytes); return {};
    },
    async createSignedUrl(name, seconds) {
      signed.push(name); assert.equal(seconds, 600);
      return { data: { signedUrl: `https://example.supabase.co/${name}?signed=fixture` } };
    },
  };
  return { files, uploads, signed, client: { storage: { from: name => {
    assert.equal(name, 'sarscope-data'); return bucket;
  }, getBucket: async () => ({ data: { public: false } }) } } };
}
test('bundle publication and geographic API retrieve the matching three images, not legacy results', async () => {
  const s = storage();
  s.files.set('results/manifest.json', 'legacy preserved');
  await publishSceneBundle(s.client, metadata, images);
  assert.deepEqual(s.uploads, ['before.png', 'after.png', 'change_overlay.png', 'metadata.json'].map(x => `results/${metadata.id}/${x}`).concat(SCENE_INDEX));
  assert.equal(s.files.get('results/manifest.json'), 'legacy preserved');
  const response = await getSceneResults(new Request('https://site/api/scene-results?lat=41.5&lng=-87.5'), s.client);
  const body = await response.json();
  assert.equal(body.state, 'ready');
  assert.equal(body.result.id, metadata.id);
  assert.equal(Object.keys(body.result.images).length, 3);
  assert.ok(body.result.images.change_overlay.includes('/change_overlay.png'));
  assert.equal((await (await getSceneResults(new Request('https://site/api/scene-results?lat=0&lng=0'), s.client)).json()).state, 'empty');
  await assert.rejects(publishSceneBundle(s.client, metadata, images), /already exists/);
});
test('latest observation is default; explicit selection retains other region choices', async () => {
  const s = storage();
  await publishSceneBundle(s.client, metadata, images);
  await publishSceneBundle(s.client, { ...metadata, id: 'newer', after: { ...metadata.after, observed_at: '2026-11-01T00:00:00Z' } }, images);
  const query = 'https://site/api/scene-results?lat=41.5&lng=-87.5';
  assert.equal((await (await getSceneResults(new Request(query), s.client)).json()).result.id, 'newer');
  const chosen = await (await getSceneResults(new Request(query + '&id=chicago-run-1'), s.client)).json();
  assert.equal(chosen.result.id, metadata.id);
  assert.equal(chosen.available.length, 2);
  assert.equal((await (await getSceneResults(new Request(query + '&id=unlisted'), s.client)).json()).state, 'empty');
});
test('invalid coordinates, dates, missing PNGs and path-like IDs fail before publication', async () => {
  for (const patch of [{ id: '../bad' }, { crs: 'EPSG:3857' }, { bounds: [1, 2, 3, 1] },
    { before: metadata.after }, { synthetic: true }]) assert.throws(() => parseMetadata({ ...metadata, ...patch }));
  assert.throws(() => validateBundle(metadata, { ...images, 'after.png': Buffer.from('not a PNG') }));
  const s = storage();
  for (const query of ['', '?lat=&lng=0', '?lat=91&lng=0', '?lat=0', '?id=../bad']) {
    assert.equal((await getSceneResults(new Request('https://site/api/scene-results' + query), s.client)).status, 400);
  }
  assert.equal(s.signed.length, 0);
});
test('dateline bounds include both sides and exclude unrelated longitudes', () => {
  const crossing = parseMetadata({ ...metadata, bounds: [170, -10, -170, 10] });
  assert.equal(containsPoint(crossing, 0, 179), true);
  assert.equal(containsPoint(crossing, 0, -179), true);
  assert.equal(containsPoint(crossing, 0, 0), false);
});
test('failed upload never publishes partial bundle; metadata mismatch cannot sign files', async () => {
  const s = storage(`results/${metadata.id}/after.png`);
  await assert.rejects(publishSceneBundle(s.client, metadata, images), /Index unchanged/);
  assert.equal(s.files.has(SCENE_INDEX), false);
  const ready = storage();
  await publishSceneBundle(ready.client, metadata, images);
  ready.files.set(`results/${metadata.id}/metadata.json`, JSON.stringify({ ...metadata, bounds: [0, 0, 1, 1] }));
  await assert.rejects(getSceneResults(new Request('https://site/api/scene-results?id=chicago-run-1'), ready.client), /does not match/);
  assert.equal(ready.signed.length, 0);
});
