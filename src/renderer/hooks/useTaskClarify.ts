/**
 * Task-clarify submission hook
 * Handles task-clarify form submission and sends to A2A backend
 *
 * Uses Native tool call format:
 * {"tool_result": {"tool_name": "task_clarify", "tool_call_id": "xxx", "result": {...}}}
 *
 * taskId continuation mechanism:
 * - When task state becomes input-required, IPC layer auto-saves taskId to conversation.currentTaskId
 * - When submitting tool result, the saved taskId is automatically used
 * - This ensures the response is sent to the same task, not creating a new one
 */

import { useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { v4 as uuidv4 } from 'uuid';
import {
  currentConversationAtom,
  messagesAtom,
  streamingAtom,
  streamingContentAtom,
  streamingChunksAtom,
  endpointAtom,
  errorAtom,
  authConfigAtom,
  debugLogsAtom,
  currentStreamingMessageIdAtom,
} from '../atoms/chat-atoms';
import type { UserMessage, A2ARequest, JsonRpcLogEntry } from '../../shared/types';

/**
 * Format tool result response as native tool call JSON
 * Supports task_clarify, presentation_planner, and other client tools
 */
function formatNativeToolResultMessage(
  responses: Record<string, string | string[]>,
  toolCallId: string,
  toolName: string = 'task_clarify',
): string {
  // Remove internal _tool_name field before sending
  const { _tool_name, ...cleanResponses } = responses as Record<string, unknown>;
  return JSON.stringify({
    tool_result: {
      tool_name: toolName,
      tool_call_id: toolCallId,
      result: cleanResponses,
    },
  });
}

/**
 * Hook providing task-clarify form submission functionality
 */
export function useTaskClarify() {
  const currentConversation = useAtomValue(currentConversationAtom);
  const [messages, setMessages] = useAtom(messagesAtom);
  const [streaming, setStreaming] = useAtom(streamingAtom);
  const setStreamingContent = useSetAtom(streamingContentAtom);
  const setStreamingChunks = useSetAtom(streamingChunksAtom);
  const endpoint = useAtomValue(endpointAtom);
  const authConfig = useAtomValue(authConfigAtom);
  const setError = useSetAtom(errorAtom);
  const setDebugLogs = useSetAtom(debugLogsAtom);
  const setCurrentStreamingMessageId = useSetAtom(currentStreamingMessageIdAtom);

  // Add debug log (also persisted to file)
  const addDebugLog = useCallback((entry: Omit<JsonRpcLogEntry, 'id' | 'timestamp'>) => {
    const logEntry: JsonRpcLogEntry = {
      id: uuidv4(),
      timestamp: Date.now(),
      ...entry,
    };
    setDebugLogs((prev) => [...prev, logEntry]);

    // Persist to file asynchronously
    if (currentConversation) {
      window.electronAPI.saveDebugLog(currentConversation.id, logEntry).catch(console.error);
    }
  }, [setDebugLogs, currentConversation]);

  const submitTaskClarify = useCallback(
    async (responses: Record<string, string | string[]>, toolCallId?: string) => {
      if (!currentConversation || streaming) {
        throw new Error('Cannot submit: no conversation or already streaming');
      }

      // toolCallId is required for native tool call format
      if (!toolCallId) {
        throw new Error('toolCallId is required for native tool call format');
      }

      // Detect tool name from responses (default to task_clarify)
      const toolName = typeof responses._tool_name === 'string' ? responses._tool_name : 'task_clarify';

      // Format as native tool call
      const messageContent = formatNativeToolResultMessage(responses, toolCallId, toolName);

      // Build raw request for debugging (before creating message)
      const auth = authConfig.bearerToken || authConfig.accountId ? authConfig : undefined;
      const requestEndpoint = currentConversation.endpoint || endpoint;
      const metadata = auth?.accountId ? { accountId: auth.accountId } : undefined;
      const rawRequest: A2ARequest = {
        jsonrpc: '2.0',
        method: 'message/stream',
        params: {
          message: {
            role: 'user',
            kind: 'message',
            messageId: uuidv4(),
            parts: [{ kind: 'text', type: 'text', text: messageContent }],
            ...(currentConversation.id && { contextId: currentConversation.id }),
            ...(currentConversation.currentTaskId && { taskId: currentConversation.currentTaskId }),
          },
          ...(metadata && { metadata }),
        },
        id: `req-${Date.now()}`,
      };

      // Create user message (tool result) with rawRequest for debugging
      const userMessage: UserMessage = {
        id: uuidv4(),
        role: 'user',
        content: messageContent,
        rawRequest, // Store raw request for view mode toggle
        createdAt: Date.now(),
      };

      // Add user message
      setMessages((prev) => [...prev, userMessage]);
      await window.electronAPI.saveMessage(currentConversation.id, userMessage);

      // Start streaming response
      setStreaming(true);
      setStreamingContent('');
      setStreamingChunks([]);

      // Set current streaming message ID (for correlating subsequent SSE events)
      setCurrentStreamingMessageId(userMessage.id);

      try {
        // Log request to debug logs
        addDebugLog({
          direction: 'request',
          messageId: userMessage.id,
          request: {
            method: 'message/stream (native task-clarify)',
            endpoint: requestEndpoint,
            body: rawRequest,
            _contextIdInfo: {
              usingContextId: currentConversation.id || null,
              usingTaskId: currentConversation.currentTaskId || null,
              conversationId: currentConversation.id,
              note: currentConversation.currentTaskId
                ? 'Continuing input-required task (taskId passed)'
                : currentConversation.id
                  ? 'Reusing existing session (contextId passed)'
                  : 'No contextId - will create new session',
            },
          },
        });

        await window.electronAPI.a2aStream(
          requestEndpoint,
          messageContent,
          currentConversation.id,
          auth
        );
      } catch (error) {
        setError(`Failed to submit task clarify: ${error}`);
        setStreaming(false);
        setCurrentStreamingMessageId(null);
        throw error;
      }
    },
    [
      currentConversation,
      streaming,
      setMessages,
      setStreaming,
      setStreamingContent,
      setStreamingChunks,
      endpoint,
      authConfig,
      setError,
      addDebugLog,
      setCurrentStreamingMessageId,
    ]
  );

  return { submitTaskClarify };
}
