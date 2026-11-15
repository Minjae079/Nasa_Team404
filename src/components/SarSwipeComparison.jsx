import { useRef, useState } from 'react';
import { ObservationInsights, ObservationSiren } from './ObservationContext.jsx';

const clamp = value => Math.max(0, Math.min(100, value));

export function SarSwipeComparison({
  title,
  point,
  serviceState,
  onRefresh,
  changeUrl,
  onClose,
  beforeUrl,
  afterUrl,
  beforeDate,
  afterDate,
  onImageFailure,
}) {
  const [mode, setMode] = useState('swipe');
  const [overlayFailed, setOverlayFailed] = useState(false);
  const [split, setSplit] = useState(50);
  const [sizes, setSizes] = useState({});
  const [failed, setFailed] = useState(false);
  const activePointer = useRef(null);


  const before = sizes.before;
  const after = sizes.after;

  const mismatch = Boolean(
    before && after &&
    (before.width !== after.width ||
     before.height !== after.height)
  );

  const ready = Boolean(before && after && !mismatch && !failed);

  const overlayReady = ready && sizes.change && !overlayFailed &&
    sizes.change.width === before.width && sizes.change.height === before.height;
  const overlayMismatch = sizes.change && before &&
    (sizes.change.width !== before.width || sizes.change.height !== before.height);

  function handleLoad(side, event) {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (!naturalWidth || !naturalHeight) {
      setFailed(true);
      return;
    }
    setSizes(old => ({
      ...old,
      [side]: { width: naturalWidth, height: naturalHeight },
    }));
  }

  function updatePosition(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    setSplit(clamp(
      ((event.clientX - rect.left) / rect.width) * 100
    ));
  }

  function pointerDown(event) {
    if (mode !== 'swipe' || !ready || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }
    activePointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updatePosition(event);
  }

  function pointerMove(event) {
    if (activePointer.current === event.pointerId) {
      updatePosition(event);
    }
  }

  function pointerEnd(event) {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function imageError() {
    setFailed(true);
    onImageFailure?.();
  }

  const aspectRatio = before
    ? `${before.width} / ${before.height}`
    : '1828 / 2048';
  const imageAspect = before ? before.width / before.height : 1828 / 2048;

  return (
    <div className="sar-swipe-viewer">
      <header className="sar-console-header">
        <div className="sar-console-heading">
          <span className="sar-console-kicker">NISAR / OBSERVATION</span>
          <div className="sar-console-title-line">
            <h2 id="sar-swipe-title">{title}</h2>
            <p aria-label="Selected coordinates">{Math.abs(point.lat).toFixed(4)}° {point.lat < 0 ? 'S' : 'N'} <span> / </span> {Math.abs(point.lng).toFixed(4)}° {point.lng < 0 ? 'W' : 'E'}</p>
          </div>
        </div>
        <button type="button" className="sar-swipe-close" aria-label="Close analysis" onClick={onClose}>✕</button>
      </header>
      <div className="sar-console-body">
      <section className="sar-console-imagery" aria-label="Satellite imagery">
        <div className="sar-console-toolbar">
          <div className="sar-console-modes" role="group" aria-label="Analysis mode">
            <button type="button" aria-pressed={mode === 'swipe'} onClick={() => setMode('swipe')}>SWIPE</button>
            <button type="button" aria-pressed={mode === 'change'} onClick={() => setMode('change')}>SAR CHANGE</button>
          </div>
          <ObservationSiren />
        </div>
      <div className="sar-imagery-content">
      <div className="sar-imagery-main">
      <div className="sar-swipe-dates">
        <span><strong>BEFORE</strong> {beforeDate}</span>
        <span><strong>AFTER</strong> {afterDate}</span>
      </div>

      <div className="sar-swipe-stage">
        <div
          className={`sar-swipe-frame sar-view-${mode}`}
          style={{ aspectRatio, '--sar-image-aspect': imageAspect }}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerEnd}
          onPointerCancel={pointerEnd}
          onLostPointerCapture={() => { activePointer.current = null; }}
          aria-label={mode === 'swipe' ? 'Drag horizontally to compare two observations' : 'SAR backscatter change'}
        >
          <img
            className="sar-swipe-image"
            aria-hidden={mode === 'change'}
            src={afterUrl}
            alt={`NISAR observation after, ${afterDate}`}
            draggable={false}
            onLoad={event => handleLoad('after', event)}
            onError={imageError}
          />

          <div
            className="sar-swipe-before"
            aria-hidden={mode === 'change'}
            style={{ clipPath: `inset(0 ${100 - split}% 0 0)`, visibility: mode === 'swipe' ? 'visible' : 'hidden' }}
          >
            <img
              className="sar-swipe-image"
              src={beforeUrl}
              alt={`NISAR observation before, ${beforeDate}`}
              draggable={false}
              onLoad={event => handleLoad('before', event)}
              onError={imageError}
            />
          </div>

          <img className="sar-swipe-image sar-change-image" src={changeUrl}
            alt="SAR backscatter change, absolute change of at least 3 dB"
            style={{ visibility: mode === 'change' && overlayReady ? 'visible' : 'hidden' }}
            draggable={false} onLoad={event => handleLoad('change', event)}
            onError={() => { setOverlayFailed(true); onImageFailure?.(); }} />

          {ready && mode === 'swipe' && (
            <div
              className="sar-swipe-boundary"
              style={{ left: `${split}%` }}
              role="slider"
              tabIndex={0}
              aria-label="Before image revealed"
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split)}
              aria-valuetext={`${Math.round(split)}% Before revealed`}
              onKeyDown={event => {
                const positions = { ArrowLeft: split - 1, ArrowDown: split - 1, ArrowRight: split + 1, ArrowUp: split + 1, PageDown: split - 10, PageUp: split + 10, Home: 0, End: 100 };
                if (event.key in positions) { event.preventDefault(); setSplit(clamp(positions[event.key])); }
              }}
            >
              <span className="sar-swipe-handle">‹ ›</span>
            </div>
          )}

          {mode === 'change' && !overlayReady && ready && <div className="sar-swipe-notice" role="status">{overlayFailed ? 'Change image unavailable.' : overlayMismatch ? 'Image dimensions differ.' : 'Loading SAR change…'}</div>}
          {!ready && (
            <div className="sar-swipe-notice" role="status">
              {mismatch
                ? 'Image dimensions differ. Swipe is unavailable.'
                : failed
                  ? 'An image could not be loaded. Try refreshing.'
                  : 'Loading both observations…'}
            </div>
          )}
        </div>
      </div>
      </div>
      <ObservationInsights />
      </div>

      {(failed || mismatch || overlayFailed || overlayMismatch || serviceState === 'error' || serviceState === 'setup') && <button className="sar-retry" type="button" onClick={onRefresh}>Retry images</button>}
      </section>
      </div>
    </div>
  );
}
