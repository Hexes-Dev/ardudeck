/**
 * Configuration model for the green fighter HUD: which widgets show, their
 * style (colour / line weight / glow), display units, overall scale, and the
 * positions of the movable corner widgets. Pure data + helpers so it can be
 * unit-tested and shared by the designer and the live video overlay.
 */

import { READOUT_IDS, type HudReadoutId } from './hud-readouts';

export type HudColor = 'green' | 'amber' | 'cyan' | 'white';
export type HudUnits = 'metric' | 'imperial';

export const HUD_COLORS: Record<HudColor, string> = {
  green: '#3dff7a',
  amber: '#ffb000',
  cyan: '#3df0ff',
  white: '#eef4f8',
};

/** Widgets that are always centred/edge-anchored (flight instruments). */
export const FIXED_WIDGETS = [
  'horizon',
  'pitchLadder',
  'fpm',
  'boresight',
  'bankArc',
  'headingTape',
  'airspeedTape',
  'altitudeTape',
  'vsi',
  'ccip',
  'ccrp',
] as const;

/** Widgets the user can drag around (corner readouts / graph). */
export const MOVABLE_WIDGETS = ['status', 'battery', 'home', 'linkGraph'] as const;

/**
 * A HUD widget is either a flight instrument (fixed/edge-anchored), a legacy
 * movable readout cluster, or one of the freely-placeable telemetry readouts
 * (HudReadoutId) that make the HUD composable. All share one `widgets` toggle
 * map and one `positions` map so the panel and renderer treat them uniformly.
 */
export type HudWidgetId = (typeof FIXED_WIDGETS)[number] | (typeof MOVABLE_WIDGETS)[number] | HudReadoutId;

/** All readouts default to off (the stock HUD is the instruments + clusters). */
function readoutsOff(): Record<HudReadoutId, boolean> {
  const o = {} as Record<HudReadoutId, boolean>;
  for (const id of READOUT_IDS) o[id] = false;
  return o;
}

/** Readouts auto-place in left-edge columns until the user drags them. */
export const DEFAULT_READOUT_POSITIONS: Record<string, Vec2> = Object.fromEntries(
  READOUT_IDS.map((id, i) => [id, { x: 70 + Math.floor(i / 12) * 260, y: 120 + (i % 12) * 60 }]),
);

export interface HudWidgetMeta {
  id: HudWidgetId;
  label: string;
  movable: boolean;
}

export const HUD_WIDGETS: HudWidgetMeta[] = [
  { id: 'horizon', label: 'Horizon line', movable: false },
  { id: 'pitchLadder', label: 'Pitch ladder', movable: false },
  { id: 'fpm', label: 'Flight path marker', movable: false },
  { id: 'boresight', label: 'Boresight', movable: false },
  { id: 'bankArc', label: 'Bank scale', movable: false },
  { id: 'headingTape', label: 'Heading tape', movable: false },
  { id: 'airspeedTape', label: 'Airspeed tape', movable: false },
  { id: 'altitudeTape', label: 'Altitude tape', movable: false },
  { id: 'vsi', label: 'Vertical speed', movable: false },
  { id: 'ccip', label: 'CCIP impact point', movable: false },
  { id: 'ccrp', label: 'CCRP release cue', movable: false },
  { id: 'status', label: 'Status (mode/sat/thr)', movable: true },
  { id: 'battery', label: 'Battery', movable: true },
  { id: 'home', label: 'Home arrow + distance', movable: true },
  { id: 'linkGraph', label: 'Link graph', movable: true },
];

export interface Vec2 {
  x: number;
  y: number;
}

export interface HudConfig {
  widgets: Record<HudWidgetId, boolean>;
  color: HudColor;
  /** Line-weight multiplier, ~0.6 .. 1.8. */
  lineWeight: number;
  glow: boolean;
  units: HudUnits;
  /** Overall HUD scale, ~0.7 .. 1.3. */
  scale: number;
  /**
   * Payload terminal velocity (m/s) for the CCIP/CCRP ballistics. The single
   * drag parameter; 0 = no drag (vacuum, over-throws). ~25 draggy box,
   * ~45 compact package, ~80+ dense/streamlined.
   */
  payloadTerminalV: number;
  /** Positions (1600x900 viewBox coords) of movable widgets. */
  positions: Record<string, Vec2>;
}

/** Default anchor positions for movable widgets in the 1600x900 viewBox. */
export const DEFAULT_POSITIONS: Record<string, Vec2> = {
  status: { x: 70, y: 740 },
  battery: { x: 1530, y: 770 },
  home: { x: 800, y: 800 },
  linkGraph: { x: 1230, y: 250 },
  ...DEFAULT_READOUT_POSITIONS,
};

export const DEFAULT_HUD_CONFIG: HudConfig = {
  widgets: {
    horizon: true,
    pitchLadder: true,
    fpm: true,
    boresight: true,
    bankArc: true,
    headingTape: true,
    airspeedTape: true,
    altitudeTape: true,
    vsi: true,
    ccip: false,
    ccrp: false,
    status: true,
    battery: true,
    home: true,
    linkGraph: false,
    ...readoutsOff(),
  },
  color: 'green',
  lineWeight: 1,
  glow: true,
  units: 'metric',
  scale: 1,
  payloadTerminalV: 45,
  positions: { ...DEFAULT_POSITIONS },
};

// ── unit conversions ────────────────────────────────────────────────────────

const M_TO_FT = 3.28084;
const MS_TO_MPH = 2.23694;

export interface UnitProfile {
  /** Convert a distance/altitude in metres to display units. */
  dist: (m: number) => number;
  /** Convert a speed in m/s to display units. */
  speed: (ms: number) => number;
  distUnit: string;
  speedUnit: string;
  /** Tape half-span and step in DISPLAY units for the altitude/speed tapes. */
  altHalf: number;
  altStepMinor: number;
  altStepMajor: number;
  spdHalf: number;
  spdStepMinor: number;
  spdStepMajor: number;
}

export function unitProfile(units: HudUnits): UnitProfile {
  if (units === 'imperial') {
    return {
      dist: (m) => m * M_TO_FT,
      speed: (ms) => ms * MS_TO_MPH,
      distUnit: 'ft',
      speedUnit: 'mph',
      altHalf: 160,
      altStepMinor: 40,
      altStepMajor: 200,
      spdHalf: 40,
      spdStepMinor: 10,
      spdStepMajor: 20,
    };
  }
  return {
    dist: (m) => m,
    speed: (ms) => ms,
    distUnit: 'm',
    speedUnit: 'm/s',
    altHalf: 50,
    altStepMinor: 10,
    altStepMajor: 50,
    spdHalf: 18,
    spdStepMinor: 5,
    spdStepMajor: 10,
  };
}

/** Merge a partial/legacy config onto the defaults (for persistence/presets). */
export function normalizeHudConfig(partial: Partial<HudConfig> | undefined): HudConfig {
  if (!partial) return { ...DEFAULT_HUD_CONFIG, positions: { ...DEFAULT_POSITIONS } };
  return {
    ...DEFAULT_HUD_CONFIG,
    ...partial,
    widgets: { ...DEFAULT_HUD_CONFIG.widgets, ...(partial.widgets ?? {}) },
    positions: { ...DEFAULT_POSITIONS, ...(partial.positions ?? {}) },
  };
}
