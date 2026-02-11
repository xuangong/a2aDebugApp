/**
 * 调试面板组件
 * 显示 JSON-RPC 交互过程
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAtom, useAtomValue } from 'jotai';
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
} from 'lucide-react';
import type { JsonRpcLogEntry, A2AResult } from '../../../shared/types';
import { debugLogsAtom, debugPanelExpandedAtom, selectedMessageIdAtom, currentConversationAtom } from '../../atoms/chat-atoms';

const MIN_WIDTH = 280;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 384; // w-96 = 24rem = 384px

export function DebugPanel() {
  const [debugLogs, setDebugLogs] = useAtom(debugLogsAtom);
  const [expanded, setExpanded] = useAtom(debugPanelExpandedAtom);
  const selectedMessageId = useAtomValue(selectedMessageIdAtom);
  const currentConversation = useAtomValue(currentConversationAtom);
  const listRef = useRef<HTMLDivElement>(null);
  const highlightedRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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
      <div className="w-10 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col">
        {/* 标题栏拖拽区域（与主窗口对齐） */}
        <div className="h-11 titlebar-drag flex-shrink-0 bg-white dark:bg-gray-900" />
        <div className="flex-1 flex flex-col items-center py-2">
          <button
            onClick={() => setExpanded(true)}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Show Debug Panel"
          >
            <PanelRightOpen className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col relative"
      style={{ width: panelWidth }}
    >
      {/* 左侧拖拽手柄 */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 transition-colors z-10 ${
          isResizing ? 'bg-blue-500' : 'bg-transparent hover:bg-blue-300'
        }`}
        onMouseDown={handleMouseDown}
        title="Drag to resize"
      >
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 p-0.5 bg-gray-300 dark:bg-gray-600 rounded opacity-0 hover:opacity-100 transition-opacity">
          <GripVertical className="w-3 h-3 text-gray-500 dark:text-gray-400" />
        </div>
      </div>

      {/* 标题栏拖拽区域（与主窗口对齐） */}
      <div className="h-11 titlebar-drag flex-shrink-0 bg-white dark:bg-gray-900" />

      {/* 头部 - 与 ChatHeader 内容区域对齐 */}
      <div className="flex items-center justify-between px-3 py-2 min-h-[44px] border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            JSON-RPC Log
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            ({filterType !== 'all' ? `${filteredLogs.length}/${debugLogs.length}` : debugLogs.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* 类型筛选下拉框 */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All</option>
            <option value="request">Request</option>
            <option value="response">Response</option>
            <option value="sse">SSE</option>
            <option value="tool">Tool</option>
          </select>
          <button
            onClick={handleClear}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5 text-gray-500" />
          </button>
          <button
            onClick={() => setExpanded(false)}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors"
            title="Hide Debug Panel"
          >
            <PanelRightClose className="w-3.5 h-3.5 text-gray-500" />
          </button>
        </div>
      </div>

      {/* 日志列表 */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-500 text-center px-4">
            {filterType !== 'all' ? 'No matching logs found.' : 'No logs yet. Send a message to see JSON-RPC interactions.'}
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
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
    </div>
  );
}

interface LogEntryProps {
  entry: JsonRpcLogEntry;
  isHighlighted: boolean;
  onRefReady: (el: HTMLDivElement | null) => void;
}

function LogEntry({ entry, isHighlighted, onRefReady }: LogEntryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
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
          color: 'text-gray-500',
          label: 'Unknown',
          preview: '',
        };
    }
  }, [entry, isToolResult, toolName]);

  const jsonContent = useMemo(() => {
    if (entry.direction === 'request' && entry.request) {
      return JSON.stringify(entry.request.body, null, 2);
    }
    if (entry.direction === 'response' && entry.response) {
      return JSON.stringify(entry.response.data, null, 2);
    }
    if (entry.direction === 'sse-event' && entry.sseEvent) {
      return JSON.stringify(entry.sseEvent.data || entry.sseEvent.error, null, 2);
    }
    return '{}';
  }, [entry]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonContent);
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
      className={`${isHighlighted ? 'bg-blue-50 dark:bg-blue-900/30 ring-2 ring-blue-400 ring-inset' : 'bg-white dark:bg-gray-800/50'}`}
    >
      {/* 头部 */}
      <div
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${isHighlighted ? 'hover:bg-blue-100 dark:hover:bg-blue-900/50' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <button className="p-0.5">
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 text-gray-400" />
          ) : (
            <ChevronRight className="w-3 h-3 text-gray-400" />
          )}
        </button>
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-16">
          {label}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-500 truncate flex-1">
          {preview}
        </span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
          {timestamp}
        </span>
      </div>

      {/* 展开的内容 */}
      {isExpanded && (
        <div className="px-3 pb-3">
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              className="absolute top-2 right-2 p-1 bg-gray-700/80 hover:bg-gray-600 rounded transition-colors"
              title="Copy JSON"
            >
              {copied ? (
                <Check className="w-3 h-3 text-green-400" />
              ) : (
                <Copy className="w-3 h-3 text-gray-300" />
              )}
            </button>
            <pre className="text-[10px] bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto max-h-64 font-mono whitespace-pre-wrap break-all">
              <code>{jsonContent}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
