/**
 * 助手消息组件
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, ChevronRight, ChevronDown, Maximize2, Minimize2, Eye, Code, FileText } from 'lucide-react';
import type { AssistantMessage as AssistantMessageType, A2AResult, ToolResultData } from '../../../shared/types';
import type { ViewMode } from '../../atoms/chat-atoms';
import { parseXmlContent, type XmlCall } from '../../lib/xml-streaming-parser';
import { ToolCallCard, CompleteCard, AskCard, TaskClarifyCard, PresentationPlannerCard, DateTimeCard } from '../ToolCallCard';
import { extractPartsFromResult, collectToolResults } from '../../../shared/types';

interface AssistantMessageProps {
  message: AssistantMessageType;
  viewMode: ViewMode;
  isSelected?: boolean;
  isSearchMatch?: boolean;
  searchQuery?: string;
  onClick?: () => void;
  /** 提交 task-clarify 表单时的回调 */
  onSubmitTaskClarify?: (responses: Record<string, string | string[]>) => Promise<void>;
}

export function AssistantMessage({ message, viewMode: globalViewMode, isSelected, isSearchMatch, searchQuery, onClick, onSubmitTaskClarify }: AssistantMessageProps) {
  // 每个消息区块独立控制视图模式，默认使用全局设置
  const [localViewMode, setLocalViewMode] = useState<ViewMode | null>(null);
  const viewMode = localViewMode ?? globalViewMode;
  const containerRef = useRef<HTMLDivElement>(null);

  // 处理点击事件，只在没有选中文本且点击来自本 DOM 内时触发
  const handleClick = useCallback((e: React.MouseEvent) => {
    // 忽略来自 portal（不在消息气泡 DOM 内）的点击
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
        {/* 视图切换控制 */}
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

function RenderedView({ message, searchQuery, onSubmitTaskClarify }: { message: AssistantMessageType; searchQuery?: string; onSubmitTaskClarify?: (responses: Record<string, string | string[]>) => Promise<void> }) {
  // 使用流式解析器解析 XML 工具调用（支持不完整的 XML）
  const { plainText, xmlCalls, parsingXmlCall } = useMemo(
    () => parseXmlContent(message.content),
    [message.content]
  );

  // 收集所有工具结果（通过 tool_call_id 关联）
  const toolResultsMap = useMemo(() => {
    const rawResponse = message.rawResponse;
    let results: A2AResult[] = [];
    if (Array.isArray(rawResponse)) {
      results = rawResponse;
    } else if ('result' in rawResponse && rawResponse.result) {
      results = [rawResponse.result];
    } else if ('kind' in rawResponse) {
      results = [rawResponse as unknown as A2AResult];
    }
    return collectToolResults(results);
  }, [message.rawResponse]);

  // 合并已完成的和正在解析的 XML 调用
  const allXmlCalls: XmlCall[] = useMemo(() => {
    const calls = [...xmlCalls];
    if (parsingXmlCall) {
      calls.push(parsingXmlCall);
    }
    return calls;
  }, [xmlCalls, parsingXmlCall]);

  // 根据 tool_call_id 获取工具结果
  const getToolResult = (xmlCall: XmlCall): ToolResultData | undefined => {
    const toolCallId = xmlCall.toolCallId || xmlCall.attributes['_tool_call_id'];
    if (toolCallId) {
      return toolResultsMap.get(toolCallId);
    }
    return undefined;
  };

  // 渲染内容，将文本和工具调用混合
  const renderContent = () => {
    if (allXmlCalls.length === 0) {
      // 没有工具调用，直接渲染 Markdown
      return (
        <MarkdownContent content={message.content} />
      );
    }

    // 有工具调用，需要分段渲染
    // 使用原始文本 (message.content) 来计算位置
    const originalText = message.content;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    for (const xmlCall of allXmlCalls) {
      // 渲染工具调用前的文本（使用原始文本的偏移量）
      if (xmlCall.offsetInText > lastIndex) {
        let textBefore = originalText.substring(lastIndex, xmlCall.offsetInText);
        // 移除 XML 前后的 ``` 标记
        textBefore = textBefore.replace(/```xml?\s*$/g, '').replace(/^\s*```\s*/g, '');
        if (textBefore.trim()) {
          parts.push(
            <MarkdownContent key={`md-${lastIndex}`} content={textBefore} />
          );
        }
      }

      // 获取该工具调用的结果
      const toolResult = getToolResult(xmlCall);

      // 渲染工具调用组件
      const toolKey = `tool-${xmlCall.toolCallId || xmlCall.name}-${xmlCall.offsetInText}`;
      if (xmlCall.name === 'complete') {
        parts.push(<CompleteCard key={toolKey} xmlCall={xmlCall} toolResult={toolResult} />);
      } else if (xmlCall.name === 'ask') {
        parts.push(<AskCard key={toolKey} xmlCall={xmlCall} toolResult={toolResult} />);
      } else if (xmlCall.name === 'task-clarify') {
        parts.push(<TaskClarifyCard key={toolKey} xmlCall={xmlCall} onSubmit={onSubmitTaskClarify} toolResult={toolResult} />);
      } else if (xmlCall.name === 'presentation-planner') {
        parts.push(<PresentationPlannerCard key={toolKey} xmlCall={xmlCall} toolResult={toolResult} />);
      } else if (xmlCall.name === 'get-current-datetime') {
        parts.push(<DateTimeCard key={toolKey} xmlCall={xmlCall} forceCompleted toolResult={toolResult} />);
      } else {
        parts.push(<ToolCallCard key={toolKey} xmlCall={xmlCall} toolResult={toolResult} />);
      }

      lastIndex = xmlCall.offsetInText + xmlCall.rawXml.length;
    }

    // 渲染最后一段文本（仅对已完成的 XML 有效）
    if (!parsingXmlCall && lastIndex < originalText.length) {
      let remainingText = originalText.substring(lastIndex);
      // 移除开头的 ``` 标记
      remainingText = remainingText.replace(/^\s*```\s*/g, '');
      if (remainingText.trim()) {
        parts.push(
          <MarkdownContent key={`md-${lastIndex}`} content={remainingText} />
        );
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

/** Markdown 内容渲染组件 */
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
          // 自定义代码块渲染
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
          // 自定义链接（新窗口打开）
          a({ href, children, ...props }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            );
          },
          // 自定义表格样式
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
      {/* 头部工具栏 */}
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
      {/* JSON 内容（可折叠） */}
      <div className={`text-xs bg-gray-200 dark:bg-gray-900 p-3 rounded-lg overflow-auto ${isExpanded ? '' : 'max-h-96'}`}>
        <CollapsibleJson data={message.rawResponse} />
      </div>
    </div>
  );
}

/** 可折叠的 JSON 查看器 */
interface CollapsibleJsonProps {
  data: unknown;
  depth?: number;
  initialExpanded?: boolean;
}

function CollapsibleJson({ data, depth = 0, initialExpanded = true }: CollapsibleJsonProps) {
  // 默认全部展开
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
    // 对于长字符串，截断显示
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

/** Content 视图 - 拼接所有文本内容 */
function ContentView({ message, searchQuery }: { message: AssistantMessageType; searchQuery?: string }) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // 从 rawResponse 中提取所有文本内容
  const allContent = useMemo(() => {
    const rawResponse = message.rawResponse;

    // 规范化为 A2AResult 数组
    let items: A2AResult[] = [];
    if (Array.isArray(rawResponse)) {
      items = rawResponse;
    } else if ('result' in rawResponse && rawResponse.result) {
      // A2AResponse 对象，提取 result
      items = [rawResponse.result];
    } else if ('kind' in rawResponse) {
      // 直接是 A2AResult
      items = [rawResponse as unknown as A2AResult];
    }

    // 使用 Set 去重，避免重复内容
    const seenTexts = new Set<string>();
    const textParts: string[] = [];
    for (const item of items) {
      // 处理简化的流式 chunk 格式 {text, state}（后端录制格式）
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
          // 只添加未见过的文本
          if (!seenTexts.has(part.text)) {
            seenTexts.add(part.text);
            textParts.push(part.text);
          }
        }
      }
    }

    return textParts.join('');
  }, [message.rawResponse]);

  // 高亮搜索词
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
      {/* 头部工具栏 */}
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
      {/* 内容 */}
      <div className={`bg-gray-200 dark:bg-gray-900 p-3 rounded-lg overflow-auto ${isExpanded ? '' : 'max-h-96'}`}>
        <pre className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words font-mono">
          {highlightedContent}
        </pre>
      </div>
    </div>
  );
}


