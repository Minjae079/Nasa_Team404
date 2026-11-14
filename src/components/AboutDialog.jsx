import { ConnectionStatus } from './ConnectionStatus.jsx';

export function AboutDialog({ onOpenModelResults }) {
  return (<div id="aboutModal" className="modal-backdrop" hidden>
    <section className="about-modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <button className="modal-close" id="closeAbout" aria-label="Close dialog">×</button>
      <span className="eyebrow"><span className="eyebrow-line"></span> HOW IT WORKS</span>
      <h2 id="modalTitle">From globe to ground.</h2>
      <p>Use your mouse or touch to rotate the 3D Earth. Click any location to compare available observations, then open the local map for a closer look. The Illinois Tech shortcut takes you straight to the planned study area.</p>
      <div className="modal-steps">
        <div><span>01</span><strong>Explore the globe</strong><p>Rotate, zoom, and choose a location.</p></div>
        <div><span>02</span><strong>Inspect the location</strong><p>Switch between street and satellite basemaps.</p></div>
        <div><span>03</span><strong>View processed imagery</strong><p>Load published before, after and change images for the selected location. No model is run on click.</p></div>
      </div>
      <div className="modal-caution">This is a learning/prototyping interface. It does not yet detect surface changes. Browse images are visual previews; validated model outputs are listed separately.</div>
      <ConnectionStatus /><hr />
      <button className="btn btn-outline" type="button" onClick={onOpenModelResults}>View model results</button>
      <button className="btn btn-primary" id="startExplore">Start exploring <span>↗</span></button>
    </section>
  </div>);
}
