export const floodDemoSites = [
  {
    id: 'sacramento', title: 'Sacramento Delta', lat: 38, lng: -121.6,
    bounds: [-121.856, 37.795, -121.391, 38.205],
    before: '2026-10-15', after: '2026-10-27', level: 1,
    metrics: ['8.4 mm', '3.0%', '+0.90 m'],
  },
  {
    id: 'assam', title: 'Upper Assam', lat: 26.98, lng: 94.63,
    bounds: [94.580, 26.935, 94.680, 27.025],
    before: '2026-07-10', after: '2026-07-22', level: 2,
    metrics: ['61.3 mm', '6.5%', '−0.60 m'],
  },
  {
    id: 'chokwe', title: 'Chókwè', lat: -24.52, lng: 33.025,
    bounds: [32.975, -24.566, 33.075, -24.474],
    before: '2026-01-05', after: '2026-01-17', level: 3,
    metrics: ['187.0 mm', '11.7%', '−1.80 m'],
    reference: 'https://svs.gsfc.nasa.gov/5661/',
  },
];

export function floodDemoSiteAt(point) {
  if (!point) return undefined;
  return floodDemoSites.find(({ bounds: [west, south, east, north] }) =>
    point.lat >= south && point.lat <= north && point.lng >= west && point.lng <= east);
}

export function initialFloodDemoSite(search) {
  const query = new URLSearchParams(search);
  if (query.get('demo') !== 'flood') return null;
  return floodDemoSites.find(site => site.id === query.get('site')) ?? floodDemoSites[0];
}
