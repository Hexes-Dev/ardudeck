import { describe, it, expect } from 'vitest';
import { normalizeHudConfig, unitProfile, DEFAULT_HUD_CONFIG, DEFAULT_POSITIONS } from './hud-config';

describe('normalizeHudConfig', () => {
  it('fills defaults from an empty/partial config', () => {
    const c = normalizeHudConfig(undefined);
    expect(c.color).toBe('green');
    expect(c.widgets.fpm).toBe(true);
    expect(c.positions.status).toEqual(DEFAULT_POSITIONS.status);
  });

  it('merges partial widgets/positions onto defaults without dropping keys', () => {
    const c = normalizeHudConfig({ color: 'amber', widgets: { fpm: false } as never, positions: { home: { x: 1, y: 2 } } });
    expect(c.color).toBe('amber');
    expect(c.widgets.fpm).toBe(false);
    expect(c.widgets.horizon).toBe(DEFAULT_HUD_CONFIG.widgets.horizon); // untouched key kept
    expect(c.positions.home).toEqual({ x: 1, y: 2 });
    expect(c.positions.battery).toEqual(DEFAULT_POSITIONS.battery);
  });
});

describe('unitProfile', () => {
  it('metric is identity', () => {
    const m = unitProfile('metric');
    expect(m.dist(100)).toBe(100);
    expect(m.speed(15)).toBe(15);
    expect(m.distUnit).toBe('m');
  });
  it('imperial converts metres->feet and m/s->mph', () => {
    const im = unitProfile('imperial');
    expect(im.dist(100)).toBeCloseTo(328.08, 1);
    expect(im.speed(10)).toBeCloseTo(22.37, 1);
    expect(im.distUnit).toBe('ft');
    expect(im.speedUnit).toBe('mph');
  });
});
