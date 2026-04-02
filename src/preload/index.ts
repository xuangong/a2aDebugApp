/**
 * Preload Script
 *
 * Securely exposes API to renderer process via contextBridge
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/types';
import type {
  AppConfig,
  Conversation,
  Message,
  A2AResponse,
  A2AResult,
  A2AError,
  AgentCard,
  AuthConfig,
  JsonRpcLogEntry,
  BackendConversation,
  ImportResult,
  ImportSource,
  LiveSession,
} from '../shared/types';

/**
 * API interface exposed to renderer process
 */
export interface ElectronAPI {
  // Config management
  getConfig: () => Promise<AppConfig>;
  setConfig: (updates: Partial<AppConfig>) => Promise<AppConfig>;

  // Conversation management
  listConversations: () => Promise<Conversation[]>;
  createConversation: (title: string, endpoint: string) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  updateConversation: (id: string, updates: Partial<Conversation>) => Promise<Conversation | null>;

  // Message management
  getMessages: (conversationId: string) => Promise<Message[]>;
  saveMessage: (conversationId: string, message: Message) => Promise<void>;

  // Debug logs management
  getDebugLogs: (conversationId: string) => Promise<JsonRpcLogEntry[]>;
  saveDebugLogs: (conversationId: string, logs: JsonRpcLogEntry[]) => Promise<void>;
  saveDebugLog: (conversationId: string, log: JsonRpcLogEntry) => Promise<void>;
  clearDebugLogs: (conversationId: string) => Promise<void>;

  // A2A communication (with optional auth config)
  a2aSend: (endpoint: string, message: string, conversationId: string, auth?: AuthConfig) => Promise<A2AResponse>;
  a2aStream: (endpoint: string, message: string, conversationId: string, auth?: AuthConfig) => Promise<void>;
  a2aStop: (conversationId: string) => Promise<void>;
  getAgentCard: (endpoint: string, auth?: AuthConfig) => Promise<AgentCard>;

  // A2A streaming event subscriptions
  onA2AStreamChunk: (callback: (data: { conversationId: string; data: A2AResult }) => void) => () => void;
  onA2AStreamComplete: (callback: (data: { conversationId: string; contextId?: string }) => void) => () => void;
  onA2AStreamError: (callback: (data: { conversationId: string; error: A2AError }) => void) => () => void;

  // Window controls (Windows/Linux custom title bar)
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  getPlatform: () => Promise<NodeJS.Platform>;

  // Backend recording import
  selectImportDirectory: () => Promise<string | null>;
  listBackendConversations: (sourceDir: string) => Promise<BackendConversation[]>;
  importBackendConversations: (sourceDir: string, conversationIds: string[]) => Promise<ImportResult>;
  listImportSources: () => Promise<ImportSource[]>;
  uninstallImportSource: (sourcePath: string) => Promise<{ success: boolean; removedCount: number }>;

  // Live Viewer
  liveStartWatch: (watchDir?: string) => Promise<{ success: boolean; watchDir: string | null; sessions: LiveSession[] }>;
  liveStopWatch: () => Promise<{ success: boolean }>;
  liveGetSessions: () => Promise<{ watching: boolean; watchDir: string | null; sessions: LiveSession[] }>;
  liveGetMessages: (contextId: string) => Promise<Message[]>;
  liveGetDebugLogs: (contextId: string) => Promise<JsonRpcLogEntry[]>;
  onLiveSessionUpdate: (callback: (data: { watching: boolean; watchDir: string | null; sessions: LiveSession[] }) => void) => () => void;
}

