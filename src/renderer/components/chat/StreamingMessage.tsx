/**
 * 流式消息组件
 * Apple Design System - 用于实时渲染正在接收的 Agent 响应
 * Native tool calls only (XML tool calls deprecated)
 */

import { useMemo } from 'react';
import { useSetAtom } from 'jotai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, ExternalLink } from 'lucide-react';
import type { ViewMode, SelectedToolCall } from '../../atoms/chat-atoms';
import { selectedToolCallAtom, sidePanelTabAtom } from '../../atoms/chat-atoms';
import { NativeToolCallCard, NativeTaskClarifyCard, NativeCompleteCard, NativeAskCard } from '../ToolCallCard';
import type { NativeToolCall, ToolResultData } from '../../../shared/types';

// Normalize tool name to match against known client tools
// Handles: task_clarify, task-clarify, Task_clarify, etc.
function normalizeToolName(name: string | null | undefined): string {
  if (!name) return '';
  return name.toLowerCase().replace(/_/g, '-');
}

interface StreamingMessageProps {
  content: string;
  viewMode: ViewMode;
  /** Streaming native tool calls (accumulated from artifact-update events) */
  streamingToolCalls?: NativeToolCall[];
  /** Streaming tool results (received from artifact-update events) */
  streamingToolResults?: Map<string, ToolResultData>;
  /** Callback for submitting task-clarify responses */
  onSubmitTaskClarify?: (responses: Record<string, string | string[]>, toolCallId?: string) => Promise<void>;
}

