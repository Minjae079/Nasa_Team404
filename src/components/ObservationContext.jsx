
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchJson } from '../lib/api.js';

// Regional observations shown in the analysis panel.
const pendingContext = [
  {
    key: 'rainfall',
    label: 'Rainfall',
    description: 'Satellite-estimated precipitation'
  },
  {
    key: 'waterHistory',
    label: 'Water History',
    description: 'Historical surface water occurrence'
  },
  {
    key: 'relativeElevation',
    label: 'Relative Elevation',
    description: 'Elevation relative to nearby terrain'
  },
];

// Legacy observation detail panel.
// The compact icon rail below uses the live scene-context API.
export function ObservationContext({
  beforeDate,
  afterDate,
  context = {}
}) {
  const observations = [
    ['Satellite', 'NASA–ISRO NISAR'],
    ['Product', 'L2 GCOV'],
    ['Band / Polarization', 'L-band / HH'],
    ['Frame', '069'],
    ['Before', beforeDate],
    ['After', afterDate],
  ];

  return (
    <aside
      className="sar-context"
      aria-label="Observation and regional context"
    >
      <section className="sar-observation-info">
        <h3>Observation</h3>
        <dl>
          {observations.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="sar-regional-context">
        <h3>Regional context</h3>

        {pendingContext.map(field => (
          <article className="sar-context-card" key={field.key}>
            <h4>{field.label}</h4>
            <p>{field.description}</p>

            <span>
              {context[field.key]?.value ?? 'Not yet integrated'}
            </span>

            {context[field.key]?.source && (
              <small>{context[field.key].source}</small>
            )}
          </article>
        ))}
      </section>

      <p className="sar-flood-status">
        Flood status <span>Not verified</span>
      </p>
    </aside>
  );
}

// Supported environmental indicators.
const insightItems = [
  {
    key: 'rainfall',
    label: 'Rainfall',
  },
  {
    key: 'waterHistory',
    label: 'Water history',
  },
  {
    key: 'relativeElevation',
    label: 'Elevation',
  },
];

const EXPECTED_UNITS = {
  rainfall: 'mm',
  waterHistory: 'percent',
  relativeElevation: 'm',
};

// Show a value only when the API provides an available
// numeric measurement with the expected unit.
function formatMetric(key, metric) {
  if (
    !metric ||
    metric.status !== 'available' ||
    typeof metric.value !== 'number' ||
    !Number.isFinite(metric.value) ||
    metric.unit !== EXPECTED_UNITS[key]
  ) {
    return null;
  }

  const value = metric.value;

  switch (key) {
    case 'rainfall':
      return `${value.toFixed(2)} mm`;

    case 'waterHistory':
      return `${value.toFixed(2)}%`;

    case 'relativeElevation':
      return `${value >= 0 ? '+' : ''}${value.toFixed(3)} m`;

    default:
      return null;
  }
}

// Presentation bands for independent context indicators, not flood thresholds.
function indicatorLevel(key, value) {
  if (key === 'rainfall') return value < 10 ? 1 : value < 100 ? 2 : 3;
  if (key === 'waterHistory') return value < 5 ? 0 : value < 20 ? 1 : value < 30 ? 2 : 3;
  return value >= -0.5 ? 1 : value >= -1.5 ? 2 : 3;
}

// Keep scientific interpretation distinct from flood assessment.
function metricDescription(key) {
  switch (key) {
    case 'rainfall':
      return '7-day rainfall at this point.';
    case 'waterHistory':
      return 'Historical water coverage within 2 km; not flood probability.';
    case 'relativeElevation':
      return 'Height relative to nearby terrain; not flood depth.';
    default:
      return 'Environmental context only.';
  }
}

function InsightSymbol({ kind }) {
  // Original minimalist icon design preserved.
  if (kind === 'rainfall') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 16.5a4.5 4.5 0 0 0-3.5-8.7 6.5 6.5 0 0 0-12.7 2.3A4.2 4.2 0 0 0 5 18h1" />
        <path d="m9 17-1 3m5-3-1 3m5-3-1 3" />
      </svg>
    );
  }

  if (kind === 'waterHistory') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2 8c2.3 0 2.3-2 5-2s2.7 2 5 2 2.7-2 5-2 2.7 2 5 2M2 14c2.3 0 2.3-2 5-2s2.7 2 5 2 2.7-2 5-2 2.7 2 5 2M2 20c2.3 0 2.3-2 5-2s2.7 2 5 2 2.7-2 5-2 2.7 2 5 2" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m2 20 7-12 4 6 3-4 6 10H2Z" />
      <path d="m7 11 2 2 2-2" />
    </svg>
  );
}

