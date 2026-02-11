/**
 * Task-clarify 提交 hook
 * 处理 task-clarify 表单提交并发送到 A2A 后端
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
 * 格式化 task-clarify 响应为 tool_result XML 格式
 */
function formatToolResultMessage(responses: Record<string, string | string[]>): string {
  const content = JSON.stringify(responses);
  return `<tool_result><task-clarify>${content}</task-clarify></tool_result>`;
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
    async (responses: Record<string, string | string[]>) => {
      if (!currentConversation || streaming) {
        throw new Error('Cannot submit: no conversation or already streaming');
      }

      // 格式化为 tool_result XML
      const messageContent = formatToolResultMessage(responses);

      // 创建用户消息（工具结果）
      const userMessage: UserMessage = {
        id: uuidv4(),
        role: 'user',
        content: messageContent,
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
        // 发起流式请求
        const auth = authConfig.bearerToken || authConfig.accountId ? authConfig : undefined;
        const requestEndpoint = currentConversation.endpoint || endpoint;

        // 构建请求体用于调试日志
        const metadata = auth?.accountId ? { accountId: auth.accountId } : undefined;
        const requestBody: A2ARequest = {
          jsonrpc: '2.0',
          method: 'message/stream',
          params: {
            message: {
              role: 'user',
              kind: 'message',
              messageId: uuidv4(),
              parts: [{ kind: 'text', type: 'text', text: messageContent }],
            },
            ...(currentConversation.contextId && { contextId: currentConversation.contextId }),
            ...(metadata && { metadata }),
          },
          id: `req-${Date.now()}`,
        };

        // 记录请求到调试日志（包含 messageId 用于关联）
        addDebugLog({
          direction: 'request',
          messageId: userMessage.id,
          request: {
            method: 'message/stream (task-clarify)',
            endpoint: requestEndpoint,
            body: requestBody,
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
