import { describe, expect, it } from 'vitest';
import { createSample, sampleDayNight } from '../../src/world/atmosphere/dayNight';
import { motesKind } from '../../src/world/atmosphere/AmbientMotes';
import { loadZone } from '../../src/data/zones';

describe('day/night lighting curve', () => {
  it('is full day at noon and full night at midnight, with a readable night floor', () => {
    const s = createSample();
    sampleDayNight(720, s);
    expect(s.night).toBe(0);
    expect(s.sunI).toBeGreaterThan(2);
    expect(s.skySun.y).toBeGreaterThan(0.8);
    sampleDayNight(0, s);
    expect(s.night).toBe(1);
    expect(s.sunI).toBeGreaterThanOrEqual(0.35); // moon key floor
    expect(s.hemiI).toBeGreaterThanOrEqual(0.45); // hemisphere floor (rendering §5.2)
    expect(s.skySun.y).toBeLessThan(0);
  });

  it('changes smoothly minute to minute and keeps the key light above the horizon', () => {
    const a = createSample(), b = createSample();
    for (let m = 0; m < 1440 * 2; m += 1) {
      sampleDayNight(m, a);
      sampleDayNight(m + 1, b);
      expect(Math.abs(a.sunI - b.sunI)).toBeLessThan(0.05);
      expect(Math.abs(a.night - b.night)).toBeLessThan(0.03);
      expect(a.sunDir.distanceTo(b.sunDir)).toBeLessThan(0.05);
      expect(a.sunDir.y).toBeGreaterThan(0.15);
      expect(Math.abs(a.sunDir.length() - 1)).toBeLessThan(1e-6);
    }
  });

  it('wraps negative and multi-day clocks', () => {
    const a = createSample(), b = createSample();
    sampleDayNight(-60, a);
    sampleDayNight(1380 + 1440 * 3, b);
    expect(a.sunI).toBeCloseTo(b.sunI, 6);
    expect(a.night).toBeCloseTo(b.night, 6);
  });
});

describe('ambient motes by biome', () => {
  it('assigns the expected particle kind per zone', () => {
    expect(motesKind(loadZone('route_1'))).toBe('fireflies');
    expect(motesKind(loadZone('volcano'))).toBe('embers');
    expect(motesKind(loadZone('cave'))).toBe('motes');
    expect(motesKind(loadZone('snowpeak'))).toBe('sparkle');
    expect(motesKind(loadZone('town_1'))).toBeNull();
  });
});
