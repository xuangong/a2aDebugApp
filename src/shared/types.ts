/**
 * A2A Debug App 共享类型定义
 */

// ===== 消息类型 =====

/** 用户消息 */
export interface UserMessage {
  id: string;
  role: 'user';
  content: string;
  createdAt: number;
}

/** 助手消息 */
export interface AssistantMessage {
  id: string;
  role: 'assistant';
  content: string;
  rawResponse: A2AResponse | A2AResult[];
  createdAt: number;
  streaming?: boolean;
}

/** 消息联合类型 */
export type Message = UserMessage | AssistantMessage;

// ===== A2A 协议类型 =====

/** A2A 请求 */
export interface A2ARequest {
  jsonrpc: '2.0';
  method: 'message/send' | 'message/stream';
  params: {
    message: A2AMessage;
    contextId?: string;
    /** 元数据 - 包含租户信息等 */
    metadata?: {
      accountId?: string;
      [key: string]: unknown;
    };
  };
  id: string;
}

/** A2A 消息 */
export interface A2AMessage {
  role: 'user';
  kind: 'message';
  messageId: string;
  parts: A2APart[];
}

/** A2A Part 联合类型 */
export type A2APart = A2ATextPart | A2AFilePart | A2ADataPart;

/** 文本 Part */
export interface A2ATextPart {
  kind: 'text';
  type?: 'text';
  text: string;
}

/** 文件 Part */
export interface A2AFilePart {
  kind: 'file';
  type?: 'file';
  file: {
    name: string;
    mimeType: string;
    bytes: string;
  };
}

/** 数据 Part - 用于结构化数据（如工具结果） */
export interface A2ADataPart {
  kind: 'data';
  type?: 'data';
  data: Record<string, unknown>;
}

/** 工具结果数据结构 */
export interface ToolResultData {
  type: 'tool_result';
  tool_call_id: string;
  tool_name: string;
  success: boolean;
  output: unknown;
}

/** A2A 响应 */
export interface A2AResponse {
  jsonrpc: '2.0';
  id: string;
  result?: A2AResult;
  error?: A2AError;
}

/** A2A 结果 - Message 类型 */
export interface A2AMessageResult {
  kind: 'message';
  role: 'agent';
  messageId: string;
  parts: A2APart[];
  contextId?: string;
  taskId?: string;
  final?: boolean;
}

/** A2A 结果 - Status Update 类型 (TaskStatusUpdateEvent) */
export interface A2AStatusUpdateResult {
  kind: 'status-update';
  taskId: string;
  contextId: string;
  final: boolean;
  status: {
    state: 'working' | 'completed' | 'failed' | 'canceled' | 'input-required' | 'auth-required';
    message?: A2AMessageResult;
    timestamp?: string;
  };
}

/** A2A 结果联合类型 */
export type A2AResult = A2AMessageResult | A2AStatusUpdateResult;

/** 辅助函数：从 A2AResult 提取 parts */
export function extractPartsFromResult(result: A2AResult): A2APart[] {
  if (result.kind === 'message') {
    return result.parts;
  } else if (result.kind === 'status-update' && result.status.message) {
    return result.status.message.parts;
  }
  return [];
}

/** 辅助函数：从 A2AResult 提取 contextId */
export function extractContextIdFromResult(result: A2AResult): string | undefined {
  if (result.kind === 'message') {
    return result.contextId;
  } else if (result.kind === 'status-update') {
    return result.contextId;
  }
  return undefined;
}

/** 辅助函数：检查是否为最终事件 */
export function isFinalResult(result: A2AResult): boolean {
  if (result.kind === 'message') {
    return result.final ?? false;
  } else if (result.kind === 'status-update') {
    return result.final;
  }
  return false;
}

/** 辅助函数：从 A2AResult 提取工具结果 */
export function extractToolResultsFromResult(result: A2AResult): ToolResultData[] {
  const parts = extractPartsFromResult(result);
  const toolResults: ToolResultData[] = [];

  for (const part of parts) {
    if (part.kind === 'data' && 'data' in part) {
      const data = part.data;
      if (data && typeof data === 'object' && data.type === 'tool_result') {
        toolResults.push(data as unknown as ToolResultData);
      }
    }
  }

  return toolResults;
}

/** 辅助函数：从响应数组中收集所有工具结果 */
export function collectToolResults(results: A2AResult[]): Map<string, ToolResultData> {
  const toolResultsMap = new Map<string, ToolResultData>();

  for (const result of results) {
    const toolResults = extractToolResultsFromResult(result);
    for (const toolResult of toolResults) {
      toolResultsMap.set(toolResult.tool_call_id, toolResult);
    }
  }

  return toolResultsMap;
}

