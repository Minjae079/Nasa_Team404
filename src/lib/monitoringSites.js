import scenarios from './monitoringScenarios.json' with { type: 'json' };

const dates = (before, after) => ({
  before: { observed_at: before },
  after: { observed_at: after },
});

export const monitoringSites = [
  {
    id: 'nisar-sacdelta-hh-20261015-20261027-001', slug: 'sacramento',
    title: 'Sacramento Delta', lat: 38, lng: -121.6, level: 1,
    bounds: [-121.856, 37.795, -121.391, 38.205],
    ...dates('2026-10-15', '2026-10-27'),
  },
  {
    id: 'nisar-assam-hh-20260710-20260722-001', slug: 'assam',
    title: 'Upper Assam', lat: 26.98, lng: 94.63, level: 3, candidateShare: 20.38,
    bounds: [94.580, 26.935, 94.680, 27.025],
    ...dates('2026-07-10', '2026-07-22'),
  },
  {
    id: 'nisar-chokwe-hh-20260105-20260117-001', slug: 'chokwe',
    title: 'Chókwè', lat: -24.52, lng: 33.025, level: 3, candidateShare: 27.20,
    bounds: [32.975, -24.566, 33.075, -24.474],
    ...dates('2026-01-05', '2026-01-17'),
  },
  ...scenarios,
].map(site => site.level === 3 && !(site.candidateShare > 0) ? { ...site, level: 1 } : site);

export function monitoringSiteAt({ lat, lng }) {
  return monitoringSites.find(({ bounds: [west, south, east, north] }) =>
    lat >= south && lat <= north && lng >= west && lng <= east);
}

export function monitoringAssets(site) {
  const folder = `/flood-demo/${site.slug}`;
  return {
    before: `${folder}/before_sar.webp`,
    after: `${folder}/after_sar.webp`,
    change_overlay: `${folder}/hh_change.webp`,
    ai: `${folder}/ai_result.webp`,
  };
}
