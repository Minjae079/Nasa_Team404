// 수정된 부분: regression tests for stale results, late responses and image URL extraction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { monitoringAssets, monitoringSiteAt, monitoringSites } from '../src/lib/monitoringSites.js';

function frontend(fetch, maplibregl, reduceMotion = true, options = {}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: false, dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
      replaceChildren() {}, append() {}, setAttribute() {}, removeAttribute(name) { delete this[name]; },
    });
    return nodes.get(id);
  };
  const frames = new Map();
  const timers = new Map();
  const timerDelays = new Map();
  const windowEvents = {};
  let frameId = 0;
  let timerId = 0;
  const context = vm.createContext({
    fetch, console, encodeURIComponent, URL, maplibregl, options,
    performance: { now: options.now ?? (() => 0) },
    setTimeout: (callback, delay) => { timers.set(++timerId, callback); timerDelays.set(timerId, delay); return timerId; },
    clearTimeout: id => timers.delete(id),
    window: { innerWidth: options.viewportWidth ?? 1280, innerHeight: 840, requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
      cancelAnimationFrame: id => frames.delete(id), matchMedia: query => ({ matches: query.includes('prefers-reduced-motion') ? reduceMotion : true }), addEventListener(name, handler) { windowEvents[name] = handler; } },
    document: { getElementById: node, readyState: 'loading', addEventListener() {},
      querySelector: selector => selector === '.topbar' ? { offsetHeight: 84 } : null,
      createElement: options.createElement ?? (() => ({})) },
  });
  // Expose the real controller without booting WebGL or CDN assets.
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8').replace('export function', 'function') + '\ncreateExplorer(maplibregl, options);';
  vm.runInContext(source.replace('  function start() {', `
    globalThis.controller = {
      openComparison, setImage, initGlobe, syncZoomMode, goHome, openMap, setBasemap,
      showComparisonFromMap, selectCoordinates,
      state: () => ({ lastComparedPoint, comparisonPairs, mode, map }),
      leave: () => { comparisonRequestId++; mode = 'map'; },
    };
    function start() {`), context);
  return { controller: context.controller, node, frames, timers, timerDelays, windowEvents };
}

const pair = {
  before: { date: '2026-10-10', browse: 'https://nisar.asf.earthdatacloud.nasa.gov/BROWSE/before.png' },
  after: { date: '2026-10-22', browse: 'https://nisar.asf.earthdatacloud.nasa.gov/BROWSE/after.png' },
};
const result = () => ({ ok: true, json: async () => ({ pairs: [pair] }) });

test('React storage mode receives geographic selections without requesting NASA photos', async () => {
  let requests = 0;
  const selections = [];
  const { controller } = frontend(async () => { requests++; return result(); }, undefined, true,
    { onSelection: point => selections.push(point) });
  await controller.openComparison(41.5, -87.5);
  await controller.openComparison(35, 130);
  assert.equal(requests, 0);
  assert.equal(selections.length, 2);
  assert.equal(selections[1].lat, 35);
  assert.equal(selections[1].lng, 130);
  controller.goHome();
  assert.equal(selections.at(-1), null);
});

test('new searches clear previous results, including when the search fails', async () => {
  let fail = false;
  const { controller } = frontend(async () => {
    if (fail) throw new Error('offline');
    return result();
  });
  await controller.openComparison(41, -87);
  assert.equal(controller.state().comparisonPairs.length, 1);
  fail = true;
  await controller.openComparison(30, -90);
  assert.equal(controller.state().lastComparedPoint, null);
  assert.equal(controller.state().comparisonPairs.length, 0);
});

