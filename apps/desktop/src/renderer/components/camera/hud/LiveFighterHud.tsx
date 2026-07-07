/**
 * Live data source for the green fighter HUD over the camera video. The HUD
 * itself (FighterHud) is pure; this maps the telemetry store into it, including
 * NED velocity so the flight-path marker reflects true track (with wind drift).
 */

import { memo } from 'react';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { useMissionStore } from '../../../stores/mission-store';
import { useHudStore } from '../../../stores/hud-store';
import { useConnectionStore } from '../../../stores/connection-store';
import { useSelfActiveTarget } from '../../../stores/command-target-store';
import { bearingDeg, haversineMeters, pickForwardTarget } from '../../../utils/osd/live-telemetry';
import { wrap180 } from './hud-geometry';
import { resolveHudProfile } from './hud-config';
import { useLinkHistory } from './useLinkHistory';
import { FighterHud, type FighterHudValues } from './FighterHud';

export const LiveFighterHud = memo(function LiveFighterHud() {
  const t = useTelemetryStore();
  const home = useMissionStore((s) => s.homePosition);
  const missionItems = useMissionStore((s) => s.missionItems);
  const activeTarget = useSelfActiveTarget();
  const config = useHudStore((s) => s.config);
  const mavType = useConnectionStore((s) => s.connectionState.mavType);
  const profile = resolveHudProfile(config.profile, mavType);
  const widgets = profile === 'ground' ? config.widgetsGround : config.widgets;
  const linkHistory = useLinkHistory(widgets.linkGraph);

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
  if (widgets.ccrp && (lat || lon)) {
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

  // Steering output: servo 1 is the ground-steering output on ArduPilot
  // Rover's conventional wiring. 0/undefined PWM means "no output yet".
  let steer: number | undefined;
  const steerPwm = t.servoOutput?.outputs[0];
  if (steerPwm && steerPwm >= 800 && steerPwm <= 2200) {
    steer = Math.max(-100, Math.min(100, ((steerPwm - 1500) / 500) * 100));
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
    current: t.battery.current,
    mode: t.flight.mode,
    armed: t.flight.armed,
    distance,
    homeDirection,
    gpsSats: t.gps.satellites,
    hdop: t.gps.hdop,
    lat,
    lon,
    windSpeed: t.wind.speed,
    linkHistory,
    linkLabel: 'RC LINK',
    targetBearing,
    targetRange,
    targetLabel,
    steer,
    wpDistance: t.navController?.wpDist,
    xtrackError: t.navController?.xtrackError,
  };

  return <FighterHud v={v} config={config} profile={profile} />;
});
