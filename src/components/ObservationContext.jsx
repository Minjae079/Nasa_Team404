import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
const pendingContext = [
  { key: 'rainfall', label: 'Rainfall', description: 'Accumulation during observations' },
  { key: 'waterHistory', label: 'Water History', description: 'Past water presence / frequency' },
  { key: 'relativeElevation', label: 'Relative Elevation', description: 'Elevation relative to surroundings' },
];

// These acquisition facts apply to the explicitly supported Sacramento Delta bundle.
// Future integrations supply display values and sources without fabricating defaults.
export function ObservationContext({ beforeDate, afterDate, context = {} }) {
  const observations = [
    ['Satellite', 'NASA–ISRO NISAR'], ['Product', 'L2 GCOV'],
    ['Band / Polarization', 'L-band / HH'], ['Frame', '069'],
    ['Before', beforeDate], ['After', afterDate],
  ];
  return <aside className="sar-context" aria-label="Observation and regional context">
    <section className="sar-observation-info">
      <h3>Observation</h3>
      <dl>{observations.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </section>
    <section className="sar-regional-context">
      <h3>Regional context</h3>
      {pendingContext.map(field => <article className="sar-context-card" key={field.key}>
        <h4>{field.label}</h4><p>{field.description}</p>
        <span>{context[field.key]?.value ?? 'Not yet integrated'}</span>
        {context[field.key]?.source && <small>{context[field.key].source}</small>}
      </article>)}
    </section>
    <p className="sar-flood-status">Flood status <span>Not verified</span></p>
  </aside>;
}


// Compact observations for the floating panel. These are deliberately
// unavailable until grounded regional data and its provenance are supplied.
const insightItems = [
  { key: 'rainfall', label: 'Rainfall', short: 'Rainfall not yet integrated.', detail: 'Accumulated precipitation between observations is pending.' },
  { key: 'waterHistory', label: 'Water history', short: 'Water history not yet integrated.', detail: 'Historical water occurrence data is pending.' },
  { key: 'relativeElevation', label: 'Elevation', short: 'Elevation not yet integrated.', detail: 'Elevation relative to nearby terrain is pending.' },
];

function InsightSymbol({ kind }) {
  // Minimal line icons, consistent with the existing scientific console.
  if (kind === 'rainfall') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 16.5a4.5 4.5 0 0 0-3.5-8.7 6.5 6.5 0 0 0-12.7 2.3A4.2 4.2 0 0 0 5 18h1"/><path d="m9 17-1 3m5-3-1 3m5-3-1 3"/>
  </svg>;
  if (kind === 'waterHistory') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 8c2.3 0 2.3-2 5-2s2.7 2 5 2 2.7-2 5-2 2.7 2 5 2M2 14c2.3 0 2.3-2 5-2s2.7 2 5 2 2.7-2 5-2 2.7 2 5 2M2 20c2.3 0 2.3-2 5-2s2.7 2 5 2 2.7-2 5-2 2.7 2 5 2"/>
  </svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m2 20 7-12 4 6 3-4 6 10H2Z"/><path d="m7 11 2 2 2-2"/>
  </svg>;
}

// Popovers use a document-level portal so they can appear *outside* the
// compact console. An inline tooltip would be clipped by its overflow:hidden
// container and would obscure the SAR image instead of the globe.
function InsightTrigger({ label, ariaLabel, summary, detail, className = '', children }) {
  const buttonRef = useRef(null);
  const tooltipId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState(null);
  const visible = hovered || focused || pinned;

  useEffect(() => {
    if (!visible) return;
    const place = () => {
      const button = buttonRef.current;
      if (!button) return;
      const anchor = button.getBoundingClientRect();
      const panel = button.closest('.sar-swipe-dialog')?.getBoundingClientRect() ?? anchor;
      const width = Math.min(234, window.innerWidth - 24);
      const external = window.innerWidth - panel.right >= width + 24;
      // Desktop: open to the right of the analysis console, keeping SAR clear.
      // Narrow viewports: show above the selected icon within the viewport.
      const left = external ? panel.right + 12 : Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
      const desiredTop = external ? anchor.top + anchor.height / 2 - 48 : anchor.top - 116;
      const top = Math.max(12, Math.min(desiredTop, window.innerHeight - 136));
      setPosition({ left, top, width });
    };
    const dismiss = event => {
      if (!buttonRef.current?.contains(event.target)) setPinned(false);
    };
    const escape = event => { if (event.key === 'Escape') { setPinned(false); setHovered(false); buttonRef.current?.blur(); } };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [visible]);

  return <>
    <button ref={buttonRef} type="button" className={`sar-insight-button ${className}`.trim()}
      aria-label={ariaLabel} aria-describedby={visible ? tooltipId : undefined}
      aria-expanded={visible}
      onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onClick={() => setPinned(value => !value)}>
      {children}
    </button>
    {visible && position && createPortal(
      <div id={tooltipId} className="sar-floating-insight-popover" role="tooltip" style={position}>
        <strong>{label}</strong>
        <span>{summary}</span>
        <small>{detail}</small>
      </div>, document.body
    )}
  </>;
}

export function ObservationSiren() {
  // Neutral does not mean safe. Alert colors are intentionally disabled until
  // a scientifically validated model status is available for this region.
  return <div className="sar-console-alert" aria-label="Flood assessment status">
    <InsightTrigger label="Flood assessment" ariaLabel="Flood assessment: not verified"
      summary="Flood detection not verified."
      detail="SAR backscatter changes alone cannot confirm flooding."
      className="sar-siren-button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 17h14M7 17v-6a5 5 0 0 1 10 0v6M9 21h6M12 3V1M3.5 6.5 2 5M20.5 6.5 22 5M3 12H1M23 12h-2"/>
      </svg>
    </InsightTrigger>
  </div>;
}

export function ObservationInsights() {
  return <aside className="sar-insight-rail" aria-label="Regional context insights">
    {insightItems.map(item => <div className="sar-insight-item" key={item.key}>
      <InsightTrigger label={item.label} ariaLabel={`${item.label}: data not yet integrated`}
        summary={item.short} detail={item.detail}>
        <InsightSymbol kind={item.key}/>
      </InsightTrigger>
    </div>)}
  </aside>;
}
