/**
 * XML Tool Call Card Component
 * Renders tool calls from Agent responses
 */

import { useMemo } from 'react';
import { Terminal, FileCode, FileText, Globe, Search, Code, Play, CheckCircle, Loader2, Box } from 'lucide-react';
import type { XmlCall } from '../../lib/xml-streaming-parser';

interface ToolCallCardProps {
  xmlCall: XmlCall;
}

/** Tool name to human-readable name mapping */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  'create-file': 'Create File',
  'read-file': 'Read File',
  'delete-file': 'Delete File',
  'str-replace': 'Edit File',
  'full-file-rewrite': 'Rewrite File',
  'execute-command': 'Run Command',
  'web-search': 'Web Search',
  'crawl-webpage': 'Read Webpage',
  'enterprise-search': 'Search Files',
  'git-status': 'Git Status',
  'git-add': 'Git Add',
  'git-commit': 'Git Commit',
  'git-push': 'Git Push',
  'git-clone': 'Git Clone',
  'start-webapp-dev-server': 'Start Dev Server',
  'stop-webapp-dev-server': 'Stop Dev Server',
  'deploy-staticpage': 'Deploy',
  'browser-navigate-to': 'Navigate',
  'browser-screenshot': 'Screenshot',
  'browser-act': 'Browser Action',
  'complete': 'Complete',
  'ask': 'Ask User',
  'task-clarify': 'Task Clarify',
  'presentation-planner': 'Plan Presentation',
  'execute-slide': 'Create Slide',
  'run-subagent': 'Run Subagent',
};

/** Get tool icon */
function getToolIcon(toolName: string) {
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    'create-file': FileCode,
    'read-file': FileText,
    'delete-file': FileText,
    'str-replace': Code,
    'full-file-rewrite': FileCode,
    'execute-command': Terminal,
    'web-search': Search,
    'crawl-webpage': Globe,
    'enterprise-search': Search,
    'start-webapp-dev-server': Play,
    'stop-webapp-dev-server': Play,
    'browser-navigate-to': Globe,
    'browser-screenshot': Globe,
    'browser-act': Globe,
    'complete': CheckCircle,
  };

  return iconMap[toolName] || Box;
}

/** Extract primary parameters for display */
function extractPrimaryParam(xmlCall: XmlCall): string | null {
  const { name, attributes, content } = xmlCall;

  // File operations - show file path
  if (['create-file', 'read-file', 'delete-file', 'full-file-rewrite'].includes(name)) {
    return attributes.file_path || attributes.file_name || null;
  }

  // Command execution - show command
  if (name === 'execute-command') {
    const cmd = attributes.command || content;
    return cmd ? (cmd.length > 50 ? cmd.slice(0, 50) + '...' : cmd) : null;
  }

  // Search - show query
  if (['web-search', 'enterprise-search'].includes(name)) {
    return attributes.query || null;
  }

  // URL navigation
  if (name === 'browser-navigate-to') {
    return attributes.url || null;
  }

  // str-replace - show file path
  if (name === 'str-replace') {
    return attributes.file_path || null;
  }

  return null;
}

/** Tool call card - completed state */
export function ToolCallCard({ xmlCall }: ToolCallCardProps) {
  const Icon = getToolIcon(xmlCall.name);
  const displayName = TOOL_DISPLAY_NAMES[xmlCall.name] || xmlCall.name;
  const paramDisplay = extractPrimaryParam(xmlCall);

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 my-1 bg-gray-100 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 text-sm">
      <Icon className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
      <span className="font-medium text-gray-700 dark:text-gray-200">{displayName}</span>
      {paramDisplay && (
        <span className="text-gray-500 dark:text-gray-400 truncate max-w-[200px]" title={paramDisplay}>
          {paramDisplay}
        </span>
      )}
      <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
    </div>
  );
}

/** Streaming tool call card - in-progress state */
export function StreamingToolCallCard({ xmlCall }: ToolCallCardProps) {
  const Icon = getToolIcon(xmlCall.name);
  const displayName = TOOL_DISPLAY_NAMES[xmlCall.name] || xmlCall.name;
  const paramDisplay = extractPrimaryParam(xmlCall);

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 my-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-sm">
      <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
      <span className="font-medium text-gray-700 dark:text-gray-200">{displayName}</span>
      {paramDisplay && (
        <span className="text-gray-500 dark:text-gray-400 truncate max-w-[200px]" title={paramDisplay}>
          {paramDisplay}
        </span>
      )}
      <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin flex-shrink-0" />
    </div>
  );
}

/** Tool call detail expandable card - for tools like complete/ask that display content */
export function ToolCallDetailCard({ xmlCall }: ToolCallCardProps) {
  const Icon = getToolIcon(xmlCall.name);
  const displayName = TOOL_DISPLAY_NAMES[xmlCall.name] || xmlCall.name;

  // Special handling for complete tag - show its content
  const hasContent = xmlCall.content && xmlCall.content.trim().length > 0;

  return (
    <div className="my-2 rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700">
        <Icon className="w-4 h-4 text-gray-600 dark:text-gray-300 flex-shrink-0" />
        <span className="font-medium text-sm text-gray-700 dark:text-gray-200">{displayName}</span>
        {xmlCall.streaming && (
          <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin ml-auto" />
        )}
      </div>
      {hasContent && (
        <div className="px-3 py-2 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
          {xmlCall.content}
        </div>
      )}
    </div>
  );
}

interface ToolCallRendererProps {
  xmlCalls: XmlCall[];
  parsingXmlCall?: XmlCall;
}

/** Render tool call list */
export function ToolCallRenderer({ xmlCalls, parsingXmlCall }: ToolCallRendererProps) {
  const renderedCalls = useMemo(() => {
    const elements: React.ReactNode[] = [];

    // Render completed calls
    for (const call of xmlCalls) {
      if (call.name === 'complete' || call.name === 'ask') {
        elements.push(<ToolCallDetailCard key={`${call.toolCallId || call.name}-${call.offsetInText}`} xmlCall={call} />);
      } else {
        elements.push(<ToolCallCard key={`${call.toolCallId || call.name}-${call.offsetInText}`} xmlCall={call} />);
      }
    }

    // Render calls being parsed
    if (parsingXmlCall) {
      if (parsingXmlCall.name === 'complete' || parsingXmlCall.name === 'ask') {
        elements.push(<ToolCallDetailCard key="parsing" xmlCall={parsingXmlCall} />);
      } else {
        elements.push(<StreamingToolCallCard key="parsing" xmlCall={parsingXmlCall} />);
      }
    }

    return elements;
  }, [xmlCalls, parsingXmlCall]);

  if (renderedCalls.length === 0) {
    return null;
  }

  return <div className="flex flex-wrap gap-2 my-2">{renderedCalls}</div>;
}
