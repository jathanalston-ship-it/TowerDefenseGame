// ASSIMILATION Mission Control — the desktop developer analytics app (docs/ANALYTICS.md
// §devapp). Deliberately tiny: one BrowserWindow rendering ui/index.html. All state
// (API base URL + DEV_KEY) lives in the renderer's localStorage, which Electron persists
// per-app in userData — no IPC surface, no preload, no remote content. The renderer talks
// to the production /api/dev/* endpoints directly (they answer CORS for exactly this).

const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 640,
    backgroundColor: '#0b0f0d',
    title: 'ASSIMILATION Mission Control',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  // Any external link opens in the system browser — the app never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
