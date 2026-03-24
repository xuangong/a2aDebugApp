/**
 * Assistant Message Component
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, ChevronRight, ChevronDown, Maximize2, Minimize2, Eye, Code, FileText } from 'lucide-react';
import type { AssistantMessage as AssistantMessageType, A2AResult, ToolResultData, NativeToolCall } from '../../../shared/types';
import type { ViewMode } from '../../atoms/chat-atoms';
import { parseXmlContent, type XmlCall } from '../../lib/xml-streaming-parser';
import {
  ToolCallCard,
  CompleteCard,
  AskCard,
  TaskClarifyCard,
  PresentationPlannerCard,
  DateTimeCard,
  NativeToolCallCard,
  NativeCompleteCard,
  NativeAskCard,
  NativeTaskClarifyCard,
} from '../ToolCallCard';
import { extractPartsFromResult, collectToolResults, collectNativeToolCalls } from '../../../shared/types';

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
    <div className="flex justify-start w-full">
      <div
        ref={containerRef}
        className={`w-full bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3 transition-all select-text ${
          isSearchMatch
            ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 bg-yellow-50 dark:bg-yellow-900/20'
            : isSelected
              ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-white dark:ring-offset-gray-900'
              : 'hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
        }`}
        onClick={handleClick}
        title="Click to highlight related logs"
      >
        {/* View mode toggle */}
        <div className="flex items-center justify-end mb-2 -mt-1" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center bg-gray-200 dark:bg-gray-700 rounded-md p-0.5">
            <button
              onClick={() => setLocalViewMode('rendered')}
              className={`p-1 rounded transition-colors ${
                viewMode === 'rendered'
                  ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-200 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              title="Rendered view"
            >
              <Eye className="w-3 h-3" />
            </button>
            <button
              onClick={() => setLocalViewMode('raw')}
              className={`p-1 rounded transition-colors ${
                viewMode === 'raw'
                  ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-200 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              title="Raw JSON view"
            >
              <Code className="w-3 h-3" />
            </button>
            <button
              onClick={() => setLocalViewMode('content')}
              className={`p-1 rounded transition-colors ${
                viewMode === 'content'
                  ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-200 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
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
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {new Date(message.createdAt).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

function RenderedView({ message, searchQuery, onSubmitTaskClarify }: { message: AssistantMessageType; searchQuery?: string; onSubmitTaskClarify?: (responses: Record<string, string | string[]>, toolCallId?: string) => Promise<void> }) {
  // Parse XML tool calls from text content (legacy support)
  const { plainText, xmlCalls, parsingXmlCall } = useMemo(
    () => parseXmlContent(message.content),
    [message.content]
  );

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

  // Collect tool results (matched by tool_call_id)
  const toolResultsMap = useMemo(() => collectToolResults(results), [results]);

  // Collect native tool calls from DataParts and merge with message.nativeToolCalls
  // message.nativeToolCalls contains the finalized tool calls captured before streaming reset
  const nativeToolCalls = useMemo(() => {
    const fromResults = collectNativeToolCalls(results);
    const fromMessage = message.nativeToolCalls || [];

    // If we have tool calls from results, prefer those (more complete data)
    // Otherwise use the ones saved in the message (finalized from streaming)
    if (fromResults.length > 0) {
      return fromResults;
    }
    return fromMessage;
  }, [results, message.nativeToolCalls]);

  // Extract text content from TextParts (for native tool mode)
  const textFromParts = useMemo(() => {
    const texts: string[] = [];
    for (const result of results) {
      const parts = extractPartsFromResult(result);
      for (const part of parts) {
        if (part.kind === 'text' && 'text' in part) {
          texts.push(part.text);
        }
      }
    }
    return texts.join('');
  }, [results]);

  // Merge completed and in-progress XML calls
  const allXmlCalls: XmlCall[] = useMemo(() => {
    const calls = [...xmlCalls];
    if (parsingXmlCall) {
      calls.push(parsingXmlCall);
    }
    return calls;
  }, [xmlCalls, parsingXmlCall]);

  // Get tool result by tool_call_id
  const getToolResult = (xmlCall: XmlCall): ToolResultData | undefined => {
    const toolCallId = xmlCall.toolCallId || xmlCall.attributes['_tool_call_id'];
    if (toolCallId) {
      return toolResultsMap.get(toolCallId);
    }
    return undefined;
  };

  // Get tool result for native tool call
  const getNativeToolResult = (tc: NativeToolCall): ToolResultData | undefined => {
    return toolResultsMap.get(tc.id);
  };

  // Render native tool call card
  const renderNativeToolCard = (tc: NativeToolCall, index: number) => {
    const toolResult = getNativeToolResult(tc);
    const key = `native-${tc.id}-${index}`;
    const normalizedName = normalizeToolName(tc.function?.name);

    if (normalizedName === 'complete') {
      return <NativeCompleteCard key={key} toolCall={tc} toolResult={toolResult} />;
    } else if (normalizedName === 'ask') {
      return <NativeAskCard key={key} toolCall={tc} toolResult={toolResult} />;
    } else if (normalizedName === 'task-clarify') {
      return <NativeTaskClarifyCard key={key} toolCall={tc} toolResult={toolResult} onSubmit={onSubmitTaskClarify} />;
    } else {
      return <NativeToolCallCard key={key} toolCall={tc} toolResult={toolResult} />;
    }
  };

  // Render content mixing text and tool calls
  const renderContent = () => {
    // Check if we have native tool calls (new mode)
    if (nativeToolCalls.length > 0) {
      return (
        <>
          {textFromParts && <MarkdownContent content={textFromParts} />}
          {nativeToolCalls.map((tc, i) => renderNativeToolCard(tc, i))}
        </>
      );
    }

    // Fall back to XML parsing (legacy mode)
    if (allXmlCalls.length === 0) {
      return <MarkdownContent content={message.content} />;
    }

    // Mix text and XML tool calls
    const originalText = message.content;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    for (const xmlCall of allXmlCalls) {
      if (xmlCall.offsetInText > lastIndex) {
        let textBefore = originalText.substring(lastIndex, xmlCall.offsetInText);
        textBefore = textBefore.replace(/```xml?\s*$/g, '').replace(/^\s*```\s*/g, '');
        if (textBefore.trim()) {
          parts.push(<MarkdownContent key={`md-${lastIndex}`} content={textBefore} />);
        }
      }

      const toolResult = getToolResult(xmlCall);
      const toolKey = `tool-${xmlCall.toolCallId || xmlCall.name}-${xmlCall.offsetInText}`;
      const normalizedName = normalizeToolName(xmlCall.name);

      if (normalizedName === 'complete') {
        parts.push(<CompleteCard key={toolKey} xmlCall={xmlCall} toolResult={toolResult} />);
      } else if (normalizedName === 'ask') {
        parts.push(<AskCard key={toolKey} xmlCall={xmlCall} toolResult={toolResult} />);
      } else if (normalizedName === 'task-clarify') {
        parts.push(<TaskClarifyCard key={toolKey} xmlCall={xmlCall} onSubmit={onSubmitTaskClarify} toolResult={toolResult} />);
      } else if (normalizedName === 'presentation-planner') {
        parts.push(<PresentationPlannerCard key={toolKey} xmlCall={xmlCall} toolResult={toolResult} />);
      } else if (normalizedName === 'get-current-datetime') {
        parts.push(<DateTimeCard key={toolKey} xmlCall={xmlCall} forceCompleted toolResult={toolResult} />);
      } else {
        parts.push(<ToolCallCard key={toolKey} xmlCall={xmlCall} toolResult={toolResult} />);
      }

      lastIndex = xmlCall.offsetInText + xmlCall.rawXml.length;
    }

    if (!parsingXmlCall && lastIndex < originalText.length) {
      let remainingText = originalText.substring(lastIndex);
      remainingText = remainingText.replace(/^\s*```\s*/g, '');
      if (remainingText.trim()) {
        parts.push(<MarkdownContent key={`md-${lastIndex}`} content={remainingText} />);
      }
    }

    return <>{parts}</>;
  };

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      {renderContent()}
    </div>
  );
}

