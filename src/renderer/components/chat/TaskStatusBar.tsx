/**
 * Task 状态栏组件
 * 显示当前 context 中的 task 列表和状态
 */

import { useAtomValue } from 'jotai';
import { Activity, CheckCircle, XCircle, Clock, MessageSquare, Loader2 } from 'lucide-react';
import { tasksAtom, currentTaskAtom, type TaskInfo } from '../../atoms/chat-atoms';
import type { TaskState } from '../../../shared/types';

/** Task 状态对应的图标和颜色 */
const taskStateConfig: Record<TaskState, { icon: typeof Activity; color: string; label: string }> = {
  submitted: { icon: Clock, color: 'text-gray-400', label: 'Submitted' },
  working: { icon: Loader2, color: 'text-blue-500', label: 'Working' },
  'input-required': { icon: MessageSquare, color: 'text-yellow-500', label: 'Input Required' },
  completed: { icon: CheckCircle, color: 'text-green-500', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-500', label: 'Failed' },
  canceled: { icon: XCircle, color: 'text-gray-500', label: 'Canceled' },
  'auth-required': { icon: Clock, color: 'text-orange-500', label: 'Auth Required' },
};

export function TaskStatusBar() {
  const tasks = useAtomValue(tasksAtom);
  const currentTask = useAtomValue(currentTaskAtom);

  if (tasks.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
      {/* Task 列表（显示为小圆点） */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">Tasks:</span>
        {tasks.map((task, index) => {
          const config = taskStateConfig[task.state];
          const Icon = config.icon;
          const isActive = task.taskId === currentTask?.taskId;

          return (
            <div
              key={task.taskId}
              className={`relative group ${isActive ? 'ring-2 ring-primary-500 rounded-full' : ''}`}
              title={`Task ${index + 1}: ${config.label}\nID: ${task.taskId.slice(0, 8)}...`}
            >
              <Icon
                className={`w-4 h-4 ${config.color} ${task.state === 'working' ? 'animate-spin' : ''}`}
              />
            </div>
          );
        })}
      </div>

      {/* 当前 Task 状态 */}
      {currentTask && (
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Current:
          </span>
          <TaskStateBadge state={currentTask.state} />
          <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
            {currentTask.taskId.slice(0, 8)}
          </span>
        </div>
      )}
    </div>
  );
}

/** Task 状态徽章 */
function TaskStateBadge({ state }: { state: TaskState }) {
  const config = taskStateConfig[state];
  const Icon = config.icon;

  const bgColorMap: Record<TaskState, string> = {
    submitted: 'bg-gray-100 dark:bg-gray-700',
    working: 'bg-blue-100 dark:bg-blue-900/30',
    'input-required': 'bg-yellow-100 dark:bg-yellow-900/30',
    completed: 'bg-green-100 dark:bg-green-900/30',
    failed: 'bg-red-100 dark:bg-red-900/30',
    canceled: 'bg-gray-100 dark:bg-gray-700',
    'auth-required': 'bg-orange-100 dark:bg-orange-900/30',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${bgColorMap[state]} ${config.color}`}
    >
      <Icon className={`w-3 h-3 ${state === 'working' ? 'animate-spin' : ''}`} />
      {config.label}
    </span>
  );
}