test('reselecting a comparison location moves the pin before the search completes', async () => {
  let pin;
  let finish;
  class Map {
    constructor() { this.events = {}; }
    getCanvas() { return { setAttribute() {} }; }
    on(name, handler) { this.events[name] = handler; }
    getLayer() { return false; }
    flyTo(options) { this.flight = options; }
    getZoom() { return 0; }
  }
  class Marker {
    constructor() { pin = this; }
    setLngLat(coords) { this.coords = coords; return this; }
    addTo() { return this; }
  }
  const { controller } = frontend(() => new Promise(resolve => { finish = resolve; }), { Map, Marker }, false);
  controller.initGlobe();
  const map = controller.state().map;
  map.events.load();
  assert.equal(pin, undefined);
  const first = controller.openComparison(30, -90);
  assert.deepEqual(Array.from(pin.coords), [-90, 30]);
  finish(result());
  await first;
  const second = controller.openComparison(35, -100);
  assert.deepEqual(Array.from(pin.coords), [-100, 35]);
  finish(result());
  await second;
  controller.openMap(35, -100);
  assert.equal(map.flight.duration, 2400);
});

test('late responses cannot replace a newer location or repopulate results after leaving', async () => {
  const pending = [];
  const { controller } = frontend(() => new Promise(resolve => pending.push(resolve)));
  const first = controller.openComparison(41, -87);
  const second = controller.openComparison(30, -90);
  pending[1](result());
  await second;
  pending[0](result());
  await first;
  assert.equal(controller.state().lastComparedPoint.lat, 30);
  const third = controller.openComparison(20, -80);
  controller.leave();
  pending[2](result());
  await third;
  assert.equal(controller.state().lastComparedPoint, null);
});

test('comparison images unwrap encoded preview URLs and remove appended image paths', () => {
  const { controller, node } = frontend(async () => result());
  const url = 'https://nisar.asf.earthdatacloud.nasa.gov/BROWSE/sample.png';
  for (const input of [url, encodeURIComponent(url),
    '/api/preview?url=' + encodeURIComponent(url),
    '/api/preview?url=' + encodeURIComponent('/api/preview?url=' + encodeURIComponent(url)),
    url + '/sample.png?download=1#preview']) {
    controller.setImage('image', 'error', input);
    assert.equal(node('image').src, url);
  }
  node('image').onerror();
  assert.equal(node('image').hidden, true);
  assert.equal(node('error').hidden, false);
});

test('invalid image links clear the old source and show the image error', () => {
  const { controller, node } = frontend(async () => result());
  controller.setImage('image', 'error', 'https://nisar.asf.earthdatacloud.nasa.gov/BROWSE/sample.png');
  controller.setImage('image', 'error', '/api/preview?url=' + encodeURIComponent('https://evil.example/image.png'));
  assert.equal(node('image').src, undefined);
  assert.equal(node('image').hidden, true);
  assert.equal(node('error').hidden, false);
});

test('reported GCOV preview src becomes the decoded original NASA src', () => {
  const { controller, node } = frontend(async () => result());
  const input = '/api/preview?url=https%3A%2F%2Fnisar.asf.earthdatacloud.nasa.gov%2FBROWSE%2FNISAR_L2_GCOV_PROVISIONAL_V1%2FNISAR_L2_PR_GCOV_032_099_D_069_4005_DHDH_A_20261007T014929_20261007T015004_P05023_N_F_J_001%2FNISAR_L2_PR_GCOV_032_099_D_069_4005_DHDH_A_20261007T014929_20261007T015004_P05023_N_F_J_001_LATLON.png';
  const expected = 'https://nisar.asf.earthdatacloud.nasa.gov/BROWSE/NISAR_L2_GCOV_PROVISIONAL_V1/NISAR_L2_PR_GCOV_032_099_D_069_4005_DHDH_A_20261007T014929_20261007T015004_P05023_N_F_J_001/NISAR_L2_PR_GCOV_032_099_D_069_4005_DHDH_A_20261007T014929_20261007T015004_P05023_N_F_J_001_LATLON.png';
  controller.setImage('image', 'error', input);
  assert.equal(node('image').src, expected);
  assert.equal(node('error').hidden, true);
});

