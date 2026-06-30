/**
 * Per-vehicle telemetry, keyed by vehicleKey.
 *
 * The legacy `telemetry-store` holds a single flat snapshot that the existing
 * views read; it now reflects only the *active* vehicle (gated in App.tsx). This
 * store holds the accumulated telemetry for *every* vehicle so the fleet strip
 * and the multi-marker map (Sub-spec C) can render all vehicles at once without
 * disturbing the single-vehicle views.
 *
 * Fed by the same TELEMETRY_BATCH IPC stream: App.tsx routes each batch here by
 * its tagged `__vehicleKey`, then also applies it to the flat store when it is
 * the active vehicle.
 */

import { create } from 'zustand';
import type { TelemetryBatch } from './telemetry-store';

/** Accumulated telemetry for one vehicle. Same optional-field shape as a batch. */
export type VehicleTelemetry = Omit<TelemetryBatch, '__vehicleKey'> & {
  /** Wall-clock ms of the last batch applied to this vehicle. */
  lastUpdate: number;
};

interface FleetTelemetryStore {
  byVehicle: Record<string, VehicleTelemetry>;
  /** Merge a batch into a vehicle's accumulated telemetry. */
  applyBatch: (vehicleKey: string, batch: TelemetryBatch) => void;
  /** Drop a vehicle's telemetry (on vehicle lost / disconnect). */
  removeVehicle: (vehicleKey: string) => void;
  clear: () => void;
}

export const useFleetTelemetryStore = create<FleetTelemetryStore>((set, get) => ({
  byVehicle: {},

  applyBatch: (vehicleKey, batch) => {
    const { __vehicleKey: _ignored, ...fields } = batch;
    const prev = get().byVehicle[vehicleKey];
    set({
      byVehicle: {
        ...get().byVehicle,
        [vehicleKey]: { ...prev, ...fields, lastUpdate: Date.now() },
      },
    });
  },

  removeVehicle: (vehicleKey) => {
    const next = { ...get().byVehicle };
    delete next[vehicleKey];
    set({ byVehicle: next });
  },

  clear: () => set({ byVehicle: {} }),
}));
