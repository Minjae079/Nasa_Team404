import { useEffect, useRef, useState } from 'react';
import { parseCoordinates } from '../lib/coordinates.js';

export function CoordinateSearch({ ready, onSelect }) {
  const [open, setOpen] = useState(false);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [error, setError] = useState('');
  const root = useRef(null);
  const toggle = useRef(null);
  useEffect(() => {
    function dismiss(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  function submit(event) {
    event.preventDefault();
    try {
      const point = parseCoordinates(latitude, longitude);
      if (!onSelect(point.lat, point.lng)) throw new Error('Map unavailable. Wait for the globe to load and try again.');
      setError(''); setOpen(false); toggle.current?.focus();
    } catch (problem) { setError(problem.message); }
  }
  return <div className="coordinate-search" ref={root} onKeyDown={event => {
    if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); }
  }}>
    <button className="coordinate-toggle" ref={toggle} type="button" aria-expanded={open} aria-controls="coordinate-panel" onClick={() => setOpen(value => !value)}>
      <span aria-hidden="true">⌖</span> Go to coordinates <span aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
    <form id="coordinate-panel" className="coordinate-panel" hidden={!open} onSubmit={submit} aria-label="Find a location by coordinates" noValidate>
      <div className="coordinate-fields">
        <label htmlFor="coordinate-latitude">Latitude<input id="coordinate-latitude" type="text" inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="41.83531" value={latitude} onChange={event => {setLatitude(event.target.value);setError('');}} aria-describedby="coordinate-help coordinate-error" aria-invalid={!!error} /></label>
        <label htmlFor="coordinate-longitude">Longitude<input id="coordinate-longitude" type="text" inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="-87.62700" value={longitude} onChange={event => {setLongitude(event.target.value);setError('');}} aria-describedby="coordinate-help coordinate-error" aria-invalid={!!error} /></label>
      </div>
      <p id="coordinate-help">Decimal degrees · North/east +, south/west −</p>
      <p id="coordinate-error" className="coordinate-error" role="alert">{error}</p>
      <button className="coordinate-submit" type="submit" disabled={!ready}>{ready ? 'Go to location ↗' : 'Waiting for map…'}</button>
    </form>
  </div>;
}
