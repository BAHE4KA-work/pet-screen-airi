const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  setIgnoreMouseEvents: (ignore) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore);
  },
  close: () => {
    ipcRenderer.send('app-close');
  },
  onToggleHud: (callback) => {
    ipcRenderer.on('toggle-hud', () => callback());
  }
});
