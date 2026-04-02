/**
 * Electron Main Process Entry
 */

import { app, BrowserWindow, Menu, shell, nativeImage } from 'electron';
import { join } from 'path';
import { registerIpcHandlers } from './ipc';

// Handle EPIPE errors gracefully (occurs when parent process closes stdout)
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') return;
  throw err;
});
process.stderr.on('error', (err) => {
  if (err.code === 'EPIPE') return;
  throw err;
});

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

// Platform detection
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

// Get app icon path
function getIconPath(): string {
  const isDev = !app.isPackaged;
  // In dev: __dirname is /path/to/project/dist, go up one level
  // In prod: use process.resourcesPath
  const basePath = isDev
    ? join(__dirname, '..', 'resources')
    : join(process.resourcesPath, 'resources');

  // Use PNG for all platforms in dev mode (better compatibility)
  // Use platform-specific formats in production
  if (isDev) {
    return join(basePath, 'icon-512.png');
  }

  if (isMac) {
    return join(basePath, 'icon.icns');
  } else if (isWindows) {
    return join(basePath, 'icon.ico');
  } else {
    return join(basePath, 'icon.png');
  }
}

function createWindow(): void {
  // Platform-specific window options
  const platformOptions: Electron.BrowserWindowConstructorOptions = isMac
    ? {
        // macOS: Use hidden title bar with vibrancy effect
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 18, y: 18 },
        vibrancy: 'under-window',
        visualEffectState: 'active',
      }
    : {
        // Windows/Linux: Use frameless window + custom title bar
        frame: false,
        transparent: false,
      };

  // Load icon
  const iconPath = getIconPath();
  let icon: Electron.NativeImage | undefined;
  try {
    icon = nativeImage.createFromPath(iconPath);
    console.log('Loading icon from:', iconPath, 'isEmpty:', icon.isEmpty());

    // Set dock icon on macOS
    if (isMac && !icon.isEmpty()) {
      app.dock.setIcon(icon);
    }
  } catch (err) {
    console.warn('Failed to load app icon:', iconPath, err);
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...platformOptions,
  });

  // Load renderer process
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5174');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, 'renderer', 'index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Intercept external links
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isDev && url.startsWith('http://localhost:')) return;
    event.preventDefault();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Right-click context menu
  mainWindow.webContents.on('context-menu', (_, params) => {
    const menuItems: Electron.MenuItemConstructorOptions[] = [];

    // Show copy option if text is selected
    if (params.selectionText) {
      menuItems.push({
        label: 'Copy',
        role: 'copy',
      });
    }

    // Show paste option if in editable area
    if (params.isEditable) {
      menuItems.push({
        label: 'Paste',
        role: 'paste',
      });
      menuItems.push({
        label: 'Cut',
        role: 'cut',
      });
    }

    // Select all
    menuItems.push({
      label: 'Select All',
      role: 'selectAll',
    });

    if (menuItems.length > 0) {
      const contextMenu = Menu.buildFromTemplate(menuItems);
      contextMenu.popup();
    }
  });

  // macOS: Hide window on close button click
  if (process.platform === 'darwin') {
    mainWindow.on('close', (event) => {
      if (!isQuitting) {
        event.preventDefault();
        mainWindow?.hide();
      }
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  // Set dock icon FIRST on macOS (before window creation)
  if (isMac) {
    const iconPath = getIconPath();
    try {
      const dockIcon = nativeImage.createFromPath(iconPath);
      console.log('Setting dock icon from:', iconPath, 'isEmpty:', dockIcon.isEmpty());
      if (!dockIcon.isEmpty()) {
        app.dock.setIcon(dockIcon);
      }
    } catch (err) {
      console.warn('Failed to set dock icon:', err);
    }
  }

  createMenu();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});
