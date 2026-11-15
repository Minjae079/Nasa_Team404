
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchJson } from '../lib/api.js';

export function FloodAssessmentSiren({ sceneId, monitoringSite }) {
  const [assessment, setAssessment] = useState({
    state: 'loading',
    area: null
  });

  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState(null);

  const buttonRef = useRef(null);
  const tooltipId = useId();

  // Fetch the actual flood assessment for the selected scene.
  useEffect(() => {
    if (!sceneId) {
      setAssessment({ state: 'empty', area: null });
      return;
    }

    const controller = new AbortController();

    setAssessment({ state: 'loading', area: null });

    fetchJson(
      `/api/flood-assessment?id=${encodeURIComponent(sceneId)}`,
      { signal: controller.signal }
    )
      .then(data => {
        if (controller.signal.aborted) return;

        if (
          !data ||
          (data.scene_id && data.scene_id !== sceneId)
        ) {
          throw new Error('Invalid assessment response');
        }

        const unverified =
          data.state === 'unverified' &&
          data.risk_level === 'unknown' &&
          data.assessment?.status === 'candidate_unverified' &&
          data.assessment?.validation_status === 'not_validated';

        const candidateArea =
          data.assessment?.candidate_area_km2;

        const area =
          unverified &&
          typeof candidateArea === 'number' &&
          Number.isFinite(candidateArea) &&
          candidateArea >= 0
            ? candidateArea
            : null;

        setAssessment({
          state: unverified
            ? 'unverified'
            : data.state === 'empty' ||
              data.state === 'not_evaluated' ||
              data.state === 'disabled'
              ? data.state
              : 'unknown',
          area
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setAssessment({
            state: 'error',
            area: null
          });
        }
      });

    return () => controller.abort();
  }, [sceneId]);

  // Determine text without inventing a risk classification.
  let summary = 'Assessment not available.';
  let detail = 'No validated flood assessment is available.';

  if (assessment.state === 'loading') {
    summary = 'Loading assessment…';
    detail = 'Retrieving the stored analysis result.';
  } else if (assessment.state === 'unverified') {
    summary = assessment.area !== null
      ? `Unverified candidate: ${assessment.area.toFixed(4)} km²`
      : 'Unverified water candidate';

    detail =
      'Heuristic water detection. Not confirmed flooding ' +
      'or an official flood warning.';
  } else if (assessment.state === 'not_evaluated') {
    summary = 'Not evaluated.';
    detail = 'No flood assessment has been completed.';
  } else if (assessment.state === 'error') {
    summary = 'Assessment unavailable.';
    detail = 'Unable to retrieve the analysis.';
  } else if (assessment.state === 'disabled') {
    summary = 'Assessment disabled.';
    detail = 'Public analysis is not enabled.';
  }

  const level = monitoringSite?.level ?? 0;
  if (monitoringSite) {
    summary = `Screening: ${['Unassessed', 'Low', 'Elevated', 'High'][level]}`;
    const signal = monitoringSite.candidateShare !== undefined
      ? `V1-long candidate scores ≥ 0.50 on ${monitoringSite.candidateShare.toFixed(2)}% of valid pixels. `
      : '';
    detail = signal + 'Scenario screening level. Experimental, not an official flood warning.';
  }

  const visible = hovered || focused || pinned;

  // Keep the existing floating-popover visual style.
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
        Math.min(desiredTop, window.innerHeight - 160)
      );

      setPosition({ left, top, width });
    };

    const dismiss = event => {
      if (!buttonRef.current?.contains(event.target)) {
        setPinned(false);
      }
    };

    const escape = event => {
      if (event.key === 'Escape') {
        setPinned(false);
        setHovered(false);
        buttonRef.current?.blur();
      }
    };

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

  return (
    <div
      className="sar-console-alert"
      aria-label="Flood assessment status"
    >
      <button
        ref={buttonRef}
        type="button"
        className="sar-insight-button sar-siren-button"
        data-indicator-level={level}
        aria-label={`Flood assessment: ${summary}`}
        aria-describedby={visible ? tooltipId : undefined}
        aria-expanded={visible}
        onPointerEnter={event => {
          if (event.pointerType === 'mouse') {
            setHovered(true);
          }
        }}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={() => setPinned(value => !value)}
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
          <path d="M5 17h14M7 17v-6a5 5 0 0 1 10 0v6M9 21h6M12 3V1M3.5 6.5 2 5M20.5 6.5 22 5M3 12H1M23 12h-2"/>
        </svg>
      </button>

      {visible && position && createPortal(
        <div
          id={tooltipId}
          className="sar-floating-insight-popover"
          role="tooltip"
          style={position}
        >
          <strong>Flood assessment</strong>
          <span>{summary}</span>
          <small>{detail}</small>
        </div>,
        document.body
      )}
    </div>
  );
}
