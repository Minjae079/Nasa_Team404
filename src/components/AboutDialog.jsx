import { ConnectionStatus } from './ConnectionStatus.jsx';

export function AboutDialog() {
  return (
    <div id="aboutModal" className="modal-backdrop" hidden>
      <section className="about-modal observation-guide" role="dialog" aria-modal="true"
        aria-labelledby="modalTitle" aria-describedby="guide-intro">
        <button className="modal-close" id="closeAbout" aria-label="Close dialog">×</button>
        <h2 id="modalTitle">How it works</h2>
        <p id="guide-intro">Compare NISAR radar images from two dates and inspect possible changes in surface water.</p>

        <div className="guide-workflow">
          <section className="guide-card">
            <h3>Choose an observation</h3>
            <p>Rotate or zoom the globe. Select a pin, enter coordinates, or use <strong>Explore Chicago</strong>.</p>
            <p>White pins are shortcuts. The panel shows the actual region and coordinates of its radar images.</p>
          </section>
          <section className="guide-card">
            <h3>Compare two dates</h3>
            <dl className="guide-modes">
              <div><dt>SWIPE</dt><dd>Drag to compare the earlier and later radar images.</dd></div>
              <div><dt>Radar change</dt><dd>See where the radar return changed between dates.</dd></div>
              <div><dt>Flood candidates</dt><dd>Where available, blue marks areas flagged by the model.</dd></div>
            </dl>
          </section>
          <section className="guide-card">
            <h3>Inspect the context</h3>
            <p>Hover over the siren for the screening level. The other icons show <strong>7-day rainfall</strong>, <strong>historical water occurrence</strong>, and <strong>relative elevation</strong>.</p>
            <p>Some supporting readings are illustrative.</p>
          </section>
        </div>

        <ul className="guide-legend" aria-label="Globe marker colors">
          <li data-level="0">Observation shortcut</li>
          <li data-level="1">Low screening</li>
          <li data-level="2">Caution</li>
          <li data-level="3">Experimental warning</li>
        </ul>
        <p className="guide-notice">The flood layer shows experimental model candidates. Confirm conditions using local observations and official alerts.</p>

        <footer className="guide-footer">
          <details className="guide-connection"><summary>Data connection</summary><ConnectionStatus /></details>
          <button className="btn btn-primary" id="startExplore">Start exploring <span aria-hidden="true">↗</span></button>
        </footer>
      </section>
    </div>
  );
}
