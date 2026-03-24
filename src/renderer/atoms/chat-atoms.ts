/**
 * Jotai 状态管理
 */

import { atom } from 'jotai';
import type { Conversation, Message, AppConfig, A2AResult, AgentCard, AuthConfig, JsonRpcLogEntry, LiveSession, NativeToolCall, ToolResultData, TaskState, FileArtifact } from '../../shared/types';

// ===== 配置状态 =====
export const configAtom = atom<AppConfig>({
  defaultEndpoint: 'http://localhost:8000/a2a/',
  theme: 'dark',
});

// ===== 认证状态 =====
export const authConfigAtom = atom<AuthConfig>({
  bearerToken: '',
  accountId: '',
});

// ===== Task 状态（A2A 协议，per-conversation）=====
// Re-export TaskState from shared types
export type { TaskState } from '../../shared/types';

export interface TaskInfo {
  taskId: string;
  contextId: string;
  state: TaskState;
  createdAt: number;
  updatedAt: number;
  /** Associated user message ID */
  messageId?: string;
}

// Map: conversationId -> tasks
export const tasksMapAtom = atom<Map<string, TaskInfo[]>>(new Map());

// Derived atom for current conversation's tasks
export const tasksAtom = atom(
  (get) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return [];
    return get(tasksMapAtom).get(currentId) || [];
  },
  (get, set, newTasks: TaskInfo[] | ((prev: TaskInfo[]) => TaskInfo[])) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return;
    const map = new Map(get(tasksMapAtom));
    const currentTasks = map.get(currentId) || [];
    const updatedTasks = typeof newTasks === 'function' ? newTasks(currentTasks) : newTasks;
    map.set(currentId, updatedTasks);
    set(tasksMapAtom, map);
  }
);

// 当前活跃的 task（派生自当前对话的 tasks）
export const currentTaskAtom = atom<TaskInfo | null>((get) => {
  const tasks = get(tasksAtom);
  return tasks.length > 0 ? tasks[tasks.length - 1] : null;
});

// ===== 对话状态 =====
export const conversationsAtom = atom<Conversation[]>([]);
export const currentConversationIdAtom = atom<string | null>(null);

// 当前对话（派生状态）
export const currentConversationAtom = atom((get) => {
  const conversations = get(conversationsAtom);
  const currentId = get(currentConversationIdAtom);
  return conversations.find((c) => c.id === currentId) || null;
});

// ===== 消息状态（per-conversation）=====
// Map: conversationId -> messages
export const messagesMapAtom = atom<Map<string, Message[]>>(new Map());

// Derived atom for current conversation's messages
export const messagesAtom = atom(
  (get) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return [];
    return get(messagesMapAtom).get(currentId) || [];
  },
  (get, set, newMessages: Message[] | ((prev: Message[]) => Message[])) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return;
    const map = new Map(get(messagesMapAtom));
    const currentMessages = map.get(currentId) || [];
    const updatedMessages = typeof newMessages === 'function' ? newMessages(currentMessages) : newMessages;
    map.set(currentId, updatedMessages);
    set(messagesMapAtom, map);
  }
);

// ===== 流式状态（per-conversation）=====
// Per-conversation streaming state structure
export interface ConversationStreamingState {
  streaming: boolean;
  content: string;
  chunks: A2AResult[];
  toolCalls: NativeToolCall[];
  toolResults: Map<string, ToolResultData>;
  fileArtifacts: FileArtifact[];
  messageId: string | null;
}

const createEmptyStreamingState = (): ConversationStreamingState => ({
  streaming: false,
  content: '',
  chunks: [],
  toolCalls: [],
  toolResults: new Map(),
  fileArtifacts: [],
  messageId: null,
});

// Map: conversationId -> streaming state
export const streamingMapAtom = atom<Map<string, ConversationStreamingState>>(new Map());

// Helper to get streaming state for a specific conversation
export const getConversationStreamingState = (map: Map<string, ConversationStreamingState>, id: string): ConversationStreamingState => {
  return map.get(id) || createEmptyStreamingState();
};

// Helper to update streaming state for a specific conversation (not just current)
export const updateStreamingStateForConversation = (
  map: Map<string, ConversationStreamingState>,
  conversationId: string,
  updater: (state: ConversationStreamingState) => Partial<ConversationStreamingState>
): Map<string, ConversationStreamingState> => {
  const newMap = new Map(map);
  const currentState = getConversationStreamingState(newMap, conversationId);
  const updates = updater(currentState);
  newMap.set(conversationId, { ...currentState, ...updates });
  return newMap;
};

// Derived atoms for current conversation's streaming state (backwards compatible)
export const streamingAtom = atom(
  (get) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return false;
    return getConversationStreamingState(get(streamingMapAtom), currentId).streaming;
  },
  (get, set, value: boolean) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return;
    const map = new Map(get(streamingMapAtom));
    const state = getConversationStreamingState(map, currentId);
    map.set(currentId, { ...state, streaming: value });
    set(streamingMapAtom, map);
  }
);

export const streamingContentAtom = atom(
  (get) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return '';
    return getConversationStreamingState(get(streamingMapAtom), currentId).content;
  },
  (get, set, value: string | ((prev: string) => string)) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return;
    const map = new Map(get(streamingMapAtom));
    const state = getConversationStreamingState(map, currentId);
    const newContent = typeof value === 'function' ? value(state.content) : value;
    map.set(currentId, { ...state, content: newContent });
    set(streamingMapAtom, map);
  }
);

