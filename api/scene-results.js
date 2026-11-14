import { getSupabaseServer, apiJson, databaseError } from '../lib/supabaseServer.js';
import { MOCK_SCENE_INDEX, readSceneIndex, parseMetadata, containsPoint, InvalidSceneBundle, IMAGE_NAMES } from '../lib/sceneBundle.js';

export async function getSceneResults(request, client, { allowMock = process.env.SARSCOPE_ALLOW_MOCK_DATA === 'true' } = {}) {
  const params = new URL(request.url).searchParams;
  const rawLat = params.get('lat'), rawLng = params.get('lng'), id = params.get('id');
  const lat = Number(rawLat), lng = Number(rawLng);
  const hasPoint = rawLat !== null || rawLng !== null;
  if ((hasPoint && (!rawLat?.trim() || !rawLng?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) ||
      (id !== null && !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) || (!hasPoint && !id)) {
    return apiJson({ error: 'INVALID_QUERY' }, 400);
  }
  const bucket = client.storage.from('sarscope-data');
  const indexed = await readSceneIndex(bucket);
  if (allowMock) indexed.push(...await readSceneIndex(bucket, { allowMock: true, indexPath: MOCK_SCENE_INDEX }));
  const rows = indexed.filter(row => row.published &&
    (!row.metadata.synthetic || allowMock) &&
    (!hasPoint || containsPoint(row.metadata, lat, lng)))
    .sort((a, b) => Date.parse(b.metadata.after.observed_at) - Date.parse(a.metadata.after.observed_at) || a.metadata.id.localeCompare(b.metadata.id));
  const selected = (id ? rows.find(row => row.metadata.id === id) : rows[0])?.metadata;
  if (!selected) return apiJson({ state: 'empty', result: null, available: [] });
  const prefix = `results/${selected.id}`;
  const downloaded = await bucket.download(`${prefix}/metadata.json`);
  if (downloaded.error) throw downloaded.error;
  if (downloaded.data.size > 64000) throw new InvalidSceneBundle('Metadata too large');
  let value;
  try { value = JSON.parse(await downloaded.data.text()); } catch { throw new InvalidSceneBundle('Invalid metadata JSON'); }
  const metadata = parseMetadata(value, { allowMock });
  if (JSON.stringify(metadata) !== JSON.stringify(selected)) throw new InvalidSceneBundle('Metadata does not match index');
  const images = {};
  for (const name of IMAGE_NAMES) {
    const signed = await bucket.createSignedUrl(`${prefix}/${name}`, 600);
    if (signed.error || !signed.data?.signedUrl) throw signed.error || new Error('Cannot sign image');
    images[name.replace('.png', '')] = signed.data.signedUrl;
  }
  return apiJson({ state: 'ready', result: { ...metadata, images },
    available: rows.map(({ metadata: m }) => ({ id: m.id, title: m.title, before: m.before.observed_at, after: m.after.observed_at })),
    urls_expire_at: new Date(Date.now() + 600000).toISOString() });
}
export async function GET(request) {
  if (process.env.SARSCOPE_PUBLIC_ANALYSES !== 'true') return apiJson({ state: 'disabled', result: null, available: [] });
  try { return await getSceneResults(request, getSupabaseServer()); }
  catch (error) {
    if (error instanceof InvalidSceneBundle) return apiJson({ error: 'INVALID_SCENE_METADATA' }, 502);
    return databaseError(error);
  }
}
