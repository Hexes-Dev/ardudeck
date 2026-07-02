import { create } from 'zustand';
import type { InstalledModule, ModuleProgress, UpdateAvailable } from '../../shared/module-types.js';

interface ModuleState {
  // State
  modules: InstalledModule[];
  isLoading: boolean;
  error: string | null;
  activating: boolean;
  progress: ModuleProgress | null;
  updates: UpdateAvailable[];
  /** Slug currently being updated, or 'all' during an update-all sweep. */
  updating: string | null;

  // Actions
  loadModules: () => Promise<void>;
  activateLicense: (key: string) => Promise<{ success: boolean; error?: string }>;
  removeLicense: (key: string) => Promise<void>;
  checkUpdates: () => Promise<void>;
  /** Update one module to its latest published version. */
  updateModule: (slug: string) => Promise<{ success: boolean; error?: string }>;
  /** Update every module that has a pending update. Returns how many succeeded. */
  updateAll: () => Promise<number>;
  setProgress: (progress: ModuleProgress | null) => void;
  clearError: () => void;
}

export const useModuleStore = create<ModuleState>((set, get) => ({
  modules: [],
  isLoading: false,
  error: null,
  activating: false,
  progress: null,
  updates: [],
  updating: null,

  loadModules: async () => {
    set({ isLoading: true, error: null });
    try {
      const modules = await window.electronAPI.moduleList();
      set({ modules, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, isLoading: false });
    }
  },

  activateLicense: async (key: string) => {
    set({ activating: true, error: null, progress: null });
    try {
      const result = await window.electronAPI.moduleActivate(key);
      if (!result.success) {
        set({ activating: false, error: result.error || 'Activation failed' });
        return result;
      }
      // Refresh module list
      await get().loadModules();
      set({ activating: false });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ activating: false, error: message });
      return { success: false, error: message };
    }
  },

  removeLicense: async (key: string) => {
    set({ error: null });
    try {
      await window.electronAPI.moduleRemove(key);
      await get().loadModules();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
    }
  },

  checkUpdates: async () => {
    try {
      const updates = await window.electronAPI.moduleCheckUpdates();
      set({ updates });
    } catch (err) {
      console.error('[ModuleStore] Update check failed:', err);
    }
  },

  updateModule: async (slug: string) => {
    set({ updating: slug, error: null, progress: null });
    try {
      const result = await window.electronAPI.moduleUpdate(slug);
      if (!result.success) {
        set({ updating: null, error: result.error || 'Update failed' });
        return result;
      }
      await get().loadModules();
      await get().checkUpdates();
      set({ updating: null });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ updating: null, error: message });
      return { success: false, error: message };
    }
  },

  updateAll: async () => {
    const pending = get().updates.map((u) => u.slug);
    set({ updating: 'all', error: null, progress: null });
    let succeeded = 0;
    // Sequential on purpose: updates share the download pipe and the store,
    // and a licence covering a bundle updates several slugs in one call.
    for (const slug of pending) {
      // A previous iteration may have already cleared this slug's update
      // (bundle licences update sibling modules together).
      if (!get().updates.some((u) => u.slug === slug) && succeeded > 0) continue;
      const result = await window.electronAPI.moduleUpdate(slug);
      if (result.success) {
        succeeded += 1;
        await get().loadModules();
        await get().checkUpdates();
      } else {
        set({ error: result.error || `Update failed for ${slug}` });
      }
    }
    set({ updating: null });
    return succeeded;
  },

  setProgress: (progress) => set({ progress }),

  clearError: () => set({ error: null }),
}));