export const streamingChunksAtom = atom(
  (get) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return [];
    return getConversationStreamingState(get(streamingMapAtom), currentId).chunks;
  },
  (get, set, value: A2AResult[] | ((prev: A2AResult[]) => A2AResult[])) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return;
    const map = new Map(get(streamingMapAtom));
    const state = getConversationStreamingState(map, currentId);
    const newChunks = typeof value === 'function' ? value(state.chunks) : value;
    map.set(currentId, { ...state, chunks: newChunks });
    set(streamingMapAtom, map);
  }
);

export const streamingToolCallsAtom = atom(
  (get) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return [];
    return getConversationStreamingState(get(streamingMapAtom), currentId).toolCalls;
  },
  (get, set, value: NativeToolCall[]) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return;
    const map = new Map(get(streamingMapAtom));
    const state = getConversationStreamingState(map, currentId);
    map.set(currentId, { ...state, toolCalls: value });
    set(streamingMapAtom, map);
  }
);

export const streamingToolResultsAtom = atom(
  (get) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return new Map<string, ToolResultData>();
    return getConversationStreamingState(get(streamingMapAtom), currentId).toolResults;
  },
  (get, set, value: Map<string, ToolResultData>) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return;
    const map = new Map(get(streamingMapAtom));
    const state = getConversationStreamingState(map, currentId);
    map.set(currentId, { ...state, toolResults: value });
    set(streamingMapAtom, map);
  }
);

export const streamingFileArtifactsAtom = atom(
  (get) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return [];
    return getConversationStreamingState(get(streamingMapAtom), currentId).fileArtifacts;
  },
  (get, set, value: FileArtifact[]) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return;
    const map = new Map(get(streamingMapAtom));
    const state = getConversationStreamingState(map, currentId);
    map.set(currentId, { ...state, fileArtifacts: value });
    set(streamingMapAtom, map);
  }
);

export const currentStreamingMessageIdAtom = atom(
  (get) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return null;
    return getConversationStreamingState(get(streamingMapAtom), currentId).messageId;
  },
  (get, set, value: string | null) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return;
    const map = new Map(get(streamingMapAtom));
    const state = getConversationStreamingState(map, currentId);
    map.set(currentId, { ...state, messageId: value });
    set(streamingMapAtom, map);
  }
);

// ===== UI 状态 =====
export type ViewMode = 'raw' | 'rendered' | 'content';
export const viewModeAtom = atom<ViewMode>('rendered');

// 端点配置
export const endpointAtom = atom('http://localhost:8000/a2a/');

// 侧边栏展开状态
export const sidebarExpandedAtom = atom(true);

// 调试面板展开状态
export const debugPanelExpandedAtom = atom(true);

// 聊天消息搜索
export const chatSearchQueryAtom = atom('');
export const chatSearchVisibleAtom = atom(false);

// ===== Agent Card 状态 =====
export const agentCardAtom = atom<AgentCard | null>(null);
export const agentCardLoadingAtom = atom(false);
export const agentCardErrorAtom = atom<string | null>(null);

// ===== 调试日志状态（per-conversation）=====
// Map: conversationId -> debug logs
export const debugLogsMapAtom = atom<Map<string, JsonRpcLogEntry[]>>(new Map());

// Derived atom for current conversation's debug logs
export const debugLogsAtom = atom(
  (get) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return [];
    return get(debugLogsMapAtom).get(currentId) || [];
  },
  (get, set, newLogs: JsonRpcLogEntry[] | ((prev: JsonRpcLogEntry[]) => JsonRpcLogEntry[])) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return;
    const map = new Map(get(debugLogsMapAtom));
    const currentLogs = map.get(currentId) || [];
    const updatedLogs = typeof newLogs === 'function' ? newLogs(currentLogs) : newLogs;
    map.set(currentId, updatedLogs);
    set(debugLogsMapAtom, map);
  }
);

// 当前选中的消息 ID（per-conversation，用于高亮对应日志）
export const selectedMessageIdMapAtom = atom<Map<string, string | null>>(new Map());

export const selectedMessageIdAtom = atom(
  (get) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return null;
    return get(selectedMessageIdMapAtom).get(currentId) || null;
  },
  (get, set, value: string | null) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return;
    const map = new Map(get(selectedMessageIdMapAtom));
    map.set(currentId, value);
    set(selectedMessageIdMapAtom, map);
  }
);

// ===== Side Panel 状态（与主线前端对齐）=====
export type SidePanelTab = 'logs' | 'tool' | 'artifacts';
export const sidePanelTabAtom = atom<SidePanelTab>('logs');

// 当前选中的工具调用（per-conversation，用于在右侧面板显示详情）
export interface SelectedToolCall {
  type: 'xml' | 'native';
  toolName: string;
  toolCallId?: string;
  arguments?: Record<string, unknown>;
  content?: string;
  rawXml?: string;
  result?: {
    success: boolean;
    output: unknown;
  };
  streaming?: boolean;
}

export const selectedToolCallMapAtom = atom<Map<string, SelectedToolCall | null>>(new Map());

export const selectedToolCallAtom = atom(
  (get) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return null;
    return get(selectedToolCallMapAtom).get(currentId) || null;
  },
  (get, set, value: SelectedToolCall | null) => {
    const currentId = get(currentConversationIdAtom);
    if (!currentId) return;
    const map = new Map(get(selectedToolCallMapAtom));
    map.set(currentId, value);
    set(selectedToolCallMapAtom, map);
  }
);

// ===== 错误状态 =====
export const errorAtom = atom<string | null>(null);

// ===== Live Viewer 状态 =====
export const liveWatchingAtom = atom(false);
export const liveWatchDirAtom = atom<string | null>(null);
export const liveSessionsAtom = atom<LiveSession[]>([]);
export const liveSelectedContextIdAtom = atom<string | null>(null);

// 当前视图模式：debug（正常调试）或 live（实时监控）
export type AppMode = 'debug' | 'live';
export const appModeAtom = atom<AppMode>('debug');
