/**
 * Live session read-only message viewer
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { Radio, Globe, Clock } from 'lucide-react';
import { liveSessionsAtom, viewModeAtom, debugLogsAtom } from '../../atoms/chat-atoms';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { DebugPanel } from '../debug/DebugPanel';
import type { Message, LiveSession } from '../../../shared/types';

interface LiveSessionViewProps {
  contextId: string;
}

export function LiveSessionView({ contextId }: LiveSessionViewProps) {
  const liveSessions = useAtomValue(liveSessionsAtom);
  const viewMode = useAtomValue(viewModeAtom);
  const setDebugLogs = useSetAtom(debugLogsAtom);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const session: LiveSession | undefined = liveSessions.find(
    (s) => s.contextId === contextId
  );

  const loadMessages = useCallback(async () => {
    try {
      const [msgs, logs] = await Promise.all([
        window.electronAPI.liveGetMessages(contextId),
        window.electronAPI.liveGetDebugLogs(contextId),
      ]);
      setMessages(msgs);
      setDebugLogs(logs);
    } catch {
      // ignore load errors
    } finally {
      setLoading(false);
    }
  }, [contextId, setDebugLogs]);

  // Load messages on mount / contextId change
  useEffect(() => {
    setLoading(true);
    setMessages([]);
    loadMessages();
  }, [loadMessages]);

  // Subscribe to live updates and refresh messages
  useEffect(() => {
    const unsubscribe = window.electronAPI.onLiveSessionUpdate(() => {
      loadMessages();
    });
    return unsubscribe;
  }, [loadMessages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const statusColor: Record<string, string> = {
    streaming: 'text-green-500',
    active: 'text-blue-500',
    idle: 'text-yellow-500',
    inactive: 'text-gray-400',
  };

  return (
    <div className="flex-1 flex min-h-0">
      {/* 会话主区域 */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <Radio className={`w-4 h-4 ${statusColor[session?.status ?? 'inactive']}`} />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
            {session?.title ?? contextId}
          </h2>
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            {session?.endpoint && (
              <span className="flex items-center gap-1 truncate">
                <Globe className="w-3 h-3" />
                {session.endpoint}
              </span>
            )}
            {session?.lastActivity && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(session.lastActivity).toLocaleTimeString()}
              </span>
            )}
            <span className="capitalize">{session?.status ?? 'unknown'}</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-primary-500 rounded-full animate-spin" />
              Loading messages...
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-500">
            No messages in this session yet
          </div>
        ) : (
          <div className="w-full space-y-4">
            {messages.map((message) =>
              message.role === 'user' ? (
                <UserMessage key={message.id} message={message} viewMode={viewMode} />
              ) : (
                <AssistantMessage
                  key={message.id}
                  message={message}
                  viewMode={viewMode}
                />
              )
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      </div>

      {/* 调试面板 */}
      <DebugPanel messages={messages} />
    </div>
  );
}