// 수정된 부분: verify automatic zoom navigation uses one persistent map instance.
test('zoom alone enters and exits detail view without recreating the map', () => {
  let instances = 0;
  class Map {
    constructor(options) {
      instances++;
      this.zoom = options.zoom;
      this.center = { lng: -87, lat: 41 };
      this.events = {};
      this.properties = {};
      assert.equal(options.style.projection.type, 'globe');
    }
    on(name, handler) { this.events[name] = handler; }
    getCanvas() { return { setAttribute() {} }; }
    getZoom() { return this.zoom; }
    getCenter() { return this.center; }
    getLayer(id) { return ['streets', 'satellite', 'earth'].includes(id); }
    setLayoutProperty(id, property, value) { this.properties[id + property] = value; }
    flyTo(options) {
      this.zoom = options.zoom;
      this.center = { lng: options.center[0], lat: options.center[1] };
      this.events.zoom();
      this.events.moveend();
    }
  }
  class Marker {
    setLngLat(coords) { this.coords = coords; return this; }
    addTo() { return this; }
    remove() {}
  }
  const { controller, node } = frontend(async () => result(), { Map, Marker });
  controller.initGlobe();
  const map = controller.state().map;
  map.zoom = 7;
  map.events.zoom();
  assert.equal(controller.state().mode, 'map');
  assert.equal(node('mapScene').hidden, false);
  const selectedCoords = node('selectedCoords').textContent;
  map.events.movestart({ originalEvent: {} });
  map.center = { lng: -100, lat: 35 };
  map.events.dragstart?.();
  map.events.moveend();
  assert.equal(node('selectedCoords').textContent, selectedCoords);
  assert.equal(map.events.click, undefined, 'Single clicks must not select a location');
  map.events.dblclick({ lngLat: { lng: -99, lat: 36 } });
  const clickedCoords = node('selectedCoords').textContent;
  assert.notEqual(clickedCoords, selectedCoords);
  map.events.movestart({ originalEvent: {} });
  map.center = { lng: -110, lat: 30 };
  map.events.moveend();
  assert.equal(node('selectedCoords').textContent, clickedCoords);
  map.zoom = 5;
  map.events.zoom();
  assert.equal(controller.state().mode, 'globe');
  assert.equal(node('mapScene').hidden, true);
  controller.openMap(41, -87);
  assert.equal(controller.state().mode, 'map');
  controller.setBasemap('streets');
  assert.equal(map.properties.streetsvisibility, 'visible');
  assert.equal(map.properties.earthvisibility, 'none');
  assert.equal(map.properties.satellitevisibility, 'none');
  controller.goHome();
  assert.equal(map.properties.streetsvisibility, 'none');
  assert.equal(map.properties.satellitevisibility, 'visible');
  assert.equal(map.properties.earthvisibility, 'visible');
  assert.equal(controller.state().mode, 'globe');
  assert.equal(node('mapScene').hidden, true);
  assert.equal(controller.state().map, map);
  assert.equal(instances, 1);
});


