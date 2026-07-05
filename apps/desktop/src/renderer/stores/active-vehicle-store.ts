/**
 * Active vehicle store - renderer-side mirror of the connection registry's
 * known vehicles plus the user's "currently selected" pointer.
 *
 * Role:
 *   - Mirrors the registry's vehicle list (kept in sync via the
 *     COMMS_VEHICLE_DISCOVERED / COMMS_VEHICLE_LOST IPC events).
 *   - Holds the active vehicle pointer that per-vehicle store projections will
 *     read (Sub-spec B) and the fleet UI will drive (Sub-spec C).
 *   - Auto-promotes the first discovered vehicle to active so single-vehicle
 *     users see no behavioral change at all.
 */

import { create } from 'zustand';
import type { VehicleInfoIpc } from '../../shared/ipc-channels';

interface ActiveVehicleState {
  /** The currently selected vehicle's key, or null if nothing is selected. */
  activeVehicleKey: string | null;
  /** The transport that owns the active vehicle. Cached for convenience. */
  activeTransportId: string | null;
  /**
   * Every vehicle the registry has reported. Indexed by `key` for fast lookup;
   * stored as a record (not a Map) so selector subscribers get structural
   * equality.
   */
  knownVehicles: Record<string, VehicleInfoIpc>;
  /**
   * Vehicles the user has multi-selected for group commands (fleet strip
   * checkboxes). Independent of the single active vehicle.
   */
  selectedVehicleKeys: string[];

  /**
   * When a leader-follower formation is active, the leader's key. The fleet strip
   * renders the rest as wingmen nested under it. Null = no formation.
   */
  formationLeaderKey: string | null;

  /**
   * Keys of the vehicles actually in the active formation (leader + its wingmen).
   * May be a subset of the fleet - the operator can form only some vehicles. The
   * fleet strip nests these under the leader; everyone else stays a free vehicle.
   */
  formationMemberKeys: string[];

  /** Set the active selection. Pass null for both to clear. */
  setActive: (transportId: string | null, vehicleKey: string | null) => void;

  /** Toggle a vehicle's membership in the group-command selection. */
  toggleSelected: (vehicleKey: string) => void;
  /** Replace the group-command selection. */
  setSelected: (vehicleKeys: string[]) => void;

  /** Set (or clear with null) the active formation leader. */
  setFormationLeader: (vehicleKey: string | null) => void;
  /** Replace the set of vehicles in the active formation. */
  setFormationMembers: (vehicleKeys: string[]) => void;

  /**
   * Record a vehicle the registry just discovered. Adds it to `knownVehicles`
   * and, if nothing is active, auto-promotes it. The auto-promotion keeps
   * single-vehicle behavior unchanged: the first heartbeat after connect makes
   * the new vehicle active with no extra UI step.
   */
  recordDiscovered: (vehicle: VehicleInfoIpc) => void;

  /**
   * Drop a vehicle the registry has lost, by key. Removes it from
   * `knownVehicles` and, if it was active, clears the active pointer.
   */
  recordLost: (vehicleKey: string) => void;

  /** Replace the entire known-vehicles map (used after a COMMS_LIST_VEHICLES poll). */
  hydrate: (vehicles: VehicleInfoIpc[]) => void;

  /** Clear everything - used by mode switching and disconnect-all flows. */
  clearAll: () => void;
}

export const useActiveVehicleStore = create<ActiveVehicleState>((set, get) => ({
  activeVehicleKey: null,
  activeTransportId: null,
  knownVehicles: {},
  selectedVehicleKeys: [],
  formationLeaderKey: null,
  formationMemberKeys: [],

  setActive: (transportId, vehicleKey) => {
    set({ activeTransportId: transportId, activeVehicleKey: vehicleKey });
  },

  setFormationLeader: (vehicleKey) => set({ formationLeaderKey: vehicleKey }),
  setFormationMembers: (vehicleKeys) => set({ formationMemberKeys: vehicleKeys }),

  toggleSelected: (vehicleKey) => {
    const current = get().selectedVehicleKeys;
    set({
      selectedVehicleKeys: current.includes(vehicleKey)
        ? current.filter((k) => k !== vehicleKey)
        : [...current, vehicleKey],
    });
  },

  setSelected: (vehicleKeys) => set({ selectedVehicleKeys: vehicleKeys }),

  recordDiscovered: (vehicle) => {
    const next = { ...get().knownVehicles, [vehicle.key]: vehicle };
    const shouldPromote = get().activeVehicleKey === null;
    set({
      knownVehicles: next,
      ...(shouldPromote
        ? { activeVehicleKey: vehicle.key, activeTransportId: vehicle.transportId }
        : {}),
    });
  },

  recordLost: (vehicleKey) => {
    const next = { ...get().knownVehicles };
    delete next[vehicleKey];
    const wasActive = get().activeVehicleKey === vehicleKey;
    const wasLeader = get().formationLeaderKey === vehicleKey;
    set({
      knownVehicles: next,
      selectedVehicleKeys: get().selectedVehicleKeys.filter((k) => k !== vehicleKey),
      formationMemberKeys: get().formationMemberKeys.filter((k) => k !== vehicleKey),
      ...(wasActive ? { activeVehicleKey: null, activeTransportId: null } : {}),
      ...(wasLeader ? { formationLeaderKey: null, formationMemberKeys: [] } : {}),
    });
  },

  hydrate: (vehicles) => {
    const map: Record<string, VehicleInfoIpc> = {};
    for (const v of vehicles) {
      map[v.key] = v;
    }
    const patch: Partial<ActiveVehicleState> = { knownVehicles: map };
    // Adopt the active selection the roster reports (set by the main process), so
    // a window that opens *after* the selection was made — e.g. a popped-out
    // panel — still knows the active vehicle. The change broadcast only covers
    // future changes, never the current state. Fall back to the sole vehicle in
    // single-vehicle mode so it works even before any explicit selection.
    if (get().activeVehicleKey === null) {
      const active = vehicles.find((v) => v.isActive) ?? (vehicles.length === 1 ? vehicles[0] : undefined);
      if (active) {
        patch.activeVehicleKey = active.key;
        patch.activeTransportId = active.transportId;
      }
    }
    set(patch);
  },

  clearAll: () => {
    set({ activeVehicleKey: null, activeTransportId: null, knownVehicles: {}, selectedVehicleKeys: [], formationLeaderKey: null, formationMemberKeys: [] });
  },
}));
