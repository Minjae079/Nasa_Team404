import { StoredComparison } from './StoredComparison.jsx';

export function ComparisonScene({ point, onClose }) {
  return (
    <section id="compareScene" className="scene scene-compare" hidden aria-label="NASA SAR observation comparison">
      {point && <StoredComparison key={`${point.lat}:${point.lng}`} point={point} onClose={onClose} />}
    </section>
  );
}
