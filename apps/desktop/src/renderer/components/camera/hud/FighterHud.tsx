/**
 * Green fighter-style HUD — a ground-rendered graphical overlay (the kind
 * RubyFPV draws, NOT a font/DisplayPort OSD). Thin vector symbology: fixed
 * boresight, conformal climb-dive pitch ladder + horizon, the Flight Path
 * Marker (velocity vector), airspeed / altitude / heading tapes, and movable
 * corner readouts. Pure SVG in a 1600x900 viewBox, telemetry-driven.
 *
 * Driven by a HudConfig: which widgets show, colour / line weight / glow,
 * units, overall scale, and the positions of the movable widgets. In the OSD
 * Designer the movable widgets can be dragged (editable); over the live video
 * they're static.
 */

import { memo, useRef } from 'react';
import { headingTicks, verticalTapeTicks, pitchLadderRungs, wrap180 } from './hud-geometry';
import { ballisticImpact, depressionDeg } from './hud-ballistics';
import {
  type HudConfig,
  HUD_COLORS,
  unitProfile,
  DEFAULT_POSITIONS,
} from './hud-config';

export interface FighterHudValues {
  roll: number;
  pitch: number;
  heading: number;
  airspeed: number;
  groundspeed: number;
  altitude: number;
  vario: number;
  throttle: number;
  vx?: number;
  vy?: number;
  vz?: number;
  batteryVoltage: number;
  batteryPercent: number;
  mode: string;
  armed: boolean;
  distance: number;
  homeDirection: number;
  gForce?: number;
  gpsSats?: number;
  linkHistory?: number[];
  linkLabel?: string;
  /** CCRP target (designated drop point): bearing from north + horizontal ground range, metres. */
  targetBearing?: number;
  targetRange?: number;
  targetLabel?: string;
}

const VB_W = 1600;
const VB_H = 900;
const CX = VB_W / 2;
const CY = VB_H / 2;
const WARN = '#ff5a5a';

const PITCH_HALF_SPAN = 18;
const PITCH_BAND = 250;
const PX_PER_DEG = PITCH_BAND / PITCH_HALF_SPAN;
const HDG_HALF = 45;
const HDG_BAND = 360;
const TAPE_BAND = 200;
const DEG = Math.PI / 180;

interface HudProps {
  v: FighterHudValues;
  config: HudConfig;
  editable?: boolean;
  onMovePosition?: (id: string, x: number, y: number) => void;
}

