/**
 * Shared fleet-formation commands, used by both the rail glyph bar (FleetCoordination)
 * and the right-click menu (FleetContextMenu). Encapsulates orchestration-server
 * discovery, capability gating and the intent calls so the two surfaces stay in lock
 * step. Every action is one call - pick a glyph, the fleet forms up; no apply step.
 */

import { useOrchestrationStore } from '../stores/orchestration-store';
import { useActiveVehicleStore } from '../stores/active-vehicle-store';
import { useMissionStore } from '../stores/mission-store';
import { useFormationStore } from '../stores/formation-store';
import { SHAPE_BY_VALUE } from '../components/fleet/FormationGlyphs';
import { useFleetVehicles, selectActiveVehicle, type FleetVehicle } from './useFleet';

export interface FormationControl {
  /** True when an orchestration engine is connected. */
  hasServer: boolean;
  vehicles: FleetVehicle[];
  canTakeoff: boolean;
  canFollow: boolean;
  /** A formation is currently active. */
  forming: boolean;
  /** The current/intended leader (active formation leader, else selected vehicle). */
  leader: FleetVehicle | undefined;
  formationLeaderKey: string | null;
  shape: string;
  spacing: number;
  altStep: number;
  busy: boolean;
  setSpacing: (m: number) => void;
  setAltStep: (m: number) => void;
  /** Form up / re-form. Optional shape and leader overrides; both default to current. */
  formUp: (shapeValue?: string, leaderKeyOverride?: string) => Promise<void>;
  breakFormation: () => Promise<void>;
  /** Drop a single vehicle from the formation (leader/last -> full break). */
  releaseFromFormation: (key: string) => Promise<void>;
  takeOffAll: (altitude: number) => Promise<void>;
  startLeaderMission: () => Promise<void>;
}

