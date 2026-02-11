/**
 * 消息输入组件
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Send, Square } from 'lucide-react';
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
} from '../../atoms/chat-atoms';
import type { UserMessage, AssistantMessage, A2AResult, JsonRpcLogEntry, A2ARequest } from '../../../shared/types';
import { extractPartsFromResult } from '../../../shared/types';

export function ChatInput() {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useAtom(streamingAtom);
  const [streamingContent, setStreamingContent] = useAtom(streamingContentAtom);
  const [streamingChunks, setStreamingChunks] = useAtom(streamingChunksAtom);
  const currentConversation = useAtomValue(currentConversationAtom);
  const [messages, setMessages] = useAtom(messagesAtom);
  const endpoint = useAtomValue(endpointAtom);
  const authConfig = useAtomValue(authConfigAtom);
  const setError = useSetAtom(errorAtom);
  const setDebugLogs = useSetAtom(debugLogsAtom);
  const [currentStreamingMessageId, setCurrentStreamingMessageId] = useAtom(currentStreamingMessageIdAtom);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 使用 ref 存储最新的值，避免闭包问题
  const streamingContentRef = useRef('');
  const streamingChunksRef = useRef<A2AResult[]>([]);
  const currentStreamingMessageIdRef = useRef<string | null>(null);

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

  // 同步 ref 值
  useEffect(() => {
    streamingContentRef.current = streamingContent;
  }, [streamingContent]);

  useEffect(() => {
    streamingChunksRef.current = streamingChunks;
  }, [streamingChunks]);

  useEffect(() => {
    currentStreamingMessageIdRef.current = currentStreamingMessageId;
  }, [currentStreamingMessageId]);

  // 订阅流式事件
  useEffect(() => {
    if (!currentConversation) return;

    const unsubChunk = window.electronAPI.onA2AStreamChunk(({ conversationId, data }) => {
      if (conversationId !== currentConversation.id) return;

      // 记录 SSE 事件到调试日志（包含 messageId 用于关联）
      addDebugLog({
        direction: 'sse-event',
        messageId: currentStreamingMessageIdRef.current || undefined,
        sseEvent: {
          eventType: 'chunk',
          data,
        },
      });

      setStreamingChunks((prev) => [...prev, data]);

      // 提取文本内容（支持 message 和 status-update 两种格式）
      const parts = extractPartsFromResult(data);
      const textParts = parts
        .filter((p) => p.kind === 'text' && 'text' in p)
        .map((p) => (p as { text: string }).text);

      if (textParts.length > 0) {
        setStreamingContent((prev) => prev + textParts.join(''));
      }
    });

    const unsubComplete = window.electronAPI.onA2AStreamComplete(({ conversationId }) => {
      if (conversationId !== currentConversation.id) return;

      // 记录完成事件（包含 messageId 用于关联）
      addDebugLog({
        direction: 'sse-event',
        messageId: currentStreamingMessageIdRef.current || undefined,
        sseEvent: {
          eventType: 'complete',
        },
      });

      finalizeStreamingMessage();
    });

    const unsubError = window.electronAPI.onA2AStreamError(({ conversationId, error }) => {
      if (conversationId !== currentConversation.id) return;

      // 记录错误事件（包含 messageId 用于关联）
      addDebugLog({
        direction: 'sse-event',
        messageId: currentStreamingMessageIdRef.current || undefined,
        sseEvent: {
          eventType: 'error',
          error,
        },
      });

      setError(`A2A Error: ${error.message} (code: ${error.code})`);
      setStreaming(false);
      setStreamingContent('');
      setStreamingChunks([]);
      setCurrentStreamingMessageId(null);
    });

    return () => {
      unsubChunk();
      unsubComplete();
      unsubError();
    };
  }, [currentConversation?.id]);

  const finalizeStreamingMessage = useCallback(async () => {
    if (!currentConversation) return;

    // 使用 ref 中的最新值
    const content = streamingContentRef.current;
    const chunks = streamingChunksRef.current;
    const requestMessageId = currentStreamingMessageIdRef.current;

    const assistantMessage: AssistantMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: content,
      rawResponse: chunks,
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, assistantMessage]);
    await window.electronAPI.saveMessage(currentConversation.id, assistantMessage);

    // 更新关联日志的 responseMessageId，使点击 assistant 消息也能高亮对应日志
    if (requestMessageId) {
      setDebugLogs((prev) => {
        const updatedLogs = prev.map((log) =>
          log.messageId === requestMessageId
            ? { ...log, responseMessageId: assistantMessage.id }
            : log
        );
        // 异步保存更新后的日志到文件
        window.electronAPI.saveDebugLogs(currentConversation.id, updatedLogs).catch(console.error);
        return updatedLogs;
      });
    }

    setStreaming(false);
    setStreamingContent('');
    setStreamingChunks([]);
    setCurrentStreamingMessageId(null);
  }, [currentConversation, setMessages, setStreaming, setStreamingContent, setStreamingChunks, setCurrentStreamingMessageId, setDebugLogs]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!input.trim() || !currentConversation || streaming) return;

    const userMessage: UserMessage = {
      id: uuidv4(),
      role: 'user',
      content: input.trim(),
      createdAt: Date.now(),
    };

    // 添加用户消息
    setMessages((prev) => [...prev, userMessage]);
    await window.electronAPI.saveMessage(currentConversation.id, userMessage);

    setInput('');
    setStreaming(true);
    setStreamingContent('');
    setStreamingChunks([]);

    // 设置当前流式消息 ID（用于关联后续 SSE 事件）
    setCurrentStreamingMessageId(userMessage.id);

    try {
      // 发起流式请求（传递认证配置）
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
            parts: [{ kind: 'text', type: 'text', text: userMessage.content }],
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
          method: 'message/stream',
          endpoint: requestEndpoint,
          body: requestBody,
        },
      });

      await window.electronAPI.a2aStream(
        requestEndpoint,
        userMessage.content,
        currentConversation.id,
        auth
      );
    } catch (error) {
      setError(`Failed to send message: ${error}`);
      setStreaming(false);
      setCurrentStreamingMessageId(null);
    }
  };

  const handleStop = async () => {
    if (!currentConversation) return;
    await window.electronAPI.a2aStop(currentConversation.id);
    finalizeStreamingMessage();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 自动调整高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  if (!currentConversation) return null;

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 p-4">
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              disabled={streaming}
              className="w-full px-4 py-3 pr-12 text-sm border border-gray-300 dark:border-gray-600 rounded-2xl bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none disabled:opacity-50"
              rows={1}
            />
          </div>

          {streaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
              title="Stop generation"
            >
              <Square className="w-5 h-5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="p-3 bg-primary-500 text-white rounded-full hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
