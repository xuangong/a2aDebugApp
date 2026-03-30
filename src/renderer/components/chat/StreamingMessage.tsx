/**
 * 流式消息组件
 * Apple Design System - 用于实时渲染正在接收的 Agent 响应
 * Native tool calls only (XML tool calls deprecated)
 * Supports interleaved text and tool_calls display
 */

import { useMemo } from 'react';
import { useSetAtom } from 'jotai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, ExternalLink } from 'lucide-react';
import type { ViewMode, SelectedToolCall } from '../../atoms/chat-atoms';
import { selectedToolCallAtom, sidePanelTabAtom } from '../../atoms/chat-atoms';
import { NativeToolCallCard, NativeTaskClarifyCard, NativeCompleteCard, NativeAskCard, NativePresentationPlannerCard } from '../ToolCallCard';
import type { NativeToolCall, ToolResultData, A2AResult } from '../../../shared/types';
import { extractPartsFromResult } from '../../../shared/types';

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
  /** Raw streaming chunks for interleaved rendering */
  streamingChunks?: A2AResult[];
  /** Callback for submitting task-clarify responses */
  onSubmitTaskClarify?: (responses: Record<string, string | string[]>, toolCallId?: string) => Promise<void>;
}

export function StreamingMessage({ content, viewMode, streamingToolCalls = [], streamingToolResults = new Map(), streamingChunks = [], onSubmitTaskClarify }: StreamingMessageProps) {
  return (
    <div className="flex justify-start w-full animate-fade-in">
      <div className="w-full apple-message-assistant">
        <div className="space-y-2">
          {viewMode === 'rendered' ? (
            <RenderedStreamingContent
              content={content}
              streamingToolCalls={streamingToolCalls}
              streamingToolResults={streamingToolResults}
              streamingChunks={streamingChunks}
              onSubmitTaskClarify={onSubmitTaskClarify}
            />
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

/** Rendered 模式：按流顺序交错渲染 text 和 Native Tool Calls */
function RenderedStreamingContent({ content, streamingToolCalls, streamingToolResults, streamingChunks, onSubmitTaskClarify }: {
  content: string;
  streamingToolCalls: NativeToolCall[];
  streamingToolResults: Map<string, ToolResultData>;
  streamingChunks: A2AResult[];
  onSubmitTaskClarify?: (responses: Record<string, string | string[]>, toolCallId?: string) => Promise<void>;
}) {
  // Build a map from tool call ID to the accumulated tool call (with complete arguments)
  const accumulatedToolCallsMap = useMemo(() => {
    const map = new Map<string, NativeToolCall>();
    for (const tc of streamingToolCalls) {
      map.set(tc.id, tc);
    }
    return map;
  }, [streamingToolCalls]);

  // Build interleaved content from chunks
  const interleavedElements = useMemo(() => {
    const elements: React.ReactNode[] = [];
    const seenTexts = new Set<string>();
    const seenToolCallIds = new Set<string>();
    let pendingTexts: string[] = [];
    let idx = 0;

    const flushText = () => {
      if (pendingTexts.length > 0) {
        const combined = pendingTexts.join('');
        if (combined.trim()) {
          elements.push(<MarkdownContent key={`text-${idx++}`} content={combined} />);
        }
        pendingTexts = [];
      }
    };

    const renderToolCard = (tc: NativeToolCall) => {
      const toolResult = streamingToolResults.get(tc.id);
      const key = `tc-${idx++}-${tc.id}`;
      const normalizedName = normalizeToolName(tc.function?.name);
      const isToolStreaming = !toolResult;

      if (normalizedName === 'complete') {
        return <NativeCompleteCard key={key} toolCall={tc} toolResult={toolResult} streaming={isToolStreaming} />;
      } else if (normalizedName === 'ask') {
        return <NativeAskCard key={key} toolCall={tc} toolResult={toolResult} streaming={isToolStreaming} />;
      } else if (normalizedName === 'task-clarify') {
        return <NativeTaskClarifyCard key={key} toolCall={tc} toolResult={toolResult} streaming={isToolStreaming} onSubmit={onSubmitTaskClarify} />;
      } else if (normalizedName === 'presentation-planner') {
        return <NativePresentationPlannerCard key={key} toolCall={tc} toolResult={toolResult} streaming={isToolStreaming} onSubmit={onSubmitTaskClarify} />;
      } else {
        return <NativeToolCallCard key={key} toolCall={tc} toolResult={toolResult} streaming={isToolStreaming} />;
      }
    };

    // Process chunks in order
    for (let chunkIdx = 0; chunkIdx < streamingChunks.length; chunkIdx++) {
      const chunk = streamingChunks[chunkIdx];
      const parts = extractPartsFromResult(chunk);

      for (const part of parts) {
        if (part.kind === 'text' && 'text' in part && part.text.trim()) {
          // Use chunk index + part text as dedupe key to allow same text in different chunks
          // This prevents loss of repeated characters/words across different SSE events
          const dedupeKey = `${chunkIdx}-${part.text}`;
          if (!seenTexts.has(dedupeKey)) {
            seenTexts.add(dedupeKey);
            pendingTexts.push(part.text);
          }
        } else if (part.kind === 'data' && 'data' in part) {
          const data = part.data as Record<string, unknown>;
          const toolCalls = data?.tool_calls;
          if (Array.isArray(toolCalls) && toolCalls.length > 0) {
            flushText();
            for (const chunkTc of toolCalls as NativeToolCall[]) {
              // Get tool call ID - might be null in early chunks, use index as fallback
              const tcId = chunkTc.id;
              const tcIndex = (chunkTc as unknown as { index?: number }).index ?? 0;
              // Use a composite key for deduplication: id if available, otherwise index
              const dedupeKey = tcId || `index-${tcIndex}`;

              // Skip chunks with null name AND null id - these are incremental data chunks
              // We'll render when we get a chunk with actual id/name
              if (!tcId && !chunkTc.function?.name) {
                continue;
              }

              if (!seenToolCallIds.has(dedupeKey)) {
                seenToolCallIds.add(dedupeKey);
                // If we have tcId, try to get accumulated data; otherwise use chunk data
                // Always prefer accumulated data as it has complete arguments
                const accumulatedTc = tcId ? accumulatedToolCallsMap.get(tcId) : undefined;
                // Use accumulated if it has longer arguments (more complete)
                let tcToRender = chunkTc;
                if (accumulatedTc) {
                  const accArgs = accumulatedTc.function?.arguments;
                  const chunkArgs = chunkTc.function?.arguments;
                  const accLen = typeof accArgs === 'string' ? accArgs.length : JSON.stringify(accArgs || '').length;
                  const chunkLen = typeof chunkArgs === 'string' ? chunkArgs.length : JSON.stringify(chunkArgs || '').length;
                  // Prefer accumulated if it has more data
                  tcToRender = accLen >= chunkLen ? accumulatedTc : chunkTc;
                }
                elements.push(renderToolCard(tcToRender));
              }
            }
          }
        }
      }
    }

    flushText();

    // Always check streamingToolCalls for any tool calls not already rendered
    // This handles cases where chunks have incomplete tool_call data or null ids
    for (const tc of streamingToolCalls) {
      if (tc.id && !seenToolCallIds.has(tc.id)) {
        seenToolCallIds.add(tc.id);
        elements.push(renderToolCard(tc));
      }
    }

    // Fallback: if still no elements, use content text
    if (elements.length === 0 && content.trim()) {
      elements.push(<MarkdownContent key="fallback-text" content={content} />);
    }

    return elements;
  }, [streamingChunks, content, streamingToolCalls, streamingToolResults, onSubmitTaskClarify, accumulatedToolCallsMap]);

  if (interleavedElements.length === 0) {
    return null;
  }

  return <>{interleavedElements}</>;
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
