/**
 * Live data source for the green fighter HUD over the camera video. The HUD
 * itself (FighterHud) is pure; this maps the telemetry store into it, including
 * NED velocity so the flight-path marker reflects true track (with wind drift).
 */

import { memo } from 'react';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { useMissionStore } from '../../../stores/mission-store';
import { useHudStore } from '../../../stores/hud-store';
import { useSelfActiveTarget } from '../../../stores/command-target-store';
import { bearingDeg, haversineMeters, pickForwardTarget } from '../../../utils/osd/live-telemetry';
import { wrap180 } from './hud-geometry';
import { useLinkHistory } from './useLinkHistory';
import { FighterHud, type FighterHudValues } from './FighterHud';

export const LiveFighterHud = memo(function LiveFighterHud() {
  const t = useTelemetryStore();
  const home = useMissionStore((s) => s.homePosition);
  const missionItems = useMissionStore((s) => s.missionItems);
  const activeTarget = useSelfActiveTarget();
  const config = useHudStore((s) => s.config);
  const linkHistory = useLinkHistory(config.widgets.linkGraph);

  const lat = t.gps.lat || t.position.lat;
  const lon = t.gps.lon || t.position.lon;
  const heading = t.vfrHud.heading || t.attitude.yaw;

  let distance = 0;
  let homeDirection = 0;
  if (home && (lat || lon)) {
    distance = haversineMeters(lat, lon, home.lat, home.lon);
    homeDirection = wrap180(bearingDeg(lat, lon, home.lat, home.lon) - heading);
  }

  // CCRP designated target, in priority order:
  //  1. an on-the-fly "Move here" (guided goto) commanded from the map, else
  //  2. the nearest pending drop waypoint ahead - geometric, not FC mission
  //     index, so it auto-advances drop-to-drop in manual FPV flight.
  let targetBearing: number | undefined;
  let targetRange: number | undefined;
  let targetLabel: string | undefined;
  if (config.widgets.ccrp && (lat || lon)) {
    if (activeTarget?.type === 'goto') {
      targetRange = haversineMeters(lat, lon, activeTarget.lat, activeTarget.lon);
      targetBearing = bearingDeg(lat, lon, activeTarget.lat, activeTarget.lon);
      targetLabel = 'MOVE';
    } else {
      const located = missionItems.filter((m) => m.latitude || m.longitude);
      const tgt = pickForwardTarget(lat, lon, heading, located);
      if (tgt) {
        targetRange = tgt.range;
        targetBearing = tgt.bearing;
        targetLabel = tgt.seq != null ? `WP${tgt.seq}` : 'TGT';
      }
    }
  }

  const v: FighterHudValues = {
    roll: t.attitude.roll,
    pitch: t.attitude.pitch,
    heading,
    airspeed: t.vfrHud.airspeed,
    groundspeed: t.vfrHud.groundspeed,
    altitude: t.position.relativeAlt || t.vfrHud.alt,
    vario: t.vfrHud.climb,
    throttle: t.vfrHud.throttle,
    vx: t.position.vx,
    vy: t.position.vy,
    vz: t.position.vz,
    batteryVoltage: t.battery.voltage,
    batteryPercent: t.battery.remaining,
    mode: t.flight.mode,
    armed: t.flight.armed,
    distance,
    homeDirection,
    gpsSats: t.gps.satellites,
    linkHistory,
    linkLabel: 'RC LINK',
    targetBearing,
    targetRange,
    targetLabel,
  };

  return <FighterHud v={v} config={config} />;
});