// Show descriptions only while the pointer is over an icon.
function InsightTrigger({
  label,
  ariaLabel,
  summary,
  detail,
  className = '',
  level,
  children
}) {
  const buttonRef = useRef(null);
  const tooltipId = useId();

  const [hovered, setHovered] = useState(false);
  const [position, setPosition] = useState(null);

  const visible = hovered;

  useEffect(() => {
    if (!visible) return;

    const place = () => {
      const button = buttonRef.current;
      if (!button) return;

      const anchor = button.getBoundingClientRect();

      const panel =
        button.closest('.sar-swipe-dialog')
          ?.getBoundingClientRect() ?? anchor;

      const width = Math.min(234, window.innerWidth - 24);

      const external =
        window.innerWidth - panel.right >= width + 24;

      const left = external
        ? panel.right + 12
        : Math.max(
            12,
            Math.min(
              anchor.left,
              window.innerWidth - width - 12
            )
          );

      const desiredTop = external
        ? anchor.top + anchor.height / 2 - 48
        : anchor.top - 116;

      const top = Math.max(
        12,
        Math.min(desiredTop, window.innerHeight - 136)
      );

      setPosition({ left, top, width });
    };

    const escape = event => {
      if (event.key === 'Escape') {
        setHovered(false);
        buttonRef.current?.blur();
      }
    };

    place();

    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('keydown', escape);

    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('keydown', escape);
    };
  }, [visible]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`sar-insight-button ${className}`.trim()}
        aria-label={ariaLabel}
        data-indicator-level={level}
        aria-describedby={visible ? tooltipId : undefined}
        aria-expanded={visible}
        onPointerEnter={event => {
          if (event.pointerType === 'mouse') {
            setHovered(true);
          }
        }}
        onPointerLeave={() => setHovered(false)}
        onPointerCancel={() => setHovered(false)}
      >
        {children}
      </button>

      {visible && position && createPortal(
        <div
          id={tooltipId}
          className="sar-floating-insight-popover"
          role="tooltip"
          style={position}
        >
          <strong>{label}</strong>
          <span>{summary}</span>
          <small>{detail}</small>
        </div>,
        document.body
      )}
    </>
  );
}

// Flood Alert remains independent from environmental context.
// No unvalidated danger/safety classification is displayed.
export function ObservationSiren() {
  return (
    <div
      className="sar-console-alert"
      aria-label="Flood assessment status"
    >
      <InsightTrigger
        label="Flood assessment"
        ariaLabel="Flood assessment: not verified"
        summary="Not verified."
        detail="SAR changes alone do not confirm flooding."
        className="sar-siren-button"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 17h14M7 17v-6a5 5 0 0 1 10 0v6M9 21h6M12 3V1M3.5 6.5 2 5M20.5 6.5 22 5M3 12H1M23 12h-2" />
        </svg>
      </InsightTrigger>
    </div>
  );
}

// Live regional context from the scene-context API.
export function ObservationInsights({ sceneId }) {
  const [context, setContext] = useState({
    state: 'loading',
    metrics: {}
  });

  useEffect(() => {
    if (!sceneId) {
      setContext({
        state: 'empty',
        metrics: {}
      });
      return;
    }

    const controller = new AbortController();

    setContext({
      state: 'loading',
      metrics: {}
    });

    const url =
      `/api/scene-context?id=${encodeURIComponent(sceneId)}`;

    fetchJson(url, { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;

        if (
          !['ready', 'partial'].includes(data.state) ||
          data.scene_id !== sceneId ||
          !data.metrics ||
          typeof data.metrics !== 'object'
        ) {
          throw new Error('Invalid scene context response');
        }

        setContext({
          state: data.state,
          metrics: data.metrics
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setContext({
            state: 'error',
            metrics: {}
          });
        }
      });

    // Cancel stale requests when the scene changes
    // or the panel is unmounted.
    return () => controller.abort();
  }, [sceneId]);

  return (
    <aside
      className="sar-insight-rail"
      aria-label="Regional context insights"
    >
      {insightItems.map(item => {
        const metric = context.metrics[item.key];
        const value = formatMetric(item.key, metric);

        let summary;
        let detail;

        if (value !== null) {
          summary = value;
          detail = metric.source_name === 'SARscope manual entry'
            ? `Manual context input. ${metricDescription(item.key)}`
            : metricDescription(item.key);
        } else if (context.state === 'loading') {
          summary = 'Loading data…';
          detail = 'Retrieving regional environmental context.';
        } else if (context.state === 'error') {
          summary = 'Data unavailable.';
          detail = 'Unable to load context. Refresh the analysis.';
        } else {
          summary = 'Not available.';
          detail = 'No available regional data for this scene.';
        }

        return (
          <div
            className="sar-insight-item"
            key={item.key}
          >
            <InsightTrigger
              label={item.label}
              ariaLabel={`${item.label}: ${summary}`}
              summary={summary}
              detail={detail}
              level={value !== null ? indicatorLevel(item.key, metric.value) : 0}
            >
              <InsightSymbol kind={item.key} />
            </InsightTrigger>
          </div>
        );
      })}
    </aside>
  );
}
