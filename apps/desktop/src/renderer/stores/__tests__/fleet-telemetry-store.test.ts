import { describe, it, expect, beforeEach } from 'vitest';
import { useFleetTelemetryStore } from '../fleet-telemetry-store';
import type { TelemetryBatch } from '../telemetry-store';

const reset = () => useFleetTelemetryStore.setState({ byVehicle: {} });

describe('fleet-telemetry-store', () => {
  beforeEach(reset);

  it('accumulates batches per vehicle and strips __vehicleKey', () => {
    const store = useFleetTelemetryStore.getState();
    const batch: TelemetryBatch = {
      __vehicleKey: 't1:1.1',
      position: { lat: 1, lon: 2, alt: 3, relativeAlt: 3, vx: 0, vy: 0, vz: 0 },
    };
    store.applyBatch('t1:1.1', batch);
    const v = useFleetTelemetryStore.getState().byVehicle['t1:1.1']!;
    expect(v.position?.lat).toBe(1);
    expect('__vehicleKey' in v).toBe(false);
    expect(v.lastUpdate).toBeGreaterThan(0);
  });

  it('merges successive batches for the same vehicle', () => {
    const store = useFleetTelemetryStore.getState();
    store.applyBatch('t1:1.1', { battery: { voltage: 12, current: 1, remaining: 80 } });
    store.applyBatch('t1:1.1', { vfrHud: { airspeed: 0, groundspeed: 5, heading: 90, throttle: 50, alt: 10, climb: 0 } });
    const v = useFleetTelemetryStore.getState().byVehicle['t1:1.1']!;
    expect(v.battery?.voltage).toBe(12);
    expect(v.vfrHud?.groundspeed).toBe(5);
  });

  it('keeps vehicles isolated from each other', () => {
    const store = useFleetTelemetryStore.getState();
    store.applyBatch('t1:1.1', { battery: { voltage: 12, current: 0, remaining: 50 } });
    store.applyBatch('t1:9.1', { battery: { voltage: 5, current: 0, remaining: 10 } });
    const s = useFleetTelemetryStore.getState().byVehicle;
    expect(s['t1:1.1']?.battery?.voltage).toBe(12);
    expect(s['t1:9.1']?.battery?.voltage).toBe(5);
  });

  it('removeVehicle drops only that vehicle', () => {
    const store = useFleetTelemetryStore.getState();
    store.applyBatch('t1:1.1', { battery: { voltage: 12, current: 0, remaining: 50 } });
    store.applyBatch('t1:9.1', { battery: { voltage: 5, current: 0, remaining: 10 } });
    store.removeVehicle('t1:9.1');
    const s = useFleetTelemetryStore.getState().byVehicle;
    expect(s['t1:1.1']).toBeDefined();
    expect(s['t1:9.1']).toBeUndefined();
  });
});
