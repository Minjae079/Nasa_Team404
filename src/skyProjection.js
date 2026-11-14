// Decorative inertial sky; catalog coordinates are not tied to observer time.
const radians = Math.PI / 180;
export function starVector([longitude, latitude]) {
  const lon = longitude * radians, lat = latitude * radians;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}
export function skyCamera({ lng, lat, bearing = 0, pitch = 0 }, width, height) {
  const lon = lng * radians, phi = lat * radians;
  const forward = [-Math.cos(phi) * Math.cos(lon), -Math.cos(phi) * Math.sin(lon), -Math.sin(phi)];
  const east = [-Math.sin(lon), Math.cos(lon), 0];
  const north = [-Math.sin(phi) * Math.cos(lon), -Math.sin(phi) * Math.sin(lon), Math.cos(phi)];
  const b = bearing * radians, p = pitch * radians;
  const right = east.map((n, i) => n * Math.cos(b) + north[i] * Math.sin(b));
  const up = north.map((n, i) => n * Math.cos(b) - east[i] * Math.sin(b));
  return {
    forward: forward.map((n, i) => n * Math.cos(p) + up[i] * Math.sin(p)),
    up: up.map((n, i) => n * Math.cos(p) - forward[i] * Math.sin(p)), right,
    width, height, focal: height / (2 * Math.tan(55 * radians / 2)),
  };
}
export function projectStar(vector, camera) {
  const dot = axis => vector.reduce((sum, n, i) => sum + n * axis[i], 0);
  const depth = dot(camera.forward);
  if (depth <= 0.01) return null;
  const x = camera.width / 2 + camera.focal * dot(camera.right) / depth;
  const y = camera.height / 2 - camera.focal * dot(camera.up) / depth;
  if (x < -8 || x > camera.width + 8 || y < -8 || y > camera.height + 8) return null;
  return [x, y];
}
