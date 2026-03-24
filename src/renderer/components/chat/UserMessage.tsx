/**
 * 用户消息组件
 */

import { useCallback, useMemo } from 'react';
import { CheckCircle } from 'lucide-react';
import type { UserMessage as UserMessageType } from '../../../shared/types';

interface UserMessageProps {
  message: UserMessageType;
  isSelected?: boolean;
  onClick?: () => void;
}

/**
 * 解析 tool_result 消息
 */
function parseToolResult(content: string): { toolName: string; result: Record<string, unknown> } | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && 'tool_result' in parsed) {
      const toolResult = parsed.tool_result;
      return {
        toolName: toolResult.tool_name || 'unknown',
        result: toolResult.result || {},
      };
    }
  } catch {
    // Not JSON, return null
  }
  return null;
}

/**
 * 渲染 tool_result 内容
 */
function ToolResultContent({ toolName, result }: { toolName: string; result: Record<string, unknown> }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-primary-100">
        <CheckCircle className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wide">
          {toolName.replace(/_/g, ' ')} Response
        </span>
      </div>
      <div className="bg-primary-600/50 rounded-lg p-2 space-y-1">
        {Object.entries(result).map(([key, value]) => (
          <div key={key} className="flex gap-2 text-sm">
            <span className="text-primary-200 font-medium min-w-[80px]">
              {key.replace(/_/g, ' ')}:
            </span>
            <span className="text-white">
              {typeof value === 'string' ? value : JSON.stringify(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function UserMessage({ message, isSelected, onClick }: UserMessageProps) {
  // 处理点击事件，只在没有选中文本时触发
  const handleClick = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      // 用户在选择文本，不触发点击
      return;
    }
    onClick?.();
  }, [onClick]);

  // 解析 tool_result
  const toolResult = useMemo(() => parseToolResult(message.content), [message.content]);

  return (
    <div className="flex justify-end">
      <div
        className={`max-w-[85%] bg-primary-500 text-white rounded-2xl px-4 py-3 transition-all select-text ${
          isSelected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-white dark:ring-offset-gray-900' : 'hover:opacity-90'
        }`}
        onClick={handleClick}
        title="Click to highlight related logs"
      >
        <div className="text-sm whitespace-pre-wrap break-words">
          {toolResult ? (
            <ToolResultContent toolName={toolResult.toolName} result={toolResult.result as Record<string, unknown>} />
          ) : (
            message.content
          )}
        </div>
        <div className="text-xs text-primary-200 mt-1 text-right">
          {new Date(message.createdAt).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