export const FighterHud = memo(function FighterHud({ v, config, editable, onMovePosition }: HudProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const C = HUD_COLORS[config.color];
  const lw = config.lineWeight;
  const u = unitProfile(config.units);
  const w = config.widgets;
  const pos = (id: string) => config.positions[id] ?? DEFAULT_POSITIONS[id] ?? { x: 0, y: 0 };

  const ladder = pitchLadderRungs(v.pitch, PITCH_HALF_SPAN, 5);
  const hdg = headingTicks(v.heading, HDG_HALF, 5, 15);
  const spdDisp = u.speed(v.airspeed > 0.2 ? v.airspeed : v.groundspeed);
  const altDisp = u.dist(v.altitude);
  const spd = verticalTapeTicks(spdDisp, u.spdHalf, u.spdStepMinor, u.spdStepMajor);
  const alt = verticalTapeTicks(altDisp, u.altHalf, u.altStepMinor, u.altStepMajor);

  // Flight Path Marker geometry.
  let course = v.heading;
  let fpa: number;
  if (v.vx != null && v.vy != null) {
    const gsH = Math.hypot(v.vx, v.vy);
    if (gsH > 0.5) course = (Math.atan2(v.vy, v.vx) / DEG + 360) % 360;
    fpa = Math.atan2(-(v.vz ?? 0), Math.max(gsH, 0.1)) / DEG;
  } else {
    fpa = Math.atan2(v.vario, Math.max(v.groundspeed, 0.1)) / DEG;
  }
  const fpmDX = Math.max(-26, Math.min(26, wrap180(course - v.heading))) * PX_PER_DEG;
  const fpmDY = Math.max(-16, Math.min(16, v.pitch - fpa)) * PX_PER_DEG;

  // Payload-delivery reticles (CCIP impact point + CCRP release cue). Vacuum
  // ballistic; relative altitude is treated as height above the target/ground.
  const gsHoriz = v.vx != null && v.vy != null ? Math.hypot(v.vx, v.vy) : v.groundspeed;
  const vDown = v.vz != null ? v.vz : -v.vario;
  const agl = Math.max(0, v.altitude);
  const impact = ballisticImpact({ heightAGL: agl, vDown, groundSpeed: gsHoriz, terminalV: config.payloadTerminalV });
  const deliveryReady = agl > 1;
  const clampDeg = (d: number) => Math.max(-17, Math.min(17, d));
  // CCIP pipper: along the velocity ground track, depressed below the horizon.
  const ccipDepr = depressionDeg(agl, impact.range);
  const ccipDXp = Math.max(-26, Math.min(26, wrap180(course - v.heading))) * PX_PER_DEG;
  const ccipDeg = v.pitch + ccipDepr;
  const ccipDYp = clampDeg(ccipDeg) * PX_PER_DEG;
  const ccipOff = ccipDeg > 17;
  // CCRP: designated target diamond + release cue.
  const hasTarget = v.targetBearing != null && v.targetRange != null;
  const tgtAz = hasTarget ? Math.max(-26, Math.min(26, wrap180(v.targetBearing! - v.heading))) * PX_PER_DEG : 0;
  const tgtDepr = hasTarget ? depressionDeg(agl, v.targetRange!) : 0;
  const tgtDeg = v.pitch + tgtDepr;
  const tgtDYp = clampDeg(tgtDeg) * PX_PER_DEG;
  const tgtOff = tgtDeg > 17;
  const releaseNow = hasTarget && deliveryReady && impact.range >= (v.targetRange ?? 0);
  const timeToRelease = hasTarget && gsHoriz > 0.5 ? (v.targetRange! - impact.range) / gsHoriz : Infinity;
  // CCRP solution cue: descends the steering line from the velocity vector to
  // the target reticle as the ballistic throw closes on the target range.
  const fpmYpx = CY + fpmDY;
  const relFrac = hasTarget && (v.targetRange ?? 0) > 0 ? Math.max(0, Math.min(1, impact.range / v.targetRange!)) : 0;
  const cueY = fpmYpx + relFrac * (CY + tgtDYp - fpmYpx);

  // Drag handling for movable widgets (designer only).
  const toViewBox = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = svg.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    const r = p.matrixTransform(ctm.inverse());
    return { x: r.x, y: r.y };
  };

  const startDrag = (id: string) => (e: React.PointerEvent) => {
    if (!editable || !onMovePosition) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const start = toViewBox(e.clientX, e.clientY);
    const base = pos(id);
    if (!start) return;
    const offX = base.x - start.x;
    const offY = base.y - start.y;
    const move = (ev: PointerEvent) => {
      const cur = toViewBox(ev.clientX, ev.clientY);
      if (!cur) return;
      const nx = Math.max(20, Math.min(VB_W - 20, cur.x + offX));
      const ny = Math.max(20, Math.min(VB_H - 20, cur.y + offY));
      onMovePosition(id, nx, ny);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const Movable = ({ id, width, height, anchorRight, children }: { id: string; width: number; height: number; anchorRight?: boolean; children: React.ReactNode }) => {
    const p = pos(id);
    return (
      <g transform={`translate(${p.x} ${p.y})`} style={{ pointerEvents: editable ? 'auto' : 'none', cursor: editable ? 'move' : 'default' }} onPointerDown={startDrag(id)}>
        {editable && (
          <rect x={anchorRight ? -width : 0} y={-height + 18} width={width} height={height} rx={6} fill="rgba(255,255,255,0.04)" stroke={C} strokeOpacity={0.4} strokeDasharray="5 4" strokeWidth={1.5} />
        )}
        {children}
      </g>
    );
  };

  const glow = config.glow
    ? `drop-shadow(0 0 3px ${C}) drop-shadow(0 1px 2px rgba(0,0,0,0.85))`
    : 'drop-shadow(0 1px 2px rgba(0,0,0,0.9))';

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ filter: glow, pointerEvents: 'none', fontFamily: 'ui-monospace, monospace' }}
    >
      <g stroke={C} fill={C} strokeWidth={2 * lw}>
        {/* fixed instrument cluster (scaled around centre) */}
        <g transform={`translate(${CX} ${CY}) scale(${config.scale}) translate(${-CX} ${-CY})`}>
          {/* pitch ladder + horizon (conformal) */}
          {(w.pitchLadder || w.horizon) && (
            <g transform={`rotate(${-v.roll} ${CX} ${CY})`}>
              {ladder.map((r) => {
                const y = CY + r.norm * PITCH_BAND;
                if (r.deg === 0) {
                  if (!w.horizon) return null;
                  return (
                    <g key="h" strokeWidth={2.5 * lw}>
                      <line x1={CX - 560} y1={y} x2={CX - 120} y2={y} />
                      <line x1={CX + 120} y1={y} x2={CX + 560} y2={y} />
                    </g>
                  );
                }
                if (!w.pitchLadder) return null;
                const up = r.deg > 0;
                const half = 150;
                const tick = up ? 16 : -16;
                return (
                  <g key={r.deg} strokeDasharray={up ? undefined : '12 9'}>
                    <line x1={CX - half} y1={y} x2={CX - 64} y2={y} />
                    <line x1={CX - half} y1={y} x2={CX - half} y2={y + tick} />
                    <line x1={CX + 64} y1={y} x2={CX + half} y2={y} />
                    <line x1={CX + half} y1={y} x2={CX + half} y2={y + tick} />
                    <text x={CX - half - 12} y={y + 7} fontSize={22} textAnchor="end" stroke="none">{r.deg}</text>
                    <text x={CX + half + 12} y={y + 7} fontSize={22} stroke="none">{r.deg}</text>
                  </g>
                );
              })}
            </g>
          )}

          {w.boresight && (
            <g strokeWidth={3 * lw} fill="none">
              <line x1={CX - 95} y1={CY} x2={CX - 32} y2={CY} />
              <line x1={CX - 32} y1={CY} x2={CX - 16} y2={CY + 17} />
              <line x1={CX + 32} y1={CY} x2={CX + 95} y2={CY} />
              <line x1={CX + 32} y1={CY} x2={CX + 16} y2={CY + 17} />
            </g>
          )}

          {w.fpm && (
            <g transform={`translate(${CX + fpmDX} ${CY + fpmDY})`} strokeWidth={3 * lw} fill="none">
              <circle cx={0} cy={0} r={17} />
              <line x1={17} y1={0} x2={45} y2={0} />
              <line x1={-17} y1={0} x2={-45} y2={0} />
              <line x1={0} y1={-17} x2={0} y2={-34} />
            </g>
          )}

          {/* CCIP — Projected Bomb Impact Line + bomb reticle (A-10 style). */}
          {w.ccip && deliveryReady && (
            <g fill="none">
              {/* Projected Bomb Impact Line (PBIL): velocity vector -> reticle. */}
              <line x1={CX + fpmDX} y1={CY + fpmDY} x2={CX + ccipDXp} y2={CY + ccipDYp} strokeWidth={2 * lw} />
              {/* CCIP bomb reticle: circle + cardinal ticks + centre pipper. */}
              <g transform={`translate(${CX + ccipDXp} ${CY + ccipDYp})`} strokeWidth={2.5 * lw}>
                <circle cx={0} cy={0} r={24} />
                <line x1={0} y1={-24} x2={0} y2={-33} />
                <line x1={-24} y1={0} x2={-33} y2={0} />
                <line x1={24} y1={0} x2={33} y2={0} />
                <circle cx={0} cy={0} r={2.5} fill={C} stroke="none" />
                {ccipOff && <polygon points="0,42 -8,30 8,30" fill={C} stroke="none" />}
              </g>
            </g>
          )}

          {/* CCRP — Azimuth Steering Line + bomb reticle + descending solution cue. */}
          {w.ccrp && deliveryReady && hasTarget && (
            <g fill="none">
              {/* Azimuth Steering Line (ASL) / projected bomb release line. */}
              <line x1={CX + tgtAz} y1={CY - PITCH_BAND} x2={CX + tgtAz} y2={CY + tgtDYp} strokeWidth={2 * lw} />
              {/* CCRP bomb reticle at the designated target. */}
              <g transform={`translate(${CX + tgtAz} ${CY + tgtDYp})`} strokeWidth={2.5 * lw}>
                <circle cx={0} cy={0} r={24} />
                <line x1={-24} y1={0} x2={-33} y2={0} />
                <line x1={24} y1={0} x2={33} y2={0} />
                <circle cx={0} cy={0} r={2.5} fill={C} stroke="none" />
                {tgtOff && <polygon points="0,42 -8,30 8,30" fill={C} stroke="none" />}
                <text x={38} y={6} fontSize={18} stroke="none" fill={C} opacity={0.85}>{v.targetLabel ?? 'TGT'}</text>
              </g>
              {/* Solution cue: rides the ASL down to the reticle at release. */}
              <circle cx={CX + tgtAz} cy={cueY} r={9} strokeWidth={2.5 * lw} />
              {/* Release cue. */}
              <g transform={`translate(${CX + tgtAz} ${CY + tgtDYp - 40})`} stroke="none" textAnchor="middle">
                {releaseNow ? (
                  <text x={0} y={0} fontSize={26} fontWeight="bold" fill="#ffb000">
                    RELEASE
                    <animate attributeName="opacity" values="1;0.25;1" dur="0.6s" repeatCount="indefinite" />
                  </text>
                ) : Number.isFinite(timeToRelease) && timeToRelease > 0 && timeToRelease < 30 ? (
                  <text x={0} y={0} fontSize={20} fill={C}>REL {timeToRelease.toFixed(1)}s</text>
                ) : null}
              </g>
            </g>
          )}

          {/* Time-of-fall + mode readout (A-10 lower-left delivery block). */}
          {(w.ccip || w.ccrp) && deliveryReady && (
            <g transform={`translate(150 ${CY + 150})`} stroke="none" fill={C}>
              <rect x={-6} y={-22} width={112} height={30} fill="rgba(0,0,0,0.4)" stroke={C} strokeWidth={1.5 * lw} />
              <text x={50} y={0} textAnchor="middle" fontSize={22}>TOF {impact.time.toFixed(1)}</text>
              <text x={50} y={28} textAnchor="middle" fontSize={16} opacity={0.8}>{w.ccrp && hasTarget ? 'CCRP' : 'CCIP'}</text>
            </g>
          )}

          {w.bankArc && <BankArc roll={v.roll} c={C} lw={lw} />}
          {w.headingTape && <HeadingTape ticks={hdg} heading={v.heading} homeRel={v.homeDirection} c={C} lw={lw} />}
          {w.airspeedTape && <VTape x={300} ticks={spd} value={spdDisp} label={`AS ${u.speedUnit}`} side="left" c={C} lw={lw} />}
          {w.altitudeTape && <VTape x={VB_W - 300} ticks={alt} value={altDisp} label={`ALT ${u.distUnit}`} side="right" c={C} lw={lw} />}
          {w.vsi && <VertSpeed climb={v.vario} c={C} lw={lw} />}
        </g>

        {/* movable corner widgets */}
        {w.status && (
          <Movable id="status" width={300} height={150}>
            <g stroke="none" fill={C}>
              <text x={0} y={0} fontSize={32} fontWeight="bold">{(v.mode || 'UNKNOWN').toUpperCase()}</text>
              <text x={0} y={34} fontSize={26} fill={v.armed ? WARN : C}>{v.armed ? 'ARMED' : 'DISARMED'}</text>
              {v.gpsSats != null && <text x={0} y={64} fontSize={22}>SAT {v.gpsSats}</text>}
              <text x={0} y={94} fontSize={22}>THR {v.throttle.toFixed(0)}%{v.gForce ? ` · ${v.gForce.toFixed(1)}G` : ''}</text>
            </g>
          </Movable>
        )}

        {w.battery && (
          <Movable id="battery" width={260} height={80} anchorRight>
            <g stroke="none" fill={v.batteryPercent < 20 ? WARN : C} textAnchor="end">
              <text x={0} y={0} fontSize={32} fontWeight="bold">{v.batteryVoltage.toFixed(1)}V</text>
              <text x={0} y={32} fontSize={24}>{v.batteryPercent.toFixed(0)}%</text>
            </g>
          </Movable>
        )}

        {w.home && (
          <Movable id="home" width={200} height={80}>
            <g stroke="none">
              <g transform={`rotate(${v.homeDirection})`}>
                <polygon points="0,-24 10,9 0,1 -10,9" fill={C} />
              </g>
              <text x={0} y={44} textAnchor="middle" fontSize={22} fill={C}>
                HOME {v.distance >= 1000 ? `${(v.distance / 1000).toFixed(2)}km` : `${v.distance.toFixed(0)}m`}
              </text>
            </g>
          </Movable>
        )}

        {w.linkGraph && v.linkHistory && v.linkHistory.length > 1 && (
          <Movable id="linkGraph" width={320} height={110}>
            <LinkSparkline history={v.linkHistory} label={v.linkLabel} c={C} />
          </Movable>
        )}
      </g>
    </svg>
  );
});

