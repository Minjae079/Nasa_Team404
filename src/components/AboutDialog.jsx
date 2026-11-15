import { ConnectionStatus } from './ConnectionStatus.jsx';

export function AboutDialog() {
  return (<div id="aboutModal" className="modal-backdrop" hidden>
    <section className="about-modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <button className="modal-close" id="closeAbout" aria-label="Close dialog">×</button>
      <span className="eyebrow"><span className="eyebrow-line"></span> HOW IT WORKS</span>
      <h2 id="modalTitle">From globe to ground.</h2>
      <p>Use your mouse or touch to rotate the 3D Earth. Select a monitoring marker or enter coordinates to compare available observations. Explore Chicago takes you straight to the Chicago study area.</p>
      <div className="modal-steps">
        <div><span>01</span><strong>Explore the globe</strong><p>Rotate, zoom, and choose a location.</p></div>
        <div><span>02</span><strong>Inspect the location</strong><p>Select a pin or enter coordinates to find an observation.</p></div>
        <div><span>03</span><strong>View processed imagery</strong><p>Review before and after radar images, detected radar changes, and experimental flood candidates where available.</p></div>
      </div>
      <div className="modal-caution">Flood candidates and screening levels are experimental. Some supporting readings are illustrative. White pins are shortcuts to radar observations elsewhere. The observation panel shows the actual source location.</div>
      <ConnectionStatus /><hr />
      <button className="btn btn-primary" id="startExplore">Start exploring <span>↗</span></button>
    </section>
  </div>);
}
