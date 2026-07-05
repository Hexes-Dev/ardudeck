/**
 * Keeps the active-vehicle store in sync with the main-process registry.
 *
 * Mounted once at app startup (by App.tsx). Performs an initial hydrate via
 * COMMS_LIST_VEHICLES so the renderer has the registry's view of the world,
 * then subscribes to COMMS_VEHICLE_DISCOVERED / COMMS_VEHICLE_LOST to stay
 * current. Single-vehicle UX is unchanged: the store auto-promotes the first
 * discovered vehicle to active.
 */

import { useEffect } from 'react';
import { useActiveVehicleStore } from '../stores/active-vehicle-store';
import { useFleetTelemetryStore } from '../stores/fleet-telemetry-store';
import { useOrchestrationStore } from '../stores/orchestration-store';
import { applyActiveSelectionFromBroadcast } from './useFleet';

export function useActiveVehicleSync(): void {
  const recordDiscovered = useActiveVehicleStore((s) => s.recordDiscovered);
  const recordLost = useActiveVehicleStore((s) => s.recordLost);
  const hydrate = useActiveVehicleStore((s) => s.hydrate);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    // Initial hydrate from the main process registry. Covers hot-reload, where
    // the renderer reattaches to a main process that already has vehicles.
    api.listVehicles?.().then(hydrate).catch((err: unknown) => {
      console.warn('[useActiveVehicleSync] initial listVehicles failed', err);
    });

    const offDiscovered = api.onVehicleDiscovered?.((vehicle) => {
      recordDiscovered(vehicle);
    });

    const offLost = api.onVehicleLost?.((vehicleKey) => {
      recordLost(vehicleKey);
      useFleetTelemetryStore.getState().removeVehicle(vehicleKey);
    });

    const offOrch = api.onOrchestrationStatus?.((status) => {
      useOrchestrationStore.getState().applyStatus(status);
    });

    // Follow active-vehicle changes made in other windows (e.g. the 3D world).
    const offActive = api.onActiveVehicleChanged?.((payload) => {
      applyActiveSelectionFromBroadcast(payload.transportId, payload.vehicleKey ?? null);
    });

    return () => {
      offDiscovered?.();
      offLost?.();
      offOrch?.();
      offActive?.();
    };
  }, [recordDiscovered, recordLost, hydrate]);
}
