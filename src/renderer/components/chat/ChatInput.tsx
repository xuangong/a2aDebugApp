/**
 * 消息输入组件
 * 支持多个对话同时 streaming，切换对话不中断后台 streaming
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Send, Square } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import {
  currentConversationAtom,
  conversationsAtom,
  messagesMapAtom,
  streamingAtom,
  streamingContentAtom,
  streamingChunksAtom,
  streamingMapAtom,
  getConversationStreamingState,
  endpointAtom,
  errorAtom,
  authConfigAtom,
  debugLogsMapAtom,
  currentStreamingMessageIdAtom,
  streamingToolCallsAtom,
  streamingToolResultsAtom,
  streamingFileArtifactsAtom,
  tasksMapAtom,
  type TaskInfo as AtomTaskInfo,
  type ConversationStreamingState,
} from '../../atoms/chat-atoms';
import type { UserMessage, AssistantMessage, A2AResult, JsonRpcLogEntry, A2ARequest, A2AArtifactUpdateResult, NativeToolCall, ToolResultData, FileArtifact, Message, A2AFilePart } from '../../../shared/types';
import { extractPartsFromResult, ToolCallAccumulator, extractContextIdFromResult, extractToolResultsFromResult, extractTaskInfoFromResult, getFileArtifactType, collectNativeToolCalls } from '../../../shared/types';

// Per-conversation accumulator state
interface ConversationAccumulators {
  toolCalls: ToolCallAccumulator;
  toolResults: Map<string, ToolResultData>;
  fileArtifacts: Map<string, FileArtifact>;
}

export function ChatInput() {
  const [input, setInput] = useState('');
  // Current conversation's streaming state (for UI display)
  const [streaming, setStreaming] = useAtom(streamingAtom);
  const setStreamingContent = useSetAtom(streamingContentAtom);
  const setStreamingChunks = useSetAtom(streamingChunksAtom);
  const setStreamingToolCalls = useSetAtom(streamingToolCallsAtom);
  const setStreamingToolResults = useSetAtom(streamingToolResultsAtom);
  const setStreamingFileArtifacts = useSetAtom(streamingFileArtifactsAtom);
  const setCurrentStreamingMessageId = useSetAtom(currentStreamingMessageIdAtom);

  // Direct access to per-conversation maps for updating any conversation
  const [streamingMap, setStreamingMap] = useAtom(streamingMapAtom);
  const [messagesMap, setMessagesMap] = useAtom(messagesMapAtom);

  // Ref to hold latest streamingMap for use in event handlers without re-registering
  const streamingMapRef = useRef(streamingMap);
  useEffect(() => {
    streamingMapRef.current = streamingMap;
  }, [streamingMap]);

  const currentConversation = useAtomValue(currentConversationAtom);
  const setConversations = useSetAtom(conversationsAtom);
  const endpoint = useAtomValue(endpointAtom);
  const authConfig = useAtomValue(authConfigAtom);
  const setError = useSetAtom(errorAtom);
  const setDebugLogsMap = useSetAtom(debugLogsMapAtom);
  const setTasksMap = useSetAtom(tasksMapAtom);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Per-conversation accumulators (refs don't re-render, perfect for background updates)
  const accumulatorsRef = useRef<Map<string, ConversationAccumulators>>(new Map());

  const getOrCreateAccumulators = useCallback((conversationId: string): ConversationAccumulators => {
    let acc = accumulatorsRef.current.get(conversationId);
    if (!acc) {
      acc = {
        toolCalls: new ToolCallAccumulator(),
        toolResults: new Map(),
        fileArtifacts: new Map(),
      };
      accumulatorsRef.current.set(conversationId, acc);
    }
    return acc;
  }, []);

  const resetAccumulators = useCallback((conversationId: string) => {
    const acc = accumulatorsRef.current.get(conversationId);
    if (acc) {
      acc.toolCalls.reset();
      acc.toolResults.clear();
      acc.fileArtifacts.clear();
    }
  }, []);

  // Helper to update streaming state for a specific conversation
  const updateConversationStreaming = useCallback((
    conversationId: string,
    updater: (state: ConversationStreamingState) => Partial<ConversationStreamingState>
  ) => {
    setStreamingMap((map) => {
      const newMap = new Map(map);
      const currentState = getConversationStreamingState(newMap, conversationId);
      const updates = updater(currentState);
      newMap.set(conversationId, { ...currentState, ...updates });
      return newMap;
    });
  }, [setStreamingMap]);

  // Helper to add message to a specific conversation (with deduplication)
  const addMessageToConversation = useCallback((conversationId: string, message: Message) => {
    setMessagesMap((map) => {
      const newMap = new Map(map);
      const messages = newMap.get(conversationId) || [];
      // Dedupe by message id
      if (messages.some(m => m.id === message.id)) {
        return map; // Already exists, don't add
      }
      newMap.set(conversationId, [...messages, message]);
      return newMap;
    });
  }, [setMessagesMap]);

  // 添加调试日志（同时保存到文件，per-conversation）
  const addDebugLog = useCallback((conversationId: string, entry: Omit<JsonRpcLogEntry, 'id' | 'timestamp'>) => {
    const logEntry: JsonRpcLogEntry = {
      id: uuidv4(),
      timestamp: Date.now(),
      ...entry,
    };
    setDebugLogsMap((map) => {
      const newMap = new Map(map);
      const logs = newMap.get(conversationId) || [];
      newMap.set(conversationId, [...logs, logEntry]);
      return newMap;
    });

    // 异步保存到文件
    window.electronAPI.saveDebugLog(conversationId, logEntry).catch(console.error);
  }, [setDebugLogsMap]);

  // Finalize streaming message for a specific conversation
  const finalizeStreamingMessage = useCallback(async (conversationId: string) => {
    const state = getConversationStreamingState(streamingMapRef.current, conversationId);
    const acc = accumulatorsRef.current.get(conversationId);

    // Collect tool calls from multiple sources:
    // 1. Accumulator (from artifact-update streaming chunks)
    // 2. Final status-update (authoritative source with complete tool calls)
    const accumulatorToolCalls = acc?.toolCalls.getAllToolCalls() || [];
    const statusUpdateToolCalls = collectNativeToolCalls(state.chunks);

    // Merge and dedupe - prefer status-update data as it has complete arguments
    const toolCallsById = new Map<string, NativeToolCall>();
    // First add accumulator tool calls
    for (const tc of accumulatorToolCalls) {
      if (tc.id) {
        toolCallsById.set(tc.id, tc);
      }
    }
    // Then override with status-update tool calls (more complete data)
    for (const tc of statusUpdateToolCalls) {
      if (tc.id) {
        toolCallsById.set(tc.id, tc);
      }
    }
    const finalToolCalls = Array.from(toolCallsById.values());

    // Collect tool results from accumulator
    const finalToolResults = acc?.toolResults && acc.toolResults.size > 0
      ? Array.from(acc.toolResults.values())
      : undefined;
    // Use fileArtifacts from accumulator ref (more reliable than streamingMap state)
    const finalFileArtifacts = acc?.fileArtifacts && acc.fileArtifacts.size > 0
      ? Array.from(acc.fileArtifacts.values())
      : (state.fileArtifacts.length > 0 ? state.fileArtifacts : undefined);

    const assistantMessage: AssistantMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: state.content,
      rawResponse: state.chunks,
      nativeToolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
      toolResults: finalToolResults,
      fileArtifacts: finalFileArtifacts,
      createdAt: Date.now(),
    };

    // Add message to the specific conversation
    addMessageToConversation(conversationId, assistantMessage);
    await window.electronAPI.saveMessage(conversationId, assistantMessage);

    // Update debug logs with response message ID (per-conversation)
    const requestMessageId = state.messageId;
    if (requestMessageId) {
      setDebugLogsMap((map) => {
        const newMap = new Map(map);
        const logs = newMap.get(conversationId) || [];
        const updatedLogs = logs.map((log) =>
          log.messageId === requestMessageId
            ? { ...log, responseMessageId: assistantMessage.id }
            : log
        );
        newMap.set(conversationId, updatedLogs);
        window.electronAPI.saveDebugLogs(conversationId, updatedLogs).catch(console.error);
        return newMap;
      });
    }

    // Clear streaming state for this conversation
    updateConversationStreaming(conversationId, () => ({
      streaming: false,
      content: '',
      chunks: [],
      toolCalls: [],
      toolResults: new Map(),
      fileArtifacts: [],
      messageId: null,
    }));

    resetAccumulators(conversationId);
  }, [addMessageToConversation, setDebugLogsMap, updateConversationStreaming, resetAccumulators]);

  // Global streaming event listeners (handle all conversations)
  useEffect(() => {
    const unsubChunk = window.electronAPI.onA2AStreamChunk(({ conversationId, data }) => {
      const acc = getOrCreateAccumulators(conversationId);
      const state = getConversationStreamingState(streamingMapRef.current, conversationId);

      // Log SSE event
      addDebugLog(conversationId, {
        direction: 'sse-event',
        messageId: state.messageId || undefined,
        sseEvent: {
          eventType: 'chunk',
          data,
        },
      });

      // Verify contextId matches
      const contextId = extractContextIdFromResult(data);
      if (contextId && contextId !== conversationId) {
        console.warn('[ChatInput] contextId mismatch:', { conversationId, receivedContextId: contextId });
      }

      // Extract and track Task state (per-conversation)
      const taskInfo = extractTaskInfoFromResult(data);
      if (taskInfo) {
        setTasksMap((map) => {
          const newMap = new Map(map);
          const tasks = newMap.get(conversationId) || [];
          const existingIndex = tasks.findIndex((t) => t.taskId === taskInfo.taskId);
          const now = Date.now();
          const newTask: AtomTaskInfo = {
            taskId: taskInfo.taskId,
            contextId: taskInfo.contextId,
            state: taskInfo.state,
            createdAt: existingIndex >= 0 ? tasks[existingIndex].createdAt : now,
            updatedAt: now,
            messageId: state.messageId || undefined,
          };

          if (existingIndex >= 0) {
            const updated = [...tasks];
            updated[existingIndex] = newTask;
            newMap.set(conversationId, updated);
          } else {
            newMap.set(conversationId, [...tasks, newTask]);
          }
          return newMap;
        });

        // Update conversation's currentTaskId
        if (taskInfo.state === 'input-required') {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversationId ? { ...c, currentTaskId: taskInfo.taskId } : c
            )
          );
          window.electronAPI.updateConversation(conversationId, {
            currentTaskId: taskInfo.taskId,
          }).catch(console.error);
        } else if (['completed', 'failed', 'canceled'].includes(taskInfo.state)) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversationId ? { ...c, currentTaskId: undefined } : c
            )
          );
          window.electronAPI.updateConversation(conversationId, {
            currentTaskId: undefined,
          }).catch(console.error);
        }
      }

      // Handle artifact-update events
      if (data.kind === 'artifact-update') {
        const artifactUpdate = data as A2AArtifactUpdateResult;
        const artifactName = artifactUpdate.artifact.name;

        if (artifactName === 'tool_results') {
          const newToolResults = extractToolResultsFromResult(artifactUpdate);
          for (const tr of newToolResults) {
            acc.toolResults.set(tr.tool_call_id, tr);
          }
          updateConversationStreaming(conversationId, () => ({
            toolResults: new Map(acc.toolResults),
          }));
          // Don't return - continue to add to chunks for interleaved display
        }

        if (artifactName === 'tool_calls') {
          acc.toolCalls.processArtifactUpdate(artifactUpdate);
          updateConversationStreaming(conversationId, () => ({
            toolCalls: acc.toolCalls.getAllToolCalls(),
          }));
          // Don't return - continue to add to chunks for interleaved display
        }

        // Handle file artifacts from artifact-update (FilePart)
        for (const part of artifactUpdate.artifact.parts) {
          if (part.kind === 'file') {
            const filePart = part as A2AFilePart;
            const fileName = filePart.file.name;
            const mimeType = filePart.file.mimeType;
            const uri = filePart.file.uri;
            if (uri && fileName) {
              const fileArtifact: FileArtifact = {
                id: artifactUpdate.artifact.artifactId,
                file_path: artifactName || fileName,
                file_name: fileName,
                mime_type: mimeType,
                download_url: uri,
                type: getFileArtifactType(mimeType, fileName),
                createdAt: Date.now(),
              };
              acc.fileArtifacts.set(fileName, fileArtifact);
              updateConversationStreaming(conversationId, () => ({
                fileArtifacts: Array.from(acc.fileArtifacts.values()),
              }));
            }
          }
        }
        // Don't return - continue to add to chunks for interleaved display
      }

      // Handle file_artifacts from status-update DataPart (backend-provided)
      if (data.kind === 'status-update') {
        const statusParts = extractPartsFromResult(data);
        for (const part of statusParts) {
          if (part.kind === 'data' && 'data' in part) {
            const partData = part.data as Record<string, unknown>;
            // Backend sends file_artifacts array in DataPart
            if (Array.isArray(partData.file_artifacts)) {
              for (const fa of partData.file_artifacts) {
                if (fa && typeof fa === 'object' && fa.file_name) {
                  const fileArtifact: FileArtifact = {
                    id: (fa as Record<string, unknown>).id as string || `fa-${Date.now()}`,
                    file_path: (fa as Record<string, unknown>).file_path as string || '',
                    file_name: fa.file_name as string,
                    mime_type: (fa as Record<string, unknown>).mime_type as string || 'application/octet-stream',
                    download_url: (fa as Record<string, unknown>).download_url as string || '',
                    type: getFileArtifactType(
                      (fa as Record<string, unknown>).mime_type as string || '',
                      fa.file_name as string
                    ),
                    createdAt: Date.now(),
                  };
                  acc.fileArtifacts.set(fileArtifact.file_name, fileArtifact);
                }
              }
              updateConversationStreaming(conversationId, () => ({
                fileArtifacts: Array.from(acc.fileArtifacts.values()),
              }));
            }
          }
        }
      }

      // Extract text content
      const parts = extractPartsFromResult(data);
      const textParts = parts
        .filter((p) => p.kind === 'text' && 'text' in p)
        .map((p) => (p as { text: string }).text);

      // Update streaming state for this conversation
      updateConversationStreaming(conversationId, (prevState) => ({
        chunks: [...prevState.chunks, data],
        content: prevState.content + textParts.join(''),
        fileArtifacts: Array.from(acc.fileArtifacts.values()),
      }));
    });

    const unsubComplete = window.electronAPI.onA2AStreamComplete(({ conversationId }) => {
      const state = getConversationStreamingState(streamingMapRef.current, conversationId);

      addDebugLog(conversationId, {
        direction: 'sse-event',
        messageId: state.messageId || undefined,
        sseEvent: {
          eventType: 'complete',
        },
      });

      finalizeStreamingMessage(conversationId);
    });

    const unsubError = window.electronAPI.onA2AStreamError(({ conversationId, error }) => {
      const state = getConversationStreamingState(streamingMapRef.current, conversationId);

      addDebugLog(conversationId, {
        direction: 'sse-event',
        messageId: state.messageId || undefined,
        sseEvent: {
          eventType: 'error',
          error,
        },
      });

      setError(`A2A Error: ${error.message} (code: ${error.code})`);

      // Clear streaming state for this conversation
      updateConversationStreaming(conversationId, () => ({
        streaming: false,
        content: '',
        chunks: [],
        toolCalls: [],
        toolResults: new Map(),
        fileArtifacts: [],
        messageId: null,
      }));

      resetAccumulators(conversationId);
    });

    return () => {
      unsubChunk();
      unsubComplete();
      unsubError();
    };
  }, [getOrCreateAccumulators, addDebugLog, setTasksMap, setConversations, updateConversationStreaming, finalizeStreamingMessage, resetAccumulators, setError]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!input.trim() || !currentConversation || streaming) return;

    const conversationId = currentConversation.id;
    const messageContent = input.trim();
    const now = Date.now();
    const userMessage: UserMessage = {
      id: uuidv4(),
      role: 'user',
      content: messageContent,
      createdAt: now,
    };

    // Check if this is the first message - update conversation title
    const existingMessages = messagesMap.get(conversationId) || [];
    if (existingMessages.length === 0) {
      // Format: "First query..." + time (HH:MM)
      const maxLen = 20;
      const truncatedQuery = messageContent.length > maxLen
        ? messageContent.substring(0, maxLen) + '...'
        : messageContent;
      const timeStr = new Date(now).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const newTitle = `${truncatedQuery} ${timeStr}`;

      // Update conversation title in state
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, title: newTitle, updatedAt: now } : c
        )
      );
      // Persist to file
      window.electronAPI.updateConversation(conversationId, { title: newTitle }).catch(console.error);
    }

    // Add user message to the conversation
    addMessageToConversation(conversationId, userMessage);
    await window.electronAPI.saveMessage(conversationId, userMessage);

    setInput('');

    // Initialize streaming state for this conversation
    resetAccumulators(conversationId);
    updateConversationStreaming(conversationId, () => ({
      streaming: true,
      content: '',
      chunks: [],
      toolCalls: [],
      toolResults: new Map(),
      fileArtifacts: [],
      messageId: userMessage.id,
    }));

    try {
      const auth = authConfig.bearerToken || authConfig.accountId ? authConfig : undefined;
      const requestEndpoint = currentConversation.endpoint || endpoint;

      const metadata = auth?.accountId ? { accountId: auth.accountId } : undefined;
      const requestBody: A2ARequest = {
        jsonrpc: '2.0',
        method: 'message/stream',
        params: {
          message: {
            role: 'user',
            kind: 'message',
            messageId: uuidv4(),
            parts: [{ kind: 'text', type: 'text', text: userMessage.content }],
            ...(conversationId && { contextId: conversationId }),
          },
          ...(metadata && { metadata }),
        },
        id: `req-${Date.now()}`,
      };

      addDebugLog(conversationId, {
        direction: 'request',
        messageId: userMessage.id,
        request: {
          method: 'message/stream',
          endpoint: requestEndpoint,
          body: requestBody,
          _contextIdInfo: {
            usingContextId: conversationId || null,
            conversationId: conversationId,
            note: conversationId
              ? 'Reusing existing session (contextId passed)'
              : 'No contextId - will create new session',
          },
        },
      });

      await window.electronAPI.a2aStream(
        requestEndpoint,
        userMessage.content,
        conversationId,
        auth
      );
    } catch (error) {
      setError(`Failed to send message: ${error}`);
      updateConversationStreaming(conversationId, () => ({
        streaming: false,
        messageId: null,
      }));
      resetAccumulators(conversationId);
    }
  };

  const handleStop = async () => {
    if (!currentConversation) return;
    await window.electronAPI.a2aStop(currentConversation.id);
    await finalizeStreamingMessage(currentConversation.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const adjustHeight = () => {
      // Reset to auto to get accurate scrollHeight measurement
      textarea.style.height = 'auto';

      // Calculate new height: min 44px (single line with padding), max 200px
      const minHeight = 44;
      const maxHeight = 200;
      const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));
      textarea.style.height = `${newHeight}px`;
    };

    adjustHeight();

    // Also listen for window resize to recalculate height
    window.addEventListener('resize', adjustHeight);
    return () => window.removeEventListener('resize', adjustHeight);
  }, [input]);

  if (!currentConversation) return null;

  return (
    <div className="p-4 border-t border-apple-gray-300/60 dark:border-[#38383A] bg-white dark:bg-[#1C1C1E]">
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={streaming}
            className="flex-1 min-h-11 py-[10px] px-4 rounded-xl border border-apple-gray-300 dark:border-[#48484A] bg-white dark:bg-[#2C2C2E] text-apple-gray-900 dark:text-apple-gray-100 placeholder:text-apple-gray-400 dark:placeholder:text-apple-gray-500 focus:outline-none focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 resize-none text-sm leading-6"
            rows={1}
          />

          {streaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="flex-shrink-0 w-11 h-11 flex items-center justify-center bg-apple-red text-white rounded-xl shadow-sm hover:bg-apple-red/90 transition-all duration-150 active:scale-95"
              title="Stop generation"
            >
              <Square className="w-5 h-5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="flex-shrink-0 w-11 h-11 flex items-center justify-center bg-apple-blue text-white rounded-xl shadow-sm hover:bg-[#0066CC] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 active:scale-95"
              title="Send message"
            >
              <Send className="w-5 h-5" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
