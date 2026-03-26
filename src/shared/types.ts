/**
 * A2A Debug App Shared Type Definitions
 */

// ===== Message Types =====

/** User Message */
export interface UserMessage {
  id: string;
  role: 'user';
  content: string;
  /** Raw A2A request sent to server (for tool results, etc.) */
  rawRequest?: A2ARequest | Record<string, unknown>;
  createdAt: number;
}

/** Assistant Message */
export interface AssistantMessage {
  id: string;
  role: 'assistant';
  content: string;
  rawResponse: A2AResponse | A2AResult[];
  /** Native tool calls accumulated during streaming */
  nativeToolCalls?: NativeToolCall[];
  /** Tool results accumulated during streaming (matched by tool_call_id) */
  toolResults?: ToolResultData[];
  /** File artifacts from backend (complete tool attachments) */
  fileArtifacts?: FileArtifact[];
  createdAt: number;
  streaming?: boolean;
}

/** Message Union Type */
export type Message = UserMessage | AssistantMessage;

// ===== A2A Protocol Types =====

/** A2A Request */
export interface A2ARequest {
  jsonrpc: '2.0';
  method: 'message/send' | 'message/stream';
  params: {
    message: A2AMessage;
    /** Metadata - includes tenant info etc */
    metadata?: {
      accountId?: string;
      [key: string]: unknown;
    };
  };
  id: string;
}

/** A2A Message */
export interface A2AMessage {
  role: 'user';
  kind: 'message';
  messageId: string;
  parts: A2APart[];
  /** contextId for session continuation */
  contextId?: string;
  /** taskId for continuing input-required tasks */
  taskId?: string;
}

/** A2A Part Union Type */
export type A2APart = A2ATextPart | A2AFilePart | A2ADataPart;

/** Text Part */
export interface A2ATextPart {
  kind: 'text';
  type?: 'text';
  text: string;
}

/** File Part */
export interface A2AFilePart {
  kind: 'file';
  type?: 'file';
  file: {
    name: string;
    mimeType: string;
    bytes?: string;
    /** URI for file download (A2A FilePart with FileWithUri) */
    uri?: string;
  };
}

/** File Artifact - structured artifact info returned by backend
 * Sent via:
 * 1. TaskArtifactUpdateEvent with FilePart (streaming)
 * 2. Final status-update with DataPart containing file_artifacts array
 */
export interface FileArtifact {
  id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  download_url: string;
  /** Artifact type derived from mime_type or file extension */
  type: 'pptx' | 'xlsx' | 'docx' | 'pdf' | 'image' | 'html' | 'csv' | 'md' | 'other';
  createdAt: number;
}

/** Data Part - for structured data (e.g., tool results) */
export interface A2ADataPart {
  kind: 'data';
  type?: 'data';
  data: Record<string, unknown>;
}

/** Tool Result Data Structure
 * Sent by backend via artifact-update with name="tool_results"
 * Format: { tool_results: [ToolResultData, ...] }
 */
export interface ToolResultData {
  tool_call_id: string;
  tool_name: string;
  result: unknown;
  success: boolean;
}

/** Native Tool Call - OpenAI format tool call */
export interface NativeToolCall {
  id: string;
  type: 'function';
  /** Index of the tool call in the current LLM response (for stable React keys) */
  index?: number;
  function: {
    name: string;
    arguments: string | Record<string, unknown>;
  };
}

/** Extract tool_calls from DataPart */
export function extractToolCallsFromDataPart(data: Record<string, unknown>): NativeToolCall[] {
  if (Array.isArray(data.tool_calls)) {
    return data.tool_calls as NativeToolCall[];
  }
  return [];
}

/**
 * Accumulated Tool Call - represents a tool call being built from streaming chunks
 */
export interface AccumulatedToolCall {
  id: string | null;
  /** Stable ID for React key - generated once, never changes */
  stableId: string;
  type: string;
  index: number;
  function: {
    name: string | null;
    arguments: string;
  };
}

/**
 * Tool Call Accumulator - accumulates streaming tool call chunks
 * Uses append + lastChunk A2A protocol pattern:
 * - append=true, lastChunk=false: incremental chunks to accumulate
 * - append=true, lastChunk=true: signals end (may have empty data)
 * - Final status-update contains complete tool_calls (authoritative source)
 */
