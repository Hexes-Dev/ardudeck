/**
 * Tests for sim-state-store.ts — the decode-only sim state store. We exercise
 * the pure parser and the ingest/disconnect reducer logic (no real WebSocket).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  useSimStateStore,
  parseStateMessage,
  type SimStateMessage,
} from './sim-state-store';

function makeMsg(overrides: Partial<SimStateMessage> = {}): SimStateMessage {
  return {
    type: 'state',
    id: 'v1',
    home: { lat: 42, lng: 19, alt: 0, heading: 270 },
    timestamp: 1.5,
    position: [1, 2, -3],
    velocity: [0.5, 0, -1],
    quaternion: [1, 0, 0, 0],
    euler: { roll: 0, pitch: 0, yaw: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  useSimStateStore.setState({
    status: 'disconnected',
    port: null,
    vehicles: new Map(),
    updateCount: 0,
  });
});

describe('parseStateMessage', () => {
  it('parses a valid JSON string payload', () => {
    const msg = makeMsg({ batteryVoltage: 12.4 });
    const parsed = parseStateMessage(JSON.stringify(msg));
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe('v1');
    expect(parsed!.position).toEqual([1, 2, -3]);
    expect(parsed!.batteryVoltage).toBe(12.4);
  });

  it('parses a plain object payload', () => {
    const parsed = parseStateMessage(makeMsg());
    expect(parsed).not.toBeNull();
    expect(parsed!.euler.yaw).toBe(0);
  });

  it('omits batteryVoltage when absent', () => {
    const parsed = parseStateMessage(makeMsg());
    expect(parsed).not.toBeNull();
    expect(parsed!.batteryVoltage).toBeUndefined();
  });

  it('returns null for non-state messages', () => {
    expect(parseStateMessage({ type: 'hello' })).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseStateMessage('{not json')).toBeNull();
  });

  it('returns null when position is not a 3-tuple', () => {
    const bad = { ...makeMsg(), position: [1, 2] };
    expect(parseStateMessage(bad)).toBeNull();
  });

  it('returns null when quaternion is not a 4-tuple', () => {
    const bad = { ...makeMsg(), quaternion: [1, 0, 0] };
    expect(parseStateMessage(bad)).toBeNull();
  });

  it('returns null when home is missing fields', () => {
    const bad = { ...makeMsg(), home: { lat: 1, lng: 2 } };
    expect(parseStateMessage(bad)).toBeNull();
  });
});

describe('ingest reducer', () => {
  it('adds a message to the vehicle map and bumps updateCount', () => {
    useSimStateStore.getState().ingest(makeMsg());
    const s = useSimStateStore.getState();
    expect(s.vehicles.size).toBe(1);
    expect(s.vehicles.get('v1')?.timestamp).toBe(1.5);
    expect(s.updateCount).toBe(1);
  });

  it('replaces an existing vehicle by id (keeps map size, latest wins)', () => {
    const store = useSimStateStore.getState();
    store.ingest(makeMsg({ timestamp: 1 }));
    store.ingest(makeMsg({ timestamp: 2 }));
    const s = useSimStateStore.getState();
    expect(s.vehicles.size).toBe(1);
    expect(s.vehicles.get('v1')?.timestamp).toBe(2);
    expect(s.updateCount).toBe(2);
  });

  it('tracks multiple vehicles independently', () => {
    const store = useSimStateStore.getState();
    store.ingest(makeMsg({ id: 'v1' }));
    store.ingest(makeMsg({ id: 'v2' }));
    const s = useSimStateStore.getState();
    expect(s.vehicles.size).toBe(2);
    expect(new Set(s.vehicles.keys())).toEqual(new Set(['v1', 'v2']));
  });

  it('produces a new Map reference on ingest (immutability for React)', () => {
    const before = useSimStateStore.getState().vehicles;
    useSimStateStore.getState().ingest(makeMsg());
    const after = useSimStateStore.getState().vehicles;
    expect(after).not.toBe(before);
  });
});

describe('disconnect reducer', () => {
  it('clears vehicles, resets status and port', () => {
    useSimStateStore.setState({ status: 'connected', port: 5780 });
    useSimStateStore.getState().ingest(makeMsg());
    expect(useSimStateStore.getState().vehicles.size).toBe(1);

    useSimStateStore.getState().disconnect();
    const s = useSimStateStore.getState();
    expect(s.status).toBe('disconnected');
    expect(s.port).toBeNull();
    expect(s.vehicles.size).toBe(0);
    expect(s.updateCount).toBe(0);
  });
});
