/**
 * IPC 处理器注册
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import { A2AClient } from './lib/a2a-client';
import { ConversationManager } from './lib/conversation-manager';
import { ConfigManager } from './lib/config-manager';
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
}
