/**
 * Assistant Message Component
 * Apple Design System - Native tool calls only (XML tool calls deprecated)
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Maximize2, Minimize2, Eye, Code, FileText } from 'lucide-react';
import type { AssistantMessage as AssistantMessageType, A2AResult, A2AArtifactUpdateResult, ToolResultData, NativeToolCall } from '../../../shared/types';
import type { ViewMode } from '../../atoms/chat-atoms';
import {
  NativeToolCallCard,
  NativeCompleteCard,
  NativeAskCard,
  NativeTaskClarifyCard,
  NativePresentationPlannerCard,
} from '../ToolCallCard';
import { extractPartsFromResult, collectToolResults } from '../../../shared/types';
import { JsonView, darkStyles, defaultStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';

// Custom expand function: expand all nodes by default
const expandAllNodes = () => true;

// Normalize tool name to match against known client tools
// Handles: task_clarify, task-clarify, Task_clarify, etc.
function normalizeToolName(name: string | null | undefined): string {
  if (!name) return '';
  return name.toLowerCase().replace(/_/g, '-');
}

interface AssistantMessageProps {
  message: AssistantMessageType;
  viewMode: ViewMode;
  isSelected?: boolean;
  isSearchMatch?: boolean;
  searchQuery?: string;
  onClick?: () => void;
  /** Callback for submitting task-clarify form */
  onSubmitTaskClarify?: (responses: Record<string, string | string[]>, toolCallId?: string) => Promise<void>;
}