const electronAPI: ElectronAPI = {
  // Config management
  getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET),
  setConfig: (updates) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET, updates),

  // Conversation management
  listConversations: () => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_LIST),
  createConversation: (title, endpoint) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_CREATE, { title, endpoint }),
  deleteConversation: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_DELETE, { id }),
  updateConversation: (id, updates) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATIONS_UPDATE, { id, updates }),

  // Message management
  getMessages: (conversationId) =>
    ipcRenderer.invoke(IPC_CHANNELS.MESSAGES_LIST, { conversationId }),
  saveMessage: (conversationId, message) =>
    ipcRenderer.invoke(IPC_CHANNELS.MESSAGES_SAVE, { conversationId, message }),

  // Debug logs management
  getDebugLogs: (conversationId) =>
    ipcRenderer.invoke(IPC_CHANNELS.DEBUG_LOGS_LIST, { conversationId }),
  saveDebugLogs: (conversationId, logs) =>
    ipcRenderer.invoke(IPC_CHANNELS.DEBUG_LOGS_SAVE, { conversationId, logs }),
  saveDebugLog: (conversationId, log) =>
    ipcRenderer.invoke(IPC_CHANNELS.DEBUG_LOGS_SAVE_ONE, { conversationId, log }),
  clearDebugLogs: (conversationId) =>
    ipcRenderer.invoke(IPC_CHANNELS.DEBUG_LOGS_CLEAR, { conversationId }),

  // A2A communication
  a2aSend: (endpoint, message, conversationId, auth) =>
    ipcRenderer.invoke(IPC_CHANNELS.A2A_SEND, { endpoint, message, conversationId, auth }),
  a2aStream: (endpoint, message, conversationId, auth) =>
    ipcRenderer.invoke(IPC_CHANNELS.A2A_STREAM, { endpoint, message, conversationId, auth }),
  a2aStop: (conversationId) =>
    ipcRenderer.invoke(IPC_CHANNELS.A2A_STOP, { conversationId }),
  getAgentCard: (endpoint, auth) =>
    ipcRenderer.invoke(IPC_CHANNELS.A2A_GET_AGENT_CARD, { endpoint, auth }),

  // A2A streaming event subscriptions
  onA2AStreamChunk: (callback) => {
    const listener = (_: unknown, data: { conversationId: string; data: A2AResult }): void =>
      callback(data);
    ipcRenderer.on(IPC_CHANNELS.A2A_STREAM_CHUNK, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.A2A_STREAM_CHUNK, listener);
    };
  },

  onA2AStreamComplete: (callback) => {
    const listener = (_: unknown, data: { conversationId: string; contextId?: string }): void =>
      callback(data);
    ipcRenderer.on(IPC_CHANNELS.A2A_STREAM_COMPLETE, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.A2A_STREAM_COMPLETE, listener);
    };
  },

  onA2AStreamError: (callback) => {
    const listener = (_: unknown, data: { conversationId: string; error: A2AError }): void =>
      callback(data);
    ipcRenderer.on(IPC_CHANNELS.A2A_STREAM_ERROR, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.A2A_STREAM_ERROR, listener);
    };
  },

  // Window controls (Windows/Linux custom title bar)
  windowMinimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  windowMaximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
  windowClose: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
  windowIsMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
  getPlatform: () => ipcRenderer.invoke(IPC_CHANNELS.GET_PLATFORM),

  // Backend recording import
  selectImportDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.IMPORT_BACKEND_SELECT_DIR),
  listBackendConversations: (sourceDir) =>
    ipcRenderer.invoke(IPC_CHANNELS.IMPORT_BACKEND_LIST, { sourceDir }),
  importBackendConversations: (sourceDir, conversationIds) =>
    ipcRenderer.invoke(IPC_CHANNELS.IMPORT_BACKEND_IMPORT, { sourceDir, conversationIds }),
  listImportSources: () => ipcRenderer.invoke(IPC_CHANNELS.IMPORT_BACKEND_LIST_SOURCES),
  uninstallImportSource: (sourcePath) =>
    ipcRenderer.invoke(IPC_CHANNELS.IMPORT_BACKEND_UNINSTALL, { sourcePath }),

  // Live Viewer
  liveStartWatch: (watchDir) =>
    ipcRenderer.invoke(IPC_CHANNELS.LIVE_START_WATCH, { watchDir }),
  liveStopWatch: () => ipcRenderer.invoke(IPC_CHANNELS.LIVE_STOP_WATCH),
  liveGetSessions: () => ipcRenderer.invoke(IPC_CHANNELS.LIVE_GET_SESSIONS),
  liveGetMessages: (contextId) =>
    ipcRenderer.invoke(IPC_CHANNELS.LIVE_GET_MESSAGES, { contextId }),
  liveGetDebugLogs: (contextId) =>
    ipcRenderer.invoke(IPC_CHANNELS.LIVE_GET_DEBUG_LOGS, { contextId }),
  onLiveSessionUpdate: (callback) => {
    const listener = (
      _: unknown,
      data: { watching: boolean; watchDir: string | null; sessions: LiveSession[] }
    ): void => callback(data);
    ipcRenderer.on(IPC_CHANNELS.LIVE_SESSION_UPDATE, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.LIVE_SESSION_UPDATE, listener);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
