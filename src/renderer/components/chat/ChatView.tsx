/**
 * Chat Main View
 */

import { useAtomValue } from 'jotai';
import { Bot } from 'lucide-react';
import { currentConversationAtom, agentCardAtom } from '../../atoms/chat-atoms';
import { ChatHeader } from './ChatHeader';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { TaskStatusBar } from './TaskStatusBar';
import { ConnectionPanel } from '../agent/ConnectionPanel';
import { DebugPanel } from '../debug/DebugPanel';
import { useTaskClarify } from '../../hooks/useTaskClarify';

export function ChatView() {
  const currentConversation = useAtomValue(currentConversationAtom);
  const agentCard = useAtomValue(agentCardAtom);
  const { submitTaskClarify } = useTaskClarify();

  if (!currentConversation) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full space-y-6">
          {/* Welcome message */}
          <div className="text-center">
            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Bot className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
              A2A Debug App
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Connect to an A2A agent server to start debugging
            </p>
          </div>

          {/* Connection panel */}
          <ConnectionPanel />

          {/* Hint message */}
          <div className="text-center text-xs text-gray-400 dark:text-gray-500">
            <p>Create a new conversation from the sidebar after connecting</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0">
      {/* Chat main area */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatHeader />
        <TaskStatusBar />
        <ChatMessages onSubmitTaskClarify={submitTaskClarify} />
        <ChatInput />
      </div>

      {/* Debug panel */}
      <DebugPanel />
    </div>
  );
}
