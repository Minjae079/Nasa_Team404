
import {
  getSupabaseServer,
  apiJson,
  databaseError
} from '../lib/supabaseServer.js';

import { monitoringSites } from '../src/lib/monitoringSites.js';

import {
  readSceneIndex
} from '../lib/sceneBundle.js';

const METRICS = [
  'rainfall',
  'waterHistory',
  'relativeElevation'
];

export async function getSceneContext(request, client) {
  const params = new URL(request.url).searchParams;
  const id = params.get('id');

  // 기존 scene-results API와 동일한 ID 검증
  if (!id || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) {
    return apiJson({ error: 'INVALID_QUERY' }, 400);
  }

  // Bundled monitoring sites have real imagery even if Storage is unavailable.
  if (!monitoringSites.some(site => site.id === id)) {
    const bucket = client.storage.from('sarscope-data');
    const index = await readSceneIndex(bucket);
    const published = index.some(row =>
      row.published && !row.metadata.synthetic && row.metadata.id === id
    );
    if (!published) return apiJson({ state: 'empty', result: null });
  }

  // Supabase PostgreSQL에서 환경 지표 조회
  const { data, error } = await client
    .from('sarscope_scene_metrics')
    .select(`
      metric,
      status,
      value,
      unit,
      attention_level,
      source_name,
      source_url,
      period_start,
      period_end,
      reference_period,
      spatial_method,
      calculation_method
    `)
    .eq('scene_id', id)
    .in('metric', METRICS);

  if (error) throw error;

  const metrics = {};

  for (const name of METRICS) {
    const row = data.find(item => item.metric === name);

    metrics[name] = row
      ? {
          ...row,
          value: row.status === 'available'
            ? row.value
            : null
        }
      : {
          metric: name,
          status: 'pending',
          value: null,
          attention_level: 'unknown'
        };
  }

  const allAvailable = METRICS.every(
    name => metrics[name].status === 'available'
  );

  return apiJson({
    state: allAvailable ? 'ready' : 'partial',
    scene_id: id,
    metrics
  });
}

export async function GET(request) {
  if (process.env.SARSCOPE_PUBLIC_ANALYSES !== 'true') {
    return apiJson({
      state: 'disabled',
      result: null
    });
  }

  try {
    return await getSceneContext(
      request,
      getSupabaseServer()
    );
  } catch (error) {
    return databaseError(error);
  }
}
