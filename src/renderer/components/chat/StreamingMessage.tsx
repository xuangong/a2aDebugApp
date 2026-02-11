/**
 * 流式消息组件
 * 用于实时渲染正在接收的 Agent 响应
 * - rendered 模式：实时解析 XML 工具调用并渲染卡片
 * - 其他模式：简单显示原始内容
 */

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2 } from 'lucide-react';
import type { ViewMode } from '../../atoms/chat-atoms';
import { parseXmlContent, type XmlCall } from '../../lib/xml-streaming-parser';
import { ToolCallCard, CompleteCard, AskCard, TaskClarifyCard, PresentationPlannerCard, DateTimeCard } from '../ToolCallCard';

interface StreamingMessageProps {
  content: string;
  viewMode: ViewMode;
}

export function StreamingMessage({ content, viewMode }: StreamingMessageProps) {
  return (
    <div className="flex justify-start w-full">
      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3">
        <div className="space-y-2">
          {viewMode === 'rendered' ? (
            <RenderedStreamingContent content={content} />
          ) : (
            <RawStreamingContent content={content} viewMode={viewMode} />
          )}
          {/* 流式光标 */}
          <span className="inline-flex items-center gap-1 text-gray-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="text-xs">Generating...</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Rendered 模式：实时解析 XML 并渲染 */
function RenderedStreamingContent({ content }: { content: string }) {
  // 使用流式解析器解析 XML 工具调用
  const { plainText, xmlCalls, parsingXmlCall } = useMemo(
    () => parseXmlContent(content),
    [content]
  );

  // 合并已完成的和正在解析的 XML 调用
  const allXmlCalls: XmlCall[] = useMemo(() => {
    const calls = [...xmlCalls];
    if (parsingXmlCall) {
      calls.push(parsingXmlCall);
    }
    return calls;
  }, [xmlCalls, parsingXmlCall]);

  if (allXmlCalls.length === 0) {
    // 没有工具调用，直接渲染 Markdown
    return <MarkdownContent content={content} />;
  }

  // 有工具调用，需要分段渲染
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const xmlCall of allXmlCalls) {
    // 渲染工具调用前的文本
    if (xmlCall.offsetInText > lastIndex) {
      let textBefore = content.substring(lastIndex, xmlCall.offsetInText);
      // 移除 XML 前后的 ``` 标记
      textBefore = textBefore.replace(/```xml?\s*$/g, '').replace(/^\s*```\s*/g, '');
      if (textBefore.trim()) {
        parts.push(
          <MarkdownContent key={`md-${lastIndex}`} content={textBefore} />
        );
      }
    }

    // 渲染工具调用组件
    const toolKey = `tool-${xmlCall.toolCallId || xmlCall.name}-${xmlCall.offsetInText}`;
    if (xmlCall.name === 'complete') {
      parts.push(<CompleteCard key={toolKey} xmlCall={xmlCall} />);
    } else if (xmlCall.name === 'ask') {
      parts.push(<AskCard key={toolKey} xmlCall={xmlCall} />);
    } else if (xmlCall.name === 'task-clarify') {
      // 流式时不提供 onSubmit，因为还没完成
      parts.push(<TaskClarifyCard key={toolKey} xmlCall={xmlCall} />);
    } else if (xmlCall.name === 'presentation-planner') {
      parts.push(<PresentationPlannerCard key={toolKey} xmlCall={xmlCall} />);
    } else if (xmlCall.name === 'get-current-datetime') {
      parts.push(<DateTimeCard key={toolKey} xmlCall={xmlCall} />);
    } else {
      parts.push(<ToolCallCard key={toolKey} xmlCall={xmlCall} />);
    }

    lastIndex = xmlCall.offsetInText + xmlCall.rawXml.length;
  }

  // 渲染最后一段文本（仅对已完成的 XML 有效）
  if (!parsingXmlCall && lastIndex < content.length) {
    let remainingText = content.substring(lastIndex);
    // 移除开头的 ``` 标记
    remainingText = remainingText.replace(/^\s*```\s*/g, '');
    if (remainingText.trim()) {
      parts.push(
        <MarkdownContent key={`md-${lastIndex}`} content={remainingText} />
      );
    }
  }

  return <>{parts}</>;
}

/** Raw/Table/Content 模式：简单显示原始内容 */
function RawStreamingContent({ content, viewMode }: { content: string; viewMode: ViewMode }) {
  return (
    <pre className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words font-mono overflow-auto max-h-96">
      {content}
    </pre>
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
    ">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
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
