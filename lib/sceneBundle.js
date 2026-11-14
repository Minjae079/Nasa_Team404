export const SCENE_INDEX = 'results/scenes.json';
export const MOCK_SCENE_INDEX = 'results/mock-scenes.json';
export const IMAGE_NAMES = ['before.png', 'after.png', 'change_overlay.png'];
export class InvalidSceneBundle extends Error {}
const fail = message => { throw new InvalidSceneBundle(message); };
const text = (value, name) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) fail(`Invalid ${name}`);
  return value;
};
export function parseMetadata(input, { allowMock = false } = {}) {
  if (!input || input.version !== 1) fail('metadata version must be 1');
  const id = text(input.id, 'id');
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) fail('Invalid result ID');
  const synthetic = input.synthetic === true || input.is_demo === true;
  if (synthetic && (!allowMock || input.synthetic !== true || !id.startsWith('mock-') ||
      typeof input.title !== 'string' || !input.title.startsWith('[MOCK] ') ||
      typeof input.model_version !== 'string' || !input.model_version.startsWith('mock-'))) {
    fail('Synthetic results require explicit mock mode, mock- ID/version and [MOCK] title');
  }
  if (input.crs !== 'EPSG:4326') fail('Use EPSG:4326 longitude/latitude bounds');
  const b = input.bounds;
  if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isFinite) ||
      b[0] < -180 || b[0] > 180 || b[2] < -180 || b[2] > 180 ||
      b[1] < -90 || b[3] > 90 || b[1] >= b[3] || b[0] === b[2]) fail('Invalid [west,south,east,north] bounds');
  const observation = (value, name) => {
    if (!value) fail(`Missing ${name}`);
    const observed_at = text(value.observed_at, `${name}.observed_at`);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(observed_at) || !Number.isFinite(Date.parse(observed_at)) ||
        new Date(observed_at).toISOString().slice(0, 19) !== observed_at.slice(0, 19)) fail('Use valid UTC observation timestamps');
    return { observed_at, source_scene_id: text(value.source_scene_id, `${name}.source_scene_id`) };
  };
  const before = observation(input.before, 'before'), after = observation(input.after, 'after');
  if (Date.parse(before.observed_at) >= Date.parse(after.observed_at)) fail('Before must precede after');
  if (before.source_scene_id === after.source_scene_id) fail('Use distinct source observations');
  return { version: 1, id, title: text(input.title, 'title'), crs: input.crs, bounds: [...b], before, after,
    model_version: text(input.model_version, 'model_version'), ...(synthetic ? { synthetic: true } : {}) };
}
export function containsPoint(metadata, lat, lng) {
  const [west, south, east, north] = metadata.bounds;
  return lat >= south && lat <= north && (west <= east ? lng >= west && lng <= east : lng >= west || lng <= east);
}
export function parseSceneIndex(value, options = {}) {
  if (!value || value.version !== 1 || !Array.isArray(value.results) || value.results.length > 5000) fail('Invalid scene index');
  const ids = new Set();
  return value.results.map(row => {
    const metadata = parseMetadata(row.metadata, options);
    if (ids.has(metadata.id) || typeof row.published !== 'boolean') fail('Duplicate ID or invalid publication state');
    ids.add(metadata.id);
    return { published: row.published, metadata };
  });
}
export const missingObject = error => String(error?.statusCode) === '404' || error?.code === 'NoSuchKey';
export async function readSceneIndex(bucket, options = {}) {
  const { data, error } = await bucket.download(options.indexPath || SCENE_INDEX);
  if (error) { if (missingObject(error)) return []; throw error; }
  if (data.size > 8000000) fail('Scene index too large');
  let value;
  try { value = JSON.parse(await data.text()); } catch { fail('Invalid scene index JSON'); }
  return parseSceneIndex(value, options);
}