export class ToolCallAccumulator {
  private toolCallsByArtifactId: Map<string, Map<number, AccumulatedToolCall>> = new Map();
  private completedArtifacts: Set<string> = new Set();

  /**
   * Process an artifact-update event
   */
  processArtifactUpdate(result: A2AArtifactUpdateResult): void {
    const artifactId = result.artifact.artifactId;
    const append = result.append ?? false;
    const lastChunk = result.lastChunk ?? false;

    // Get or create the accumulator for this artifact
    if (!this.toolCallsByArtifactId.has(artifactId)) {
      this.toolCallsByArtifactId.set(artifactId, new Map());
    }
    const toolCalls = this.toolCallsByArtifactId.get(artifactId)!;

    // Extract tool_calls from the artifact parts
    for (const part of result.artifact.parts) {
      if (part.kind === 'data' && 'data' in part) {
        const rawToolCalls = extractToolCallsFromDataPart(part.data);
        for (const tc of rawToolCalls) {
          const index = (tc as unknown as { index?: number }).index ?? 0;

          if (append && toolCalls.has(index)) {
            // Append mode - accumulate incremental data
            const existing = toolCalls.get(index)!;

            // Merge id (first non-null wins)
            if (tc.id && !existing.id) {
              existing.id = tc.id;
            }

            // Merge function name (first non-null wins)
            if (tc.function?.name && !existing.function.name) {
              existing.function.name = tc.function.name;
            }

            // Append arguments (streaming tokens)
            if (tc.function?.arguments) {
              const argsChunk = typeof tc.function.arguments === 'string'
                ? tc.function.arguments
                : JSON.stringify(tc.function.arguments);
              existing.function.arguments += argsChunk;
            }
          } else {
            // Create new tool call entry with stable ID
            const args = typeof tc.function?.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function?.arguments ?? '');
            // Generate stable ID immediately - use tc.id if available, otherwise artifactId-index
            const stableId = tc.id ?? `${artifactId}-${index}`;
            toolCalls.set(index, {
              id: tc.id ?? null,
              stableId,
              type: tc.type ?? 'function',
              index,
              function: {
                name: tc.function?.name ?? null,
                arguments: args,
              },
            });
          }
        }
      }
    }

