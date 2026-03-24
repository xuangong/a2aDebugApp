/**
 * Task-clarify 提交 hook
 * 处理 task-clarify 表单提交并发送到 A2A 后端
 *
 * 使用 Native tool call 格式:
 * {"tool_result": {"tool_name": "task_clarify", "tool_call_id": "xxx", "result": {...}}}
 *
 * taskId 续传机制:
 * - 当 task 状态变为 input-required 时，IPC 层会自动保存 taskId 到 conversation.currentTaskId
 * - 提交 tool result 时，会自动使用保存的 taskId
 * - 这确保了响应会被发送到同一个 task，而不是创建新 task
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
 * 格式化 task-clarify 响应为 native tool call JSON 格式
 */
function formatNativeToolResultMessage(
  responses: Record<string, string | string[]>,
  toolCallId: string,
): string {
  return JSON.stringify({
    tool_result: {
      tool_name: 'task_clarify',
      tool_call_id: toolCallId,
      result: responses,
    },
  });
}

/**
 * 提供 task-clarify 表单提交功能的 hook
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

  // 添加调试日志（同时保存到文件）
  const addDebugLog = useCallback((entry: Omit<JsonRpcLogEntry, 'id' | 'timestamp'>) => {
    const logEntry: JsonRpcLogEntry = {
      id: uuidv4(),
      timestamp: Date.now(),
      ...entry,
    };
    setDebugLogs((prev) => [...prev, logEntry]);

    // 异步保存到文件
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

      console.log('[useTaskClarify] submitTaskClarify called with:', {
        responses,
        toolCallId,
      });

      // Format as native tool call
      const messageContent = formatNativeToolResultMessage(responses, toolCallId);
      console.log('[useTaskClarify] messageContent:', messageContent);

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

      // 创建用户消息（工具结果）with rawRequest for debugging
      const userMessage: UserMessage = {
        id: uuidv4(),
        role: 'user',
        content: messageContent,
        rawRequest, // Store raw request for view mode toggle
        createdAt: Date.now(),
      };

      // 添加用户消息
      setMessages((prev) => [...prev, userMessage]);
      await window.electronAPI.saveMessage(currentConversation.id, userMessage);

      // 开始流式响应
      setStreaming(true);
      setStreamingContent('');
      setStreamingChunks([]);

      // 设置当前流式消息 ID（用于关联后续 SSE 事件）
      setCurrentStreamingMessageId(userMessage.id);

      try {
        // 记录请求到调试日志
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
