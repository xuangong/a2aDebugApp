/**
 * 聊天头部组件
 * Apple Design System
 */

import { useState, useRef, useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Settings, Eye, Code, Bot, FileText, Search, X, Link2, Copy, Check } from 'lucide-react';
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
  const [showContextId, setShowContextId] = useState(false);
  const [copied, setCopied] = useState(false);
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

  const copyContextId = () => {
    if (currentConversation?.id) {
      navigator.clipboard.writeText(currentConversation.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!currentConversation) return null;

  return (
    <div className="relative">
      {/* 标题栏拖拽区域 */}
      <div className="h-11 titlebar-drag" />

      {/* 内容区域 - Apple style header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-apple-gray-300/60 dark:border-[#38383A]">
        <div className="flex items-center gap-3">
          {/* Agent 信息 */}
          {agentCard ? (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-apple-blue rounded-apple flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-apple-sm font-semibold text-apple-gray-900 dark:text-apple-gray-100">
                  {agentCard.name}
                </span>
                {agentCard.version && (
                  <span className="ml-2 apple-badge-blue">v{agentCard.version}</span>
                )}
              </div>
            </div>
          ) : (
            <h1 className="text-apple-sm font-semibold text-apple-gray-900 dark:text-apple-gray-100 truncate max-w-xs">
              {currentConversation.title}
            </h1>
          )}

          {/* Endpoint */}
          <span className="text-apple-xs text-apple-gray-500 truncate max-w-xs hidden sm:block">
            {currentConversation.endpoint || endpoint}
          </span>

          {/* Context ID 显示按钮 */}
          <button
            onClick={() => setShowContextId(!showContextId)}
            className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded-apple-sm text-apple-xs font-medium transition-all duration-apple
              ${currentConversation.id
                ? 'bg-apple-green/10 text-apple-green hover:bg-apple-green/15'
                : 'bg-apple-gray-200 dark:bg-[#38383A] text-apple-gray-500'
              }
            `}
            title={currentConversation.id ? `ContextId: ${currentConversation.id}` : 'No contextId yet'}
          >
            <Link2 className="w-3 h-3" />
            {currentConversation.id ? 'Session' : 'No Session'}
          </button>
        </div>

        <div className="flex items-center gap-2 titlebar-no-drag">
          {/* 搜索按钮 */}
          <button
            onClick={toggleSearch}
            className={`btn-apple-icon ${searchVisible ? 'bg-apple-blue/10 text-apple-blue' : ''}`}
            title="Search messages (Ctrl+F)"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* 视图切换 - Apple Segmented Control */}
          <div className="apple-segmented">
            <button
              onClick={() => setViewMode('rendered')}
              className={`apple-segment flex items-center gap-1.5 ${viewMode === 'rendered' ? 'active' : ''}`}
              title="Rendered view"
            >
              <Eye className="w-3 h-3" />
              <span className="hidden sm:inline">Rendered</span>
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`apple-segment flex items-center gap-1.5 ${viewMode === 'raw' ? 'active' : ''}`}
              title="Raw JSON view"
            >
              <Code className="w-3 h-3" />
              <span className="hidden sm:inline">Raw</span>
            </button>
            <button
              onClick={() => setViewMode('content')}
              className={`apple-segment flex items-center gap-1.5 ${viewMode === 'content' ? 'active' : ''}`}
              title="Raw content view"
            >
              <FileText className="w-3 h-3" />
              <span className="hidden sm:inline">Content</span>
            </button>
          </div>

          {/* 连接设置按钮 */}
          <button
            onClick={() => setShowConnectionPanel(!showConnectionPanel)}
            className={`btn-apple-icon ${showConnectionPanel ? 'bg-apple-blue/10 text-apple-blue' : ''}`}
            title="Server Connection"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Context ID 详情面板 */}
      {showContextId && (
        <div className="px-6 py-3 bg-apple-gray-50 dark:bg-[#1C1C1E] border-b border-apple-gray-300/60 dark:border-[#38383A] animate-slide-up">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-apple-xs font-medium text-apple-gray-500">Context ID (Thread ID):</span>
                {currentConversation.id ? (
                  <code className="text-apple-xs bg-apple-gray-200 dark:bg-[#38383A] px-2 py-1 rounded-apple-sm font-mono text-apple-gray-800 dark:text-apple-gray-200">
                    {currentConversation.id}
                  </code>
                ) : (
                  <span className="text-apple-xs text-apple-gray-400 italic">Not set - will be assigned on first message</span>
                )}
                {currentConversation.id && (
                  <button
                    onClick={copyContextId}
                    className="btn-apple-icon w-6 h-6"
                    title="Copy Context ID"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-apple-green" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
              <p className="text-apple-xs text-apple-gray-400 max-w-lg">
                Context ID is extracted from SSE responses and used to maintain session continuity with the backend.
              </p>
            </div>
            <button
              onClick={() => setShowContextId(false)}
              className="btn-apple-icon w-6 h-6"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 连接面板 */}
      {showConnectionPanel && (
        <div className="absolute top-full right-6 z-50 mt-2 animate-scale-in">
          <ConnectionPanel onClose={() => setShowConnectionPanel(false)} />
        </div>
      )}

      {/* 搜索框 - Apple vibrancy style */}
      {searchVisible && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 z-50 mt-2 animate-scale-in">
          <div className="apple-vibrancy apple-card rounded-apple-lg p-3 shadow-apple-lg">
            <div className="flex items-center gap-3">
              <Search className="w-4 h-4 text-apple-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search in responses..."
                className="w-72 px-0 py-1 text-apple-sm border-none bg-transparent text-apple-gray-900 dark:text-apple-gray-100 placeholder:text-apple-gray-400 focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="btn-apple-icon w-6 h-6"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <kbd className="px-2 py-0.5 text-[10px] font-medium text-apple-gray-500 bg-apple-gray-100 dark:bg-[#38383A] rounded-apple-sm">
                ESC
              </kbd>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
