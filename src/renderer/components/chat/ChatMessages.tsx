/**
 * Message List Component
 */

import { useEffect, useRef, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { messagesAtom, streamingAtom, streamingContentAtom, streamingToolCallsAtom, streamingToolResultsAtom, streamingChunksAtom, viewModeAtom, selectedMessageIdAtom, chatSearchQueryAtom } from '../../atoms/chat-atoms';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { StreamingMessage } from './StreamingMessage';
import type { AssistantMessage as AssistantMessageType } from '../../../shared/types';

interface ChatMessagesProps {
  /** task-clarify form submit callback */
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

  // Filter messages: search assistant message content
  const { filteredMessages, matchingIds } = useMemo(() => {
    if (!searchQuery.trim()) {
      return { filteredMessages: messages, matchingIds: new Set<string>() };
    }
    const query = searchQuery.toLowerCase();
    const ids = new Set<string>();

    // Find matching assistant messages
    messages.forEach((msg) => {
      if (msg.role === 'assistant') {
        const assistantMsg = msg as AssistantMessageType;
        // Search content and rawResponse
        const content = assistantMsg.content?.toLowerCase() || '';
        const rawJson = JSON.stringify(assistantMsg.rawResponse || []).toLowerCase();
        if (content.includes(query) || rawJson.includes(query)) {
          ids.add(msg.id);
        }
      }
    });

    return { filteredMessages: messages, matchingIds: ids };
  }, [messages, searchQuery]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, streamingToolCalls]);

  // Toggle message selection on click
  const handleMessageClick = (messageId: string) => {
    if (selectedMessageId === messageId) {
      setSelectedMessageId(null);
    } else {
      setSelectedMessageId(messageId);
    }
  };

  // Deselect when clicking empty area
  const handleContainerClick = (e: React.MouseEvent) => {
    // Only deselect when clicking the container itself (not child elements)
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

        {/* Streaming message - real-time rendering of XML tool calls and Native Tool Calls */}
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

        {/* Loading indicator - Apple style */}
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