export function useFormationControl(): FormationControl {
  const servers = useOrchestrationStore((s) => s.servers);
  const activeKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const formationLeaderKey = useActiveVehicleStore((s) => s.formationLeaderKey);
  const setFormationLeader = useActiveVehicleStore((s) => s.setFormationLeader);
  const setFormationMembers = useActiveVehicleStore((s) => s.setFormationMembers);
  const vehicles = useFleetVehicles();
  const shape = useFormationStore((s) => s.shape);
  const spacing = useFormationStore((s) => s.spacing);
  const altStep = useFormationStore((s) => s.altStep);
  const setShape = useFormationStore((s) => s.setShape);
  const setSpacing = useFormationStore((s) => s.setSpacing);
  const setAltStep = useFormationStore((s) => s.setAltStep);
  const busy = useFormationStore((s) => s.busy);
  const setBusy = useFormationStore((s) => s.setBusy);

  // Prefer an engine that advertises capabilities; fall back to any connected one so a
  // stale build with empty caps doesn't hide the actions (our orchestrator always
  // supports these intents).
  const server = Object.values(servers).find((s) => s.capabilities.length > 0) ?? Object.values(servers)[0];
  const caps = server
    ? (server.capabilities.length > 0 ? server.capabilities : ['takeoff.synchronized', 'follow.leader', 'formation.stop'])
    : [];
  const canTakeoff = caps.includes('takeoff.synchronized');
  const canFollow = caps.includes('follow.leader') && vehicles.length >= 2;
  const forming = formationLeaderKey !== null;

  const leader = forming
    ? vehicles.find((v) => v.key === formationLeaderKey)
    : (vehicles.find((v) => v.key === activeKey) ?? vehicles[0]);

  const submit = async (kind: string, sysids: number[] | undefined, payload: unknown): Promise<void> => {
    if (!server) return;
    setBusy(true);
    try {
      await window.electronAPI?.submitIntent?.(server.transportId, { kind, vehicleSysids: sysids, payload });
    } finally {
      setBusy(false);
    }
  };

  const formUp = async (shapeValue?: string, leaderKeyOverride?: string): Promise<void> => {
    const nextShape = shapeValue ?? shape;
    const target = vehicles.find((v) => v.key === (leaderKeyOverride ?? leader?.key));
    if (!target) return;
    if (shapeValue && shapeValue !== shape) {
      setShape(shapeValue);
      const preset = SHAPE_BY_VALUE.get(shapeValue)?.spacing;
      if (preset) setSpacing(preset);
    }
    const spacingM = (shapeValue && SHAPE_BY_VALUE.get(shapeValue)?.spacing) || spacing;
    // Followers: if the operator has multi-selected vehicles (checkboxes), form up only
    // those on the leader; otherwise the whole fleet. Lets you fly a subset in formation
    // while other vehicles keep doing their own thing.
    const selected = useActiveVehicleStore.getState().selectedVehicleKeys;
    const checkedWingmen = vehicles.filter((v) => v.key !== target.key && selected.includes(v.key));
    const followers = checkedWingmen.length > 0 ? checkedWingmen : vehicles.filter((v) => v.key !== target.key);
    const ordered = [target.sysid, ...followers.map((v) => v.sysid)];
    await submit('follow.leader', ordered, { spacingM, altStepM: altStep, shape: nextShape });
    setFormationLeader(target.key);
    setFormationMembers([target.key, ...followers.map((v) => v.key)]);
    // CRITICAL: command the leader now, else map/flight commands still target whatever
    // wingman was selected, the follow loop overrides them, and "nothing moves".
    selectActiveVehicle(target.key, target.transportId);
  };

  const breakFormation = async (): Promise<void> => {
    await submit('formation.stop', undefined, null);
    setFormationLeader(null);
    setFormationMembers([]);
  };

  // Drop ONE vehicle from the formation, leaving the rest in formation. Releasing the
  // leader (or the last wingman) ends the whole formation; releasing a wingman re-forms
  // the remaining vehicles without it, so the orchestrator stops commanding it.
  const releaseFromFormation = async (key: string): Promise<void> => {
    if (!forming) return;
    const memberKeys = useActiveVehicleStore.getState().formationMemberKeys;
    const leaderV = vehicles.find((v) => v.key === formationLeaderKey);
    // Remaining = current formation members minus the one leaving and the leader.
    const remaining = vehicles.filter((v) => memberKeys.includes(v.key) && v.key !== key && v.key !== formationLeaderKey);
    if (key === formationLeaderKey || !leaderV || remaining.length === 0) {
      await breakFormation();
      return;
    }
    // Stop the whole follow loop first (releases EVERY vehicle, including the one
    // leaving), then re-form only the remaining ones - simply omitting a vehicle from a
    // re-issued follow.leader doesn't make the orchestrator let it go.
    await submit('formation.stop', undefined, null);
    const ordered = [leaderV.sysid, ...remaining.map((v) => v.sysid)];
    await submit('follow.leader', ordered, { spacingM: spacing, altStepM: altStep, shape });
    setFormationMembers([leaderV.key, ...remaining.map((v) => v.key)]);
    selectActiveVehicle(leaderV.key, leaderV.transportId);
  };

  const takeOffAll = (altitude: number): Promise<void> =>
    submit('takeoff.synchronized', vehicles.map((v) => v.sysid), { altitude });

  // Start ONLY the leader's mission (AUTO); wingmen stay in GUIDED and the follow loop
  // keeps formation. (Re)upload the leader's assigned WP group first so the operator
  // never has to remember a separate upload step.
  const startLeaderMission = async (): Promise<void> => {
    if (!leader) return;
    setBusy(true);
    try {
      const ms = useMissionStore.getState();
      const grp = ms.groups.find((g) => g.assignedVehicleKey === leader.key);
      if (grp) {
        const uploaded = await ms.uploadGroupToVehicle(grp.id, leader.key);
        if (!uploaded) return;
      }
      await window.electronAPI?.vehicleCommand?.(leader.key, { kind: 'mission-start' });
    } finally {
      setBusy(false);
    }
  };

  return {
    hasServer: !!server,
    vehicles,
    canTakeoff,
    canFollow,
    forming,
    leader,
    formationLeaderKey,
    shape,
    spacing,
    altStep,
    busy,
    setSpacing,
    setAltStep,
    formUp,
    breakFormation,
    releaseFromFormation,
    takeOffAll,
    startLeaderMission,
  };
}
