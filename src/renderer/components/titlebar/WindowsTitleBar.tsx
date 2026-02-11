/**
 * Windows 自定义标题栏组件
 * 仅在 Windows/Linux 平台上显示
 */

import { useState, useEffect, useCallback } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';

interface WindowsTitleBarProps {
  title?: string;
}

export function WindowsTitleBar({ title = 'A2A Debug App' }: WindowsTitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  // 初始化时获取窗口最大化状态
  useEffect(() => {
    const checkMaximized = async () => {
      const maximized = await window.electronAPI.windowIsMaximized();
      setIsMaximized(maximized);
    };
    checkMaximized();
  }, []);

  const handleMinimize = useCallback(async () => {
    await window.electronAPI.windowMinimize();
  }, []);

  const handleMaximize = useCallback(async () => {
    await window.electronAPI.windowMaximize();
    // 切换后更新状态
    const maximized = await window.electronAPI.windowIsMaximized();
    setIsMaximized(maximized);
  }, []);

  const handleClose = useCallback(async () => {
    await window.electronAPI.windowClose();
  }, []);

  return (
    <div className="windows-titlebar h-8 flex items-center justify-between bg-gray-100 dark:bg-gray-900 select-none"
         style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* 左侧标题 */}
      <div className="flex items-center px-3 h-full">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
          {title}
        </span>
      </div>

      {/* 右侧窗口控制按钮 */}
      <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* 最小化 */}
        <button
          onClick={handleMinimize}
          className="w-12 h-full flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="Minimize"
        >
          <Minus className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </button>

        {/* 最大化/还原 */}
        <button
          onClick={handleMaximize}
          className="w-12 h-full flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <Copy className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
          ) : (
            <Square className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
          )}
        </button>

        {/* 关闭 */}
        <button
          onClick={handleClose}
          className="w-12 h-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors group"
          title="Close"
        >
          <X className="w-4 h-4 text-gray-600 dark:text-gray-400 group-hover:text-white" />
        </button>
      </div>
    </div>
  );
}
