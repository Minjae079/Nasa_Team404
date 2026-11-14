// 수정된 부분: regression tests for stale results, late responses and image URL extraction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

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
  let frameId = 0;
  const context = vm.createContext({
    fetch, console, clearTimeout, encodeURIComponent, URL, maplibregl, options,
    window: { innerWidth: options.viewportWidth ?? 1280, requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
      cancelAnimationFrame: id => frames.delete(id), matchMedia: query => ({ matches: query.includes('prefers-reduced-motion') ? reduceMotion : true }), addEventListener() {} },
    document: { getElementById: node, readyState: 'loading', addEventListener() {},
      createElement: () => ({}) },
  });
  // Expose the real controller without booting WebGL or CDN assets.
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8').replace('export function', 'function') + '\ncreateExplorer(maplibregl, options);';
  vm.runInContext(source.replace('  function start() {', `
    globalThis.controller = {
      openComparison, setImage, initGlobe, syncZoomMode, goHome, openMap, setBasemap,
      showComparisonFromMap,
      state: () => ({ lastComparedPoint, comparisonPairs, mode, map }),
      leave: () => { comparisonRequestId++; mode = 'map'; },
    };
    function start() {`), context);
  return { controller: context.controller, node, frames };
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
    getLayer(id) { return ['streets', 'satellite'].includes(id); }
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
  map.events.click({ lngLat: { lng: -99, lat: 36 } });
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
  controller.goHome();
  assert.equal(controller.state().mode, 'globe');
  assert.equal(node('mapScene').hidden, true);
  assert.equal(controller.state().map, map);
  assert.equal(instances, 1);
});


test('globe rotates while approaching, stays unmarked until selection, and respects motion preferences', () => {
  class Map {
    constructor(options) { this.options = options; this.events = {}; this.center = { lng: options.center[0], lat: options.center[1] }; this.zoom = options.zoom; }
    getCanvas() { return { setAttribute() {} }; }
    on(name, handler) { this.events[name] = handler; }
    getLayer() { return false; }
    stop() { this.stopped = true; }
    getZoom() { return this.zoom; }
    getCenter() { return this.center; }
    flyTo(options) { this.flight = options; }
    jumpTo({ center, zoom }) { this.center = { lng: center[0], lat: center[1] }; if (zoom !== undefined) this.zoom = zoom; }
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
  const startLng = map.center.lng;
  tick(0); tick(16);
  assert.ok(map.center.lng < startLng);
  assert.ok(map.zoom > -0.75 && map.zoom < 2);
  for (let time = 80; time <= 3216; time += 64) tick(time);
  assert.equal(map.zoom, 2);
  const arrivedLng = map.center.lng;
  tick(3280);
  assert.ok(map.center.lng < arrivedLng);
  assert.equal(map.zoom, 2);
  map.events.mousedown();
  assert.equal(frames.size, 0);
  map.events.click({lngLat:{lat:35,lng:130}});
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
  const interrupted = frontend(async () => ({ok:false}), {Map, Marker}, false);
  interrupted.controller.initGlobe();
  const interruptedMap = interrupted.controller.state().map;
  interruptedMap.events.load();
  interruptedMap.events.touchstart();
  assert.equal(interrupted.frames.size, 0);
  assert.equal(interruptedMap.stopped, true);
  interruptedMap.events.moveend();
  assert.equal(interrupted.frames.size, 0);
});

test('home camera padding follows responsive layout and clears for result selection', async () => {
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
  await controller.openComparison(35,130);
  assert.equal(node("homeHero").inert,true);
  assert.equal(map.flight.duration,0);
  assert.deepEqual(Object.values(map.padding),[0,0,0,0]);
  map.events.move();
  assert.equal(updates.at(-1).offsetX,0);
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
  assert.equal(smoothMap.flight.duration,1500);
  assert.equal(smoothMap.flight.padding.left,0);
  assert.equal(smoothMap.flight.easing(0),0);
  assert.equal(smoothMap.flight.easing(1),1);
  assert.ok(smoothMap.flight.easing(0.1) < 0.1);
  smooth.controller.goHome();
  assert.equal(smoothMap.flight.duration,1500);
  assert.equal(smoothMap.flight.padding.left,410);
  assert.equal(smooth.frames.size,0);
  smoothMap.events.moveend();
  assert.equal(smooth.frames.size,1);
});
