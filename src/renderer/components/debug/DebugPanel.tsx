/**
 * 调试面板组件
 * 显示 JSON-RPC 交互过程
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  ChevronRight,
  ChevronDown,
  ArrowUpCircle,
  ArrowDownCircle,
  Radio,
  Copy,
  Check,
  Trash2,
  PanelRightClose,
  PanelRightOpen,
  Wrench,
  MessageSquare,
  GripVertical,
  FileText,
  List,
  Package,
} from 'lucide-react';
import type { JsonRpcLogEntry, A2AResult, AssistantMessage, Message } from '../../../shared/types';
import { debugLogsAtom, debugPanelExpandedAtom, selectedMessageIdAtom, currentConversationAtom, sidePanelTabAtom, selectedToolCallAtom, messagesAtom, streamingFileArtifactsAtom } from '../../atoms/chat-atoms';
import { ToolDetailPanel } from './ToolDetailPanel';
import { ArtifactsPanel } from '../chat/ArtifactsPanel';
import { JsonView, darkStyles, defaultStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';

// Custom expand function: expand all nodes by default
const expandAllNodes = () => true;

const MIN_WIDTH = 280;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 384; // w-96 = 24rem = 384px

interface DebugPanelProps {
  /** Optional external messages (for Live mode) - if not provided, uses atom */
  messages?: Message[];
}

