// Seeded decorative distant stars supplement the brighter measured catalog.
// These points add visual density; they are not measured astronomical objects.
export function createBackdrop(count = 36000) {
  let seed = 404;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  return Array.from({ length: count }, () => {
    const z = random() * 2 - 1, angle = random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    return { vector: [r * Math.cos(angle), r * Math.sin(angle), z],
      radius: 0.35 + Math.pow(random(), 3) * 0.43,
      alpha: 0.28 + random() * 0.40,
      color: random() < 0.12 ? '195,215,250' : '232,236,242' };
  });
}
