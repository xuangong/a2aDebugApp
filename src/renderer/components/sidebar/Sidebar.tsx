/**
 * Sidebar Component
 * Apple Design System - Clean, Minimal
 */

import { useState, useEffect, useMemo } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  Plus,
  MessageSquare,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Download,
  Folder,
  FolderOpen,
  FolderMinus,
  Eye,
  EyeOff,
  Radio,
  Sun,
  Moon,
} from 'lucide-react';
import {
  conversationsAtom,
  currentConversationIdAtom,
  endpointAtom,
  sidebarExpandedAtom,
  appModeAtom,
  liveWatchingAtom,
  liveWatchDirAtom,
  liveSessionsAtom,
  liveSelectedContextIdAtom,
} from '../../atoms/chat-atoms';
import type { BackendConversation, Conversation, LiveSession } from '../../../shared/types';

interface SidebarProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

export function Sidebar({ isDark, onToggleTheme }: SidebarProps) {
  const [conversations, setConversations] = useAtom(conversationsAtom);
  const [currentConversationId, setCurrentConversationId] = useAtom(currentConversationIdAtom);
  const [sidebarExpanded, setSidebarExpanded] = useAtom(sidebarExpandedAtom);
  const endpoint = useAtomValue(endpointAtom);

  const [appMode, setAppMode] = useAtom(appModeAtom);
  const [liveWatching, setLiveWatching] = useAtom(liveWatchingAtom);
  const [liveWatchDir, setLiveWatchDir] = useAtom(liveWatchDirAtom);
  const [liveSessions, setLiveSessions] = useAtom(liveSessionsAtom);
  const [liveSelectedContextId, setLiveSelectedContextId] = useAtom(liveSelectedContextIdAtom);

  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importSourceDir, setImportSourceDir] = useState<string | null>(null);
  const [backendConversations, setBackendConversations] = useState<BackendConversation[]>([]);
  const [selectedImports, setSelectedImports] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = window.electronAPI.onLiveSessionUpdate((data) => {
      setLiveWatching(data.watching);
      setLiveWatchDir(data.watchDir);
      setLiveSessions(data.sessions);
    });
    window.electronAPI.liveGetSessions().then((data) => {
      setLiveWatching(data.watching);
      setLiveWatchDir(data.watchDir);
      setLiveSessions(data.sessions);
    });
    return unsubscribe;
  }, [setLiveWatching, setLiveWatchDir, setLiveSessions]);

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
      const conversation = await window.electronAPI.createConversation('New Conversation', endpoint);
      setConversations((prev) => [conversation, ...prev]);
      setCurrentConversationId(conversation.id);
      // Tasks are now per-conversation, no need to clear
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
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (selectedImports.size === 0 || !importSourceDir) return;
    setImporting(true);
    try {
      const result = await window.electronAPI.importBackendConversations(importSourceDir, Array.from(selectedImports));
      if (result.importedCount > 0) {
        const updatedConversations = await window.electronAPI.listConversations();
        setConversations(updatedConversations);
        setExpandedSources((prev) => new Set([...prev, importSourceDir]));
      }
      setShowImportDialog(false);
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
      next.has(source) ? next.delete(source) : next.add(source);
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
    // Don't switch to the same conversation
    if (id === currentConversationId) return;

    setAppMode('debug');
    setCurrentConversationId(id);
    // Tasks are now per-conversation, automatically switches with currentConversationId
  };

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
      case 'streaming': return 'bg-apple-green animate-pulse';
      case 'active': return 'bg-apple-green';
      case 'idle': return 'bg-apple-orange';
      case 'inactive': return 'bg-apple-gray-400';
    }
  };

  const renderConversationItem = (conversation: Conversation, indent = false) => (
    <div
      key={conversation.id}
      onClick={() => handleSelectConversation(conversation.id)}
      className={`
        apple-list-item group
        ${indent ? 'ml-3' : ''}
        ${currentConversationId === conversation.id ? 'active' : ''}
      `}
    >
      <MessageSquare className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 truncate text-apple-sm">{conversation.title}</span>
      <button
        onClick={(e) => handleDeleteConversation(conversation.id, e)}
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-apple-gray-300/50 dark:hover:bg-white/10 rounded transition-opacity"
      >
        <Trash2 className="w-3.5 h-3.5 text-apple-gray-400" />
      </button>
    </div>
  );

  return (
    <div className={`apple-sidebar flex flex-col transition-all duration-apple ease-apple ${sidebarExpanded ? 'w-64' : 'w-14'}`}>
      {/* Title bar drag area */}
      <div className="h-11 titlebar-drag flex-shrink-0" />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className={`flex items-center px-3 py-2 ${sidebarExpanded ? 'justify-between' : 'justify-center'}`}>
          {sidebarExpanded ? (
            <>
              <span className="text-apple-sm font-semibold text-apple-gray-900 dark:text-apple-gray-100">
                A2A Debug
              </span>
              <button
                onClick={() => setSidebarExpanded(false)}
                className="btn-apple-icon titlebar-no-drag"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setSidebarExpanded(true)}
              className="btn-apple-icon titlebar-no-drag"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Actions */}
        <div className={`px-2 space-y-1 ${sidebarExpanded ? '' : 'flex flex-col items-center'}`}>
          <button
            onClick={handleNewConversation}
            className={`btn-apple ${sidebarExpanded ? 'w-full' : 'w-10 h-10 p-0'}`}
          >
            <Plus className="w-4 h-4" />
            {sidebarExpanded && <span className="ml-2">New Chat</span>}
          </button>

          {sidebarExpanded && (
            <button onClick={handleOpenImportDialog} className="btn-apple-secondary w-full justify-start">
              <Download className="w-4 h-4" />
              <span className="ml-2">Import</span>
            </button>
          )}
        </div>

        {/* Conversation list */}
        {sidebarExpanded ? (
          <div className="flex-1 overflow-y-auto px-2 mt-4">
            {localConversations.length > 0 && (
              <div className="mb-4">
                <div className="apple-section-header">Local</div>
                {localConversations.map((conv) => renderConversationItem(conv))}
              </div>
            )}

            {importedGroups.map(({ source, name, conversations: groupConvs }) => (
              <div key={source} className="mb-4">
                <div
                  onClick={() => handleToggleSourceExpand(source)}
                  className="apple-list-item group"
                >
                  {expandedSources.has(source) ? (
                    <FolderOpen className="w-4 h-4 text-apple-orange" />
                  ) : (
                    <Folder className="w-4 h-4 text-apple-orange" />
                  )}
                  <span className="flex-1 truncate text-apple-xs font-medium">{name}</span>
                  <span className="apple-badge">{groupConvs.length}</span>
                  <button
                    onClick={(e) => handleUninstallSource(source, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-apple-gray-300/50 rounded"
                  >
                    <FolderMinus className="w-3.5 h-3.5 text-apple-gray-400" />
                  </button>
                </div>
                {expandedSources.has(source) && groupConvs.map((conv) => renderConversationItem(conv, true))}
              </div>
            ))}

            {conversations.length === 0 && (
              <div className="text-center py-8">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 text-apple-gray-300" />
                <p className="text-apple-sm text-apple-gray-500">No conversations</p>
              </div>
            )}

            {/* Divider */}
            <div className="apple-divider my-4" />

            {/* Live Viewer */}
            <div className="mb-4">
              <div className="flex items-center justify-between px-3 mb-2">
                <span className="apple-section-header p-0">Live Viewer</span>
                <button
                  onClick={liveWatching ? handleStopWatch : handleStartWatch}
                  className="btn-apple-icon w-6 h-6"
                >
                  {liveWatching ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              {liveWatching && liveWatchDir && (
                <>
                  <div className="px-3 text-apple-xs text-apple-gray-500 truncate mb-2">
                    {liveWatchDir.split(/[/\\]/).pop()}
                  </div>
                  {liveSessions.length === 0 ? (
                    <div className="px-3 py-4 text-apple-xs text-apple-gray-400 text-center">
                      No active sessions
                    </div>
                  ) : (
                    liveSessions.map((session) => (
                      <div
                        key={session.contextId}
                        onClick={() => handleSelectLiveSession(session.contextId)}
                        className={`apple-list-item ${appMode === 'live' && liveSelectedContextId === session.contextId ? 'active' : ''}`}
                      >
                        <div className="relative">
                          <Radio className="w-4 h-4" />
                          <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${getStatusColor(session.status)}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-apple-sm truncate">{session.title}</div>
                          {session.lastMessage && (
                            <div className="text-apple-xs text-apple-gray-500 truncate">{session.lastMessage}</div>
                          )}
                        </div>
                        <span className="apple-badge">{session.messageCount}</span>
                      </div>
                    ))
                  )}
                </>
              )}

              {!liveWatching && (
                <button
                  onClick={handleStartWatch}
                  className="w-full px-3 py-2 text-apple-xs text-apple-gray-500 hover:text-apple-blue transition-colors"
                >
                  Click to watch a directory...
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto flex flex-col items-center gap-1 mt-4 px-1">
            {conversations.slice(0, 10).map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => handleSelectConversation(conversation.id)}
                className={`btn-apple-icon ${currentConversationId === conversation.id ? 'bg-apple-blue/10 text-apple-blue' : ''}`}
                title={conversation.title}
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            ))}
          </div>
        )}

        {/* Footer: Theme toggle */}
        <div className={`p-3 ${sidebarExpanded ? '' : 'flex justify-center'}`}>
          <button
            onClick={onToggleTheme}
            className={`btn-apple-icon ${sidebarExpanded ? 'w-full justify-start px-3 gap-2' : ''}`}
            title={isDark ? 'Light mode' : 'Dark mode'}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {sidebarExpanded && <span className="text-apple-sm">{isDark ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>
        </div>
      </div>

      {/* Import Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 animate-fade-in">
          <div className="apple-card w-[440px] max-h-[560px] flex flex-col animate-scale-in">
            <div className="px-5 py-4 border-b border-apple-gray-300/60 dark:border-[#38383A]">
              <h2 className="text-apple-lg font-semibold text-apple-gray-900 dark:text-apple-gray-100">
                Import Recordings
              </h2>
              <p className="text-apple-sm text-apple-gray-500 mt-1 truncate">{importSourceDir}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {backendConversations.length === 0 ? (
                <div className="text-center text-apple-gray-500 py-8">
                  <p className="text-apple-sm">No recordings found.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {backendConversations.map((conv) => (
                    <label
                      key={conv.id}
                      className={`
                        flex items-center gap-3 p-3 rounded-apple border cursor-pointer transition-all
                        ${conv.imported
                          ? 'bg-apple-gray-100 dark:bg-[#2C2C2E] border-apple-gray-200 dark:border-[#38383A] opacity-50'
                          : selectedImports.has(conv.id)
                            ? 'bg-apple-blue/5 border-apple-blue'
                            : 'bg-white dark:bg-[#2C2C2E] border-apple-gray-200 dark:border-[#38383A] hover:border-apple-gray-300'
                        }
                      `}
                    >
                      <input
                        type="checkbox"
                        checked={selectedImports.has(conv.id)}
                        disabled={conv.imported}
                        onChange={() => handleToggleImportSelection(conv.id)}
                        className="w-4 h-4 rounded border-apple-gray-300 text-apple-blue focus:ring-apple-blue/30"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-apple-sm font-medium text-apple-gray-900 dark:text-apple-gray-100 truncate">
                          {conv.title}
                        </div>
                        <div className="text-apple-xs text-apple-gray-500 mt-0.5">
                          {new Date(conv.createdAt).toLocaleString()}
                          {conv.imported && <span className="ml-2 text-apple-green">(Imported)</span>}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-apple-gray-300/60 dark:border-[#38383A] flex justify-end gap-2">
              <button onClick={() => setShowImportDialog(false)} className="btn-apple-secondary">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={selectedImports.size === 0 || importing}
                className="btn-apple disabled:opacity-50"
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
