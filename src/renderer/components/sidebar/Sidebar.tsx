/**
 * 侧边栏组件
 */

import { useState, useEffect, useMemo } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Plus, MessageSquare, Trash2, ChevronLeft, ChevronRight, Download, Folder, FolderOpen, FolderMinus, Eye, EyeOff, Radio } from 'lucide-react';
import {
  conversationsAtom,
  currentConversationIdAtom,
  endpointAtom,
  sidebarExpandedAtom,
  messagesAtom,
  appModeAtom,
  liveWatchingAtom,
  liveWatchDirAtom,
  liveSessionsAtom,
  liveSelectedContextIdAtom,
} from '../../atoms/chat-atoms';
import type { BackendConversation, Conversation, LiveSession } from '../../../shared/types';

export function Sidebar() {
  const [conversations, setConversations] = useAtom(conversationsAtom);
  const [currentConversationId, setCurrentConversationId] = useAtom(currentConversationIdAtom);
  const [sidebarExpanded, setSidebarExpanded] = useAtom(sidebarExpandedAtom);
  const endpoint = useAtomValue(endpointAtom);
  const setMessages = useSetAtom(messagesAtom);

  // App mode (debug vs live)
  const [appMode, setAppMode] = useAtom(appModeAtom);

  // Live Viewer state
  const [liveWatching, setLiveWatching] = useAtom(liveWatchingAtom);
  const [liveWatchDir, setLiveWatchDir] = useAtom(liveWatchDirAtom);
  const [liveSessions, setLiveSessions] = useAtom(liveSessionsAtom);
  const [liveSelectedContextId, setLiveSelectedContextId] = useAtom(liveSelectedContextIdAtom);

  // 导入对话框状态
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importSourceDir, setImportSourceDir] = useState<string | null>(null);
  const [backendConversations, setBackendConversations] = useState<BackendConversation[]>([]);
  const [selectedImports, setSelectedImports] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  // 导入来源管理
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());

  // Live Viewer 事件监听
  useEffect(() => {
    const unsubscribe = window.electronAPI.onLiveSessionUpdate((data) => {
      setLiveWatching(data.watching);
      setLiveWatchDir(data.watchDir);
      setLiveSessions(data.sessions);
    });

    // 初始加载状态
    window.electronAPI.liveGetSessions().then((data) => {
      setLiveWatching(data.watching);
      setLiveWatchDir(data.watchDir);
      setLiveSessions(data.sessions);
    });

    return unsubscribe;
  }, [setLiveWatching, setLiveWatchDir, setLiveSessions]);

  // 分组会话：本地会话 + 按导入来源分组
  const { localConversations, importedGroups } = useMemo(() => {
    const local: Conversation[] = [];
    const imported = new Map<string, Conversation[]>();

    for (const conv of conversations) {
      if (conv.importSource) {
        const group = imported.get(conv.importSource) || [];
        group.push(conv);
        imported.set(conv.importSource, group);
      } else {
        local.push(conv);
      }
    }

    return {
      localConversations: local,
      importedGroups: Array.from(imported.entries()).map(([source, convs]) => ({
        source,
        name: source.split(/[/\\]/).pop() || source,
        conversations: convs,
      })),
    };
  }, [conversations]);

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

  const handleOpenImportDialog = async () => {
    try {
      const selectedDir = await window.electronAPI.selectImportDirectory();
      if (!selectedDir) return;

      setImportSourceDir(selectedDir);
      const backendConvs = await window.electronAPI.listBackendConversations(selectedDir);
      setBackendConversations(backendConvs);
      setSelectedImports(new Set());
      setShowImportDialog(true);
    } catch (error) {
      console.error('Failed to list backend conversations:', error);
    }
  };

  const handleToggleImportSelection = (id: string) => {
    setSelectedImports((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (selectedImports.size === 0 || !importSourceDir) return;

    setImporting(true);
    try {
      const result = await window.electronAPI.importBackendConversations(
        importSourceDir,
        Array.from(selectedImports)
      );

      if (result.importedCount > 0) {
        const updatedConversations = await window.electronAPI.listConversations();
        setConversations(updatedConversations);
        // 自动展开新导入的来源
        setExpandedSources((prev) => new Set([...prev, importSourceDir]));
      }

      setShowImportDialog(false);

      if (result.errors.length > 0) {
        console.error('Import errors:', result.errors);
      }
    } catch (error) {
      console.error('Failed to import conversations:', error);
    } finally {
      setImporting(false);
    }
  };

  const handleUninstallSource = async (sourcePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Offload all conversations from:\n${sourcePath}?`)) return;

    try {
      const result = await window.electronAPI.uninstallImportSource(sourcePath);
      if (result.success) {
        const updatedConversations = await window.electronAPI.listConversations();
        setConversations(updatedConversations);
        setExpandedSources((prev) => {
          const next = new Set(prev);
          next.delete(sourcePath);
          return next;
        });
      }
    } catch (error) {
      console.error('Failed to uninstall source:', error);
    }
  };

  const handleToggleSourceExpand = (source: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) {
        next.delete(source);
      } else {
        next.add(source);
      }
      return next;
    });
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
    setAppMode('debug');
    setCurrentConversationId(id);
  };

  // ===== Live Viewer Handlers =====

  const handleStartWatch = async () => {
    try {
      const result = await window.electronAPI.liveStartWatch();
      if (result.success) {
        setLiveWatching(true);
        setLiveWatchDir(result.watchDir);
        setLiveSessions(result.sessions);
        setAppMode('live');
      }
    } catch (error) {
      console.error('Failed to start watch:', error);
    }
  };

  const handleStopWatch = async () => {
    try {
      await window.electronAPI.liveStopWatch();
      setLiveWatching(false);
      setLiveWatchDir(null);
      setLiveSessions([]);
    } catch (error) {
      console.error('Failed to stop watch:', error);
    }
  };

  const handleSelectLiveSession = (contextId: string) => {
    setAppMode('live');
    setLiveSelectedContextId(contextId);
  };

  const getStatusColor = (status: LiveSession['status']) => {
    switch (status) {
      case 'streaming':
        return 'bg-green-500 animate-pulse';
      case 'active':
        return 'bg-green-500';
      case 'idle':
        return 'bg-yellow-500';
      case 'inactive':
        return 'bg-gray-400';
    }
  };

  const getStatusLabel = (status: LiveSession['status']) => {
    switch (status) {
      case 'streaming':
        return 'Streaming';
      case 'active':
        return 'Active';
      case 'idle':
        return 'Idle';
      case 'inactive':
        return 'Inactive';
    }
  };

  const renderConversationItem = (conversation: Conversation, indent = false) => (
    <div
      key={conversation.id}
      onClick={() => handleSelectConversation(conversation.id)}
      className={`group flex items-center gap-2 px-3 py-2 mb-1 rounded-lg cursor-pointer transition-colors ${
        indent ? 'ml-4' : ''
      } ${
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
  );

  return (
    <div
      className={`bg-gray-50 dark:bg-gray-800 flex flex-col transition-all duration-300 ease-in-out ${
        sidebarExpanded ? 'w-64' : 'w-12'
      }`}
    >
      {/* 标题栏 */}
      <div className="h-11 titlebar-drag flex-shrink-0 bg-white dark:bg-gray-900" />

      {/* 内容区域 */}
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

        {/* 按钮区域 */}
        <div className={`px-2 ${sidebarExpanded ? '' : 'flex flex-col items-center gap-1'}`}>
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

          <button
            onClick={handleOpenImportDialog}
            className={`flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors ${
              sidebarExpanded ? 'w-full px-3 py-2' : 'p-2'
            }`}
            title="Import recordings"
          >
            <Download className={sidebarExpanded ? 'w-4 h-4' : 'w-5 h-5'} />
            {sidebarExpanded && <span className="whitespace-nowrap">Import</span>}
          </button>
        </div>

        {/* 对话列表 - 树状结构 */}
        {sidebarExpanded ? (
          <div className="flex-1 overflow-y-auto px-2 mt-2">
            {/* 本地会话 */}
            {localConversations.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 px-3 py-1 uppercase">
                  Local
                </div>
                {localConversations.map((conv) => renderConversationItem(conv))}
              </div>
            )}

            {/* 导入的会话（按来源分组） */}
            {importedGroups.map(({ source, name, conversations: groupConvs }) => (
              <div key={source} className="mb-2">
                {/* 分组标题 */}
                <div
                  onClick={() => handleToggleSourceExpand(source)}
                  className="group flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50"
                >
                  {expandedSources.has(source) ? (
                    <FolderOpen className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Folder className="w-4 h-4 text-amber-500" />
                  )}
                  <span className="flex-1 text-xs font-medium text-gray-600 dark:text-gray-300 truncate" title={source}>
                    {name}
                  </span>
                  <span className="text-xs text-gray-400">{groupConvs.length}</span>
                  <button
                    onClick={(e) => handleUninstallSource(source, e)}
                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-opacity"
                    title="Offload this folder"
                  >
                    <FolderMinus className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                  </button>
                </div>

                {/* 分组内的会话 */}
                {expandedSources.has(source) && (
                  <div className="mt-1">
                    {groupConvs.map((conv) => renderConversationItem(conv, true))}
                  </div>
                )}
              </div>
            ))}

            {conversations.length === 0 && (
              <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
                No conversations yet
              </div>
            )}

            {/* Live Viewer 分隔线 */}
            <div className="border-t border-gray-200 dark:border-gray-700 my-3" />

            {/* Live Viewer 区域 */}
            <div className="mb-3">
              <div className="flex items-center justify-between px-3 py-1">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Live Viewer
                </span>
                {liveWatching ? (
                  <button
                    onClick={handleStopWatch}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                    title="Stop watching"
                  >
                    <EyeOff className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                ) : (
                  <button
                    onClick={handleStartWatch}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                    title="Start watching a directory"
                  >
                    <Eye className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                )}
              </div>

              {liveWatching && liveWatchDir && (
                <>
                  <div className="px-3 py-1 text-xs text-gray-400 truncate" title={liveWatchDir}>
                    {liveWatchDir.split(/[/\\]/).pop()}
                  </div>

                  {liveSessions.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-gray-400 text-center">
                      No active sessions
                    </div>
                  ) : (
                    <div className="mt-1">
                      {liveSessions.map((session) => (
                        <div
                          key={session.contextId}
                          onClick={() => handleSelectLiveSession(session.contextId)}
                          className={`group flex items-center gap-2 px-3 py-2 mb-1 rounded-lg cursor-pointer transition-colors ${
                            appMode === 'live' && liveSelectedContextId === session.contextId
                              ? 'bg-gray-200 dark:bg-gray-700'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'
                          }`}
                        >
                          <div className="relative">
                            <Radio className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            <span
                              className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${getStatusColor(session.status)}`}
                              title={getStatusLabel(session.status)}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-700 dark:text-gray-300 truncate">
                              {session.title}
                            </div>
                            {session.lastMessage && (
                              <div className="text-xs text-gray-400 truncate">
                                {session.lastMessage}
                              </div>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">{session.messageCount}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {!liveWatching && (
                <button
                  onClick={handleStartWatch}
                  className="w-full px-3 py-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
                >
                  Click to watch a directory...
                </button>
              )}
            </div>
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

      {/* 导入对话框 */}
      {showImportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[480px] max-h-[600px] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Import Recordings
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate" title={importSourceDir || ''}>
                From: {importSourceDir}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {backendConversations.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No recordings found in this directory.
                  <br />
                  <span className="text-sm">
                    Make sure the directory contains conversations.json
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  {backendConversations.map((conv) => (
                    <label
                      key={conv.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        conv.imported
                          ? 'bg-gray-100 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 opacity-60'
                          : selectedImports.has(conv.id)
                          ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedImports.has(conv.id)}
                        disabled={conv.imported}
                        onChange={() => handleToggleImportSelection(conv.id)}
                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                          {conv.title}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(conv.createdAt).toLocaleString()}
                          {conv.imported && (
                            <span className="ml-2 text-green-600 dark:text-green-400">
                              (Already imported)
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                onClick={() => setShowImportDialog(false)}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={selectedImports.size === 0 || importing}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {importing ? 'Importing...' : `Import (${selectedImports.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
