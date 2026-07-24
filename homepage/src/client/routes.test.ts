import { describe, expect, it } from 'vitest';
import { appRoutes, findRoute } from './routes.js';

describe('application routes', () => {
  it('defines the approved stable shell routes', () => {
    expect(appRoutes.map((route) => route.path)).toEqual([
      '/', '/compute', '/network', '/storage-backups', '/kubernetes', '/okd', '/services', '/weather', '/indoor',
    ]);
  });

  it('returns no route for an unknown path', () => {
    expect(findRoute('/missing')).toBeUndefined();
  });
});