export function DebugPanel({ messages: externalMessages }: DebugPanelProps) {
  const [debugLogs, setDebugLogs] = useAtom(debugLogsAtom);
  const [expanded, setExpanded] = useAtom(debugPanelExpandedAtom);
  const [activeTab, setActiveTab] = useAtom(sidePanelTabAtom);
  const selectedMessageId = useAtomValue(selectedMessageIdAtom);
  const selectedToolCall = useAtomValue(selectedToolCallAtom);
  const setSelectedToolCall = useSetAtom(selectedToolCallAtom);
  const currentConversation = useAtomValue(currentConversationAtom);
  const atomMessages = useAtomValue(messagesAtom);
  const atomStreamingFileArtifacts = useAtomValue(streamingFileArtifactsAtom);

  // Use external messages if provided (Live mode), otherwise use atom (Debug mode)
  const messages = externalMessages ?? atomMessages;
  // In Live mode (externalMessages provided), don't use streaming artifacts (Live is read-only)
  const streamingFileArtifacts = externalMessages ? [] : atomStreamingFileArtifacts;
  const listRef = useRef<HTMLDivElement>(null);
  const highlightedRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Count artifacts from backend-provided file_artifacts data
  const artifactsCount = useMemo(() => {
    let count = 0;
    // Use file_path for deduplication (more unique than file_name)
    const seenFilePaths = new Set<string>();

    // From completed messages - use fileArtifacts stored in message (backend-provided)
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      const assistantMsg = msg as AssistantMessage;
      if (Array.isArray(assistantMsg.fileArtifacts)) {
        for (const fa of assistantMsg.fileArtifacts) {
          if (!seenFilePaths.has(fa.file_path)) {
            count++;
            seenFilePaths.add(fa.file_path);
          }
        }
      }
    }

    // Add streaming artifacts (dedupe by file_path)
    for (const fa of streamingFileArtifacts) {
      if (!seenFilePaths.has(fa.file_path)) {
        count++;
        seenFilePaths.add(fa.file_path);
      }
    }

    return count;
  }, [messages, streamingFileArtifacts]);

  // 宽度调整状态
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // 筛选状态（按类型）
  const [filterType, setFilterType] = useState<'all' | 'request' | 'response' | 'sse' | 'tool'>('all');

  const handleClear = useCallback(() => {
    setDebugLogs([]);
    // 同时清除持久化的日志
    if (currentConversation) {
      window.electronAPI.clearDebugLogs(currentConversation.id).catch(console.error);
    }
  }, [setDebugLogs, currentConversation]);

  // 过滤日志（按类型）
  const filteredLogs = useMemo(() => {
    if (filterType === 'all') return debugLogs;
    return debugLogs.filter((entry) => {
      if (filterType === 'request') return entry.direction === 'request';
      if (filterType === 'response') return entry.direction === 'response';
      if (filterType === 'sse') return entry.direction === 'sse-event';
      if (filterType === 'tool') {
        // 检测是否包含工具结果
        if (entry.direction !== 'sse-event' || !entry.sseEvent?.data) return false;
        const data = entry.sseEvent.data as A2AResult;
        if (data.kind === 'status-update' && data.status?.message?.parts) {
          return data.status.message.parts.some(
            (p) => p.kind === 'data' && 'data' in p && (p.data as Record<string, unknown>)?.type === 'tool_result'
          );
        }
        if (data.kind === 'message' && data.parts) {
          return data.parts.some(
            (p) => p.kind === 'data' && 'data' in p && (p.data as Record<string, unknown>)?.type === 'tool_result'
          );
        }
        return false;
      }
      return true;
    });
  }, [debugLogs, filterType]);

  // 拖拽调整宽度
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = {
      startX: e.clientX,
      startWidth: panelWidth,
    };
  }, [panelWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      // 向左拖动增加宽度，向右拖动减少宽度
      const delta = resizeRef.current.startX - e.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, resizeRef.current.startWidth + delta));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // 当选中消息变化时，滚动到第一条高亮日志
  useEffect(() => {
    if (!selectedMessageId || !listRef.current) return;

    // 找到第一条匹配的日志并滚动到它（同时检查 messageId 和 responseMessageId）
    const firstMatchingLog = debugLogs.find(
      log => log.messageId === selectedMessageId || log.responseMessageId === selectedMessageId
    );
    if (firstMatchingLog) {
      const element = highlightedRefs.current.get(firstMatchingLog.id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectedMessageId, debugLogs]);

  if (!expanded) {
    return (
      <div className="w-10 border-l border-apple-gray-200 dark:border-[#38383A] bg-apple-gray-50 dark:bg-[#1C1C1E] flex flex-col">
        {/* 标题栏拖拽区域（与主窗口对齐） */}
        <div className="h-11 titlebar-drag flex-shrink-0 bg-white dark:bg-[#1C1C1E]" />
        <div className="flex-1 flex flex-col items-center py-2">
          <button
            onClick={() => setExpanded(true)}
            className="btn-apple-icon"
            title="Show Debug Panel"
          >
            <PanelRightOpen className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="border-l border-apple-gray-200 dark:border-[#38383A] bg-apple-gray-50 dark:bg-[#1C1C1E] flex flex-col relative"
      style={{ width: panelWidth }}
    >
      {/* 左侧拖拽手柄 */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-apple-blue transition-colors z-10 ${
          isResizing ? 'bg-apple-blue' : 'bg-transparent hover:bg-apple-blue/50'
        }`}
        onMouseDown={handleMouseDown}
        title="Drag to resize"
      >
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 p-0.5 bg-apple-gray-300 dark:bg-[#48484A] rounded opacity-0 hover:opacity-100 transition-opacity">
          <GripVertical className="w-3 h-3 text-apple-gray-500" />
        </div>
      </div>

      {/* 标题栏拖拽区域（与主窗口对齐） */}
      <div className="h-11 titlebar-drag flex-shrink-0 bg-white dark:bg-[#1C1C1E]" />

      {/* 头部 - 与 ChatHeader 内容区域对齐 */}
      <div className="flex flex-col border-b border-apple-gray-200 dark:border-[#38383A]">
        {/* Tabs - Apple segmented control style */}
        <div className="flex items-center px-3 pt-2">
          <div className="apple-segmented">
            <button
              onClick={() => setActiveTab('logs')}
              className={`apple-segment flex items-center gap-1.5 ${activeTab === 'logs' ? 'active' : ''}`}
            >
              <List className="w-3.5 h-3.5" />
              Logs
            </button>
            <button
              onClick={() => setActiveTab('artifacts')}
              className={`apple-segment flex items-center gap-1.5 ${activeTab === 'artifacts' ? 'active' : ''}`}
            >
              <Package className="w-3.5 h-3.5" />
              Artifacts
              {artifactsCount > 0 && (
                <span className="text-[10px] bg-apple-blue text-white px-1 rounded-full min-w-[16px] text-center">
                  {artifactsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('tool')}
              className={`apple-segment flex items-center gap-1.5 ${activeTab === 'tool' ? 'active' : ''}`}
            >
              <Wrench className="w-3.5 h-3.5" />
              Tool
              {selectedToolCall && (
                <span className="w-1.5 h-1.5 bg-apple-blue rounded-full" />
              )}
            </button>
          </div>
          <div className="flex-1" />
          <button
            onClick={() => setExpanded(false)}
            className="btn-apple-icon w-7 h-7"
            title="Hide Panel"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Logs filter bar - only show when logs tab is active */}
        {activeTab === 'logs' && (
          <div className="flex items-center justify-between px-3 py-2 min-h-[36px]">
            <div className="flex items-center gap-2">
              <span className="text-apple-xs text-apple-gray-500">
                {filterType !== 'all' ? `${filteredLogs.length}/${debugLogs.length}` : debugLogs.length} entries
              </span>
            </div>
            <div className="flex items-center gap-1">
              {/* 类型筛选下拉框 */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as typeof filterType)}
                className="text-apple-xs px-2 py-1 border border-apple-gray-300 dark:border-[#48484A] rounded-apple-sm bg-white dark:bg-[#2C2C2E] text-apple-gray-700 dark:text-apple-gray-300 focus:outline-none focus:ring-1 focus:ring-apple-blue"
              >
                <option value="all">All</option>
                <option value="request">Request</option>
                <option value="response">Response</option>
                <option value="sse">SSE</option>
                <option value="tool">Tool</option>
              </select>
              <button
                onClick={handleClear}
                className="btn-apple-icon w-7 h-7"
                title="Clear logs"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Tool detail header - only show when tool tab is active */}
        {activeTab === 'tool' && selectedToolCall && (
          <div className="flex items-center justify-between px-3 py-2 min-h-[36px]">
            <span className="text-apple-xs text-apple-gray-500">
              {selectedToolCall.toolName}
            </span>
            <button
              onClick={() => setSelectedToolCall(null)}
              className="text-apple-xs text-apple-blue hover:underline"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {activeTab === 'logs' && (
        /* 日志列表 */
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-apple-sm text-apple-gray-400 text-center px-4">
              {filterType !== 'all' ? 'No matching logs found.' : 'No logs yet. Send a message to see JSON-RPC interactions.'}
            </div>
          ) : (
            <div className="divide-y divide-apple-gray-200 dark:divide-[#38383A]">
              {filteredLogs.map((entry) => (
                <LogEntry
                  key={entry.id}
                  entry={entry}
                  isHighlighted={
                    selectedMessageId !== null &&
                    (entry.messageId === selectedMessageId || entry.responseMessageId === selectedMessageId)
                  }
                  onRefReady={(el) => {
                    if (el) {
                      highlightedRefs.current.set(entry.id, el);
                    } else {
                      highlightedRefs.current.delete(entry.id);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {activeTab === 'artifacts' && (
        /* Artifacts Panel */
        <div className="flex-1 overflow-y-auto">
          <ArtifactsPanel messages={externalMessages} />
        </div>
      )}
      {activeTab === 'tool' && (
        /* Tool Detail Panel */
        <ToolDetailPanel />
      )}
    </div>
  );
}

interface LogEntryProps {
  entry: JsonRpcLogEntry;
  isHighlighted: boolean;
  onRefReady: (el: HTMLDivElement | null) => void;
}

function LogEntry({ entry, isHighlighted, onRefReady }: LogEntryProps) {
  const [isExpanded, setIsExpanded] = useState(false); // Trunk collapsed by default
  const [copied, setCopied] = useState(false);

  // 检测 SSE 事件是否包含工具结果
  const isToolResult = useMemo(() => {
    if (entry.direction !== 'sse-event' || !entry.sseEvent?.data) return false;
    const data = entry.sseEvent.data as A2AResult;
    // 检查 status-update 中的 message.parts
    if (data.kind === 'status-update' && data.status?.message?.parts) {
      return data.status.message.parts.some(
        (p) => p.kind === 'data' && 'data' in p && (p.data as Record<string, unknown>)?.type === 'tool_result'
      );
    }
    // 检查 message 中的 parts
    if (data.kind === 'message' && data.parts) {
      return data.parts.some(
        (p) => p.kind === 'data' && 'data' in p && (p.data as Record<string, unknown>)?.type === 'tool_result'
      );
    }
    return false;
  }, [entry]);

  // 获取工具名称（如果是工具结果）
  const toolName = useMemo(() => {
    if (!isToolResult || !entry.sseEvent?.data) return null;
    const data = entry.sseEvent.data as A2AResult;
    const parts = data.kind === 'status-update'
      ? data.status?.message?.parts
      : data.kind === 'message' ? data.parts : [];
    if (!parts) return null;
    for (const p of parts) {
      if (p.kind === 'data' && 'data' in p) {
        const toolData = p.data as Record<string, unknown>;
        if (toolData?.type === 'tool_result') {
          // 尝试多种可能的字段名
          const name = toolData.tool_name || toolData.toolName || toolData.name;
          return (name as string) || 'tool';
        }
      }
    }
    return null;
  }, [isToolResult, entry]);

  const { icon: Icon, color, label, preview } = useMemo(() => {
    switch (entry.direction) {
      case 'request':
        return {
          icon: ArrowUpCircle,
          color: 'text-blue-500',
          label: 'Request',
          preview: entry.request?.method || 'Unknown',
        };
      case 'response':
        return {
          icon: ArrowDownCircle,
          color: 'text-green-500',
          label: 'Response',
          preview: `HTTP ${entry.response?.status || '?'}`,
        };
      case 'sse-event':
        if (isToolResult) {
          return {
            icon: Wrench,
            color: 'text-orange-500',
            label: 'Tool',
            preview: toolName || 'result',
          };
        }
        if (entry.sseEvent?.eventType === 'error') {
          return {
            icon: Radio,
            color: 'text-red-500',
            label: 'SSE',
            preview: 'error',
          };
        }
        if (entry.sseEvent?.eventType === 'complete') {
          return {
            icon: Radio,
            color: 'text-green-500',
            label: 'SSE',
            preview: 'complete',
          };
        }
        return {
          icon: MessageSquare,
          color: 'text-purple-500',
          label: 'SSE',
          preview: 'chunk',
        };
      default:
        return {
          icon: ArrowDownCircle,
          color: 'text-apple-gray-500',
          label: 'Unknown',
          preview: '',
        };
    }
  }, [entry, isToolResult, toolName]);

  const jsonContent = useMemo((): object => {
    if (entry.direction === 'request' && entry.request) {
      return entry.request.body;
    }
    if (entry.direction === 'response' && entry.response) {
      return entry.response.data;
    }
    if (entry.direction === 'sse-event' && entry.sseEvent) {
      return entry.sseEvent.data ?? entry.sseEvent.error ?? {};
    }
    return {};
  }, [entry]);

  const jsonString = useMemo(() => JSON.stringify(jsonContent, null, 2), [jsonContent]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const timestamp = new Date(entry.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });

  return (
    <div
      ref={onRefReady}
      className={`${isHighlighted ? 'bg-apple-blue/5 ring-2 ring-apple-blue ring-inset' : 'bg-white dark:bg-[#2C2C2E]'}`}
    >
      {/* 头部 */}
      <div
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${isHighlighted ? 'hover:bg-apple-blue/10' : 'hover:bg-apple-gray-100 dark:hover:bg-[#38383A]'}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <button className="p-0.5">
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 text-apple-gray-400" />
          ) : (
            <ChevronRight className="w-3 h-3 text-apple-gray-400" />
          )}
        </button>
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-apple-xs font-medium text-apple-gray-600 dark:text-apple-gray-400 w-16">
          {label}
        </span>
        <span className="text-apple-xs text-apple-gray-500 truncate flex-1">
          {preview}
        </span>
        <span className="text-[10px] text-apple-gray-400 font-mono">
          {timestamp}
        </span>
      </div>

      {/* 展开的内容 */}
      {isExpanded && (
        <div className="px-3 pb-3">
          <div className="relative bg-apple-gray-100 dark:bg-[#1C1C1E] rounded-apple p-2 overflow-auto max-h-[500px] text-[11px]">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              className="absolute top-2 right-2 p-1 bg-apple-gray-200 dark:bg-[#38383A] hover:bg-apple-gray-300 dark:hover:bg-[#48484A] rounded-apple-sm transition-colors z-10"
              title="Copy JSON"
            >
              {copied ? (
                <Check className="w-3 h-3 text-apple-green" />
              ) : (
                <Copy className="w-3 h-3 text-apple-gray-500" />
              )}
            </button>
            <JsonView
              data={jsonContent}
              shouldExpandNode={expandAllNodes}
              style={document.documentElement.classList.contains('dark') ? darkStyles : defaultStyles}
            />
          </div>
        </div>
      )}
    </div>
  );
}