function BankArc({ roll, c, lw }: { roll: number; c: string; lw: number }) {
  const R = 300;
  const marks = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];
  return (
    <g fill="none" strokeWidth={2 * lw}>
      {marks.map((m) => {
        const a = (-90 + m) * DEG;
        const r2 = m % 30 === 0 ? R - 20 : R - 11;
        return <line key={m} x1={CX + R * Math.cos(a)} y1={CY + R * Math.sin(a)} x2={CX + r2 * Math.cos(a)} y2={CY + r2 * Math.sin(a)} />;
      })}
      <g transform={`rotate(${roll} ${CX} ${CY})`}>
        <polygon points={`${CX},${CY - R + 4} ${CX - 12},${CY - R + 26} ${CX + 12},${CY - R + 26}`} fill={c} stroke="none" />
      </g>
    </g>
  );
}

function HeadingTape({ ticks, heading, homeRel, c, lw }: { ticks: ReturnType<typeof headingTicks>; heading: number; homeRel: number; c: string; lw: number }) {
  const y = 70;
  const homeX = CX + (Math.max(-HDG_HALF, Math.min(HDG_HALF, homeRel)) / HDG_HALF) * HDG_BAND;
  return (
    <g>
      <line x1={CX - HDG_BAND} y1={y + 28} x2={CX + HDG_BAND} y2={y + 28} strokeWidth={1.5 * lw} opacity={0.55} />
      {ticks.map((t) => {
        const x = CX + t.norm * HDG_BAND;
        return (
          <g key={t.deg}>
            <line x1={x} y1={y + 28} x2={x} y2={t.major ? y + 12 : y + 20} strokeWidth={2 * lw} />
            {t.major && <text x={x} y={y + 6} textAnchor="middle" fontSize={t.cardinal ? 24 : 18} stroke="none" fill={c}>{t.cardinal ?? t.deg}</text>}
          </g>
        );
      })}
      {Math.abs(homeRel) <= HDG_HALF && <polygon points={`${homeX},${y + 30} ${homeX - 9},${y + 44} ${homeX + 9},${y + 44}`} fill="#ffd23f" stroke="none" />}
      <rect x={CX - 46} y={y - 26} width={92} height={30} fill="rgba(0,0,0,0.45)" stroke={c} strokeWidth={1.5 * lw} />
      <text x={CX} y={y - 4} textAnchor="middle" fontSize={24} stroke="none" fill={c}>{Math.round(heading) % 360}</text>
      <polygon points={`${CX},${y + 30} ${CX - 8},${y + 42} ${CX + 8},${y + 42}`} fill={c} stroke="none" />
    </g>
  );
}