/** A2A 错误 */
export interface A2AError {
  code: number;
  message: string;
}

/** 流式事件类型 */
export type A2AStreamEvent =
  | { type: 'chunk'; data: A2AResult }
  | { type: 'complete'; contextId?: string }
  | { type: 'error'; error: A2AError };

// ===== 会话类型 =====

/** A2A 会话 */
export interface A2ASession {
  contextId: string | null;
  conversationId: string;
}

// ===== 对话类型 =====

/** 对话元数据 */
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  endpoint: string;
  contextId?: string;
}

// ===== 调试记录类型 =====

/** JSON-RPC 交互记录 */
export interface JsonRpcLogEntry {
  id: string;
  timestamp: number;
  direction: 'request' | 'response' | 'sse-event';
  /** 关联的用户消息 ID - 用于将日志与消息块关联 */
  messageId?: string;
  /** 关联的助手消息 ID - SSE 事件完成后关联到助手回复 */
  responseMessageId?: string;
  /** 请求相关 */
  request?: {
    method: string;
    endpoint: string;
    body: A2ARequest;
  };
  /** 响应相关 */
  response?: {
    status?: number;
    data: A2AResult | A2AResponse;
  };
  /** SSE 事件 */
  sseEvent?: {
    eventType: 'chunk' | 'complete' | 'error';
    data?: A2AResult;
    error?: A2AError;
  };
}

/** 调试记录 */
export interface DebugRecord {
  timestamp: number;
  request: {
    endpoint: string;
    method: string;
    body: A2ARequest;
  };
  response: {
    status: number;
    headers: Record<string, string>;
    body: A2AResponse | A2AResult[];
    timing: {
      start: number;
      firstByte?: number;
      complete: number;
    };
  };
  error?: {
    type: 'network' | 'parse' | 'protocol';
    message: string;
    stack?: string;
  };
}

// ===== Agent Card 类型 =====

/** Agent Card - A2A 协议定义的 Agent 元数据 */
export interface AgentCard {
  name: string;
  description?: string;
  url: string;
  version?: string;
  capabilities?: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
  };
  skills?: AgentSkill[];
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  provider?: {
    organization?: string;
    url?: string;
  };
  documentationUrl?: string;
  authentication?: {
    schemes?: string[];
    credentials?: string;
  };
}

/** Agent 技能 */
export interface AgentSkill {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

// ===== 认证配置类型 =====

/** 认证配置 */
export interface AuthConfig {
  /** Bearer Token (可选) */
  bearerToken?: string;
  /** Account ID - 用于后端租户隔离 */
  accountId?: string;
}

// ===== 配置类型 =====

/** 应用配置 */
export interface AppConfig {
  defaultEndpoint: string;
  theme: 'light' | 'dark' | 'system';
  /** 认证配置 */
  auth?: AuthConfig;
}

// ===== IPC 通道 =====

export const IPC_CHANNELS = {
  // A2A 通信
  A2A_SEND: 'a2a:send',
  A2A_STREAM: 'a2a:stream',
  A2A_STOP: 'a2a:stop',
  A2A_STREAM_CHUNK: 'a2a:stream:chunk',
  A2A_STREAM_COMPLETE: 'a2a:stream:complete',
  A2A_STREAM_ERROR: 'a2a:stream:error',
  A2A_GET_AGENT_CARD: 'a2a:get-agent-card',

  // 调试日志
  DEBUG_LOG: 'debug:log',
  DEBUG_LOGS_LIST: 'debug:logs:list',
  DEBUG_LOGS_SAVE: 'debug:logs:save',
  DEBUG_LOGS_SAVE_ONE: 'debug:logs:save-one',
  DEBUG_LOGS_CLEAR: 'debug:logs:clear',

  // 对话管理
  CONVERSATIONS_LIST: 'conversations:list',
  CONVERSATIONS_CREATE: 'conversations:create',
  CONVERSATIONS_DELETE: 'conversations:delete',
  CONVERSATIONS_UPDATE: 'conversations:update',

  // 消息管理
  MESSAGES_LIST: 'messages:list',
  MESSAGES_SAVE: 'messages:save',

  // 配置管理
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',

  // 窗口控制 (Windows/Linux 自定义标题栏)
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  GET_PLATFORM: 'get-platform',
} as const;
