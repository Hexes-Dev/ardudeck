/**
 * The overlay stack drawn on top of a view, shared by the live camera feed
 * (CameraView) and the synthetic-vision world (SyntheticVisionView) so both get
 * identical, theme-consistent symbology.
 *
 * For the active ("primary") vehicle the full flight HUD (LiveFighterHud) is
 * available and supersedes the simpler horizon/crosshair/telemetry layers to
 * avoid double-drawing; grid tiles get the lightweight CameraOsd only.
 */

import type { OsdLayers } from '../../../shared/camera-types';
import type { FleetVehicle } from '../../hooks/useFleet';
import { CameraOsd } from './CameraOsd';
import { LiveFighterHud } from './hud/LiveFighterHud';

interface CameraOverlaysProps {
  vehicle: FleetVehicle | null;
  isPrimary: boolean;
  osd: OsdLayers;
  /** Roll/pitch in degrees for the conformal horizon (active vehicle only). */
  attitude?: { roll: number; pitch: number } | null;
  /** Frame-center ground coordinate, when projectable (live gimbal views only). */
  frameCenter?: { lat: number; lon: number } | null;
}

export function CameraOverlays({ vehicle, isPrimary, osd, attitude = null, frameCenter = null }: CameraOverlaysProps) {
  const hudActive = isPrimary && osd.hud;
  return (
    <>
      {hudActive && <LiveFighterHud />}
      <CameraOsd
        layers={
          hudActive
            ? { ...osd, cornerTelemetry: false, crosshair: false, artificialHorizon: false, northIndicator: false }
            : osd
        }
        vehicle={vehicle}
        attitude={isPrimary ? attitude : null}
        frameCenter={frameCenter}
      />
    </>
  );
}