export function StreamingMessage({ content, viewMode, streamingToolCalls = [], streamingToolResults = new Map(), onSubmitTaskClarify }: StreamingMessageProps) {
  return (
    <div className="flex justify-start w-full animate-fade-in">
      <div className="w-full apple-message-assistant">
        <div className="space-y-2">
          {viewMode === 'rendered' ? (
            <RenderedStreamingContent content={content} streamingToolCalls={streamingToolCalls} streamingToolResults={streamingToolResults} onSubmitTaskClarify={onSubmitTaskClarify} />
          ) : (
            <RawStreamingContent content={content} viewMode={viewMode} streamingToolCalls={streamingToolCalls} streamingToolResults={streamingToolResults} />
          )}
          {/* 流式光标 - Apple style */}
          <span className="inline-flex items-center gap-1.5 text-apple-gray-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="text-apple-xs">Generating...</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Rendered 模式：渲染 Native Tool Calls */
function RenderedStreamingContent({ content, streamingToolCalls, streamingToolResults, onSubmitTaskClarify }: {
  content: string;
  streamingToolCalls: NativeToolCall[];
  streamingToolResults: Map<string, ToolResultData>;
  onSubmitTaskClarify?: (responses: Record<string, string | string[]>, toolCallId?: string) => Promise<void>;
}) {
  const hasNativeToolCalls = streamingToolCalls.length > 0;

  if (!hasNativeToolCalls) {
    // No tool calls, just render Markdown
    return <MarkdownContent content={content} />;
  }

  // Render text content + native tool calls
  const parts: React.ReactNode[] = [];

  // Add text content if present
  if (content.trim()) {
    parts.push(<MarkdownContent key="text-content" content={content} />);
  }

  // Render Native Tool Calls
  for (const toolCall of streamingToolCalls) {
    const toolKey = `native-tool-${toolCall.id}`;
    const normalizedName = normalizeToolName(toolCall.function?.name);
    const toolResult = streamingToolResults.get(toolCall.id);
    const isToolStreaming = !toolResult;

    // Client tools render inline
    if (normalizedName === 'task-clarify') {
      parts.push(
        <NativeTaskClarifyCard
          key={toolKey}
          toolCall={toolCall}
          toolResult={toolResult}
          streaming={isToolStreaming}
          onSubmit={onSubmitTaskClarify}
        />
      );
    } else if (normalizedName === 'complete') {
      parts.push(
        <NativeCompleteCard
          key={toolKey}
          toolCall={toolCall}
          toolResult={toolResult}
          streaming={isToolStreaming}
        />
      );
    } else if (normalizedName === 'ask') {
      parts.push(
        <NativeAskCard
          key={toolKey}
          toolCall={toolCall}
          toolResult={toolResult}
          streaming={isToolStreaming}
        />
      );
    } else {
      // Other tools render as buttons
      parts.push(
        <NativeToolCallCard
          key={toolKey}
          toolCall={toolCall}
          toolResult={toolResult}
          streaming={isToolStreaming}
        />
      );
    }
  }

  return <>{parts}</>;
}

/** Raw/Table/Content 模式：简单显示原始内容 */
function RawStreamingContent({ content, viewMode, streamingToolCalls, streamingToolResults }: { content: string; viewMode: ViewMode; streamingToolCalls: NativeToolCall[]; streamingToolResults: Map<string, ToolResultData> }) {
  return (
    <div className="space-y-3">
      {/* Text content section */}
      {content && (
        <div>
          <div className="text-apple-xs text-apple-gray-500 font-semibold mb-1">Text Content:</div>
          <pre className="text-apple-xs text-apple-gray-800 dark:text-apple-gray-200 whitespace-pre-wrap break-words font-mono overflow-auto max-h-96 bg-apple-gray-100 dark:bg-[#1C1C1E] p-2 rounded-apple">
            {content}
          </pre>
        </div>
      )}

      {/* Native Tool Calls - render as buttons, click to view in right panel */}
      {streamingToolCalls.length > 0 && (
        <div>
          <div className="text-apple-xs text-apple-gray-500 font-semibold mb-2">
            Native Tool Calls ({streamingToolCalls.length}):
          </div>
          <div className="flex flex-wrap gap-2">
            {streamingToolCalls.map((tc, index) => (
              <RawToolCallButton key={tc.id || `tc-${index}`} toolCall={tc} streaming={true} />
            ))}
          </div>
        </div>
      )}

      {/* Show empty state if no content */}
      {!content && streamingToolCalls.length === 0 && (
        <div className="text-apple-xs text-apple-gray-400 italic">
          Waiting for content...
        </div>
      )}
    </div>
  );
}

/** Raw mode tool call button - click to view details in right panel */
function RawToolCallButton({ toolCall, streaming }: { toolCall: NativeToolCall; streaming: boolean }) {
  const setSelectedToolCall = useSetAtom(selectedToolCallAtom);
  const setSidePanelTab = useSetAtom(sidePanelTabAtom);

  // Parse arguments
  const args = (() => {
    const rawArgs = toolCall.function?.arguments;
    if (!rawArgs) return {};
    if (typeof rawArgs === 'string') {
      try {
        return JSON.parse(rawArgs);
      } catch {
        return { _raw: rawArgs };
      }
    }
    return rawArgs;
  })();

  const handleClick = () => {
    const selected: SelectedToolCall = {
      type: 'native',
      toolName: toolCall.function?.name || 'unknown',
      toolCallId: toolCall.id,
      arguments: args,
      streaming,
    };
    setSelectedToolCall(selected);
    setSidePanelTab('tool');
  };

  return (
    <button
      onClick={handleClick}
      className={`group flex items-center gap-2 px-3 py-1.5 rounded-apple-sm border text-apple-xs font-medium transition-all
        bg-white dark:bg-[#2C2C2E] border-apple-gray-300 dark:border-[#48484A]
        text-apple-gray-700 dark:text-apple-gray-300 hover:bg-apple-gray-100 dark:hover:bg-[#3A3A3C]
        ${streaming ? 'animate-pulse' : ''}`}
    >
      <span>{toolCall.function?.name || 'unknown'}</span>
      {streaming && (
        <Loader2 className="w-3 h-3 animate-spin text-apple-gray-500" />
      )}
      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity flex-shrink-0" />
    </button>
  );
}

/** Markdown 内容渲染组件 - Apple typography */
function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none
      prose-headings:font-semibold prose-headings:text-apple-gray-900 dark:prose-headings:text-apple-gray-100
      prose-p:text-apple-gray-800 dark:prose-p:text-apple-gray-200 prose-p:leading-relaxed
      prose-a:text-apple-blue prose-a:no-underline hover:prose-a:underline
      prose-code:text-apple-purple prose-code:bg-apple-gray-200 dark:prose-code:bg-[#38383A] prose-code:px-1 prose-code:py-0.5 prose-code:rounded-apple-sm prose-code:text-apple-xs prose-code:before:content-none prose-code:after:content-none
      prose-pre:bg-[#1C1C1E] prose-pre:text-apple-gray-100 prose-pre:rounded-apple prose-pre:overflow-x-auto
      prose-ul:list-disc prose-ol:list-decimal
      prose-li:text-apple-gray-800 dark:prose-li:text-apple-gray-200
    ">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !className;

            if (isInline) {
              return (
                <code className="text-apple-purple bg-apple-gray-200 dark:bg-[#38383A] px-1 py-0.5 rounded-apple-sm text-apple-xs" {...props}>
                  {children}
                </code>
              );
            }

            return (
              <code className={`${className} block`} {...props}>
                {children}
              </code>
            );
          },
          a({ href, children, ...props }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
