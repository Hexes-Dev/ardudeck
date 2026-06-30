/**
 * Payload-delivery ballistics for the HUD's CCIP / CCRP reticles.
 *
 * A payload released with the vehicle's instantaneous velocity then flies as a
 * free body. Two models:
 *
 *  - No drag (vacuum): closed-form `h = vDown·t + ½gt²`. Mass is irrelevant
 *    here (everything falls the same), so it needs no payload data — but it
 *    OVER-throws because real air slows the payload.
 *  - Quadratic drag: the realistic case. Drag opposes velocity and grows with
 *    speed², so the only payload property that matters is the ballistic
 *    coefficient, expressed here as TERMINAL VELOCITY `Vt` (the steady fall
 *    speed at which drag balances gravity). Vt rolls mass, drag coefficient and
 *    frontal area into one measurable number, so the operator sets Vt instead
 *    of guessing three quantities. The equations of motion are integrated.
 *
 * Height is taken as AGL (the vehicle's relative altitude as height above the
 * target/ground). Drag is computed relative to the ground (wind ignored).
 *
 * Pure math, no DOM/telemetry, so it's unit-tested in isolation.
 */

export const GRAVITY = 9.80665;

export interface BallisticInput {
  /** Release height above the impact plane, metres (>= 0). */
  heightAGL: number;
  /** Downward velocity component at release, m/s (NED-down positive). */
  vDown: number;
  /** Horizontal ground speed at release, m/s. */
  groundSpeed: number;
  /**
   * Payload terminal velocity, m/s. The single drag parameter (= √(2mg/ρCdA)).
   * Omit / 0 / non-finite -> drag is ignored (vacuum closed form).
   */
  terminalV?: number;
  /** Gravity, m/s^2 (override for testing). */
  g?: number;
}

export interface BallisticResult {
  /** Time from release to impact, seconds. */
  time: number;
  /** Horizontal distance travelled during the fall (forward throw), metres. */
  range: number;
}

/**
 * Compute the impact time and forward throw of a released payload. Uses the
 * exact vacuum solution when no terminal velocity is given, otherwise
 * integrates the quadratic-drag equations of motion.
 */
export function ballisticImpact({ heightAGL, vDown, groundSpeed, terminalV, g = GRAVITY }: BallisticInput): BallisticResult {
  if (!(heightAGL > 0) || g <= 0) return { time: 0, range: 0 };
  const gs = Math.max(0, groundSpeed);

  // Drag-free: closed form, mass-independent.
  if (!terminalV || !Number.isFinite(terminalV) || terminalV <= 0) {
    const disc = vDown * vDown + 2 * g * heightAGL;
    const time = (-vDown + Math.sqrt(Math.max(0, disc))) / g;
    return { time, range: gs * time };
  }

  // Quadratic drag: at terminal velocity Vt, drag == gravity, so the drag
  // coefficient k satisfies g = k·Vt²  ->  k = g / Vt². Acceleration on a body
  // moving at velocity (vx, vz) with speed s is  a = gravity - k·s·v.
  const k = g / (terminalV * terminalV);
  const dt = 0.005;
  let x = 0;
  let z = 0;
  let vx = gs;
  let vz = vDown;
  let time = 0;
  for (let i = 0; i < 20000; i++) {
    const pz = z;
    const px = x;
    const s = Math.hypot(vx, vz);
    vx += -k * s * vx * dt; // semi-implicit Euler (stable for stiff drag)
    vz += (g - k * s * vz) * dt;
    x += vx * dt;
    z += vz * dt;
    time += dt;
    if (z >= heightAGL) {
      const f = (heightAGL - pz) / (z - pz || 1); // interpolate the last step
      return { time: time - dt + f * dt, range: px + f * (x - px) };
    }
  }
  return { time, range: x };
}

/**
 * Line-of-sight depression angle (degrees below the local horizontal) from the
 * vehicle to a point `range` metres ahead and `height` metres below. Used to
 * place the impact pipper / target diamond on the climb-dive scale.
 */
export function depressionDeg(height: number, range: number): number {
  if (height <= 0) return 0;
  return Math.atan2(height, Math.max(0.001, range)) * (180 / Math.PI);
}
