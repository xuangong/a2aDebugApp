/**
 * Tool Detail Panel
 * Apple Design System - Displays detailed information about the selected tool call
 */

import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import {
  FileText,
  FilePlus,
  FileX,
  Terminal,
  Search,
  Globe,
  CheckCircle,
  HelpCircle,
  Presentation,
  Clock,
  TrendingUp,
  XCircle,
  Loader2,
  Code,
  FileJson,
} from 'lucide-react';
import { selectedToolCallAtom } from '../../atoms/chat-atoms';

// Get icon for tool name
function getToolIcon(toolName: string | null) {
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    'ask': HelpCircle,
    'complete': CheckCircle,
    'create-file': FilePlus,
    'delete-file': FileX,
    'read-file': FileText,
    'str-replace': FileText,
    'full-file-rewrite': FileText,
    'execute-command': Terminal,
    'task-clarify': HelpCircle,
    'presentation-planner': Presentation,
    'web-search': Search,
    'enterprise-search': Search,
    'get-current-datetime': Clock,
    'get-financial-data': TrendingUp,
  };

  return (toolName && iconMap[toolName]) || Globe;
}

// Convert kebab-case to Title Case
function getHumanReadableName(name: string | null): string {
  if (!name) return 'Unknown Tool';
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function ToolDetailPanel() {
  const selectedTool = useAtomValue(selectedToolCallAtom);

  if (!selectedTool) {
    return (
      <div className="flex-1 flex items-center justify-center text-apple-gray-400 text-apple-sm px-4 text-center">
        <div>
          <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Click on a tool card to view details</p>
        </div>
      </div>
    );
  }

  const Icon = getToolIcon(selectedTool.toolName);
  const humanName = getHumanReadableName(selectedTool.toolName);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Tool Header */}
      <div className="px-4 py-3 border-b border-apple-gray-200 dark:border-[#38383A]">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-apple-gray-600 dark:text-apple-gray-400" />
          <span className="text-apple-sm font-medium text-apple-gray-900 dark:text-apple-gray-100">
            {humanName}
          </span>
          {selectedTool.streaming && (
            <span className="flex items-center gap-1 text-apple-xs px-2 py-0.5 rounded-apple-sm bg-apple-blue/10 text-apple-blue">
              <Loader2 className="w-3 h-3 animate-spin" />
              Streaming
            </span>
          )}
        </div>
        {selectedTool.toolCallId && (
          <div className="text-apple-xs text-apple-gray-500 mt-1 font-mono truncate">
            ID: {selectedTool.toolCallId}
          </div>
        )}
      </div>

      {/* Tool Content */}
      <div className="p-4 space-y-4">
        {/* Arguments Section */}
        {selectedTool.arguments && Object.keys(selectedTool.arguments).length > 0 && (
          <Section title="Arguments" icon={<Code className="w-4 h-4" />}>
            <div className="space-y-2">
              {Object.entries(selectedTool.arguments).map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <div className="text-apple-xs font-medium text-apple-gray-600 dark:text-apple-gray-400">
                    {key}
                  </div>
                  <ArgumentValue value={value} />
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Content Section (for XML tools) */}
        {selectedTool.content && (
          <Section title="Content" icon={<FileText className="w-4 h-4" />}>
            <pre className="text-apple-xs bg-apple-gray-100 dark:bg-[#2C2C2E] text-apple-gray-800 dark:text-apple-gray-200 p-3 rounded-apple overflow-x-auto max-h-64 whitespace-pre-wrap break-words">
              {selectedTool.content}
            </pre>
          </Section>
        )}

        {/* Raw XML Section (for XML tools) */}
        {selectedTool.rawXml && (
          <Section title="Raw XML" icon={<Code className="w-4 h-4" />}>
            <pre className="text-apple-xs bg-apple-gray-100 dark:bg-[#1C1C1E] text-apple-gray-800 dark:text-apple-gray-200 p-3 rounded-apple overflow-x-auto max-h-64 whitespace-pre-wrap break-words font-mono">
              {selectedTool.rawXml}
            </pre>
          </Section>
        )}

        {/* Result Section */}
        {selectedTool.result && (
          <Section
            title="Result"
            icon={selectedTool.result.success
              ? <CheckCircle className="w-4 h-4 text-apple-green" />
              : <XCircle className="w-4 h-4 text-apple-red" />
            }
          >
            <div className="space-y-2">
              <div className={`text-apple-xs font-medium px-2 py-1 rounded-apple-sm inline-block ${
                selectedTool.result.success
                  ? 'bg-apple-green/10 text-apple-green'
                  : 'bg-apple-red/10 text-apple-red'
              }`}>
                {selectedTool.result.success ? 'Success' : 'Failed'}
              </div>
              {selectedTool.result.output !== undefined && (
                <pre className="text-apple-xs text-apple-gray-800 dark:text-apple-gray-200 bg-apple-gray-100 dark:bg-[#2C2C2E] p-3 rounded-apple overflow-x-auto max-h-64 whitespace-pre-wrap break-words">
                  {typeof selectedTool.result.output === 'string'
                    ? selectedTool.result.output
                    : JSON.stringify(selectedTool.result.output, null, 2)
                  }
                </pre>
              )}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function Section({ title, icon, children }: SectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-apple-sm font-medium text-apple-gray-700 dark:text-apple-gray-300">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function ArgumentValue({ value }: { value: unknown }) {
  const formattedValue = useMemo(() => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') {
      // Truncate long strings for display
      if (value.length > 500) {
        return value.slice(0, 500) + '...';
      }
      return value;
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
      return String(value);
    }
    return JSON.stringify(value, null, 2);
  }, [value]);

  const isMultiline = formattedValue.includes('\n') || formattedValue.length > 100;

  if (isMultiline) {
    return (
      <pre className="text-apple-xs text-apple-gray-800 dark:text-apple-gray-200 bg-apple-gray-100 dark:bg-[#2C2C2E] p-2 rounded-apple overflow-x-auto max-h-48 whitespace-pre-wrap break-words">
        {formattedValue}
      </pre>
    );
  }

  return (
    <div className="text-apple-xs text-apple-gray-800 dark:text-apple-gray-200 bg-apple-gray-100 dark:bg-[#2C2C2E] px-2 py-1 rounded-apple-sm break-words">
      {formattedValue}
    </div>
  );
}