function VTape({ x, ticks, value, label, side, c, lw }: { x: number; ticks: ReturnType<typeof verticalTapeTicks>; value: number; label: string; side: 'left' | 'right'; c: string; lw: number }) {
  const dir = side === 'left' ? -1 : 1;
  return (
    <g>
      <line x1={x} y1={CY - TAPE_BAND} x2={x} y2={CY + TAPE_BAND} strokeWidth={1.5 * lw} opacity={0.55} />
      {ticks.map((t) => {
        const yy = CY + t.norm * TAPE_BAND;
        const len = t.major ? 22 : 12;
        return (
          <g key={t.value}>
            <line x1={x} y1={yy} x2={x + dir * len} y2={yy} strokeWidth={2 * lw} />
            {t.major && <text x={x + dir * (len + 8)} y={yy + 6} textAnchor={side === 'left' ? 'end' : 'start'} fontSize={20} stroke="none" fill={c}>{t.value}</text>}
          </g>
        );
      })}
      <rect x={side === 'left' ? x - 102 : x + 8} y={CY - 19} width={94} height={38} fill="rgba(0,0,0,0.5)" stroke={c} strokeWidth={2 * lw} />
      <text x={side === 'left' ? x - 55 : x + 55} y={CY + 8} textAnchor="middle" fontSize={26} stroke="none" fill={c}>{value.toFixed(0)}</text>
      <text x={x} y={CY - TAPE_BAND - 14} textAnchor="middle" fontSize={18} stroke="none" fill={c} opacity={0.8}>{label}</text>
    </g>
  );
}