export function AssistantMessage({ message, viewMode: globalViewMode, isSelected, isSearchMatch, searchQuery, onClick, onSubmitTaskClarify }: AssistantMessageProps) {
  // Each message block has independent view mode control, defaults to global setting
  const [localViewMode, setLocalViewMode] = useState<ViewMode | null>(null);
  const viewMode = localViewMode ?? globalViewMode;
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle click - only trigger when no text selected and click is from within this DOM
  const handleClick = useCallback((e: React.MouseEvent) => {
    // Ignore clicks from portal (outside this message bubble DOM)
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) return;
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;
    onClick?.();
  }, [onClick]);

  return (
    <div className="flex justify-start w-full animate-fade-in">
      <div
        ref={containerRef}
        className={`w-full apple-message-assistant transition-all select-text ${
          isSearchMatch
            ? 'ring-2 ring-apple-orange ring-offset-2 ring-offset-apple-gray-100 dark:ring-offset-black bg-apple-orange/5'
            : isSelected
              ? 'ring-2 ring-apple-blue ring-offset-2 ring-offset-apple-gray-100 dark:ring-offset-black'
              : 'hover:bg-apple-gray-300/50 dark:hover:bg-[#3A3A3C]'
        }`}
        onClick={handleClick}
        title="Click to highlight related logs"
      >
        {/* View mode toggle - Apple segmented control style */}
        <div className="flex items-center justify-end mb-2 -mt-1" onClick={(e) => e.stopPropagation()}>
          <div className="apple-segmented">
            <button
              onClick={() => setLocalViewMode('rendered')}
              className={`apple-segment ${viewMode === 'rendered' ? 'active' : ''}`}
              title="Rendered view"
            >
              <Eye className="w-3 h-3" />
            </button>
            <button
              onClick={() => setLocalViewMode('raw')}
              className={`apple-segment ${viewMode === 'raw' ? 'active' : ''}`}
              title="Raw JSON view"
            >
              <Code className="w-3 h-3" />
            </button>
            <button
              onClick={() => setLocalViewMode('content')}
              className={`apple-segment ${viewMode === 'content' ? 'active' : ''}`}
              title="Raw content view"
            >
              <FileText className="w-3 h-3" />
            </button>
          </div>
        </div>

        {viewMode === 'rendered' ? (
          <RenderedView message={message} searchQuery={searchQuery} onSubmitTaskClarify={onSubmitTaskClarify} />
        ) : viewMode === 'content' ? (
          <ContentView message={message} searchQuery={searchQuery} />
        ) : (
          <RawView message={message} searchQuery={searchQuery} />
        )}
        <div className="text-apple-xs text-apple-gray-500 mt-2">
          {new Date(message.createdAt).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

function RenderedView({ message, searchQuery, onSubmitTaskClarify }: { message: AssistantMessageType; searchQuery?: string; onSubmitTaskClarify?: (responses: Record<string, string | string[]>, toolCallId?: string) => Promise<void> }) {
  // Normalize rawResponse to A2AResult array
  const results: A2AResult[] = useMemo(() => {
    const rawResponse = message.rawResponse;
    if (Array.isArray(rawResponse)) {
      return rawResponse;
    } else if ('result' in rawResponse && rawResponse.result) {
      return [rawResponse.result];
    } else if ('kind' in rawResponse) {
      return [rawResponse as unknown as A2AResult];
    }
    return [];
  }, [message.rawResponse]);

  // Collect tool results - prefer saved toolResults, fallback to extracting from results
  const toolResultsMap = useMemo(() => {
    // First, use saved toolResults from message (captured during streaming)
    const map = new Map<string, ToolResultData>();
    if (message.toolResults && message.toolResults.length > 0) {
      for (const tr of message.toolResults) {
        map.set(tr.tool_call_id, tr);
      }
    }
    // Then, also check rawResponse for any tool results (for backwards compatibility)
    const fromResults = collectToolResults(results);
    for (const [key, value] of fromResults) {
      if (!map.has(key)) {
        map.set(key, value);
      }
    }
    return map;
  }, [message.toolResults, results]);

  // Build a map from tool call ID to the complete tool call data from nativeToolCalls
  const nativeToolCallsMap = useMemo(() => {
    const map = new Map<string, NativeToolCall>();
    if (message.nativeToolCalls) {
      for (const tc of message.nativeToolCalls) {
        if (tc.id) {
          map.set(tc.id, tc);
        }
      }
    }
    return map;
  }, [message.nativeToolCalls]);

  // Build interleaved content: text and tool_calls in their original order
  // Adjacent text parts are accumulated into one paragraph, flushed when tool_call appears
  const interleavedElements = useMemo(() => {
    const elements: React.ReactNode[] = [];
    const seenTexts = new Set<string>();
    const seenToolCallIds = new Set<string>();
    let pendingTexts: string[] = [];
    let idx = 0;

    // Filter raw chunks relevant to a specific tool_call_id
    const getChunksForToolCall = (toolCallId: string): unknown[] => {
      if (!toolCallId) return [];
      // Track artifact IDs that contain this tool call
      const relevantArtifactIds = new Set<string>();
      const chunks: unknown[] = [];

      for (const result of results) {
        // Include artifact-update chunks that contain this tool_call_id
        if (result.kind === 'artifact-update') {
          const artifact = (result as A2AArtifactUpdateResult).artifact;
          if (artifact.name === 'tool_calls') {
            // Check if any part has a matching tool_call_id
            let isRelevant = relevantArtifactIds.has(artifact.artifactId);
            if (!isRelevant) {
              for (const p of artifact.parts) {
                if (p.kind === 'data' && 'data' in p) {
                  const tcs = (p.data as Record<string, unknown>).tool_calls;
                  if (Array.isArray(tcs) && tcs.some((t: NativeToolCall) => t.id === toolCallId)) {
                    isRelevant = true;
                    relevantArtifactIds.add(artifact.artifactId);
                    break;
                  }
                }
              }
            }
            if (isRelevant) {
              chunks.push(result);
            }
          }
          // Include tool_results for this tool call
          if (artifact.name === 'tool_results') {
            for (const p of artifact.parts) {
              if (p.kind === 'data' && 'data' in p) {
                const trs = (p.data as Record<string, unknown>).tool_results;
                if (Array.isArray(trs) && trs.some((tr: { tool_call_id?: string }) => tr.tool_call_id === toolCallId)) {
                  chunks.push(result);
                }
              }
            }
          }
        }
      }
      return chunks;
    };

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
      // IMPORTANT: Use the complete tool call data from nativeToolCalls if available
      // DataPart tool_calls may have incomplete arguments from streaming
      const completeTc = nativeToolCallsMap.get(tc.id) || tc;
      const toolResult = toolResultsMap.get(tc.id);
      const key = `tc-${idx++}-${tc.id}`;
      const normalizedName = normalizeToolName(completeTc.function?.name);
      const rawChunks = getChunksForToolCall(tc.id);

      if (normalizedName === 'complete') {
        return <NativeCompleteCard key={key} toolCall={completeTc} toolResult={toolResult} rawChunks={rawChunks} />;
      } else if (normalizedName === 'ask') {
        return <NativeAskCard key={key} toolCall={completeTc} toolResult={toolResult} rawChunks={rawChunks} />;
      } else if (normalizedName === 'task-clarify') {
        return <NativeTaskClarifyCard key={key} toolCall={completeTc} toolResult={toolResult} onSubmit={onSubmitTaskClarify} rawChunks={rawChunks} />;
      } else if (normalizedName === 'presentation-planner') {
        return <NativePresentationPlannerCard key={key} toolCall={completeTc} toolResult={toolResult} onSubmit={onSubmitTaskClarify} rawChunks={rawChunks} />;
      } else {
        return <NativeToolCallCard key={key} toolCall={completeTc} toolResult={toolResult} rawChunks={rawChunks} />;
      }
    };

    for (let resultIdx = 0; resultIdx < results.length; resultIdx++) {
      const result = results[resultIdx];
      const parts = extractPartsFromResult(result);

      for (const part of parts) {
        if (part.kind === 'text' && 'text' in part && part.text.trim()) {
          // Use result index + part text as dedupe key to allow same text in different chunks
          // This prevents loss of repeated characters/words across different SSE events
          const dedupeKey = `${resultIdx}-${part.text}`;
          if (!seenTexts.has(dedupeKey)) {
            seenTexts.add(dedupeKey);
            pendingTexts.push(part.text);
          }
        } else if (part.kind === 'data' && 'data' in part) {
          const data = part.data as Record<string, unknown>;
          const toolCalls = data?.tool_calls;
          if (Array.isArray(toolCalls) && toolCalls.length > 0) {
            flushText();
            for (const tc of toolCalls as NativeToolCall[]) {
              // Skip streaming chunks with no id - these are incremental argument fragments
              if (!tc.id) continue;
              if (!seenToolCallIds.has(tc.id)) {
                seenToolCallIds.add(tc.id);
                elements.push(renderToolCard(tc));
              }
            }
          }
        }
      }
    }

    flushText();

    // Always check nativeToolCalls for any tool calls not already rendered
    if (message.nativeToolCalls && message.nativeToolCalls.length > 0) {
      for (const tc of message.nativeToolCalls) {
        if (tc.id && !seenToolCallIds.has(tc.id)) {
          seenToolCallIds.add(tc.id);
          elements.push(renderToolCard(tc));
        }
      }
    }

    // Fallback: if still empty, use message.content
    if (elements.length === 0 && message.content) {
      elements.push(<MarkdownContent key="fallback" content={message.content} />);
    }

    return elements;
  }, [results, message.nativeToolCalls, message.content, toolResultsMap, onSubmitTaskClarify]);

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      {interleavedElements}
    </div>
  );
}

