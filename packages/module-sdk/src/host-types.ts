import type { ComponentType } from 'react';
import type { ModuleManifest } from './manifest.js';

export interface PtyCreateOptions {
  shell: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

// --- Survey generator extension point -------------------------------------
// Structural mirror of the host's survey generator registry types
// (apps/desktop .../survey/generator-registry.ts). Kept loose on the config /
// result shapes so the SDK does not depend on renderer types; the host casts
// at the registration boundary.

export interface SurveyGeneratorCapabilities {
  /** Generator can take interior boundaries (no-fly zones) inside the ROI. */
  supportsHoles: boolean;
  /** Generator can take a separate workspace polygon (allowed flight area). */
  supportsWorkspace: boolean;
  /** Generator's track width / line spacing requires camera + overlap settings. */
  requiresCamera: boolean;
  /** Generator runs asynchronously (e.g. remote API call). */
  isAsync: boolean;
  /** Generator hits a network resource and is subject to remote failure modes. */
  isRemote: boolean;
}

export type SurveyGeneratorConfigField =
  | {
      type: 'number';
      id: string;
      label: string;
      default: number;
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
      description?: string;
    }
  | {
      type: 'boolean';
      id: string;
      label: string;
      default: boolean;
      description?: string;
    }
  | {
      type: 'select';
      id: string;
      label: string;
      default: string;
      options: Array<{ value: string; label: string }>;
      description?: string;
    };

/**
 * A survey coverage engine contributed by a module. `generate` receives the
 * host's SurveyConfig (polygon / holes / workspace as {lat,lng}[] rings,
 * camera + overlap + speed fields, and `engineParams` holding this
 * generator's declared configFields values) and must resolve to the host's
 * SurveyResult shape: `{ waypoints, photoPositions, footprints, stats,
 * warnings?, generatorResult? }`.
 */
export interface SurveyGeneratorRegistration {
  /** Stable reverse-DNS id, serialized into mission files. */
  id: string;
  version: string;
  displayName: string;
  description: string;
  capabilities: SurveyGeneratorCapabilities;
  configFields?: SurveyGeneratorConfigField[];
  generate(config: unknown): unknown | Promise<unknown>;
}

export interface RendererHostApi {
  moduleSlug: string;
  telemetry: {
    getSnapshot(): unknown;
    subscribe(listener: (s: unknown) => void): () => void;
  };
  connection: {
    getState(): unknown;
    subscribe(listener: (s: unknown) => void): () => void;
  };
  view: {
    getCurrent(): string;
    subscribe(listener: (v: string) => void): () => void;
  };
  params: {
    getAll(): Promise<unknown[]>;
    get(name: string): Promise<unknown>;
    set(name: string, value: number): Promise<void>;
  };
  pty: {
    create(opts: PtyCreateOptions): Promise<string>;
    write(id: string, data: string): Promise<void>;
    resize(id: string, cols: number, rows: number): Promise<void>;
    kill(id: string): Promise<void>;
    onData(id: string, cb: (d: string) => void): () => void;
    onExit(id: string, cb: (code: number) => void): () => void;
  };
  invoke(channel: string, data: unknown): Promise<unknown>;
  log(level: 'info' | 'warn' | 'error', ...args: unknown[]): void;
  registerMountPoint(name: 'floatingOverlay', component: ComponentType): void;
  survey: {
    /**
     * Contribute a coverage engine to the survey planner. It appears next to
     * the built-in patterns in the survey UI; the id must NOT use the
     * reserved `builtin.` prefix. Registering an id this module already
     * registered replaces it.
     */
    registerGenerator(reg: SurveyGeneratorRegistration): void;
    /** Remove a generator this module registered. Other modules' ids are ignored. */
    unregisterGenerator(id: string): void;
  };
}

export interface MainHostApi {
  moduleSlug: string;
  dataDir: string;
  readData(key: string): Promise<string | undefined>;
  writeData(key: string, value: string): Promise<void>;
  /**
   * Encrypted-at-rest storage for secrets (e.g. API keys), backed by the OS
   * keychain via Electron safeStorage. Falls back to plaintext with a warning
   * if OS encryption is unavailable. Prefer this over writeData for secrets.
   */
  secureRead(key: string): Promise<string | undefined>;
  secureWrite(key: string, value: string): Promise<void>;
  log(level: 'info' | 'warn' | 'error', ...args: unknown[]): void;
  onRendererMessage(
    channel: string,
    handler: (data: unknown) => unknown | Promise<unknown>,
  ): () => void;
}

export interface ModuleMainExports {
  activate?: (host: MainHostApi) => unknown | Promise<unknown>;
  deactivate?: () => void | Promise<void>;
}

export interface ModuleRendererExports {
  activate?: (host: RendererHostApi) => unknown | Promise<unknown>;
  deactivate?: () => void | Promise<void>;
}

export interface LoadedModuleInfo {
  slug: string;
  manifest: ModuleManifest;
  installPath: string;
}
