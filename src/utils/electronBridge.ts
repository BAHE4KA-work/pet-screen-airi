// Bridge between web UI and Electron desktop overlay
export const electronBridge = {
  isElectron: (): boolean => {
    if (typeof window === 'undefined') return false;
    return Boolean(
      (window as any).electron?.isElectron ||
      window.location.search.includes('mode=overlay') ||
      navigator.userAgent.toLowerCase().includes('electron')
    );
  },

  setInteractive: (interactive: boolean) => {
    if (typeof window !== 'undefined' && (window as any).electron?.setIgnoreMouseEvents) {
      // interactive = true => ignore = false (capture clicks in window)
      // interactive = false => ignore = true with { forward: true } (pass clicks to OS taskbar/desktop while keeping mousemove active)
      if (interactive) {
        (window as any).electron.setIgnoreMouseEvents(false);
      } else {
        (window as any).electron.setIgnoreMouseEvents(true, { forward: true });
      }
    }
  },

  close: () => {
    if (typeof window !== 'undefined' && (window as any).electron?.close) {
      (window as any).electron.close();
    }
  },

  onToggleHud: (callback: () => void) => {
    if (typeof window !== 'undefined' && (window as any).electron?.onToggleHud) {
      (window as any).electron.onToggleHud(callback);
    }
  }
};
