import { useEffect, useRef, useState } from 'react';
import { fetchJson } from '../lib/api.js';
import { monitoringAssets, monitoringSiteAt } from '../lib/monitoringSites.js';
import { SarSwipeComparison } from './SarSwipeComparison.jsx';

const VERIFIED_SWIPE_ID = 'nisar-sacdelta-hh-20261015-20261027-001';

export function StoredComparison({ point, onClose }) {
  const site = monitoringSiteAt(point);
  const [state, setState] = useState({ kind: 'loading', result: null, available: [] });
  const [selectedId, setSelectedId] = useState('');
  const [revision, setRevision] = useState(0);
  const automaticRetry = useRef(false);
  const resultId = useRef('');
  useEffect(() => {
    if (site?.screening === 'scenario') return;
    const controller = new AbortController();
    let refreshTimer;
    // Keep the active console mounted while renewing its signed image URLs.
    setState(previous => selectedId && previous.result?.id !== selectedId
      ? { kind: 'loading', result: null, available: previous.available }
      : { ...previous, kind: 'loading' });
    const params = new URLSearchParams({ lat: String(point.lat), lng: String(point.lng), includeMock: 'false' });
    if (selectedId) params.set('id', selectedId);
    fetchJson(`/api/scene-results?${params}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      if (data.state === 'ready' && (!data.result?.images?.before || !data.result.images.after || !data.result.images.change_overlay)) throw new Error('Invalid images');
      const result = data.result?.synthetic ? null : data.result;
      resultId.current = result?.id || '';
      setState({
        kind: data.result?.synthetic ? 'empty' : data.state,
        result,
        available: result ? data.available || [] : []
      });
      // Renew once when expiry approaches; no polling while a result is absent.
      if (result && Number.isFinite(Date.parse(data.urls_expire_at))) {
        refreshTimer = setTimeout(() => {
          setSelectedId(result.id);
          setRevision(value => value + 1);
        }, Math.max(1000, Date.parse(data.urls_expire_at) - Date.now() - 30000));
      }
    }).catch(error => {
      if (!controller.signal.aborted) setState(previous => ({ ...previous, kind: error.code === 'SUPABASE_NOT_CONFIGURED' ? 'setup' : 'error' }));
    });
    return () => { controller.abort(); clearTimeout(refreshTimer); };
  }, [point.lat, point.lng, selectedId, revision, site]);
  function refresh(automatic = false) {
    if (automatic && automaticRetry.current) return;
    automaticRetry.current = automatic;
    if (resultId.current) setSelectedId(resultId.current);
    setRevision(value => value + 1);
  }
  const messages = {
    loading: 'Loading precomputed results for this location…',
    empty: 'No published analysis covers this location. Choose another region.',
    disabled: 'Published results are not enabled yet.',
    setup: 'The results service is not connected yet.',
    error: 'Unable to load stored results. Please try again.',
    ready: 'Published SAR imagery · SAR signal change is not verified flood detection.',
  };
  const usePackaged = site && (site.screening === 'scenario' ||
    (!state.result && ['empty', 'disabled', 'setup', 'error'].includes(state.kind)));
  const result = usePackaged ? { ...site, images: monitoringAssets(site) } : state.result;
  const matchedSite = site?.id === result?.id ? site : null;
  const sceneSelector = !usePackaged && state.available.length > 1 && result && (
    <label className="sar-scene-selector">
      Observation dates
      <select value={result.id} onChange={event => {
        automaticRetry.current = false;
        setSelectedId(event.target.value);
      }}>
        {state.available.map(item => (
          <option key={item.id} value={item.id}>{item.before.slice(0, 10)} / {item.after.slice(0, 10)}</option>
        ))}
      </select>
    </label>
  );
  return <div className="stored-comparison has-floating-console">
      <aside
        className={`sar-swipe-dialog${!result ? ' sar-floating-placeholder' : ''}`}
        aria-label={!result ? 'Observation availability' : undefined}
        aria-labelledby={result ? 'sar-swipe-title' : undefined}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.stopPropagation(); onClose?.(); }
        }}
      >
        {!result ? <>
          <header className="sar-floating-placeholder-header">
            <span className="sar-console-kicker">NISAR / OBSERVATION</span>
            <button type="button" className="sar-swipe-close" aria-label="Close analysis" onClick={onClose}>✕</button>
          </header>
          <h2>{site?.title ?? 'Selected region'}</h2>
          <p className="sar-floating-coordinates">{point.lat.toFixed(4)}°, {point.lng.toFixed(4)}°</p>
          <div className="sar-floating-availability" role="status" aria-live="polite" data-kind={state.kind}>
            {messages[state.kind] || messages.error}
          </div>
          {state.kind !== 'loading' && <button type="button" className="sar-retry" onClick={() => refresh()}>Refresh availability</button>}
        </> : (
          <SarSwipeComparison
            sceneId={result.id}
            key={`${result.id}:${revision}:${result.images.before}`}
            title={matchedSite?.title ?? result.title}
            sceneSelector={sceneSelector}
            point={point}
            serviceState={usePackaged ? 'ready' : state.kind}
            onRefresh={() => refresh()}
            beforeUrl={result.images.before}
            afterUrl={result.images.after}
            changeUrl={result.images.change_overlay}
            aiUrl={matchedSite ? monitoringAssets(matchedSite).ai : null}
            monitoringSite={matchedSite}
            beforeDate={result.before.observed_at.slice(0, 10)}
            afterDate={result.after.observed_at.slice(0, 10)}
            onImageFailure={() => refresh(true)}
            onClose={onClose}
          />
        )}
      </aside>
  </div>;
}
