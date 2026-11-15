import { createBackdrop } from '../skyBackdrop.js';
import { useEffect, useRef } from 'react';
import catalog from '../../assets/sky/stars.compact.json';
import { starVector, skyCamera, projectStar } from '../skyProjection.js';

const backdrop = createBackdrop();
// Measured brighter stars remain at their original catalog coordinates.
const stars = catalog.map(([longitude, latitude, magnitude, bv]) => {
  return {
    vector: starVector([longitude, latitude]),
    radius: Math.max(0.62, 1.65 - magnitude * 0.17),
    alpha: Math.max(0.34, Math.min(1, Math.pow(10, -0.12 * (magnitude - 1)))),
    color: bv > 1.1 ? '255,209,161' : bv > 0.5 ? '255,239,214' : bv < 0 ? '185,213,255' : '226,236,255',
    glow: magnitude < 2.3,
  };
});
export function Starfield() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;
    let camera = { lng: -68, lat: 34, bearing: 0, pitch: 0 };
    let frame = null;
    let width = 0, height = 0;
    let lastDraw = -Infinity;
    function draw(time) {
      frame = null;
      if (camera.zooming && time - lastDraw < 1000 / 30) {
        schedule();
        return;
      }
      lastDraw = time;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nextWidth = canvas.clientWidth, nextHeight = canvas.clientHeight;
      if (!nextWidth || !nextHeight) return;
      if (width !== nextWidth || height !== nextHeight || canvas.width !== Math.round(nextWidth * dpr)) {
        width = nextWidth; height = nextHeight;
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.fillStyle = '#010207';
      context.fillRect(0, 0, width, height);
      const view = skyCamera(camera, width, height);
      for (const star of backdrop) {
        const point = projectStar(star.vector, view);
        if (!point) continue;
        context.fillStyle = 'rgba(' + star.color + ',' + star.alpha + ')';
        context.fillRect(point[0] - star.radius, point[1] - star.radius, star.radius * 2, star.radius * 2);
      }
      for (const star of stars) {
        const point = projectStar(star.vector, view);
        if (!point) continue;
        const [x, y] = point;
        if (star.glow) {
          const halo = context.createRadialGradient(x, y, 0, x, y, star.radius * 3.2);
          halo.addColorStop(0, 'rgba(' + star.color + ',' + star.alpha * 0.23 + ')');
          halo.addColorStop(1, 'rgba(' + star.color + ',0)');
          context.fillStyle = halo;
          context.fillRect(x - star.radius * 5, y - star.radius * 5, star.radius * 6.4, star.radius * 10);
        }
        context.fillStyle = 'rgba(' + star.color + ',' + star.alpha + ')';
        context.beginPath();
        context.arc(x, y, star.radius, 0, Math.PI * 2);
        context.fill();
      }
    }
    function schedule() { frame ??= requestAnimationFrame(draw); }
    function update({ detail: next }) {
      const changed = next.lng !== camera.lng || next.lat !== camera.lat ||
        next.bearing !== camera.bearing || next.pitch !== camera.pitch ||
        next.offsetX !== camera.offsetX || next.offsetY !== camera.offsetY;
      camera = next;
      // Zoom alone does not move the stars. Avoid repainting an identical sky.
      if (changed) schedule();
    }
    window.addEventListener('sarscope:camera', update);
    const observer = new ResizeObserver(schedule);
    observer.observe(canvas);
    schedule();
    return () => {
      window.removeEventListener('sarscope:camera', update);
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);
  return <canvas ref={canvasRef} className="starfield" aria-hidden="true" />;
}
