
import {
  getSupabaseServer,
  apiJson,
  databaseError
} from '../lib/supabaseServer.js';

import {
  readSceneIndex
} from '../lib/sceneBundle.js';

export async function getFloodAssessment(request, client) {
  const params = new URL(request.url).searchParams;
  const id = params.get('id');

  // Validate scene ID.
  if (!id || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) {
    return apiJson({ error: 'INVALID_QUERY' }, 400);
  }

  // Only expose assessments for published, real scenes.
  const bucket = client.storage.from('sarscope-data');
  const index = await readSceneIndex(bucket);

  const published = index.some(row =>
    row.published &&
    !row.metadata.synthetic &&
    row.metadata.id === id
  );

  if (!published) {
    return apiJson({
      state: 'empty',
      scene_id: id,
      risk_level: 'unknown',
      assessment: null
    });
  }

  // Read the stored flood assessment.
  const { data, error } = await client
    .from('sarscope_flood_assessments')
    .select(`
      scene_id,
      status,
      method,
      validation_status,
      candidate_area_km2,
      model_version,
      decision_policy_id,
      validation_report_url,
      source_name,
      updated_at
    `)
    .eq('scene_id', id)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return apiJson({
      state: 'not_evaluated',
      scene_id: id,
      risk_level: 'unknown',
      assessment: null
    });
  }

  // A detected candidate is not a confirmed flood.
  const isUnverifiedCandidate =
    data.status === 'candidate_unverified' &&
    data.validation_status === 'not_validated';

  const candidateArea =
    isUnverifiedCandidate &&
    typeof data.candidate_area_km2 === 'number' &&
    Number.isFinite(data.candidate_area_km2) &&
    data.candidate_area_km2 >= 0
      ? data.candidate_area_km2
      : null;

  // No validated severity policy is active.
  // Never infer LOW, WATCH, or HIGH from candidate area.
  return apiJson({
    state: isUnverifiedCandidate
      ? 'unverified'
      : 'not_evaluated',

    scene_id: id,
    risk_level: 'unknown',
    official_warning: false,

    assessment: {
      status: data.status,
      validation_status: data.validation_status,
      method: data.method,
      candidate_area_km2: candidateArea,
      model_version: data.model_version,
      decision_policy_id: data.decision_policy_id,
      validation_report_url: data.validation_report_url,
      source_name: data.source_name,
      updated_at: data.updated_at
    },

    disclaimer:
      'Experimental water-change candidate. ' +
      'Not confirmed flooding or an official warning.'
  });
}

export async function GET(request) {
  if (process.env.SARSCOPE_PUBLIC_ANALYSES !== 'true') {
    return apiJson({
      state: 'disabled',
      risk_level: 'unknown',
      assessment: null
    });
  }

  try {
    return await getFloodAssessment(
      request,
      getSupabaseServer()
    );
  } catch (error) {
    return databaseError(error);
  }
}