    // Mark as completed if lastChunk
    if (lastChunk) {
      this.completedArtifacts.add(artifactId);
    }
  }

  /**
   * Get all accumulated tool calls (completed artifacts only)
   */
  getCompletedToolCalls(): NativeToolCall[] {
    const result: NativeToolCall[] = [];

    for (const [artifactId, toolCalls] of this.toolCallsByArtifactId) {
      if (this.completedArtifacts.has(artifactId)) {
        for (const [, tc] of toolCalls) {
          result.push({
            id: tc.id ?? `generated-${tc.index}`,
            type: 'function',
            function: {
              name: tc.function.name ?? 'unknown',
              arguments: tc.function.arguments,
            },
          });
        }
      }
    }

    return result;
  }

  /**
   * Get all accumulated tool calls from all artifacts
   * Tool calls are accumulated across LLM iterations and displayed together
   */
  getAllToolCalls(): NativeToolCall[] {
    const result: NativeToolCall[] = [];

    // Return tool calls from all artifacts (accumulated across iterations)
    for (const [, toolCalls] of this.toolCallsByArtifactId) {
      for (const [, tc] of toolCalls) {
        // Use the stable ID that was generated when the tool call was first created
        result.push({
          id: tc.stableId,
          type: 'function',
          index: tc.index,
          function: {
            name: tc.function.name ?? 'unknown',
            arguments: tc.function.arguments,
          },
        });
      }
    }

    return result;
  }

  /**
   * Check if any artifact is still streaming
   */
  hasIncomplete(): boolean {
    for (const artifactId of this.toolCallsByArtifactId.keys()) {
      if (!this.completedArtifacts.has(artifactId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Reset the accumulator
   */
  reset(): void {
    this.toolCallsByArtifactId.clear();
    this.completedArtifacts.clear();
  }
}

/** Collect all tool_calls from A2AResult array
 * Priority: final status-update > artifact-update accumulation
 * The final status-update contains complete data, artifact-update may have duplicated arguments
 */
export function collectNativeToolCalls(results: A2AResult[]): NativeToolCall[] {
  // First, try to extract from final status-update (this is the authoritative source)
  const finalToolCalls: NativeToolCall[] = [];

  for (const result of results) {
    // Skip artifact-update events - they may have accumulated/duplicated data
    if (result.kind === 'artifact-update') {
      continue;
    }

    // Check if this is a final status-update
    const isFinal = 'final' in result && result.final === true;

    // Handle direct tool calls from message/status-update parts
    const parts = extractPartsFromResult(result);
    for (const part of parts) {
      if (part.kind === 'data' && 'data' in part) {
        const calls = extractToolCallsFromDataPart(part.data);
        if (isFinal && calls.length > 0) {
          // Final status-update has authoritative data
          finalToolCalls.push(...calls);
        }
      }
    }
  }

  // If we found tool calls in final status-update, use those
  if (finalToolCalls.length > 0) {
    // Dedupe by id
    const seen = new Set<string>();
    return finalToolCalls.filter(tc => {
      if (seen.has(tc.id)) return false;
      seen.add(tc.id);
      return true;
    });
  }

  // Fallback: no final status-update, try non-final status-updates
  const nonFinalToolCalls: NativeToolCall[] = [];
  for (const result of results) {
    if (result.kind === 'artifact-update') continue;

    const parts = extractPartsFromResult(result);
    for (const part of parts) {
      if (part.kind === 'data' && 'data' in part) {
        const calls = extractToolCallsFromDataPart(part.data);
        nonFinalToolCalls.push(...calls);
      }
    }
  }

  if (nonFinalToolCalls.length > 0) {
    const seen = new Set<string>();
    return nonFinalToolCalls.filter(tc => {
      if (seen.has(tc.id)) return false;
      seen.add(tc.id);
      return true;
    });
  }

  // Last resort: use artifact-update accumulation (may have streaming issues)
  const accumulator = new ToolCallAccumulator();
  for (const result of results) {
    if (result.kind === 'artifact-update') {
      accumulator.processArtifactUpdate(result);
    }
  }

  return accumulator.getAllToolCalls();
}

/** Parse tool call arguments */
export function parseToolArguments(tc: NativeToolCall): Record<string, unknown> {
  if (typeof tc.function.arguments === 'string') {
    try {
      return JSON.parse(tc.function.arguments);
    } catch {
      return {};
    }
  }
  return tc.function.arguments || {};
}

/** A2A Response */
export interface A2AResponse {
  jsonrpc: '2.0';
  id: string;
  result?: A2AResult;
  error?: A2AError;
}

/** A2A Result - Message Type */
export interface A2AMessageResult {
  kind: 'message';
  role: 'agent';
  messageId: string;
  parts: A2APart[];
  contextId?: string;
  taskId?: string;
  final?: boolean;
}

/** A2A Result - Status Update Type (TaskStatusUpdateEvent) */
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

/** A2A Result - Artifact Update Type (TaskArtifactUpdateEvent) */
export interface A2AArtifactUpdateResult {
  kind: 'artifact-update';
  taskId: string;
  contextId: string;
  artifact: {
    artifactId: string;
    name?: string;
    parts: A2APart[];
  };
  /** If true, content should be appended to a previously sent artifact with the same ID */
  append?: boolean;
  /** If true, this is the final chunk of the artifact */
  lastChunk?: boolean;
}

/** A2A Result Union Type */
export type A2AResult = A2AMessageResult | A2AStatusUpdateResult | A2AArtifactUpdateResult;

/** Helper: Extract parts from A2AResult */
export function extractPartsFromResult(result: A2AResult): A2APart[] {
  if (result.kind === 'message') {
    return result.parts;
  } else if (result.kind === 'status-update' && result.status.message) {
    return result.status.message.parts;
  } else if (result.kind === 'artifact-update') {
    return result.artifact.parts;
  }
  return [];
}

/** Helper: Extract contextId from A2AResult */
export function extractContextIdFromResult(result: A2AResult): string | undefined {
  if (result.kind === 'message') {
    return result.contextId;
  } else if (result.kind === 'status-update') {
    return result.contextId;
  } else if (result.kind === 'artifact-update') {
    return result.contextId;
  }
  return undefined;
}

/** Helper: Check if result is final */
export function isFinalResult(result: A2AResult): boolean {
  if (result.kind === 'message') {
    return result.final ?? false;
  } else if (result.kind === 'status-update') {
    return result.final;
  }
  // artifact-update's lastChunk only means this artifact is complete,
  // NOT that the entire task/stream is complete
  return false;
}

/** Task state type matching A2A protocol */
export type TaskState = 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled' | 'auth-required';

/** Task info extracted from A2A result */
export interface TaskInfo {
  taskId: string;
  contextId: string;
  state: TaskState;
}

/** Helper: Extract task info from A2AResult */
export function extractTaskInfoFromResult(result: A2AResult): TaskInfo | undefined {
  if (result.kind === 'status-update') {
    return {
      taskId: result.taskId,
      contextId: result.contextId,
      state: result.status.state as TaskState,
    };
  } else if (result.kind === 'artifact-update') {
    // artifact-update doesn't carry state, but has taskId/contextId
    return {
      taskId: result.taskId,
      contextId: result.contextId,
      state: 'working', // Default to working for artifact updates
    };
  }
  return undefined;
}

/** Helper: Extract tool results from A2AResult
 * Handles artifact-update with name="tool_results" format:
 * { artifact: { name: "tool_results", parts: [{ data: { tool_results: [...] } }] } }
 */
export function extractToolResultsFromResult(result: A2AResult): ToolResultData[] {
  // Only artifact-update events carry tool_results
  if (result.kind !== 'artifact-update') {
    return [];
  }

  // Check if this is a tool_results artifact
  if (result.artifact.name !== 'tool_results') {
    return [];
  }

  const toolResults: ToolResultData[] = [];

  for (const part of result.artifact.parts) {
    if (part.kind === 'data' && 'data' in part) {
      const data = part.data;
      // Look for tool_results array in the data
      if (data && typeof data === 'object' && Array.isArray(data.tool_results)) {
        for (const tr of data.tool_results) {
          if (tr && typeof tr === 'object' && tr.tool_call_id) {
            toolResults.push(tr as ToolResultData);
          }
        }
      }
    }
  }

  return toolResults;
}

/** Helper: Collect all tool results from response array */
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

/** Helper: Get file artifact type from mime type or file name */
export function getFileArtifactType(mimeType: string, fileName: string): FileArtifact['type'] {
  const lower = (mimeType + fileName).toLowerCase();

  // Check by mime type first
  if (mimeType.includes('presentation') || lower.includes('.pptx') || lower.includes('.ppt')) return 'pptx';
  if (mimeType.includes('spreadsheet') || lower.includes('.xlsx') || lower.includes('.xls')) return 'xlsx';
  if (mimeType.includes('wordprocessingml') || lower.includes('.docx') || lower.includes('.doc')) return 'docx';
  if (mimeType.includes('pdf') || lower.includes('.pdf')) return 'pdf';
  if (mimeType.includes('html') || lower.includes('.html') || lower.includes('.htm')) return 'html';
  if (mimeType.includes('csv') || lower.includes('.csv')) return 'csv';
  if (mimeType.includes('markdown') || lower.includes('.md')) return 'md';
  if (mimeType.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/.test(lower)) return 'image';

  return 'other';
}

/** A2A Error */
export interface A2AError {
  code: number;
  message: string;
}

/** Streaming Event Type */
export type A2AStreamEvent =
  | { type: 'chunk'; data: A2AResult }
  | { type: 'complete'; contextId?: string }
  | { type: 'error'; error: A2AError };

// ===== Session Types =====

/** A2A Session */
export interface A2ASession {
  contextId: string | null;
  conversationId: string;
  /** Current taskId for continuing input-required tasks */
  taskId?: string;
}

// ===== Conversation Types =====

/** Conversation Metadata */
export interface Conversation {
  /** Context ID - unique identifier, same as A2A contextId and backend thread_id */
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  endpoint: string;
  /** Current taskId for input-required state continuation */
  currentTaskId?: string;
  /** Import source directory (if imported) */
  importSource?: string;
}

// ===== Debug Record Types =====

/** JSON-RPC Interaction Log Entry */
export interface JsonRpcLogEntry {
  id: string;
  timestamp: number;
  direction: 'request' | 'response' | 'sse-event';
  /** Associated user message ID - for linking logs with message blocks */
  messageId?: string;
  /** Associated assistant message ID - linked after SSE event completes */
  responseMessageId?: string;
  /** Request related */
  request?: {
    method: string;
    endpoint: string;
    body: A2ARequest;
    /** Debug info about context/task IDs */
    _contextIdInfo?: {
      usingContextId: string | null;
      usingTaskId?: string | null;
      conversationId: string;
      note: string;
    };
  };
  /** Response related */
  response?: {
    status?: number;
    data: A2AResult | A2AResponse;
  };
  /** SSE Event */
  sseEvent?: {
    eventType: 'chunk' | 'complete' | 'error';
    data?: A2AResult;
    error?: A2AError;
  };
}

/** Debug Record */
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

// ===== Agent Card Types =====

/** Agent Card - A2A Protocol Agent Metadata */
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

/** Agent Skill */
export interface AgentSkill {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

// ===== Auth Config Types =====

/** Auth Configuration */
export interface AuthConfig {
  /** Bearer Token (optional) */
  bearerToken?: string;
  /** Account ID - for backend tenant isolation */
  accountId?: string;
  /** Token expiration timestamp (seconds since epoch) */
  expiresOn?: number;
}

// ===== Config Types =====

/** App Configuration */
export interface AppConfig {
  defaultEndpoint: string;
  theme: 'light' | 'dark' | 'system';
  /** Auth configuration */
  auth?: AuthConfig;
}

// ===== IPC Channels =====

export const IPC_CHANNELS = {
  // A2A Communication
  A2A_SEND: 'a2a:send',
  A2A_STREAM: 'a2a:stream',
  A2A_STOP: 'a2a:stop',
  A2A_STREAM_CHUNK: 'a2a:stream:chunk',
  A2A_STREAM_COMPLETE: 'a2a:stream:complete',
  A2A_STREAM_ERROR: 'a2a:stream:error',
  A2A_GET_AGENT_CARD: 'a2a:get-agent-card',

  // Debug Logs
  DEBUG_LOG: 'debug:log',
  DEBUG_LOGS_LIST: 'debug:logs:list',
  DEBUG_LOGS_SAVE: 'debug:logs:save',
  DEBUG_LOGS_SAVE_ONE: 'debug:logs:save-one',
  DEBUG_LOGS_CLEAR: 'debug:logs:clear',

  // Conversation Management
  CONVERSATIONS_LIST: 'conversations:list',
  CONVERSATIONS_CREATE: 'conversations:create',
  CONVERSATIONS_DELETE: 'conversations:delete',
  CONVERSATIONS_UPDATE: 'conversations:update',

  // Message Management
  MESSAGES_LIST: 'messages:list',
  MESSAGES_SAVE: 'messages:save',

  // Config Management
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',

  // Window Controls (Windows/Linux custom title bar)
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  GET_PLATFORM: 'get-platform',

  // Backend Recording Import
  IMPORT_BACKEND_LIST: 'import:backend:list',
  IMPORT_BACKEND_IMPORT: 'import:backend:import',
  IMPORT_BACKEND_SELECT_DIR: 'import:backend:select-dir',
  IMPORT_BACKEND_UNINSTALL: 'import:backend:uninstall',
  IMPORT_BACKEND_LIST_SOURCES: 'import:backend:list-sources',

  // Live Viewer
  LIVE_START_WATCH: 'live:start-watch',
  LIVE_STOP_WATCH: 'live:stop-watch',
  LIVE_GET_SESSIONS: 'live:get-sessions',
  LIVE_GET_MESSAGES: 'live:get-messages',
  LIVE_GET_DEBUG_LOGS: 'live:get-debug-logs',
  LIVE_SESSION_UPDATE: 'live:session-update',
} as const;

/** Backend Recorded Conversation Info */
export interface BackendConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  endpoint: string;
  contextId?: string;
  /** Whether imported to local */
  imported: boolean;
}

/** Import Result */
export interface ImportResult {
  success: boolean;
  importedCount: number;
  skippedCount: number;
  errors: string[];
}

/** Import Source Info */
export interface ImportSource {
  path: string;
  name: string;
  conversationCount: number;
}

// ===== Live Viewer Types =====

/** Live Session Status */
export type LiveSessionStatus = 'streaming' | 'active' | 'idle' | 'inactive';

/** Live Session Info */
export interface LiveSession {
  contextId: string;
  title: string;
  endpoint: string;
  lastActivity: number;
  status: LiveSessionStatus;
  messageCount: number;
  lastMessage?: string;
}
