/**
 * IPC 处理器注册
 */

import { ipcMain, BrowserWindow, dialog } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import { A2AClient } from './lib/a2a-client';
import { ConversationManager } from './lib/conversation-manager';
import { ConfigManager } from './lib/config-manager';
import { liveWatcher, debugLog } from './lib/live-watcher';
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
    // Try to load contextId and currentTaskId from persisted conversation data
    const conversations = conversationManager.listConversations();
    const conversation = conversations.find(c => c.id === conversationId);
    const persistedContextId = conversation?.contextId || null;
    const persistedTaskId = conversation?.currentTaskId;

    console.log('[getSession] Creating new session:', {
      conversationId,
      persistedContextId,
      persistedTaskId,
    });

    session = {
      contextId: persistedContextId,
      conversationId,
      taskId: persistedTaskId,
    };
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

    console.log('[IPC A2A_STREAM] Starting request:', {
      conversationId,
      sessionContextId: session.contextId,
      sessionTaskId: session.taskId,
      messagePreview: message?.substring(0, 100),
    });

    if (!window) return;

    try {
      for await (const streamEvent of client.stream(message, session)) {
        if (streamEvent.type === 'chunk') {
          window.webContents.send(IPC_CHANNELS.A2A_STREAM_CHUNK, {
            conversationId,
            data: streamEvent.data,
          });

          // contextId 现在由调用方预生成，后端会用它作为 thread_id
          // 这里只需要验证后端返回的 contextId 与我们发送的一致
          if (streamEvent.data.contextId && streamEvent.data.contextId !== session.contextId) {
            console.log('[IPC A2A_STREAM] contextId mismatch - updating to backend value:', {
              conversationId,
              expectedContextId: session.contextId,
              receivedContextId: streamEvent.data.contextId,
            });
            session.contextId = streamEvent.data.contextId;
            await conversationManager.updateConversation(conversationId, {
              contextId: session.contextId,
            });
          }

          // Track taskId for input-required state continuation
          // When task enters input-required, save taskId for subsequent tool result submission
          if (streamEvent.data.kind === 'status-update') {
            const statusUpdate = streamEvent.data as {
              taskId: string;
              status: { state: string };
            };
            const state = statusUpdate.status?.state;

            if (state === 'input-required') {
              // Save taskId for tool result continuation
              session.taskId = statusUpdate.taskId;
              console.log('[IPC A2A_STREAM] Task requires input, saving taskId:', {
                conversationId,
                taskId: session.taskId,
              });
              await conversationManager.updateConversation(conversationId, {
                currentTaskId: session.taskId,
              });
            } else if (state === 'completed' || state === 'failed' || state === 'canceled') {
              // Task ended, clear taskId
              if (session.taskId) {
                console.log('[IPC A2A_STREAM] Task ended, clearing taskId:', {
                  conversationId,
                  previousTaskId: session.taskId,
                  finalState: state,
                });
                session.taskId = undefined;
                await conversationManager.updateConversation(conversationId, {
                  currentTaskId: undefined,
                });
              }
            }
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

  ipcMain.handle(IPC_CHANNELS.LIVE_START_WATCH, async (event, args) => {
    debugLog('IPC LIVE_START_WATCH called, args=' + JSON.stringify(args));
    // 如果没有传入目录，打开选择对话框
    let dir = args?.watchDir;
    if (!dir) {
      const window = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(window!, {
        title: 'Select directory to watch',
        properties: ['openDirectory'],
        message: 'Select the recordings directory to monitor',
      });

      if (result.canceled || result.filePaths.length === 0) {
        debugLog('IPC dialog canceled');
        return { success: false, watchDir: null };
      }
      dir = result.filePaths[0];
      debugLog('IPC selected dir: ' + dir);
    }

    const success = liveWatcher.startWatch(dir);
    const sessions = success ? liveWatcher.getSessions() : [];
    debugLog('IPC result: success=' + success + ' sessions=' + JSON.stringify(sessions));
    return {
      success,
      watchDir: success ? dir : null,
      sessions,
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

  ipcMain.handle(IPC_CHANNELS.LIVE_GET_DEBUG_LOGS, async (_, { contextId }) => {
    return liveWatcher.getSessionDebugLogs(contextId);
  });
}
