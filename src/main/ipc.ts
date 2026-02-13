/**
 * IPC 处理器注册
 */

import { ipcMain, BrowserWindow, dialog } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import { A2AClient } from './lib/a2a-client';
import { ConversationManager } from './lib/conversation-manager';
import { ConfigManager } from './lib/config-manager';
import { liveWatcher } from './lib/live-watcher';
import type { A2ASession, AuthConfig } from '../shared/types';

const conversationManager = new ConversationManager();
const configManager = new ConfigManager();
const sessions = new Map<string, A2ASession>();
const a2aClients = new Map<string, A2AClient>();

function getA2AClient(endpoint: string, auth?: AuthConfig): A2AClient {
  let client = a2aClients.get(endpoint);
  if (!client) {
    client = new A2AClient({ endpoint, timeout: 60000, auth });
    a2aClients.set(endpoint, client);
  } else if (auth) {
    // 更新现有客户端的认证配置
    client.updateAuth(auth);
  }
  return client;
}

function getSession(conversationId: string): A2ASession {
  let session = sessions.get(conversationId);
  if (!session) {
    session = { contextId: null, conversationId };
    sessions.set(conversationId, session);
  }
  return session;
}

export function registerIpcHandlers(): void {
  // ===== 配置管理 =====

  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async () => {
    return configManager.get();
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, async (_, updates) => {
    return configManager.update(updates);
  });

  // ===== 对话管理 =====

  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_LIST, async () => {
    return conversationManager.listConversations();
  });

  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_CREATE, async (_, { title, endpoint }) => {
    return conversationManager.createConversation(title, endpoint);
  });

  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_DELETE, async (_, { id }) => {
    sessions.delete(id);
    return conversationManager.deleteConversation(id);
  });

  ipcMain.handle(IPC_CHANNELS.CONVERSATIONS_UPDATE, async (_, { id, updates }) => {
    return conversationManager.updateConversation(id, updates);
  });

  // ===== 消息管理 =====

  ipcMain.handle(IPC_CHANNELS.MESSAGES_LIST, async (_, { conversationId }) => {
    return conversationManager.getMessages(conversationId);
  });

  ipcMain.handle(IPC_CHANNELS.MESSAGES_SAVE, async (_, { conversationId, message }) => {
    return conversationManager.saveMessage(conversationId, message);
  });

  // ===== Debug Logs 管理 =====

  ipcMain.handle(IPC_CHANNELS.DEBUG_LOGS_LIST, async (_, { conversationId }) => {
    return conversationManager.getDebugLogs(conversationId);
  });

  ipcMain.handle(IPC_CHANNELS.DEBUG_LOGS_SAVE, async (_, { conversationId, logs }) => {
    return conversationManager.saveDebugLogs(conversationId, logs);
  });

  ipcMain.handle(IPC_CHANNELS.DEBUG_LOGS_SAVE_ONE, async (_, { conversationId, log }) => {
    return conversationManager.saveDebugLog(conversationId, log);
  });

  ipcMain.handle(IPC_CHANNELS.DEBUG_LOGS_CLEAR, async (_, { conversationId }) => {
    return conversationManager.clearDebugLogs(conversationId);
  });

  // ===== A2A 通信 =====

  ipcMain.handle(IPC_CHANNELS.A2A_SEND, async (_, { endpoint, message, conversationId, auth }) => {
    const client = getA2AClient(endpoint, auth);
    const session = getSession(conversationId);
    const response = await client.send(message, session);

    // 更新 contextId
    if (response.result?.contextId && !session.contextId) {
      session.contextId = response.result.contextId;
      // 同步到对话记录
      await conversationManager.updateConversation(conversationId, {
        contextId: session.contextId,
      });
    }

    return response;
  });

  ipcMain.handle(IPC_CHANNELS.A2A_STREAM, async (event, { endpoint, message, conversationId, auth }) => {
    const client = getA2AClient(endpoint, auth);
    const session = getSession(conversationId);
    const window = BrowserWindow.fromWebContents(event.sender);

    if (!window) return;

    try {
      for await (const streamEvent of client.stream(message, session)) {
        if (streamEvent.type === 'chunk') {
          window.webContents.send(IPC_CHANNELS.A2A_STREAM_CHUNK, {
            conversationId,
            data: streamEvent.data,
          });

          // 更新 contextId
          if (streamEvent.data.contextId && !session.contextId) {
            session.contextId = streamEvent.data.contextId;
            await conversationManager.updateConversation(conversationId, {
              contextId: session.contextId,
            });
          }
        } else if (streamEvent.type === 'complete') {
          window.webContents.send(IPC_CHANNELS.A2A_STREAM_COMPLETE, {
            conversationId,
            contextId: streamEvent.contextId,
          });
        } else if (streamEvent.type === 'error') {
          window.webContents.send(IPC_CHANNELS.A2A_STREAM_ERROR, {
            conversationId,
            error: streamEvent.error,
          });
        }
      }
    } catch (error) {
      window.webContents.send(IPC_CHANNELS.A2A_STREAM_ERROR, {
        conversationId,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  });

  ipcMain.handle(IPC_CHANNELS.A2A_STOP, async (_, { conversationId }) => {
    // 遍历所有客户端尝试取消
    for (const client of a2aClients.values()) {
      client.cancel(conversationId);
    }
  });

  // ===== Agent Card =====

  ipcMain.handle(IPC_CHANNELS.A2A_GET_AGENT_CARD, async (_, { endpoint, auth }) => {
    const client = getA2AClient(endpoint, auth);
    return client.getAgentCard();
  });

  // ===== 窗口控制 (Windows/Linux 自定义标题栏) =====

  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.minimize();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window?.isMaximized()) {
      window.unmaximize();
    } else {
      window?.maximize();
    }
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.close();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return window?.isMaximized() ?? false;
  });

  ipcMain.handle(IPC_CHANNELS.GET_PLATFORM, async () => {
    return process.platform;
  });

  // ===== 后端录制导入 =====

  ipcMain.handle(IPC_CHANNELS.IMPORT_BACKEND_SELECT_DIR, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window!, {
      title: 'Select recordings directory',
      properties: ['openDirectory'],
      message: 'Select the directory containing conversations.json',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.IMPORT_BACKEND_LIST, async (_, { sourceDir }) => {
    return conversationManager.listBackendConversations(sourceDir);
  });

  ipcMain.handle(IPC_CHANNELS.IMPORT_BACKEND_IMPORT, async (_, { sourceDir, conversationIds }) => {
    return conversationManager.importBackendConversations(sourceDir, conversationIds);
  });

  ipcMain.handle(IPC_CHANNELS.IMPORT_BACKEND_LIST_SOURCES, async () => {
    return conversationManager.listImportSources();
  });

  ipcMain.handle(IPC_CHANNELS.IMPORT_BACKEND_UNINSTALL, async (_, { sourcePath }) => {
    return conversationManager.uninstallImportSource(sourcePath);
  });

  // ===== Live Viewer =====

  ipcMain.handle(IPC_CHANNELS.LIVE_START_WATCH, async (event, { watchDir }) => {
    // 如果没有传入目录，打开选择对话框
    let dir = watchDir;
    if (!dir) {
      const window = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(window!, {
        title: 'Select directory to watch',
        properties: ['openDirectory'],
        message: 'Select the recordings directory to monitor',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, watchDir: null };
      }
      dir = result.filePaths[0];
    }

    const success = liveWatcher.startWatch(dir);
    return {
      success,
      watchDir: success ? dir : null,
      sessions: success ? liveWatcher.getSessions() : [],
    };
  });

  ipcMain.handle(IPC_CHANNELS.LIVE_STOP_WATCH, async () => {
    liveWatcher.stopWatch();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.LIVE_GET_SESSIONS, async () => {
    return {
      watching: liveWatcher.isWatching(),
      watchDir: liveWatcher.getWatchDir(),
      sessions: liveWatcher.getSessions(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.LIVE_GET_MESSAGES, async (_, { contextId }) => {
    return liveWatcher.getSessionMessages(contextId);
  });
}
