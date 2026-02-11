/**
 * 侧边栏组件
 */

import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Plus, MessageSquare, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  conversationsAtom,
  currentConversationIdAtom,
  endpointAtom,
  sidebarExpandedAtom,
  messagesAtom,
} from '../../atoms/chat-atoms';

export function Sidebar() {
  const [conversations, setConversations] = useAtom(conversationsAtom);
  const [currentConversationId, setCurrentConversationId] = useAtom(currentConversationIdAtom);
  const [sidebarExpanded, setSidebarExpanded] = useAtom(sidebarExpandedAtom);
  const endpoint = useAtomValue(endpointAtom);
  const setMessages = useSetAtom(messagesAtom);

  const handleNewConversation = async () => {
    try {
      const conversation = await window.electronAPI.createConversation(
        'New Conversation',
        endpoint
      );
      setConversations((prev) => [conversation, ...prev]);
      setCurrentConversationId(conversation.id);
      setMessages([]);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await window.electronAPI.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConversationId === id) {
        const remaining = conversations.filter((c) => c.id !== id);
        setCurrentConversationId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const handleSelectConversation = (id: string) => {
    setCurrentConversationId(id);
  };

  return (
    <div
      className={`bg-gray-50 dark:bg-gray-800 flex flex-col transition-all duration-300 ease-in-out ${
        sidebarExpanded ? 'w-64' : 'w-12'
      }`}
    >
      {/* 标题栏 - 交通灯按钮区域（使用主窗口背景色） */}
      <div className="h-11 titlebar-drag flex-shrink-0 bg-white dark:bg-gray-900" />

      {/* 内容区域（带右边框） */}
      <div className="flex-1 flex flex-col border-r border-gray-200 dark:border-gray-700 overflow-x-hidden overflow-y-auto">
        {/* 标题和折叠按钮 */}
        <div className={`flex items-center px-2 py-2 ${sidebarExpanded ? 'justify-between' : 'justify-center'}`}>
          {sidebarExpanded ? (
            <>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 pl-2 whitespace-nowrap">
                A2A Debug
              </span>
              <button
                onClick={() => setSidebarExpanded(false)}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md titlebar-no-drag transition-colors"
                title="Collapse sidebar"
              >
                <ChevronLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setSidebarExpanded(true)}
              className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg titlebar-no-drag transition-colors"
              title="Expand sidebar"
            >
              <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          )}
        </div>

        {/* 新建对话按钮 */}
        <div className={`px-2 ${sidebarExpanded ? '' : 'flex justify-center'}`}>
          <button
            onClick={handleNewConversation}
            className={`flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors ${
              sidebarExpanded ? 'w-full px-3 py-2' : 'p-2'
            }`}
            title="New conversation"
          >
            <Plus className={sidebarExpanded ? 'w-4 h-4' : 'w-5 h-5'} />
            {sidebarExpanded && <span className="whitespace-nowrap">New Conversation</span>}
          </button>
        </div>

        {/* 对话列表 */}
        {sidebarExpanded ? (
          <div className="flex-1 overflow-y-auto px-2 mt-2">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => handleSelectConversation(conversation.id)}
                className={`group flex items-center gap-2 px-3 py-2 mb-1 rounded-lg cursor-pointer transition-colors ${
                  currentConversationId === conversation.id
                    ? 'bg-gray-200 dark:bg-gray-700'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'
                }`}
              >
                <MessageSquare className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">
                  {conversation.title}
                </span>
                <button
                  onClick={(e) => handleDeleteConversation(conversation.id, e)}
                  className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-300 dark:hover:bg-gray-600 rounded transition-opacity"
                  title="Delete conversation"
                >
                  <Trash2 className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            ))}

            {conversations.length === 0 && (
              <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
                No conversations yet
              </div>
            )}
          </div>
        ) : (
          /* 收起时显示对话图标列表 */
          <div className="flex-1 overflow-y-auto flex flex-col items-center gap-1 mt-2">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => handleSelectConversation(conversation.id)}
                className={`p-2 rounded-lg transition-colors ${
                  currentConversationId === conversation.id
                    ? 'bg-gray-200 dark:bg-gray-700'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
                title={conversation.title}
              >
                <MessageSquare className={`w-5 h-5 ${
                  currentConversationId === conversation.id
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-gray-500 dark:text-gray-400'
                }`} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
