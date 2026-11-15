import { useEffect, useRef, useState } from 'react';
import { monitoringSites } from './lib/monitoringSites.js';
import { createExplorer } from '../app.js';
import { Topbar } from './components/Topbar.jsx';
import { GlobeScene } from './components/GlobeScene.jsx';
import { LocalMap } from './components/LocalMap.jsx';
import { Footer } from './components/Footer.jsx';
import { AboutDialog } from './components/AboutDialog.jsx';

const syncSkyCamera = camera => window.dispatchEvent(new CustomEvent('sarscope:camera', { detail: camera }));

const engineUrl = 'https://unpkg.com/maplibre-gl@6.18.0/dist/maplibre-gl.mjs';
let enginePromise;
export function App() {
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const explorerRef = useRef(null);
  function selectCoordinates(lat, lng) { return explorerRef.current?.selectCoordinates(lat, lng) === true; }
  useEffect(() => {
    let cancelled = false;
    let explorer;
    // Keep one map engine and one imperative map instance. React owns the shell;
    // the map controller exclusively owns map rendering and geographic controls.
    enginePromise ??= import(/* @vite-ignore */ engineUrl);
    enginePromise.then(engine => {
      if (cancelled) return;
      explorer = createExplorer(engine, { onSelection: setSelectedPoint, onCamera: syncSkyCamera, monitoringSites });
      explorer.start();
      explorerRef.current = explorer;
      setMapReady(explorer.isReady());
    }).catch(error => {
      if (cancelled) return;
      console.error('Map engine unavailable', error);
      // The shell still presents the globe fallback without WebGL or the CDN.
      explorer = createExplorer(undefined, { onSelection: setSelectedPoint, onCamera: syncSkyCamera });
      explorer.start();
    });
    return () => { cancelled = true; explorer?.destroy(); explorerRef.current = null; };
  }, []);

  return <>
    <div className="site-frame">
      <Topbar />
      <main className="main-content"><GlobeScene selectedPoint={selectedPoint} mapReady={mapReady} onSelectCoordinates={selectCoordinates} /><LocalMap /></main>
      <Footer />
    </div>
    <AboutDialog />
  </>;
}
