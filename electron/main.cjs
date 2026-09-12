const { app, BrowserWindow, screen, ipcMain, globalShortcut } = require('electron');
const path = require('path');

// Ensure transparent visuals are supported across Windows and Linux
app.commandLine.appendSwitch('enable-transparent-visuals');

let mainWindow = null;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  // Keep window always on top of games and apps
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const targetUrl = process.env.AIRI_APP_URL || 'http://localhost:3000/?mode=overlay';
  
  function tryLoad() {
    mainWindow.loadURL(targetUrl).catch((err) => {
      console.log(`[Airi Overlay] Waiting for backend at ${targetUrl}... (retrying in 2s)`);
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          tryLoad();
        }
      }, 2000);
    });
  }

  tryLoad();

  // Once page finishes loading, enable click-through with mousemove forwarding
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  });

  // Global hotkey Alt+Space to toggle HUD
  globalShortcut.register('Alt+Space', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('toggle-hud');
    }
  });

  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    app.quit();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Fixed IPC handler: when ignore is false, call setIgnoreMouseEvents(false) cleanly
ipcMain.on('set-ignore-mouse-events', (event, ignore) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    if (ignore) {
      win.setIgnoreMouseEvents(true, { forward: true });
    } else {
      win.setIgnoreMouseEvents(false);
    }
  }
});

ipcMain.on('app-close', () => {
  app.quit();
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