/** Markdown Content Renderer */
function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none
      prose-headings:font-semibold prose-headings:text-gray-800 dark:prose-headings:text-gray-200
      prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:leading-relaxed
      prose-a:text-primary-600 dark:prose-a:text-primary-400 prose-a:no-underline hover:prose-a:underline
      prose-code:text-pink-600 dark:prose-code:text-pink-400 prose-code:bg-gray-200 dark:prose-code:bg-gray-700 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
      prose-pre:bg-gray-900 dark:prose-pre:bg-gray-950 prose-pre:text-gray-100 prose-pre:rounded-lg prose-pre:overflow-x-auto
      prose-ul:list-disc prose-ol:list-decimal
      prose-li:text-gray-700 dark:prose-li:text-gray-300
      prose-blockquote:border-l-4 prose-blockquote:border-primary-500 prose-blockquote:italic prose-blockquote:text-gray-600 dark:prose-blockquote:text-gray-400
      prose-table:text-sm prose-th:bg-gray-100 dark:prose-th:bg-gray-800 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-gray-200 dark:prose-td:border-gray-700
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
                <code className="text-pink-600 dark:text-pink-400 bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-xs" {...props}>
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
        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
          Raw Response
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded transition-colors"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            )}
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            )}
          </button>
        </div>
      </div>
      {/* JSON content (collapsible) */}
      <div className={`text-xs bg-gray-200 dark:bg-gray-900 p-3 rounded-lg overflow-auto ${isExpanded ? '' : 'max-h-96'}`}>
        <CollapsibleJson data={message.rawResponse} />
      </div>
    </div>
  );
}

