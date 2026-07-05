/**
 * Sim-Engine Process Manager
 *
 * Spawns and supervises the headless `@ardudeck/sim-engine` process, which binds
 * the SITL JSON FDM UDP port and runs ArduDeck's own 6DOF physics. Mirrors the
 * lifecycle shape of `ardupilot-sitl-process.ts`.
 *
 * The engine is a plain Node program; we run it with Electron's bundled Node
 * (ELECTRON_RUN_AS_NODE) so packaged builds need no system Node. The desktop
 * build must include the engine's compiled `dist/` (resolved via require).
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export interface SimEngineStartOptions {
  /** UDP port for the JSON FDM backend (SITL connects here). Default 9002. */
  fdmPort?: number;
  /** WebSocket port the engine streams state on. Default 9020. */
  wsPort?: number;
  /** Vehicle dynamics model. Default 'copter'. */
  kind?: 'copter' | 'plane' | 'rover';
  /** Absolute path to a SITL custom-frame JSON to use for physics params. */
  framePath?: string;
  /** Home location, used for NED<->geo mapping in the engine. */
  home?: { lat: number; lng: number; alt: number; heading: number };
  /** Simulate battery sag (copter). Default true. */
  battery?: boolean;
  /** Inject IMU sensor noise. Default false. */
  noise?: boolean;
  /** Steady + turbulent wind as `n,e,d,intensity,tau`. Omit for calm. */
  wind?: string;
}

const DEFAULT_FDM_PORT = 9002;
const DEFAULT_WS_PORT = 9020;

class SimEngineProcessManager {
  private process: ChildProcess | null = null;
  private _isRunning = false;
  private _wsPort: number | null = null;

  get isRunning(): boolean {
    return this._isRunning;
  }

  get wsPort(): number | null {
    return this._wsPort;
  }

  /** Resolve the engine entry file from the workspace, or null if not built. */
  private resolveEntry(): string | null {
    let entry: string | null = null;
    try {
      const require = createRequire(import.meta.url);
      entry = require.resolve('@ardudeck/sim-engine');
    } catch {
      // Fallback for dev layouts where the package isn't linked into node_modules.
      const guess = path.resolve(moduleDir, '../../../../sim-engine/dist/main.js');
      entry = existsSync(guess) ? guess : null;
    }
    if (!entry) return null;
    // In a packaged app the resolved path is inside app.asar (a virtual archive);
    // child_process cannot execute from there. asarUnpack copies the engine to
    // app.asar.unpacked, so redirect to that real path. No-op in dev.
    if (entry.includes(`${path.sep}app.asar${path.sep}`)) {
      const unpacked = entry.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
      if (existsSync(unpacked)) return unpacked;
    }
    return entry;
  }

  async start(opts: SimEngineStartOptions): Promise<{ success: boolean; wsPort?: number; error?: string }> {
    if (this._isRunning) this.stop();

    const entry = this.resolveEntry();
    if (!entry) {
      return {
        success: false,
        error: 'sim-engine not built. Run: pnpm --filter @ardudeck/sim-engine exec tsc -b',
      };
    }

    const fdmPort = opts.fdmPort ?? DEFAULT_FDM_PORT;
    const wsPort = opts.wsPort ?? DEFAULT_WS_PORT;
    const args = [entry, '--fdm-port', String(fdmPort), '--ws-port', String(wsPort)];
    args.push('--kind', opts.kind ?? 'copter');
    if (opts.framePath) args.push('--frame', opts.framePath);
    if (opts.home) {
      args.push('--home', `${opts.home.lat},${opts.home.lng},${opts.home.alt},${opts.home.heading}`);
    }
    // Battery sag defaults on for copters; only meaningful with a frame file.
    if ((opts.battery ?? true) && (opts.kind ?? 'copter') === 'copter' && opts.framePath) {
      args.push('--battery');
    }
    if (opts.noise) args.push('--noise');
    if (opts.wind) args.push('--wind', opts.wind);

    try {
      this.process = spawn(process.execPath, args, {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this._isRunning = true;
      this._wsPort = wsPort;

      this.process.stdout?.on('data', (d: Buffer) => console.log('[sim-engine]', d.toString().trim()));
      this.process.stderr?.on('data', (d: Buffer) => console.error('[sim-engine]', d.toString().trim()));
      this.process.on('exit', () => {
        this._isRunning = false;
        this._wsPort = null;
        this.process = null;
      });
      this.process.on('error', (err) => {
        console.error('[sim-engine] process error:', err);
        this._isRunning = false;
      });

      // Give the UDP socket a moment to bind before SITL tries to reach it.
      await new Promise((r) => setTimeout(r, 250));
      return { success: true, wsPort };
    } catch (err) {
      this._isRunning = false;
      this._wsPort = null;
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  stop(): void {
    if (this.process) {
      try {
        this.process.kill('SIGTERM');
        const proc = this.process;
        setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* dead */ } }, 1500);
      } catch (err) {
        console.error('[sim-engine] failed to kill:', err);
      }
      this.process = null;
      this._isRunning = false;
      this._wsPort = null;
    }
  }
}

export const simEngineProcess = new SimEngineProcessManager();
