import { useEffect, useRef, useState } from 'react';


export function ComparisonScene() {
  const [preview, setPreview] = useState(null);
  const dialog = useRef(null);
  useEffect(() => {
    const open = event => setPreview(event.detail);
    window.addEventListener('sarscope:preview', open);
    return () => window.removeEventListener('sarscope:preview', open);
  }, []);
  useEffect(() => {
    if (preview && !dialog.current.open) dialog.current.showModal();
  }, [preview]);
  return (<section id="compareScene" className="scene scene-compare" hidden aria-label="NASA SAR observation comparison">
        <div className="compare-top">

          <button type="button" className="btn btn-dark" id="compareBack">&#10005; Close</button>
          <div className="compare-title">
            <span className="section-tag">NASA NISAR · L2 GCOV</span>
            <h2 id="compareRegion">Selected region</h2>
            <p id="compareCoordinates">Choose a location on the globe</p>
          </div>
          <button type="button" className="btn btn-outline" id="compareMap">View local map</button>
        </div>
        <div className="compare-status" id="compareStatus" role="status" aria-live="polite">
          Searching NASA ASF coverage for two comparable acquisition dates…
        </div>
        <div className="compare-chooser" id="pairChooser" hidden>
          <label htmlFor="pairSelect">Matching orbit / frame</label>
          <select id="pairSelect"></select>
          <span id="pairCount"></span>
        </div>
        <div className="sar-compare-grid" id="sarCompareGrid" hidden>
          <article className="sar-photo-panel">
            <div className="sar-photo-heading"><div><span className="sar-kicker">01 / BEFORE</span><h3 id="beforeDate">—</h3></div><span className="sar-photo-pill">SAR BROWSE</span></div>
            <div className="sar-image-frame" id="beforeFrame"><span className="image-loading" id="beforeLoading" hidden role="status">Loading observation…</span><img id="beforeImage" alt="Earlier NASA SAR observation preview" loading="eager"/><span className="sar-image-error" id="beforeError" hidden>NASA preview unavailable. Check data access or try another pair.</span></div>
            <button className="image-expand" id="beforeExpand" type="button" disabled aria-label="Enlarge before observation">↗ Expand image</button><div className="sar-file-meta"><span id="beforeMeta">—</span><a id="beforeSource" target="_blank" rel="noopener noreferrer">NASA source ↗</a></div>
          </article>
          <article className="sar-photo-panel">
            <div className="sar-photo-heading"><div><span className="sar-kicker">02 / AFTER · LATEST MATCHED</span><h3 id="afterDate">—</h3></div><span className="sar-photo-pill">SAR BROWSE</span></div>
            <div className="sar-image-frame" id="afterFrame"><span className="image-loading" id="afterLoading" hidden role="status">Loading observation…</span><img id="afterImage" alt="Later NASA SAR observation preview" loading="eager"/><span className="sar-image-error" id="afterError" hidden>NASA preview unavailable. Check data access or try another pair.</span></div>
            <button className="image-expand" id="afterExpand" type="button" disabled aria-label="Enlarge after observation">↗ Expand image</button><div className="sar-file-meta"><span id="afterMeta">—</span><a id="afterSource" target="_blank" rel="noopener noreferrer">NASA source ↗</a></div>
          </article>
        </div>
        <div className="compare-footer-note" id="compareFootnote">
          <strong>Scientific note</strong> These are ASF full-scene browse images, not necessarily cropped to the clicked point or perfectly pixel-aligned. Image differences alone are not validated land-surface changes. For measurement, use co-registered GCOV numeric data and quality masks.
        </div>
        <dialog ref={dialog} className="observation-dialog" onClose={() => setPreview(null)} aria-labelledby="observation-title">
          <header><div><span className="section-tag">NASA SAR · BROWSE PREVIEW</span><h2 id="observation-title">{preview?.title}</h2></div>
            <button className="btn btn-outline" type="button" onClick={() => dialog.current.close()}>✕ Close</button></header>
          {preview && <img src={preview.url} alt={preview.title} />}
          <p>Observation preview · Not a quantitative change map</p>
        </dialog>
      </section>);
}
