import { ConnectionStatus } from './ConnectionStatus.jsx';

export function AboutDialog() {
  return (
    <div id="aboutModal" className="modal-backdrop" hidden>
      <section className="about-modal observation-guide" role="dialog" aria-modal="true"
        aria-labelledby="modalTitle" aria-describedby="guide-intro">
        <button className="modal-close" id="closeAbout" aria-label="Close dialog">×</button>
        <h2 id="modalTitle">How it works</h2>
        <p id="guide-intro">Choose a pin or enter coordinates to see how a place looks on two different dates.</p>

        <dl className="guide-modes">
          <div><dt>SWIPE</dt><dd>Drag the divider to compare the two NISAR images.</dd></div>
          <div><dt>Radar change</dt><dd>Look for places where the radar return changed.</dd></div>
          <div><dt>Possible flooding</dt><dd>Blue shows where the model found signs of flooding.</dd></div>
        </dl>

        <p className="guide-context">Hover over the icons to see the flood signal, 7-day rainfall, how often water was observed, and elevation vs. nearby terrain. Some of these readings are illustrative.</p>
        <ul className="guide-legend" aria-label="Globe marker colors">
          <li data-level="0">Shortcut</li>
          <li data-level="1">Low flood signal</li>
          <li data-level="2">Moderate flood signal</li>
          <li data-level="3">High flood signal</li>
        </ul>
        <p className="guide-context">White pins open observations elsewhere. The panel shows where the images were taken.</p>

        <section className="guide-model">
          <h3>Where the blue comes from</h3>
          <p>We trained a Temporal U-Net on labeled Sentinel-1 radar pairs from GEOID-Flood to distinguish floodwater, permanent water, and background. The blue areas show results we generated from NISAR image pairs for review.</p>
        </section>

        <footer className="guide-footer">
          <details className="guide-connection"><summary>Data connection</summary><ConnectionStatus /></details>
          <button className="btn btn-primary" id="startExplore">Start exploring <span aria-hidden="true">↗</span></button>
        </footer>
      </section>
    </div>
  );
}
