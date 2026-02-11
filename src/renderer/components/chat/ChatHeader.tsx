/**
 * 聊天头部组件
 */

import { useState, useRef, useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Settings, Eye, Code, Bot, FileText, Search, X } from 'lucide-react';
import {
  currentConversationAtom,
  conversationsAtom,
  endpointAtom,
  viewModeAtom,
  agentCardAtom,
  chatSearchQueryAtom,
  chatSearchVisibleAtom,
} from '../../atoms/chat-atoms';
import { ConnectionPanel } from '../agent/ConnectionPanel';

export function ChatHeader() {
  const currentConversation = useAtomValue(currentConversationAtom);
  const setConversations = useSetAtom(conversationsAtom);
  const [endpoint, setEndpoint] = useAtom(endpointAtom);
  const [viewMode, setViewMode] = useAtom(viewModeAtom);
  const agentCard = useAtomValue(agentCardAtom);
  const [showConnectionPanel, setShowConnectionPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useAtom(chatSearchQueryAtom);
  const [searchVisible, setSearchVisible] = useAtom(chatSearchVisibleAtom);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 搜索框显示时自动聚焦
  useEffect(() => {
    if (searchVisible) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [searchVisible]);

  const toggleSearch = () => {
    if (searchVisible) {
      setSearchQuery('');
    }
    setSearchVisible(!searchVisible);
  };

  if (!currentConversation) return null;

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 relative">
      {/* 标题栏拖拽区域 */}
      <div className="h-11 titlebar-drag bg-white dark:bg-gray-900" />

      {/* 内容区域 */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          {/* Agent 信息 */}
          {agentCard ? (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-primary-100 dark:bg-primary-900/30 rounded flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary-600 dark:text-primary-400" />
              </div>
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {agentCard.name}
              </span>
              {agentCard.version && (
                <span className="text-xs text-gray-400">v{agentCard.version}</span>
              )}
            </div>
          ) : (
            <h1 className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate max-w-xs">
              {currentConversation.title}
            </h1>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
            {currentConversation.endpoint || endpoint}
          </span>
        </div>

        <div className="flex items-center gap-2 titlebar-no-drag">
        {/* 搜索按钮 */}
        <button
          onClick={toggleSearch}
          className={`p-1.5 rounded-lg transition-colors ${
            searchVisible
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
          }`}
          title="Search messages (Ctrl+F)"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* 视图切换 */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('rendered')}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
              viewMode === 'rendered'
                ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-200 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
            title="Rendered view"
          >
            <Eye className="w-3 h-3" />
            Rendered
          </button>
          <button
            onClick={() => setViewMode('raw')}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
              viewMode === 'raw'
                ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-200 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
            title="Raw JSON view"
          >
            <Code className="w-3 h-3" />
            Raw
          </button>
          <button
            onClick={() => setViewMode('content')}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
              viewMode === 'content'
                ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-200 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
            title="Raw content view"
          >
            <FileText className="w-3 h-3" />
            Content
          </button>
        </div>

        {/* 连接设置按钮 */}
        <button
          onClick={() => setShowConnectionPanel(!showConnectionPanel)}
          className={`p-1.5 rounded-lg transition-colors ${
            showConnectionPanel
              ? 'bg-primary-100 dark:bg-primary-900/30'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          title="Server Connection"
        >
          <Settings className={`w-4 h-4 ${
            showConnectionPanel
              ? 'text-primary-600 dark:text-primary-400'
              : 'text-gray-600 dark:text-gray-400'
          }`} />
        </button>
        </div>
      </div>

      {/* 连接面板 */}
      {showConnectionPanel && (
        <div className="absolute top-full right-4 z-50 mt-1">
          <ConnectionPanel onClose={() => setShowConnectionPanel(false)} />
        </div>
      )}

      {/* 搜索框 */}
      {searchVisible && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 z-50 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-2">
          <div className="relative flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in responses..."
              className="w-64 px-2 py-1 text-sm border-none bg-transparent text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X className="w-3 h-3 text-gray-400" />
              </button>
            )}
            <button
              onClick={toggleSearch}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-xs text-gray-500"
            >
              ESC
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
