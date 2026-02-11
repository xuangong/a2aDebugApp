/**
 * 消息列表组件
 */

import { useEffect, useRef, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { messagesAtom, streamingAtom, streamingContentAtom, viewModeAtom, selectedMessageIdAtom, chatSearchQueryAtom } from '../../atoms/chat-atoms';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { StreamingMessage } from './StreamingMessage';
import type { AssistantMessage as AssistantMessageType } from '../../../shared/types';

interface ChatMessagesProps {
  /** task-clarify 表单提交回调 */
  onSubmitTaskClarify?: (responses: Record<string, string | string[]>) => Promise<void>;
}

export function ChatMessages({ onSubmitTaskClarify }: ChatMessagesProps) {
  const messages = useAtomValue(messagesAtom);
  const streaming = useAtomValue(streamingAtom);
  const streamingContent = useAtomValue(streamingContentAtom);
  const viewMode = useAtomValue(viewModeAtom);
  const [selectedMessageId, setSelectedMessageId] = useAtom(selectedMessageIdAtom);
  const searchQuery = useAtomValue(chatSearchQueryAtom);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 过滤消息：搜索 assistant 消息内容
  const { filteredMessages, matchingIds } = useMemo(() => {
    if (!searchQuery.trim()) {
      return { filteredMessages: messages, matchingIds: new Set<string>() };
    }
    const query = searchQuery.toLowerCase();
    const ids = new Set<string>();

    // 找出匹配的 assistant 消息
    messages.forEach((msg) => {
      if (msg.role === 'assistant') {
        const assistantMsg = msg as AssistantMessageType;
        // 搜索内容和 rawResponse
        const content = assistantMsg.content?.toLowerCase() || '';
        const rawJson = JSON.stringify(assistantMsg.rawResponse || []).toLowerCase();
        if (content.includes(query) || rawJson.includes(query)) {
          ids.add(msg.id);
        }
      }
    });

    return { filteredMessages: messages, matchingIds: ids };
  }, [messages, searchQuery]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // 点击消息时设置选中状态（toggle）
  const handleMessageClick = (messageId: string) => {
    setSelectedMessageId(prev => prev === messageId ? null : messageId);
  };

  // 点击空白处时取消选择
  const handleContainerClick = (e: React.MouseEvent) => {
    // 只有点击容器本身（不是子元素）时才取消选择
    if (e.target === e.currentTarget) {
      setSelectedMessageId(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4" onClick={handleContainerClick}>
      <div className="w-full space-y-4" onClick={handleContainerClick}>
        {filteredMessages.map((message) => (
          message.role === 'user' ? (
            <UserMessage
              key={message.id}
              message={message}
              isSelected={selectedMessageId === message.id}
              onClick={() => handleMessageClick(message.id)}
            />
          ) : (
            <AssistantMessage
              key={message.id}
              message={message}
              viewMode={viewMode}
              isSelected={selectedMessageId === message.id}
              isSearchMatch={matchingIds.has(message.id)}
              searchQuery={searchQuery}
              onClick={() => handleMessageClick(message.id)}
              onSubmitTaskClarify={onSubmitTaskClarify}
            />
          )
        ))}

        {/* 流式消息 - 实时渲染 XML 工具调用 */}
        {streaming && streamingContent && (
          <StreamingMessage content={streamingContent} viewMode={viewMode} />
        )}

        {/* 加载指示器 - 等待首个内容 */}
        {streaming && !streamingContent && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
