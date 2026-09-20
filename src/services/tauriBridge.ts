/**
 * Tauri v2 Bridge for AI Desktop Overlay
 * Transparently falls back to Express REST / SSE when running in browser dev preview.
 */

export const isTauri = (): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).__TAURI_INTERNALS__ ||
    (window as any).__TAURI__ ||
    (window as any).__TAURI_METADATA__ ||
    window.location.search.includes('mode=tauri')
  );
};

export interface TauriSystemMetrics {
  cpu_usage: number;
  ram_used_mb: number;
  ram_total_mb: number;
  ram_percent: number;
  disk_used_gb: number;
  disk_total_gb: number;
  disk_percent: number;
  uptime_secs: number;
  os_name: string;
}

export const tauriBridge = {
  isTauri,

  /**
   * Set hardware Click-Through (window ignores mouse events outside interactive elements)
   */
  async setClickThrough(ignore: boolean): Promise<void> {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('set_click_through', { ignore });
      } catch (err) {
        console.warn('[Tauri] Failed to set click-through:', err);
      }
    }
  },

  /**
   * Toggle HUD overlay window visibility
   */
  async toggleWindowVisibility(): Promise<boolean> {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<boolean>('toggle_window_visibility');
      } catch (err) {
        console.warn('[Tauri] Failed to toggle window:', err);
      }
    }
    return true;
  },

  /**
   * Toggle window always on top
   */
  async setAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('set_always_on_top', { alwaysOnTop });
      } catch (err) {
        console.warn('[Tauri] Failed to set always-on-top:', err);
      }
    }
  },

  /**
   * Get native real-time system metrics (CPU, RAM, Disks)
   */
  async getSystemMetrics(): Promise<TauriSystemMetrics | null> {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<TauriSystemMetrics>('get_system_metrics');
      } catch (err) {
        console.warn('[Tauri] Failed to get system metrics:', err);
      }
    }
    return null;
  },

  /**
   * Scan local models folder
   */
  async scanLocalModels(): Promise<any> {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke('scan_local_models');
      } catch (err) {
        console.warn('[Tauri] Fallback to web API for models:', err);
      }
    }
    const res = await fetch('/api/models/overview');
    return res.json();
  },

  /**
   * Load model into container/process memory
   */
  async loadModelToRam(category: string, filename: string): Promise<any> {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke('load_model_to_ram', { category, filename });
      } catch (err) {
        console.warn('[Tauri] Fallback to web API for load model:', err);
      }
    }
    const res = await fetch('/api/models/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, filename })
    });
    return res.json();
  },

  /**
   * Unload model from container/process memory
   */
  async unloadModelFromRam(category: string): Promise<any> {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke('unload_model_from_ram', { category });
      } catch (err) {
        console.warn('[Tauri] Fallback to web API for unload model:', err);
      }
    }
    const res = await fetch('/api/models/unload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category })
    });
    return res.json();
  },

  /**
   * Listen to global Tauri events (e.g. global hotkeys from OS)
   */
  async listen(event: string, handler: (payload: any) => void): Promise<(() => void) | undefined> {
    if (isTauri()) {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        return await listen(event, (e) => handler(e.payload));
      } catch (err) {
        console.warn('[Tauri] Failed to register event listener:', err);
      }
    }
    return undefined;
  }
};
