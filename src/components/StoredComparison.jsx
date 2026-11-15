import { useEffect, useRef, useState } from 'react';
import { fetchJson } from '../lib/api.js';
import { monitoringAssets, monitoringSiteAt } from '../lib/monitoringSites.js';
import { SarSwipeComparison } from './SarSwipeComparison.jsx';

const VERIFIED_SWIPE_ID = 'nisar-sacdelta-hh-20261015-20261027-001';

function StoredImage({ url, label, onFailure, onExpand }) {
  const [state, setState] = useState('loading');
  return <>
    <div className="sar-image-frame">
      {state === 'loading' && <span className="image-loading" role="status">Loading image…</span>}
      {state === 'error' && <span className="sar-image-error" role="status">Image unavailable. Refresh to try again.</span>}
      <img src={url} alt={label} style={{ display: state === 'ready' ? 'block' : 'none' }}
        onLoad={() => setState('ready')} onError={() => { setState('error'); onFailure(); }} />
    </div>
    <button type="button" className="image-expand" disabled={state !== 'ready'} onClick={() => onExpand({ url, title: label })}>↗ Expand image</button>
  </>;
}

export function StoredComparison({ point, onClose }) {
  const site = monitoringSiteAt(point);
  const [state, setState] = useState({ kind: 'loading', result: null, available: [] });
  const [selectedId, setSelectedId] = useState('');
  const [revision, setRevision] = useState(0);
  const [showChange, setShowChange] = useState(false);
  const [preview, setPreview] = useState(null);
  const dialog = useRef(null);
  const automaticRetry = useRef(false);
  const resultId = useRef('');
  useEffect(() => {
    if (site?.screening === 'scenario') return;
    const controller = new AbortController();
    let refreshTimer;
    setPreview(null);
    dialog.current?.close();
    // Keep the active console mounted while renewing its signed image URLs.
    setState(previous => selectedId && previous.result?.id !== selectedId
      ? { kind: 'loading', result: null, available: previous.available }
      : { ...previous, kind: 'loading' });
    const params = new URLSearchParams({ lat: String(point.lat), lng: String(point.lng) });
    if (selectedId) params.set('id', selectedId);
    fetchJson(`/api/scene-results?${params}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      if (data.state === 'ready' && (!data.result?.images?.before || !data.result.images.after || !data.result.images.change_overlay)) throw new Error('Invalid images');
      resultId.current = data.result?.id || '';
      setState({ kind: data.state, result: data.result, available: data.available || [] });
      // Renew once when expiry approaches; no polling while a result is absent.
      if (data.result && Number.isFinite(Date.parse(data.urls_expire_at))) {
        refreshTimer = setTimeout(() => {
          setSelectedId(data.result.id);
          setRevision(value => value + 1);
        }, Math.max(1000, Date.parse(data.urls_expire_at) - Date.now() - 30000));
      }
    }).catch(error => {
      if (!controller.signal.aborted) setState(previous => ({ ...previous, kind: error.code === 'SUPABASE_NOT_CONFIGURED' ? 'setup' : 'error' }));
    });
    return () => { controller.abort(); clearTimeout(refreshTimer); };
  }, [point.lat, point.lng, selectedId, revision, site]);
  useEffect(() => {
    if (preview && !dialog.current.open) dialog.current.showModal();
  }, [preview]);
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
  const floating = result && !result.synthetic && (matchedSite || result.id === VERIFIED_SWIPE_ID);
  return <div className={`stored-comparison${floating ? ' has-floating-console' : ''}`}>
    <div className="compare-status" role="status" aria-live="polite" data-kind={state.kind}>
      {state.result?.synthetic ? 'MOCK DATA · Connection test only. Not satellite imagery or a real model analysis.' : messages[state.kind] || messages.error}
      {state.kind !== 'loading' && <button className="stored-refresh" type="button" onClick={() => refresh()}>Refresh</button>}
    </div>
    {result && !floating && <>
      <div className="compare-chooser">
        <label htmlFor="storedResultSelect">{result.synthetic ? 'Test bundle' : 'Published analysis'}</label>
        <select id="storedResultSelect" value={result.id} onChange={event => {
          automaticRetry.current = false; setShowChange(false); setSelectedId(event.target.value);
        }}>
          {state.available.map(item => <option key={item.id} value={item.id}>{item.title} · {item.after.slice(0, 10)}</option>)}
        </select>
        <div className="stored-mode" role="group" aria-label="Observation view">
          <button type="button" aria-pressed={!showChange} onClick={() => setShowChange(false)}>After</button>
          <button type="button" aria-pressed={showChange} onClick={() => setShowChange(true)}>Change image</button>
        </div>
      </div>
      <div className="sar-compare-grid stored-grid">
        {['before', 'after'].map(side => {
          const imageKey = side === 'after' && showChange ? 'change_overlay' : side;
          const label = `${result.title} · ${imageKey} · ${result[side].observed_at.slice(0, 10)}`;
          return <article className="sar-photo-panel" key={side}>
            <div className="sar-photo-heading"><div><span className="sar-kicker">{imageKey === 'change_overlay' ? '02 / CHANGE IMAGE' : side === 'before' ? '01 / BEFORE' : '02 / AFTER'}</span>
              <h3>{result[side].observed_at.slice(0, 10)}</h3></div><span className="sar-photo-pill">{result.synthetic ? 'MOCK DATA' : imageKey === 'change_overlay' ? 'SAR CHANGE' : 'NISAR OBSERVATION'}</span></div>
            <StoredImage key={`${result.id}:${imageKey}:${revision}`} url={result.images[imageKey]} label={label} onFailure={() => refresh(true)} onExpand={setPreview} />
            <div className="sar-file-meta"><span title={result[side].source_scene_id}>{result[side].source_scene_id}</span><span>{result.model_version}</span></div>
          </article>;
        })}
      </div>
    </>}
    {(!result || floating) && (
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
            title={matchedSite?.title ?? 'Sacramento Delta'}
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
    )}
    <dialog ref={dialog} className="observation-dialog" onClose={() => setPreview(null)} aria-labelledby="stored-preview-title">
      <header><h2 id="stored-preview-title">{preview?.title}</h2><button className="btn btn-outline" type="button" onClick={() => dialog.current.close()}>Close image</button></header>
      {preview && <img src={preview.url} alt={preview.title} />}
      <p>Precomputed image. Change image is shown independently; map alignment and risk interpretation are not inferred.</p>
    </dialog>
  </div>;
}
