export const appRoutes = [
  { path: '/', label: 'Overview', eyebrow: 'OVERVIEW' },
  { path: '/compute', label: 'Compute', eyebrow: 'COMPUTE' },
  { path: '/network', label: 'Network', eyebrow: 'NETWORK' },
  { path: '/storage-backups', label: 'Storage / Backups', eyebrow: 'STORAGE / BACKUPS' },
  { path: '/kubernetes', label: 'Kubernetes', eyebrow: 'KUBERNETES' },
  { path: '/okd', label: 'OKD', eyebrow: 'OKD' },
  { path: '/services', label: 'Services', eyebrow: 'SERVICES' },
  { path: '/weather', label: 'Weather', eyebrow: 'WEATHER' },
  { path: '/indoor', label: 'Indoor', eyebrow: 'INDOOR' },
] as const;

export type AppRoute = (typeof appRoutes)[number];

export function findRoute(pathname: string): AppRoute | undefined {
  return appRoutes.find((route) => route.path === pathname);
}
