import { useTelemetryStore } from '../../stores/telemetry-store';
import { useSettingsStore } from '../../stores/settings-store';
import { formatAltitudeFromMeters } from '../../../shared/user-units.js';
import { PanelContainer, StatRow, formatNumber } from './panel-utils';

export function AltitudePanel() {
  const vfrHud = useTelemetryStore((s) => s.vfrHud);
  const position = useTelemetryStore((s) => s.position);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);

  return (
    <PanelContainer>
      <div className="space-y-1">
        <StatRow label="MSL" value={formatAltitudeFromMeters(vfrHud.alt, altitudeUnit)} highlight />
        <StatRow label="AGL" value={formatAltitudeFromMeters(position.relativeAlt, altitudeUnit)} />
        <StatRow label="Climb" value={`${vfrHud.climb >= 0 ? '+' : ''}${formatNumber(vfrHud.climb, 1)}`} unit="m/s" />
      </div>
    </PanelContainer>
  );
}
