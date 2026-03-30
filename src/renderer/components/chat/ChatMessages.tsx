/**
 * 消息列表组件
 */

import { useEffect, useRef, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { messagesAtom, streamingAtom, streamingContentAtom, streamingToolCallsAtom, streamingToolResultsAtom, streamingChunksAtom, viewModeAtom, selectedMessageIdAtom, chatSearchQueryAtom } from '../../atoms/chat-atoms';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { StreamingMessage } from './StreamingMessage';
import type { AssistantMessage as AssistantMessageType } from '../../../shared/types';

interface ChatMessagesProps {
  /** task-clarify 表单提交回调 */
  onSubmitTaskClarify?: (responses: Record<string, string | string[]>, toolCallId?: string) => Promise<void>;
}

export function ChatMessages({ onSubmitTaskClarify }: ChatMessagesProps) {
  const messages = useAtomValue(messagesAtom);
  const streaming = useAtomValue(streamingAtom);
  const streamingContent = useAtomValue(streamingContentAtom);
  const streamingToolCalls = useAtomValue(streamingToolCallsAtom);
  const streamingToolResults = useAtomValue(streamingToolResultsAtom);
  const streamingChunks = useAtomValue(streamingChunksAtom);
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
  }, [messages, streamingContent, streamingToolCalls]);

  // 点击消息时设置选中状态（toggle）
  const handleMessageClick = (messageId: string) => {
    if (selectedMessageId === messageId) {
      setSelectedMessageId(null);
    } else {
      setSelectedMessageId(messageId);
    }
  };

  // 点击空白处时取消选择
  const handleContainerClick = (e: React.MouseEvent) => {
    // 只有点击容器本身（不是子元素）时才取消选择
    if (e.target === e.currentTarget) {
      setSelectedMessageId(null);
    }
  };

  // Check if we have any streaming content to show
  const hasStreamingContent = streaming && (streamingContent || streamingToolCalls.length > 0);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 bg-apple-gray-100 dark:bg-black" onClick={handleContainerClick}>
      <div className="max-w-4xl mx-auto space-y-4" onClick={handleContainerClick}>
        {filteredMessages.map((message) => (
          message.role === 'user' ? (
            <UserMessage
              key={message.id}
              message={message}
              viewMode={viewMode}
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

        {/* 流式消息 - 实时渲染 XML 工具调用和 Native Tool Calls */}
        {hasStreamingContent && (
          <StreamingMessage
            content={streamingContent}
            viewMode={viewMode}
            streamingToolCalls={streamingToolCalls}
            streamingToolResults={streamingToolResults}
            streamingChunks={streamingChunks}
            onSubmitTaskClarify={onSubmitTaskClarify}
          />
        )}

        {/* 加载指示器 - Apple style */}
        {streaming && !hasStreamingContent && (
          <div className="flex justify-start animate-fade-in">
            <div className="apple-message-assistant">
              <div className="flex items-center gap-1.5">
                <span className="apple-loading-dot" />
                <span className="apple-loading-dot" />
                <span className="apple-loading-dot" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
