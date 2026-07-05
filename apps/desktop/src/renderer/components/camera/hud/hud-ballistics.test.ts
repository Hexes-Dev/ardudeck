import { describe, it, expect } from 'vitest';
import { ballisticImpact, depressionDeg, GRAVITY } from './hud-ballistics';

describe('ballisticImpact', () => {
  it('returns zero on/below the ground', () => {
    expect(ballisticImpact({ heightAGL: 0, vDown: 0, groundSpeed: 20 })).toEqual({ time: 0, range: 0 });
    expect(ballisticImpact({ heightAGL: -5, vDown: 0, groundSpeed: 20 })).toEqual({ time: 0, range: 0 });
  });

  it('free fall from rest matches t = sqrt(2h/g)', () => {
    const h = 100;
    const { time, range } = ballisticImpact({ heightAGL: h, vDown: 0, groundSpeed: 0 });
    expect(time).toBeCloseTo(Math.sqrt((2 * h) / GRAVITY), 4);
    expect(range).toBe(0);
  });

  it('throws forward by groundSpeed * fall time', () => {
    const h = 80;
    const gs = 25;
    const { time, range } = ballisticImpact({ heightAGL: h, vDown: 0, groundSpeed: gs });
    expect(range).toBeCloseTo(gs * time, 6);
  });

  it('a downward velocity shortens the fall time', () => {
    const base = ballisticImpact({ heightAGL: 100, vDown: 0, groundSpeed: 20 });
    const diving = ballisticImpact({ heightAGL: 100, vDown: 10, groundSpeed: 20 });
    expect(diving.time).toBeLessThan(base.time);
  });

  it('a climb (negative vDown) lengthens the fall time', () => {
    const base = ballisticImpact({ heightAGL: 100, vDown: 0, groundSpeed: 20 });
    const climbing = ballisticImpact({ heightAGL: 100, vDown: -10, groundSpeed: 20 });
    expect(climbing.time).toBeGreaterThan(base.time);
  });

  it('drag shortens the throw versus vacuum', () => {
    const vac = ballisticImpact({ heightAGL: 120, vDown: 0, groundSpeed: 25 });
    const drag = ballisticImpact({ heightAGL: 120, vDown: 0, groundSpeed: 25, terminalV: 40 });
    expect(drag.range).toBeLessThan(vac.range);
    expect(drag.range).toBeGreaterThan(0);
  });

  it('a draggier payload (lower terminal velocity) throws shorter', () => {
    const denser = ballisticImpact({ heightAGL: 120, vDown: 0, groundSpeed: 25, terminalV: 70 });
    const lighter = ballisticImpact({ heightAGL: 120, vDown: 0, groundSpeed: 25, terminalV: 25 });
    expect(lighter.range).toBeLessThan(denser.range);
  });

  it('a very high terminal velocity converges toward the vacuum solution', () => {
    const vac = ballisticImpact({ heightAGL: 100, vDown: 0, groundSpeed: 30 });
    const lowDrag = ballisticImpact({ heightAGL: 100, vDown: 0, groundSpeed: 30, terminalV: 5000 });
    expect(lowDrag.range).toBeCloseTo(vac.range, 0);
  });

  it('drag drives the fall toward terminal velocity (a heavy drop, big height)', () => {
    const vt = 30;
    const { time } = ballisticImpact({ heightAGL: 1000, vDown: 0, groundSpeed: 0, terminalV: vt });
    // After a long fall, avg speed approaches Vt, so time ~ height / Vt (well above the vacuum √(2h/g)).
    expect(time).toBeGreaterThan(Math.sqrt((2 * 1000) / 9.80665));
  });
});

describe('depressionDeg', () => {
  it('is 45° when height equals range', () => {
    expect(depressionDeg(50, 50)).toBeCloseTo(45, 6);
  });

  it('approaches 90° straight down (zero range)', () => {
    expect(depressionDeg(50, 0)).toBeCloseTo(90, 1);
  });

  it('is shallow when the throw is long', () => {
    expect(depressionDeg(20, 400)).toBeLessThan(5);
  });

  it('returns 0 with no height', () => {
    expect(depressionDeg(0, 100)).toBe(0);
  });
});