test('globe rotates while approaching, resumes after a gesture, and respects motion preferences', () => {
  class Map {
    constructor(options) { this.options = options; this.events = {}; this.center = { lng: options.center[0], lat: options.center[1] }; this.zoom = options.zoom; }
    getCanvas() { return { setAttribute() {} }; }
    on(name, handler) { this.events[name] = handler; }
    getLayer() { return false; }
    stop() { this.stopped = true; }
    getZoom() { return this.zoom; }
    getCenter() { return this.center; }
    flyTo(options) { this.flight = options; }
    jumpTo({ center, zoom, bearing }) { this.center = { lng: center[0], lat: center[1] }; if (zoom !== undefined) this.zoom = zoom; if (bearing !== undefined) this.bearing = bearing; }
  }
  const pins = [];
  class Marker {
    constructor() { pins.push(this); }
    setLngLat(coords) { this.coords = coords; return this; }
    addTo() { this.visible = true; return this; }
    remove() { this.visible = false; }
  }
  const {controller, frames} = frontend(async () => ({ok:false}), {Map, Marker}, false);
  controller.initGlobe();
  const map = controller.state().map;
  assert.equal(map.options.zoom, -0.75);
  map.events.load();
  assert.equal(pins.length, 0);
  assert.equal(frames.size, 1);
  function tick(time) {
    const [id, callback] = frames.entries().next().value;
    frames.delete(id);
    callback(time);
  }
  const { lng: startLng, lat: startLat } = map.center;
  tick(0); tick(16);
  assert.ok(map.center.lat > startLat);
  assert.ok(map.bearing > map.options.bearing && map.bearing < 0);
  assert.ok(map.center.lng < startLng);
  assert.ok(map.zoom > -0.75 && map.zoom < 2);
  for (let time = 32; time <= 2784; time += 16) tick(time);
  const beforeHandoff = map.center.lng;
  tick(2800);
  assert.equal(map.zoom, 2);
  assert.equal(map.center.lat, 34);
  assert.equal(map.bearing, 0);
  const arrivedLng = map.center.lng;
  tick(2816);
  const introStep = arrivedLng - beforeHandoff;
  const rotationStep = map.center.lng - arrivedLng;
  assert.ok(Math.abs(introStep - rotationStep) < .006);
  assert.equal(map.zoom, 2);
  map.events.mousedown();
  assert.equal(frames.size, 0);
  map.events.dblclick({lngLat:{lat:35,lng:130}});
  assert.equal(pins.length, 0);
  assert.equal(controller.selectCoordinates(35, 130), true);
  assert.equal(pins.length, 1);
  assert.deepEqual(Array.from(pins[0].coords), [130,35]);
  controller.goHome();
  assert.equal(pins[0].visible, false);
  map.events.moveend();
  assert.equal(frames.size, 1);
  controller.openMap(41, -87);
  assert.equal(frames.size, 0);
  const reduced = frontend(async () => ({ok:false}), {Map, Marker}, true);
  reduced.controller.initGlobe();
  const still = reduced.controller.state().map;
  const pinCount = pins.length;
  still.events.load();
  assert.equal(still.options.zoom, 2);
  assert.equal(still.flight, undefined);
  assert.equal(reduced.frames.size, 0);
  assert.equal(pins.length, pinCount);
  class LngLat {
    constructor(lng, lat) { this.lng = lng; this.lat = lat; }
  }
  let now = 1000;
  const interrupted = frontend(async () => ({ok:false}), {Map, Marker, LngLat}, false, { now: () => now });
  interrupted.controller.initGlobe();
  const interruptedMap = interrupted.controller.state().map;
  interruptedMap.events.load();
  interruptedMap.events.touchstart();
  assert.equal(interrupted.frames.size, 0);
  assert.equal(interruptedMap.stopped, true);
  interruptedMap.events.moveend();
  assert.equal(interrupted.frames.size, 0);
  assert.equal(interrupted.timers.size, 0);
  interrupted.windowEvents.touchend({ touches: [{}] });
  assert.equal(interrupted.timers.size, 0);
  interrupted.windowEvents.touchend({ touches: [] });
  assert.equal(interrupted.timerDelays.get([...interrupted.timers.keys()][0]),450);
  interruptedMap.isMoving = () => true;
  function completeDelay() {
    const [id, callback] = interrupted.timers.entries().next().value;
    interrupted.timers.delete(id);
    callback();
  }
  completeDelay();
  assert.equal(interrupted.frames.size, 0);
  interruptedMap.isMoving = () => false;
  interruptedMap.events.moveend();
  completeDelay();
  assert.equal(interrupted.frames.size, 1);
  interruptedMap.events.wheel();
  interruptedMap.isZooming = () => true;
  interruptedMap.isMoving = () => true;
  const update = interruptedMap.options.transformCameraUpdate;
  const proposed = { center: new LngLat(-90, 35), zoom: 3 };
  assert.equal(update(proposed).center.lng, -90);
  now += 50;
  const rotated = update(proposed);
  assert.equal(rotated.center.lng, -90.15);
  assert.equal(rotated.center.lat, 35);
  assert.equal(rotated.zoom, undefined);
  assert.equal(interrupted.frames.size, 0);
  interruptedMap.events.zoom();
  interruptedMap.isZooming = () => false;
  interruptedMap.isMoving = () => false;
  interruptedMap.events.moveend();
  assert.equal(interrupted.timerDelays.get([...interrupted.timers.keys()][0]),0);
  completeDelay();
  assert.equal(interrupted.frames.size, 1);
  assert.equal(update({ ...proposed, zoom: interruptedMap.getZoom() }).center, undefined);
});

