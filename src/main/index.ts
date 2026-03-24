/**
 * Electron 主进程入口
 */

import { app, BrowserWindow, Menu, shell } from 'electron';
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

// 平台检测
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

function createWindow(): void {
  // 平台特定的窗口选项
  const platformOptions: Electron.BrowserWindowConstructorOptions = isMac
    ? {
        // macOS: 使用隐藏的标题栏和 vibrancy 效果
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 18, y: 18 },
        vibrancy: 'under-window',
        visualEffectState: 'active',
      }
    : {
        // Windows/Linux: 使用 frameless 窗口 + 自定义标题栏
        frame: false,
        transparent: false,
      };

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...platformOptions,
  });

  // 加载渲染进程
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5174');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, 'renderer', 'index.html'));
  }

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // 拦截外部链接
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

  // 右键上下文菜单
  mainWindow.webContents.on('context-menu', (_, params) => {
    const menuItems: Electron.MenuItemConstructorOptions[] = [];

    // 如果有选中的文本，显示复制选项
    if (params.selectionText) {
      menuItems.push({
        label: 'Copy',
        role: 'copy',
      });
    }

    // 如果在可编辑区域，显示粘贴选项
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

    // 全选
    menuItems.push({
      label: 'Select All',
      role: 'selectAll',
    });

    if (menuItems.length > 0) {
      const contextMenu = Menu.buildFromTemplate(menuItems);
      contextMenu.popup();
    }
  });

  // macOS: 点击关闭按钮时隐藏窗口
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