function VertSpeed({ climb, c, lw }: { climb: number; c: string; lw: number }) {
  const x = VB_W - 180;
  const max = 10;
  const y = CY - (Math.max(-max, Math.min(max, climb)) / max) * TAPE_BAND;
  return (
    <g>
      <line x1={x} y1={CY - TAPE_BAND} x2={x} y2={CY + TAPE_BAND} strokeWidth={1.5 * lw} opacity={0.45} />
      <line x1={x - 8} y1={CY} x2={x + 8} y2={CY} strokeWidth={1.5 * lw} opacity={0.45} />
      <line x1={x} y1={CY} x2={x} y2={y} strokeWidth={4 * lw} />
      <circle cx={x} cy={y} r={5} fill={c} stroke="none" />
      <text x={x} y={CY + TAPE_BAND + 22} textAnchor="middle" fontSize={18} stroke="none" fill={c} opacity={0.8}>VS {climb >= 0 ? '+' : ''}{climb.toFixed(1)}</text>
    </g>
  );
}

/** Link/throughput history graph drawn relative to the widget origin (top-left). */
function LinkSparkline({ history, label, c }: { history: number[]; label?: string; c: string }) {
  const w = 300;
  const h = 70;
  const n = history.length;
  const pts = history.map((val, i) => `${(i / (n - 1)) * w},${h - Math.max(0, Math.min(1, val)) * h}`).join(' ');
  return (
    <g>
      <rect x={-10} y={-20} width={w + 20} height={h + 38} rx={8} fill="rgba(0,0,0,0.4)" stroke={c} strokeOpacity={0.5} strokeWidth={1.5} />
      <text x={0} y={-2} fontSize={18} stroke="none" fill={c}>{label ?? 'LINK'}</text>
      <line x1={0} y1={h} x2={w} y2={h} strokeWidth={1} opacity={0.4} />
      <polyline points={pts} fill="none" stroke={c} strokeWidth={2} />
    </g>
  );
}
