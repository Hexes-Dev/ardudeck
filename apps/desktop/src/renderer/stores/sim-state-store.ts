/**
 * Sim State Store
 *
 * Decode-only Zustand store for the ArduDeck in-app simulator. Opens a
 * WebSocket to the headless sim-engine (port reported on ArduPilotSitlStatus
 * as `simStateWsPort`), parses incoming StateMessages, and keeps the latest
 * state per vehicle. The 3D world reads from here; there is NO business logic
 * here beyond connection lifecycle + message ingestion.
 */

import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

/**
 * Mirror of the sim-engine `StateMessage` wire type (apps/sim-engine/src/
 * state-ws.ts). Kept local to avoid a renderer → sim-engine import edge; the
 * fields below are validated structurally by `parseStateMessage`.
 */
export interface SimStateMessage {
  type: 'state';
  id: string;
  home: { lat: number; lng: number; alt: number; heading: number };
  timestamp: number;
  /** NED metres from home origin (down is +z). */
  position: [number, number, number];
  velocity: [number, number, number];
  /** Body→world, [w, x, y, z]. */
  quaternion: [number, number, number, number];
  euler: { roll: number; pitch: number; yaw: number };
  batteryVoltage?: number;
}

export type SimConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SimStateStore {
  status: SimConnectionStatus;
  /** Port we are connected (or connecting) to, if any. */
  port: number | null;
  /** Latest decoded state, keyed by vehicle id. */
  vehicles: Map<string, SimStateMessage>;
  /** Monotonic counter bumped on every ingest, so consumers can detect change. */
  updateCount: number;

  // Actions
  connect: (port: number) => void;
  disconnect: () => void;
  /** Ingest one already-parsed message (exposed for the WS handler + tests). */
  ingest: (msg: SimStateMessage) => void;
}

// =============================================================================
// Pure helpers (unit-tested)
// =============================================================================

function isNumberTriple(v: unknown): v is [number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    typeof v[2] === 'number'
  );
}

function isNumberQuad(v: unknown): v is [number, number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 4 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    typeof v[2] === 'number' &&
    typeof v[3] === 'number'
  );
}

/**
 * Parse + structurally validate a raw WS payload (JSON string or object) into a
 * SimStateMessage. Returns null for anything that isn't a well-formed state
 * message so a malformed frame can never corrupt the store.
 */
export function parseStateMessage(raw: unknown): SimStateMessage | null {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const m = obj as Record<string, unknown>;
  if (m.type !== 'state') return null;
  if (typeof m.id !== 'string') return null;
  if (typeof m.timestamp !== 'number') return null;
  if (!isNumberTriple(m.position)) return null;
  if (!isNumberTriple(m.velocity)) return null;
  if (!isNumberQuad(m.quaternion)) return null;

  const home = m.home as Record<string, unknown> | undefined;
  if (
    !home ||
    typeof home.lat !== 'number' ||
    typeof home.lng !== 'number' ||
    typeof home.alt !== 'number' ||
    typeof home.heading !== 'number'
  ) {
    return null;
  }

  const euler = m.euler as Record<string, unknown> | undefined;
  if (
    !euler ||
    typeof euler.roll !== 'number' ||
    typeof euler.pitch !== 'number' ||
    typeof euler.yaw !== 'number'
  ) {
    return null;
  }

  return {
    type: 'state',
    id: m.id,
    home: { lat: home.lat, lng: home.lng, alt: home.alt, heading: home.heading },
    timestamp: m.timestamp,
    position: m.position,
    velocity: m.velocity,
    quaternion: m.quaternion,
    euler: { roll: euler.roll, pitch: euler.pitch, yaw: euler.yaw },
    ...(typeof m.batteryVoltage === 'number' ? { batteryVoltage: m.batteryVoltage } : {}),
  };
}

// =============================================================================
// Store
// =============================================================================

// The live socket is module-scoped, not in the store, so React state stays
// serializable and the WebSocket isn't recreated on every render.
let socket: WebSocket | null = null;

export const useSimStateStore = create<SimStateStore>()((set, get) => ({
  status: 'disconnected',
  port: null,
  vehicles: new Map(),
  updateCount: 0,

  connect: (port: number) => {
    // Already connected/connecting to this port — no-op.
    if (socket && get().port === port && (get().status === 'connected' || get().status === 'connecting')) {
      return;
    }
    // Tear down any prior socket before opening a new one.
    get().disconnect();

    set({ status: 'connecting', port, vehicles: new Map(), updateCount: 0 });

    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}`);
    } catch {
      set({ status: 'error' });
      return;
    }
    socket = ws;

    ws.onopen = () => {
      // Guard against a stale socket finishing its handshake after disconnect.
      if (socket !== ws) return;
      set({ status: 'connected' });
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (socket !== ws) return;
      const msg = parseStateMessage(ev.data);
      if (msg) get().ingest(msg);
    };
    ws.onerror = () => {
      if (socket !== ws) return;
      set({ status: 'error' });
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      // Only flip to disconnected if we didn't already error out.
      set((s) => (s.status === 'error' ? s : { status: 'disconnected' }));
    };
  },

  disconnect: () => {
    if (socket) {
      const ws = socket;
      socket = null;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    set({ status: 'disconnected', port: null, vehicles: new Map(), updateCount: 0 });
  },

  ingest: (msg: SimStateMessage) => {
    set((s) => {
      const vehicles = new Map(s.vehicles);
      vehicles.set(msg.id, msg);
      return { vehicles, updateCount: s.updateCount + 1 };
    });
  },
}));