test('home camera padding follows responsive layout and reserves the wider comparison panel', async () => {
  class Map {
    constructor(options) { this.options = options; this.events = {}; this.padding = {}; }
    getCanvas() { return {setAttribute(){}}; }
    on(name, handler) { this.events[name] = handler; }
    setPadding(value) { this.padding = value; this.events.moveend?.(); }
    getZoom() { return this.zoom ?? this.options.zoom; }
    getPadding() { return this.padding; }
    getCenter() { return {lng:-86,lat:34}; }
    getBearing() { return 0; }
    getPitch() { return 0; }
    getLayer() { return false; }
    easeTo(options) { this.flight = options; this.padding = options.padding; this.zoom = options.zoom; this.events.moveend?.(); }
  }
  class Marker { setLngLat() {return this;} addTo() {return this;} remove() {} }
  const updates = [];
  const {controller, node} = frontend(async () => ({ok:false}), {Map,Marker}, true,
    {onSelection(){},onCamera: camera => updates.push(camera)});
  controller.initGlobe();
  const map = controller.state().map;
  assert.equal(map.padding.left,410);
  assert.equal(updates.at(-1).offsetX,205);
  map.events.dblclick({ lngLat: { lng: -89, lat: 36 } });
  assert.equal(controller.state().mode, 'globe');
  assert.equal(map.flight.zoom, 3);
  assert.deepEqual(Array.from(map.flight.center), [-89, 36]);
  await controller.openComparison(35,130);
  assert.equal(node("homeHero").inert,true);
  assert.equal(map.flight.duration,0);
  assert.deepEqual(Object.values(map.padding),[592,0,84,0]);
  map.events.move();
  assert.equal(updates.at(-1).offsetX,296);
  assert.equal(updates.at(-1).offsetY,42);
  map.zoom = 15;
  controller.goHome();
  assert.equal(map.padding.left,410);
  assert.equal(controller.state().mode, "globe");
  assert.equal(node("homeHero").inert,false);
  const mobile = frontend(async () => ({ok:false}),{Map,Marker},true,{viewportWidth:390});
  mobile.controller.initGlobe();
  assert.equal(mobile.controller.state().map.options.zoom,0.95);
  assert.equal(mobile.controller.state().map.padding.left,0);
  const smooth = frontend(async () => ({ok:false}),{Map,Marker},false,{onSelection(){}});
  smooth.controller.initGlobe();
  const smoothMap = smooth.controller.state().map;
  await smooth.controller.openComparison(35,130);
  assert.equal(smoothMap.flight.duration,1200);
  assert.equal(smoothMap.flight.padding.left,592);
  assert.equal(smoothMap.flight.easing(0),0);
  assert.equal(smoothMap.flight.easing(1),1);
  assert.ok(smoothMap.flight.easing(0.1) < 0.1);
  smooth.controller.goHome();
  assert.equal(smoothMap.flight.duration,1200);
  assert.equal(smoothMap.flight.padding.left,410);
  assert.equal(smooth.frames.size,0);
  smoothMap.events.moveend();
  assert.equal(smooth.frames.size,1);
});

