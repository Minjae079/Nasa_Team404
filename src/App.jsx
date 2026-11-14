import { useEffect, useRef, useState } from 'react';
import { createExplorer } from '../app.js';
import { Topbar } from './components/Topbar.jsx';
import { GlobeScene } from './components/GlobeScene.jsx';
import { LocalMap } from './components/LocalMap.jsx';
import { Footer } from './components/Footer.jsx';
import { AboutDialog } from './components/AboutDialog.jsx';
import { ModelResultsDialog } from './components/ModelResultsDialog.jsx';

const syncSkyCamera = camera => window.dispatchEvent(new CustomEvent('sarscope:camera', { detail: camera }));

const engineUrl = 'https://unpkg.com/maplibre-gl@6.18.0/dist/maplibre-gl.mjs';
let enginePromise;
export function App() {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const explorerRef = useRef(null);
  function selectCoordinates(lat, lng) { return explorerRef.current?.selectCoordinates(lat, lng) === true; }
  function openResults() {
    // The existing controller owns the legacy About overlay only.
    document.getElementById('aboutModal').hidden = true;
    setShowResults(true);
  }
  useEffect(() => {
    let cancelled = false;
    let explorer;
    // Keep one map engine and one imperative map instance. React owns the shell;
    // the map controller exclusively owns map rendering and geographic controls.
    enginePromise ??= import(/* @vite-ignore */ engineUrl);
    enginePromise.then(engine => {
      if (cancelled) return;
      explorer = createExplorer(engine, { onSelection: setSelectedPoint, onCamera: syncSkyCamera });
      explorer.start();
      explorerRef.current = explorer;
      setMapReady(explorer.isReady());
    }).catch(error => {
      if (cancelled) return;
      console.error('Map engine unavailable', error);
      // Navigation and the model result viewer still work without WebGL/CDN.
      explorer = createExplorer(undefined, { onSelection: setSelectedPoint, onCamera: syncSkyCamera });
      explorer.start();
    });
    return () => { cancelled = true; explorer?.destroy(); explorerRef.current = null; };
  }, []);

  return <>
    <div className="site-frame">
      <Topbar onOpenModelResults={openResults} />
      <main className="main-content"><GlobeScene onOpenModelResults={openResults} selectedPoint={selectedPoint} mapReady={mapReady} onSelectCoordinates={selectCoordinates} /><LocalMap /></main>
      <Footer />
    </div>
    <AboutDialog onOpenModelResults={openResults} />
    <ModelResultsDialog open={showResults} onClose={() => setShowResults(false)} />
  </>;
}
