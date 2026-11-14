import { Starfield } from './Starfield.jsx';
import { ComparisonScene } from './ComparisonScene.jsx';

export function GlobeScene({ onOpenModelResults, selectedPoint }) {
  return (<section id="globeScene" className="scene scene-globe" aria-label="Interactive 3D Earth">
        <Starfield />
        <div className="globe-aura" aria-hidden="true"></div>
        <div id="globeViz" className="globe-viz"></div>
        <div id="globeFallback" className="globe-fallback" hidden>
          <div className="fallback-icon">◎</div>
          <h2>3D globe could not load</h2>
          <p>Check your internet connection and WebGL support. The globe library and Earth texture are delivered by a CDN.</p>
          <button className="btn btn-outline" onClick={() => window.location.reload()}>Try again</button>
        </div>

        <div className="hero-content">
          <div className="eyebrow"><span className="eyebrow-line"></span> EXPLORE THE INVISIBLE EARTH</div>
          <h1>See beyond<br /><span>the surface.</span></h1>
          <p className="hero-description">Explore published SAR imagery.<br />See how Earth changes over time.</p>
          <div className="hero-actions">
            <button className="btn btn-primary" id="exploreIIT">Explore Illinois Tech <span className="btn-arrow">↗</span></button>
            <button className="btn btn-outline" id="learnMore">How it works <span className="btn-arrow">↗</span></button>
          <button className="hero-results-link" type="button" onClick={onOpenModelResults}>View model results <span aria-hidden="true">↗</span></button></div>
          <div className="hero-meta">
            <div><span className="meta-label">PRIMARY STUDY AREA</span><span className="meta-value">Chicago, Illinois <span className="meta-arrow">↗</span></span></div>
            <div><span className="meta-label">SATELLITE PROGRAM</span><span className="meta-value">NASA–ISRO NISAR</span></div>
          </div>
        </div>

        <div className="view-status"><span className="small-cross">✦</span> LIVE 3D GLOBE <span className="view-status-dot"></span></div>

        <div className="globe-controls" aria-label="Globe controls">
          <button id="zoomInGlobe" title="Zoom globe in" aria-label="Zoom globe in">+</button>
          <div className="control-separator"></div>
          <button id="zoomOutGlobe" title="Zoom globe out" aria-label="Zoom globe out">−</button>
          <div className="control-separator"></div>
          <button id="resetGlobe" title="Reset globe" aria-label="Reset globe">⟲</button>
        </div>
        <div className="interaction-guide"><span className="desktop-gesture-text"><span className="gesture-icon">⟳</span> DRAG TO ROTATE <span className="guide-split">/</span> SCROLL TO ZOOM <span className="guide-split">/</span> CLICK TO EXPLORE</span><span className="mobile-gesture-text"><span className="gesture-icon">⟳</span> DRAG · PINCH · TAP</span></div>
        <div id="mapLoadStatus" className="map-load-status" role="status" hidden></div>
        <div className="globe-bottom-right"><span className="square-marker"></span> 3D WORLD VIEW <span className="guide-split">·</span> EXPERIMENTAL</div>
      <ComparisonScene point={selectedPoint} /></section>);
}
