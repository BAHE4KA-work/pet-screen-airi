// Bridge between web UI and Electron desktop overlay
export const electronBridge = {
  isElectron: (): boolean => {
    return typeof window !== 'undefined' && Boolean((window as any).electron?.isElectron);
  },

  setInteractive: (interactive: boolean) => {
    if (typeof window !== 'undefined' && (window as any).electron?.setIgnoreMouseEvents) {
      (window as any).electron.setIgnoreMouseEvents(!interactive);
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
