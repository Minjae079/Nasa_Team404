import { useEffect, useState } from 'react';
import { fetchJson } from '../lib/api.js';
import { InsightTrigger } from './ObservationContext.jsx';

const floodSignalLabels = ['Unassessed', 'Low flood signal', 'Moderate flood signal', 'High flood signal'];

export function FloodAssessmentSiren({ sceneId, monitoringSite }) {
  const [assessment, setAssessment] = useState('Unassessed');

  useEffect(() => {
    if (!sceneId || monitoringSite) return;
    const controller = new AbortController();
    setAssessment('Loading…');
    fetchJson(`/api/flood-assessment?id=${encodeURIComponent(sceneId)}`, { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        if (data.scene_id && data.scene_id !== sceneId) throw new Error('Unexpected scene');
        setAssessment(data.state === 'unverified' && data.risk_level === 'unknown' &&
          data.assessment?.status === 'candidate_unverified' &&
          data.assessment?.validation_status === 'not_validated' ? 'Possible flooding' : 'Unassessed');
      })
      .catch(() => { if (!controller.signal.aborted) setAssessment('Unavailable'); });
    return () => controller.abort();
  }, [sceneId, monitoringSite]);

  const level = monitoringSite?.level ?? 0;
  const text = monitoringSite ? floodSignalLabels[level] : assessment;
  return <div className="sar-console-alert" aria-label="Flood signal">
    <InsightTrigger text={<span className="sar-insight-value">{text}</span>}
      ariaLabel={level > 0 ? text : `Flood signal: ${text}`} level={level} className="sar-siren-button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 17h14M7 17v-6a5 5 0 1 1 10 0v6M9 21h6M12 3V1M3.5 6.5 2 5M20.5 6.5 22 5M3 12H1M23 12h-2"/>
      </svg>
    </InsightTrigger>
  </div>;
}