/** Collapsible JSON Viewer */
interface CollapsibleJsonProps {
  data: unknown;
  depth?: number;
  initialExpanded?: boolean;
}

function CollapsibleJson({ data, depth = 0, initialExpanded = true }: CollapsibleJsonProps) {
  // Expand all by default
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  const indent = depth * 16;

  if (data === null) {
    return <span className="text-orange-500">null</span>;
  }

  if (typeof data === 'boolean') {
    return <span className="text-purple-500">{data.toString()}</span>;
  }

  if (typeof data === 'number') {
    return <span className="text-blue-500">{data}</span>;
  }

  if (typeof data === 'string') {
    // Truncate long strings for display
    const displayValue = data.length > 100 ? `${data.slice(0, 100)}...` : data;
    return (
      <span className="text-green-600 dark:text-green-400" title={data}>
        "{displayValue}"
      </span>
    );
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-gray-600 dark:text-gray-400">[]</span>;
    }

    return (
      <span>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center hover:bg-gray-300 dark:hover:bg-gray-700 rounded px-0.5"
        >
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 text-gray-500" />
          ) : (
            <ChevronRight className="w-3 h-3 text-gray-500" />
          )}
        </button>
        <span className="text-gray-600 dark:text-gray-400">
          [{!isExpanded && <span className="text-gray-400 mx-1">{data.length} items</span>}
        </span>
        {isExpanded && (
          <div style={{ marginLeft: indent + 16 }}>
            {data.map((item, index) => (
              <div key={index} className="leading-relaxed">
                <span className="text-gray-500">{index}: </span>
                <CollapsibleJson data={item} depth={depth + 1} />
                {index < data.length - 1 && <span className="text-gray-400">,</span>}
              </div>
            ))}
          </div>
        )}
        <span className="text-gray-600 dark:text-gray-400">]</span>
      </span>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data);
    if (entries.length === 0) {
      return <span className="text-gray-600 dark:text-gray-400">{'{}'}</span>;
    }

    return (
      <span>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center hover:bg-gray-300 dark:hover:bg-gray-700 rounded px-0.5"
        >
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 text-gray-500" />
          ) : (
            <ChevronRight className="w-3 h-3 text-gray-500" />
          )}
        </button>
        <span className="text-gray-600 dark:text-gray-400">
          {'{'}{!isExpanded && <span className="text-gray-400 mx-1">{entries.length} keys</span>}
        </span>
        {isExpanded && (
          <div style={{ marginLeft: indent + 16 }}>
            {entries.map(([key, value], index) => (
              <div key={key} className="leading-relaxed">
                <span className="text-red-600 dark:text-red-400">"{key}"</span>
                <span className="text-gray-600 dark:text-gray-400">: </span>
                <CollapsibleJson data={value} depth={depth + 1} />
                {index < entries.length - 1 && <span className="text-gray-400">,</span>}
              </div>
            ))}
          </div>
        )}
        <span className="text-gray-600 dark:text-gray-400">{'}'}</span>
      </span>
    );
  }

  return <span className="text-gray-500">{String(data)}</span>;
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
        <mark key={i} className="bg-yellow-300 dark:bg-yellow-600 text-gray-900 dark:text-gray-100 rounded px-0.5">
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
        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
          Raw Content ({allContent.length} chars)
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded transition-colors"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            )}
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            )}
          </button>
        </div>
      </div>
      {/* Content */}
      <div className={`bg-gray-200 dark:bg-gray-900 p-3 rounded-lg overflow-auto ${isExpanded ? '' : 'max-h-96'}`}>
        <pre className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words font-mono">
          {highlightedContent}
        </pre>
      </div>
    </div>
  );
}


