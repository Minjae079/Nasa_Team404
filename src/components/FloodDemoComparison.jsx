import { SarSwipeComparison } from './SarSwipeComparison.jsx';
import { floodDemoSites } from '../lib/floodDemo.js';

export function FloodDemoComparison({ site, point, onChoose, onClose }) {
  const asset = name => `/flood-demo/${site.id}/${name}.webp`;

  return <aside className="sar-swipe-dialog flood-demo-dialog" aria-labelledby="sar-swipe-title" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
  }}>
    <SarSwipeComparison
      key={site.id}
      title={site.title}
      point={point}
      beforeDate={site.before}
      afterDate={site.after}
      beforeUrl={asset('before_sar')}
      afterUrl={asset('after_sar')}
      changeUrl={asset('hh_change')}
      aiUrl={asset('ai_signal_unvalidated')}
      demo={site}
      onClose={onClose}
      onRefresh={() => window.location.reload()}
      siteSelector={<nav className="flood-demo-sites" aria-label="Flood demo sites">
        {floodDemoSites.map(option => <button key={option.id} type="button"
          aria-pressed={site.id === option.id} onClick={() => onChoose(option)}>{option.title}</button>)}
      </nav>}
    />
  </aside>;
}
