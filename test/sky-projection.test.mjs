import { createBackdrop } from '../src/skyBackdrop.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { starVector, skyCamera, projectStar } from '../src/skyProjection.js';
const view = (lng, lat = 0, bearing = 0) => skyCamera({lng, lat, bearing}, 1200, 720);
test('sky culls the rear hemisphere and moves a fixed star with globe camera rotation', () => {
  const star = starVector([180, 0]);
  const centered = projectStar(star, view(0));
  assert.ok(Math.abs(centered[0]-600) < 1e-8 && Math.abs(centered[1]-360) < 1e-8);
  assert.equal(projectStar(starVector([0,0]), view(0)), null);
  const moved = projectStar(star, view(10));
  assert.ok(moved[0] > 600);
});
test('sky projection is continuous across longitude seam and finite at poles', () => {
  const star = starVector([0, 0]);
  const a = projectStar(star, view(179.999));
  const b = projectStar(star, view(-180.001));
  assert.ok(Math.abs(a[0]-b[0]) < 1e-8);
  for (const lat of [-90,90]) {
    const p = projectStar(starVector([0,-lat]), view(0, lat));
    assert.ok(p.every(Number.isFinite));
    assert.ok(Math.abs(p[0]-600) < 1e-8 && Math.abs(p[1]-360) < 1e-8);
  }
});
test('bearing rotates the sky while Earth zoom leaves distant star size and spacing fixed', () => {
  const star = starVector([170,0]);
  const p = projectStar(star, view(0));
  const rolled = projectStar(star, view(0,0,90));
  assert.ok(Math.abs(rolled[0]-600) < 1e-8);
  assert.ok(Math.abs(Math.abs(rolled[1]-360)-Math.abs(p[0]-600)) < 1e-8);
  const near = skyCamera({lng:0,lat:0,zoom:2},1200,720);
  const far = skyCamera({lng:0,lat:0,zoom:-0.75},1200,720);
  assert.deepEqual(projectStar(star,near), projectStar(star,far));
});
test('compact sky catalog preserves every source coordinate, magnitude and color index', () => {
  const read = name => JSON.parse(readFileSync(new URL('../assets/sky/'+name,import.meta.url),'utf8'));
  const full = read('stars.6.json'); const compact = read('stars.compact.json');
  assert.equal(compact.length,5044);
  assert.deepEqual(compact,full.features.map(({geometry,properties})=>[...geometry.coordinates,properties.mag,Number(properties.bv)]));
});

test('dense background is deterministic on a sphere and stays distributed across views', () => {
  const stars = createBackdrop();
  assert.equal(stars.length, 36000);
  assert.deepEqual(stars.slice(0, 20), createBackdrop(20));
  for (const lng of [0,90,180,-90]) {
    const visible = stars.filter(star => projectStar(star.vector, view(lng)));
    assert.ok(visible.length > 2000);
  }
  for (const star of stars) {
    assert.ok(Math.abs(Math.hypot(...star.vector)-1) < 1e-10);
  }
});

test('off-center globe layout shifts the star vanishing point without changing star scale', () => {
  const star = starVector([180,0]);
  const shifted = projectStar(star,skyCamera({lng:0,lat:0,offsetX:200,offsetY:40},1200,720));
  assert.ok(Math.abs(shifted[0]-800)<1e-8);
  assert.ok(Math.abs(shifted[1]-400)<1e-8);
});