test('typed coordinates reuse geographic selection and the marker; invalid values do not navigate', () => {
  let pin, count = 0;
  const selections=[];
  class Map {
    constructor() {this.events={};}
    getCanvas() {return {setAttribute(){}};}
    on(name,handler) {this.events[name]=handler;}
    getLayer() {return false;}
    getZoom() {return this.flight?.zoom ?? 2;}
    getCenter() {return {lat:0,lng:0};}
    flyTo(options) {this.flight=options;}
  }
  class Marker {
    constructor(){pin=this;count++;}
    setLngLat(value){this.coords=value;return this;}
    addTo(){return this;}
  }
  const {controller}=frontend(async()=>({ok:false}),{Map,Marker},true,{onSelection:point=>selections.push(point)});
  assert.equal(controller.selectCoordinates(0,0),false);
  controller.initGlobe();
  assert.equal(controller.selectCoordinates(91,0),false);
  assert.equal(controller.selectCoordinates(0,181),false);
  assert.equal(controller.selectCoordinates(NaN,0),false);
  assert.equal(count,0);
  assert.equal(controller.selectCoordinates(0,0),true);
  assert.deepEqual(Array.from(pin.coords),[0,0]);
  assert.equal(selections.at(-1).lat,0);
  assert.equal(controller.selectCoordinates(-33.8,151.2),true);
  assert.deepEqual(Array.from(pin.coords),[151.2,-33.8]);
  assert.equal(count,1);
  controller.openMap(35,130);
  assert.equal(controller.state().mode,'compare');
  controller.state().map.flight.zoom = 8;
  controller.syncZoomMode();
  assert.equal(controller.state().mode,'compare');
  assert.equal(controller.selectCoordinates(41.83531,-87.627),true);
  assert.deepEqual(Array.from(pin.coords),[-87.627,41.83531]);
  assert.equal(controller.state().mode,'compare');
});


