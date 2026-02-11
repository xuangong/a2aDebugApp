/**
 * 用户消息组件
 */

import { useCallback } from 'react';
import type { UserMessage as UserMessageType } from '../../../shared/types';

interface UserMessageProps {
  message: UserMessageType;
  isSelected?: boolean;
  onClick?: () => void;
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
          {message.content}
        </div>
        <div className="text-xs text-primary-200 mt-1 text-right">
          {new Date(message.createdAt).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