/** Markdown Content Renderer - Apple typography */
function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none
      prose-headings:font-semibold prose-headings:text-apple-gray-900 dark:prose-headings:text-apple-gray-100
      prose-p:text-apple-gray-800 dark:prose-p:text-apple-gray-200 prose-p:leading-relaxed
      prose-a:text-apple-blue prose-a:no-underline hover:prose-a:underline
      prose-code:text-apple-purple dark:prose-code:text-apple-purple prose-code:bg-apple-gray-200 dark:prose-code:bg-[#38383A] prose-code:px-1 prose-code:py-0.5 prose-code:rounded-apple-sm prose-code:text-apple-xs prose-code:before:content-none prose-code:after:content-none
      prose-pre:bg-[#1C1C1E] prose-pre:text-apple-gray-100 prose-pre:rounded-apple prose-pre:overflow-x-auto
      prose-ul:list-disc prose-ol:list-decimal
      prose-li:text-apple-gray-800 dark:prose-li:text-apple-gray-200
      prose-blockquote:border-l-4 prose-blockquote:border-apple-blue prose-blockquote:italic prose-blockquote:text-apple-gray-600 dark:prose-blockquote:text-apple-gray-400
      prose-table:text-apple-sm prose-th:bg-apple-gray-100 dark:prose-th:bg-[#2C2C2E] prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-apple-gray-200 dark:prose-td:border-[#38383A]
    ">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom code block rendering
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
          // Custom links (open in new window)
          a({ href, children, ...props }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            );
          },
          // Custom table styles
          table({ children, ...props }) {
            return (
              <div className="overflow-x-auto">
                <table className="min-w-full" {...props}>{children}</table>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function RawView({ message, searchQuery }: { message: AssistantMessageType; searchQuery?: string }) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Detect dark mode
  const isDark = document.documentElement.classList.contains('dark');

  const jsonString = useMemo(
    () => JSON.stringify(message.rawResponse, null, 2),
    [message.rawResponse]
  );

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [jsonString]);

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      {/* Header toolbar */}
      <div className="flex items-center justify-between">
        <div className="text-apple-xs font-medium text-apple-gray-500 uppercase tracking-wide">
          Raw Response
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="btn-apple-icon w-6 h-6"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-apple-green" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="btn-apple-icon w-6 h-6"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
      {/* JSON content */}
      <div className={`text-[11px] bg-apple-gray-100 dark:bg-[#1C1C1E] p-3 rounded-apple overflow-auto ${isExpanded ? '' : 'max-h-96'}`}>
        <JsonView
          data={message.rawResponse}
          shouldExpandNode={expandAllNodes}
          style={isDark ? darkStyles : defaultStyles}
        />
      </div>
    </div>
  );
}

/** Content View - concatenate all text content */
function ContentView({ message, searchQuery }: { message: AssistantMessageType; searchQuery?: string }) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Extract all text content from rawResponse
  const allContent = useMemo(() => {
    const rawResponse = message.rawResponse;

    // Normalize to A2AResult array
    let items: A2AResult[] = [];
    if (Array.isArray(rawResponse)) {
      items = rawResponse;
    } else if ('result' in rawResponse && rawResponse.result) {
      // A2AResponse object, extract result
      items = [rawResponse.result];
    } else if ('kind' in rawResponse) {
      // Direct A2AResult
      items = [rawResponse as unknown as A2AResult];
    }

    // Use Set for deduplication
    const seenTexts = new Set<string>();
    const textParts: string[] = [];
    for (const item of items) {
      // Handle simplified streaming chunk format {text, state} (backend recording format)
      if ('text' in item && typeof (item as Record<string, unknown>).text === 'string') {
        const text = (item as Record<string, unknown>).text as string;
        if (!seenTexts.has(text)) {
          seenTexts.add(text);
          textParts.push(text);
        }
        continue;
      }

      const parts = extractPartsFromResult(item);
      for (const part of parts) {
        if (part.kind === 'text' && 'text' in part) {
          // Only add unseen text
          if (!seenTexts.has(part.text)) {
            seenTexts.add(part.text);
            textParts.push(part.text);
          }
        }
      }
    }

    return textParts.join('');
  }, [message.rawResponse]);

  // Highlight search query
  const highlightedContent = useMemo(() => {
    if (!searchQuery?.trim()) return allContent;
    const query = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${query})`, 'gi');
    const parts = allContent.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-apple-orange/30 text-apple-gray-900 dark:text-apple-gray-100 rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  }, [allContent, searchQuery]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(allContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [allContent]);

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      {/* Header toolbar */}
      <div className="flex items-center justify-between">
        <div className="text-apple-xs font-medium text-apple-gray-500 uppercase tracking-wide">
          Raw Content ({allContent.length} chars)
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="btn-apple-icon w-6 h-6"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-apple-green" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="btn-apple-icon w-6 h-6"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
      {/* Content */}
      <div className={`bg-apple-gray-100 dark:bg-[#1C1C1E] p-3 rounded-apple overflow-auto ${isExpanded ? '' : 'max-h-96'}`}>
        <pre className="text-apple-xs text-apple-gray-800 dark:text-apple-gray-200 whitespace-pre-wrap break-words font-mono">
          {highlightedContent}
        </pre>
      </div>
    </div>
  );
}
