/**
 * User Message Component
 * Apple Design System - Supports rendered, raw JSON, and text view modes
 */

import { useState, useCallback, useMemo } from 'react';
import { CheckCircle, Eye, Code, FileText, Copy, Check, Maximize2, Minimize2, Presentation, ChevronLeft, ChevronRight } from 'lucide-react';
import type { UserMessage as UserMessageType } from '../../../shared/types';
import type { ViewMode } from '../../atoms/chat-atoms';
import { JsonView, darkStyles } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';

// Custom expand function: expand all nodes by default
const expandAllNodes = () => true;

interface UserMessageProps {
  message: UserMessageType;
  viewMode: ViewMode;
  isSelected?: boolean;
  onClick?: () => void;
}

/**
 * Parse tool_result message
 */
function parseToolResult(content: string): { toolName: string; toolCallId?: string; result: Record<string, unknown> } | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && 'tool_result' in parsed) {
      const toolResult = parsed.tool_result;
      return {
        toolName: toolResult.tool_name || 'unknown',
        toolCallId: toolResult.tool_call_id,
        result: toolResult.result || {},
      };
    }
  } catch {
    // Not JSON, return null
  }
  return null;
}

/**
 * Rendered view for presentation_planner tool_result
 */
function PresentationPlannerResultContent({ result }: { result: Record<string, unknown> }) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  // Get slides from result
  const slides = (result.slides || []) as Array<{
    slideNumber?: number;
    slide_number?: number;
    title?: string;
    content?: string | string[];
    slide_intent?: string;
    narrative?: string;
  }>;
  const title = result.title as string | undefined;
  const totalSlides = result.totalSlides as number | undefined || slides.length;
  const currentSlide = slides[currentSlideIndex];

  const goToPrevSlide = () => {
    setCurrentSlideIndex((prev) => (prev > 0 ? prev - 1 : slides.length - 1));
  };

  const goToNextSlide = () => {
    setCurrentSlideIndex((prev) => (prev < slides.length - 1 ? prev + 1 : 0));
  };

  if (slides.length === 0) {
    // No slides, show simple result
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-white/90">
          <Presentation className="w-4 h-4" />
          <span className="text-apple-xs font-medium uppercase tracking-wide">
            Presentation Planner Confirmed
          </span>
        </div>
        <div className="bg-white/15 rounded-apple-sm p-2 text-white/80 text-sm">
          {result.confirmed ? 'Plan confirmed' : JSON.stringify(result)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2 text-white/90">
        <Presentation className="w-4 h-4" />
        <span className="text-apple-xs font-medium uppercase tracking-wide">
          Presentation Plan Confirmed
        </span>
        <span className="text-apple-xs text-white/60">
          ({totalSlides} slides)
        </span>
      </div>

      {/* Title */}
      {title && (
        <div className="text-white font-medium">{title}</div>
      )}

      {/* Slide viewer */}
      <div className="bg-white/15 rounded-apple-sm overflow-hidden">
        {/* Slide header with navigation */}
        <div className="flex items-center justify-between px-3 py-2 bg-white/10 border-b border-white/10">
          <button
            onClick={goToPrevSlide}
            className="p-1 rounded hover:bg-white/20 transition-colors"
            title="Previous slide"
          >
            <ChevronLeft className="w-4 h-4 text-white/70" />
          </button>
          <span className="text-apple-xs text-white/70">
            Slide {currentSlideIndex + 1} of {slides.length}
          </span>
          <button
            onClick={goToNextSlide}
            className="p-1 rounded hover:bg-white/20 transition-colors"
            title="Next slide"
          >
            <ChevronRight className="w-4 h-4 text-white/70" />
          </button>
        </div>

        {/* Slide content */}
        {currentSlide && (
          <div className="p-3 space-y-2">
            <div className="text-white font-medium">
              {currentSlide.title || `Slide ${currentSlide.slideNumber || currentSlide.slide_number || currentSlideIndex + 1}`}
            </div>
            {currentSlide.content && (
              <div className="text-white/80 text-sm">
                {Array.isArray(currentSlide.content)
                  ? currentSlide.content.map((item, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-white/50">•</span>
                        <span>{item}</span>
                      </div>
                    ))
                  : currentSlide.content}
              </div>
            )}
            {currentSlide.slide_intent && (
              <div className="text-white/60 text-xs italic">
                Intent: {currentSlide.slide_intent}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Slide thumbnails */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentSlideIndex(index)}
            className={`w-6 h-6 rounded text-xs font-medium transition-colors ${
              index === currentSlideIndex
                ? 'bg-white text-purple-600'
                : 'bg-white/20 text-white/70 hover:bg-white/30'
            }`}
          >
            {index + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Rendered view for tool_result content
 */
function ToolResultContent({ toolName, result }: { toolName: string; result: Record<string, unknown> }) {
  // Use specialized renderer for presentation_planner
  const normalizedName = toolName.toLowerCase().replace(/_/g, '-');
  if (normalizedName === 'presentation-planner') {
    return <PresentationPlannerResultContent result={result} />;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-white/90">
        <CheckCircle className="w-4 h-4" />
        <span className="text-apple-xs font-medium uppercase tracking-wide">
          {toolName.replace(/_/g, ' ').replace(/-/g, ' ')} Response
        </span>
      </div>
      <div className="bg-white/15 rounded-apple-sm p-2 space-y-1">
        {Object.entries(result).map(([key, value]) => (
          <div key={key} className="flex gap-2 text-apple-sm">
            <span className="text-white/70 font-medium min-w-[80px]">
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

/**
 * Raw JSON View
 */
function RawView({ message }: { message: UserMessageType }) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Determine what to show: rawRequest if available, otherwise parse content
  const rawData = useMemo(() => {
    if (message.rawRequest) {
      return message.rawRequest;
    }
    // Try to parse content as JSON
    try {
      return JSON.parse(message.content);
    } catch {
      return { content: message.content };
    }
  }, [message]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(JSON.stringify(rawData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [rawData]);

  return (
    <div className="space-y-2">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <span className="text-apple-xs text-white/70 font-medium">Raw Request</span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1 rounded-apple-sm hover:bg-white/20 transition-colors"
            title="Copy JSON"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-apple-green" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-white/70" />
            )}
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-apple-sm hover:bg-white/20 transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5 text-white/70" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-white/70" />
            )}
          </button>
        </div>
      </div>
      {/* JSON content */}
      <div className={`text-[11px] bg-white/15 p-3 rounded-apple-sm overflow-auto ${isExpanded ? '' : 'max-h-96'}`}>
        <JsonView
          data={rawData}
          shouldExpandNode={expandAllNodes}
          style={darkStyles}
        />
      </div>
    </div>
  );
}

/**
 * Content/Text View - shows the plain text content
 */
function ContentView({ message }: { message: UserMessageType }) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  return (
    <div className="space-y-2">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <span className="text-apple-xs text-white/70 font-medium">Text Content</span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1 rounded-apple-sm hover:bg-white/20 transition-colors"
            title="Copy text"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-apple-green" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-white/70" />
            )}
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-apple-sm hover:bg-white/20 transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5 text-white/70" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-white/70" />
            )}
          </button>
        </div>
      </div>
      {/* Text content */}
      <div className={`text-apple-sm bg-white/15 p-3 rounded-apple-sm overflow-auto whitespace-pre-wrap ${isExpanded ? '' : 'max-h-96'}`}>
        {message.content}
      </div>
    </div>
  );
}

/**
 * Rendered View - shows formatted tool result or plain text
 */
function RenderedView({ message }: { message: UserMessageType }) {
  const toolResult = useMemo(() => parseToolResult(message.content), [message.content]);

  if (toolResult) {
    return <ToolResultContent toolName={toolResult.toolName} result={toolResult.result} />;
  }

  // Plain text message
  return (
    <div className="text-apple-sm whitespace-pre-wrap break-words">
      {message.content}
    </div>
  );
}

export function UserMessage({ message, viewMode: globalViewMode, isSelected, onClick }: UserMessageProps) {
  // Each message has independent view mode control, defaults to global setting
  const [localViewMode, setLocalViewMode] = useState<ViewMode | null>(null);
  const viewMode = localViewMode ?? globalViewMode;

  // Check if this is a tool result (to show view mode toggle)
  const isToolResult = useMemo(() => {
    try {
      const parsed = JSON.parse(message.content);
      return parsed && typeof parsed === 'object' && 'tool_result' in parsed;
    } catch {
      return false;
    }
  }, [message.content]);

  // Handle click - only trigger when no text selected
  const handleClick = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      return;
    }
    onClick?.();
  }, [onClick]);

  return (
    <div className="flex justify-end animate-fade-in">
      <div
        className={`
          max-w-[85%] apple-message-user transition-all select-text
          ${isSelected ? 'ring-2 ring-white/50 ring-offset-2 ring-offset-apple-gray-100 dark:ring-offset-black' : ''}
        `}
        onClick={handleClick}
        title="Click to highlight related logs"
      >
        {/* View mode toggle - show for tool results or messages with rawRequest */}
        {(isToolResult || message.rawRequest) && (
          <div className="flex items-center justify-end mb-2 -mt-1" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center bg-white/20 rounded-apple-sm p-0.5">
              <button
                onClick={() => setLocalViewMode('rendered')}
                className={`p-1 rounded-apple-sm transition-colors ${
                  viewMode === 'rendered'
                    ? 'bg-white/30 text-white'
                    : 'text-white/70 hover:text-white'
                }`}
                title="Rendered view"
              >
                <Eye className="w-3 h-3" />
              </button>
              <button
                onClick={() => setLocalViewMode('raw')}
                className={`p-1 rounded-apple-sm transition-colors ${
                  viewMode === 'raw'
                    ? 'bg-white/30 text-white'
                    : 'text-white/70 hover:text-white'
                }`}
                title="Raw JSON view"
              >
                <Code className="w-3 h-3" />
              </button>
              <button
                onClick={() => setLocalViewMode('content')}
                className={`p-1 rounded-apple-sm transition-colors ${
                  viewMode === 'content'
                    ? 'bg-white/30 text-white'
                    : 'text-white/70 hover:text-white'
                }`}
                title="Text content view"
              >
                <FileText className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Content based on view mode */}
        <div className="text-apple-sm">
          {viewMode === 'raw' ? (
            <RawView message={message} />
          ) : viewMode === 'content' ? (
            <ContentView message={message} />
          ) : (
            <RenderedView message={message} />
          )}
        </div>

        <div className="text-apple-xs text-white/60 mt-2 text-right">
          {new Date(message.createdAt).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
