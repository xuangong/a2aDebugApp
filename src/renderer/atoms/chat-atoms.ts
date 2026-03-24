/**
 * Jotai 状态管理
 */

import { atom } from 'jotai';
import type { Conversation, Message, AppConfig, A2AResult, AgentCard, AuthConfig, JsonRpcLogEntry, LiveSession, NativeToolCall, ToolResultData, TaskState } from '../../shared/types';

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

// ===== Task 状态（A2A 协议）=====
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

// 当前 context 的所有 tasks（线性列表）
export const tasksAtom = atom<TaskInfo[]>([]);

// 当前活跃的 task
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

// ===== 消息状态 =====
export const messagesAtom = atom<Message[]>([]);

// ===== 流式状态 =====
export const streamingAtom = atom(false);
export const streamingContentAtom = atom('');
export const streamingChunksAtom = atom<A2AResult[]>([]);
// Streaming tool calls - accumulated from artifact-update events
export const streamingToolCallsAtom = atom<NativeToolCall[]>([]);
// Streaming tool results - received from artifact-update events with name="tool_results"
export const streamingToolResultsAtom = atom<Map<string, ToolResultData>>(new Map());

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

// ===== 调试日志状态 =====
export const debugLogsAtom = atom<JsonRpcLogEntry[]>([]);

// 当前选中的消息 ID（用于高亮对应日志）
export const selectedMessageIdAtom = atom<string | null>(null);

// 当前流式请求关联的消息 ID
export const currentStreamingMessageIdAtom = atom<string | null>(null);

// ===== Side Panel 状态（与主线前端对齐）=====
export type SidePanelTab = 'logs' | 'tool';
export const sidePanelTabAtom = atom<SidePanelTab>('logs');

// 当前选中的工具调用（用于在右侧面板显示详情）
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
export const selectedToolCallAtom = atom<SelectedToolCall | null>(null);

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