test('monitoring pins appear after the intro and open the comparison with one click', () => {
  const pins = [];
  const selections = [];
  let stopped = false;
  class Map {
    constructor(options) { this.options = options; this.events = {}; this.zoom = options.zoom; }
    getCanvas() { return { setAttribute() {} }; }
    on(name, callback) { this.events[name] = callback; }
    getZoom() { return this.zoom; }
    getCenter() { return { lng: -86, lat: 34 }; }
    getBearing() { return 0; }
    getPitch() { return 0; }
    getLayer() { return false; }
    getSource() { return { setData: data => { this.rings = data.features; } }; }
    stop() { stopped = true; }
    jumpTo({ zoom }) { if (zoom !== undefined) this.zoom = zoom; }
    setPaintProperty(layer, property, value) { this.paint ??= {}; this.paint[layer + property] = value; }
    easeTo(options) { this.flight = options; }
  }
  class Marker {
    constructor(options) { this.options = options; pins.push(this); }
    setLngLat(point) { this.coords = point; return this; }
    addTo() { return this; }
    remove() {}
  }
  const shortcuts = monitoringSites.filter(site => site.worldPin);
  assert.equal(shortcuts.length, 5);
  const [site, ...otherShortcuts] = shortcuts;
  const high = { title: 'Chókwè', lat: -24.52, lng: 33.025, level: 3, bounds: [32.975, -24.566, 33.075, -24.474] };
  const nearby = { title: 'Madison', lat: 43, lng: -89, level: 1, overviewOffset: { lat: 2, lng: -2 } };
  const { controller, frames } = frontend(async () => ({ok:false}), {Map, Marker}, false, {
    monitoringSites: [site, high, nearby, ...otherShortcuts],
    onSelection: point => selections.push({ ...point }),
    createElement: () => ({
      dataset: {}, classList: { contains: () => false }, setAttribute() {},
      events: {}, addEventListener(name, handler) { this.events[name] = handler; },
    }),
  });
  controller.initGlobe();
  const map = controller.state().map;
  assert.ok(map.getZoom() < 0);
  assert.equal(pins.length, 0);
  const areas = map.options.style.sources['monitoring-areas'].data.features;
  assert.deepEqual(Array.from(areas.slice(0, 4), feature => feature.geometry.type), ['LineString', 'LineString', 'Polygon', 'LineString']);
  assert.equal(areas[0].properties.level, 0);
  assert.equal(areas[1].properties.level, 3);
  const ring = areas[1].geometry.coordinates;
  assert.equal(ring.length, 65);
  assert.deepEqual(ring[0], ring.at(-1));
  const radians = Math.PI / 180;
  for (const [lng, lat] of ring) {
    const distance = Math.acos(Math.sin(high.lat * radians) * Math.sin(lat * radians)
      + Math.cos(high.lat * radians) * Math.cos(lat * radians) * Math.cos((lng - high.lng) * radians));
    assert.ok(Math.abs(distance / radians - 1.8) < 1e-8);
  }
  const halo = map.options.style.layers.find(layer => layer.id === 'monitoring-location-ring');
  assert.equal(halo.type, 'line');
  map.events.load();
  assert.equal(frames.size, 1);
  function tick(time) {
    const [id, callback] = frames.entries().next().value;
    frames.delete(id);
    callback(time);
  }
  for (let time = 0; time < 2800; time += 16) tick(time);
  assert.equal(pins.length, 0);
  assert.equal(map.paint, undefined);
  tick(2800);
  assert.equal(pins.length, 2 + shortcuts.length);
  assert.deepEqual(Array.from(pins[2].coords), [-91, 45]);
  map.zoom = 4;
  map.events.zoom();
  assert.deepEqual(Array.from(pins[2].coords), [-89, 43]);
  const north = map.rings[3].geometry.coordinates[0];
  assert.ok(Math.abs(north[0] + 89) < 1e-8);
  assert.ok(Math.abs(north[1] - 44.8) < 1e-8);
  map.zoom = 2;
  map.events.zoom();
  assert.deepEqual(Array.from(pins[2].coords), [-91, 45]);
  assert.equal(map.paint['high-risk-observation-outlineline-opacity'], 1);
  assert.equal(map.paint['monitoring-location-ringline-opacity'].at(-1), 0);
  assert.deepEqual(Array.from(pins[0].coords), [site.worldPin.lng, site.worldPin.lat]);
  assert.equal(pins[0].options.element.dataset.level, '0');
  assert.ok(!pins[0].options.element.innerHTML.includes('monitoring-pin-warning'));
  assert.ok(pins[1].options.element.innerHTML.includes('monitoring-pin-warning'));
  assert.equal(pins[0].options.anchor, 'bottom');
  assert.equal(pins[0].options.subpixelPositioning, true);
  const clicks = pins[0].options.element.events;
  clicks.pointerdown({ isPrimary: true, button: 0, stopPropagation() {} });
  assert.equal(stopped, false);
  assert.equal(frames.size, 0);
  clicks.click({ stopPropagation() {} });
  assert.deepEqual(selections, [{ lat: site.lat, lng: site.lng, siteId: site.id }]);
  assert.equal(controller.state().mode, 'compare');
  assert.deepEqual(Array.from(map.flight.center), [site.worldPin.lng, site.worldPin.lat]);
  pins[2].options.element.events.click({ stopPropagation() {} });
  assert.deepEqual(selections.at(-1), { lat: nearby.lat, lng: nearby.lng, siteId: nearby.id });
  assert.deepEqual(Array.from(map.flight.center), [nearby.lng, nearby.lat]);
  const imagePairs = new Set();
  for (const [index, shortcut] of shortcuts.entries()) {
    const pin = pins[index === 0 ? 0 : index + 2];
    pin.options.element.events.click({ stopPropagation() {} });
    const selection = selections.at(-1);
    assert.deepEqual(selection, { lat: shortcut.lat, lng: shortcut.lng, siteId: shortcut.id });
    assert.deepEqual(Array.from(map.flight.center), [shortcut.worldPin.lng, shortcut.worldPin.lat]);
    const observation = monitoringSiteAt(selection);
    assert.equal(observation, shortcut);
    const { before, after } = monitoringAssets(observation);
    imagePairs.add(before + after);
    assert.equal(controller.selectCoordinates(shortcut.worldPin.lat, shortcut.worldPin.lng), true);
    assert.deepEqual(selections.at(-1), selection);
  }
  assert.equal(imagePairs.size, shortcuts.length);
  assert.equal(pins.length, 2 + shortcuts.length);

  const newOrleans = shortcuts.find(shortcut => shortcut.slug === 'new-orleans');
  assert.equal(monitoringSiteAt(newOrleans), newOrleans);
  assert.equal(monitoringSiteAt({ ...newOrleans, siteId: site.id }), site);
});
