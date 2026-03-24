/**
 * Tool Call Card Components
 * Used to display XML and Native tool calls in rendered view
 *
 * Design Pattern (aligned with main Societas frontend):
 * - Most tools render as compact buttons that open detail panel on click
 * - Client tools (task-clarify, complete, ask) render inline with full content
 */

import { useState, useEffect, useCallback } from 'react';
import { useSetAtom, useAtomValue } from 'jotai';
import {
  FileText,
  FilePlus,
  FileX,
  Terminal,
  Search,
  Globe,
  GitBranch,
  CheckCircle,
  HelpCircle,
  Presentation,
  Smartphone,
  Monitor,
  Play,
  Upload,
  Clock,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Check,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import type { XmlCall } from '../lib/xml-streaming-parser';
import type { ToolResultData, NativeToolCall } from '../../shared/types';
import { parseToolArguments } from '../../shared/types';
import { getHumanReadableToolName, extractPrimaryParam } from '../lib/xml-parser';
import { selectedToolCallAtom, sidePanelTabAtom, type SelectedToolCall } from '../atoms/chat-atoms';

interface ToolCallCardProps {
  xmlCall: XmlCall;
  /** Force completed state (for saved messages) */
  forceCompleted?: boolean;
  /** Tool execution result (matched by tool_call_id) */
  toolResult?: ToolResultData;
}

interface TaskClarifyCardProps extends ToolCallCardProps {
  /** Callback for form submission */
  onSubmit?: (responses: Record<string, string | string[]>) => Promise<void>;
}

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
    'webapp-clarify': Monitor,
    'mobileapp-clarify': Smartphone,
    'presentation-planner': Presentation,
    'web-search': Search,
    'enterprise-search': Search,
    'create-webapp': Monitor,
    'create-mobileapp': Smartphone,
    'deploy-webapp': Upload,
    'preview-webapp': Play,
    'preview-mobileapp': Play,
    'git-clone': GitBranch,
    'git-commit': GitBranch,
    'git-push': GitBranch,
    'git-status': GitBranch,
    'get-current-datetime': Clock,
    'get-financial-data': TrendingUp,
  };

  return (toolName && iconMap[toolName]) || Globe;
}

// Get color for tool type
function getToolColor(toolName: string | null): string {
  const colorMap: Record<string, string> = {
    'ask': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700',
    'complete': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-300 dark:border-green-700',
    'create-file': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-300 dark:border-blue-700',
    'delete-file': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-300 dark:border-red-700',
    'read-file': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-300 dark:border-gray-600',
    'str-replace': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-300 dark:border-purple-700',
    'execute-command': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-300 dark:border-orange-700',
    'task-clarify': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border-indigo-300 dark:border-indigo-700',
    'web-search': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 border-cyan-300 dark:border-cyan-700',
  };

  return (toolName && colorMap[toolName]) || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-300 dark:border-gray-600';
}

export function ToolCallCard({ xmlCall, forceCompleted, toolResult }: ToolCallCardProps) {
  const setSelectedToolCall = useSetAtom(selectedToolCallAtom);
  const setSidePanelTab = useSetAtom(sidePanelTabAtom);

  const Icon = getToolIcon(xmlCall.name);
  const toolName = getHumanReadableToolName(xmlCall.name);
  const paramDisplay = extractPrimaryParam(xmlCall);
  const colorClass = getToolColor(xmlCall.name);
  const isStreaming = forceCompleted ? false : xmlCall.streaming;

  // Click handler - select tool and switch to tool tab
  const handleClick = useCallback(() => {
    const selectedTool: SelectedToolCall = {
      type: 'xml',
      toolName: xmlCall.name || 'unknown',
      toolCallId: xmlCall.toolCallId || xmlCall.attributes['_tool_call_id'],
      arguments: xmlCall.attributes,
      content: xmlCall.content,
      rawXml: xmlCall.rawXml,
      result: toolResult ? {
        success: toolResult.success,
        output: toolResult.result,
      } : undefined,
      streaming: isStreaming,
    };
    setSelectedToolCall(selectedTool);
    setSidePanelTab('tool');
  }, [xmlCall, toolResult, isStreaming, setSelectedToolCall, setSidePanelTab]);

  return (
    <button
      onClick={handleClick}
      className={`my-2 flex items-center gap-2 px-3 py-2 rounded-lg border ${colorClass} ${
        isStreaming ? 'animate-pulse' : ''
      } hover:opacity-80 transition-all cursor-pointer text-left w-auto max-w-full group`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="font-medium text-sm">{toolName}</span>
      {isStreaming && (
        <Loader2 className="w-3 h-3 animate-spin opacity-70" />
      )}
      {paramDisplay && (
        <span className="text-xs opacity-70 truncate max-w-[200px]" title={paramDisplay}>
          {paramDisplay}
        </span>
      )}
      {toolResult && (
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          toolResult.success
            ? 'bg-green-200/50 text-green-700 dark:bg-green-900/50 dark:text-green-400'
            : 'bg-red-200/50 text-red-700 dark:bg-red-900/50 dark:text-red-400'
        }`}>
          {toolResult.success ? 'success' : 'failed'}
        </span>
      )}
      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity flex-shrink-0" />
    </button>
  );
}

/**
 * Complete Card - displays completion info and attachments (INLINE, always visible)
 * Aligned with main frontend: full content visible
 */
export function CompleteCard({ xmlCall }: ToolCallCardProps) {
  const attachments = xmlCall.attributes['attachments'];
  const hasContent = xmlCall.content || attachments;

  return (
    <div className="my-3 rounded-xl border bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-green-100/50 dark:bg-green-900/30 border-b border-green-200 dark:border-green-700">
        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
        <span className="font-medium text-green-700 dark:text-green-300">Task Complete</span>
      </div>

      {/* Content - Always visible */}
      {hasContent && (
        <div className="px-4 py-3">
          {xmlCall.content && (
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {xmlCall.content}
            </p>
          )}
          {attachments && (
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <span className="font-medium">Attachments:</span>
              <span className="bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded">{attachments}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Ask Card - displays question info (INLINE, always visible)
 * Aligned with main frontend: full content visible
 */
export function AskCard({ xmlCall }: ToolCallCardProps) {
  const hasContent = !!xmlCall.content;

  return (
    <div className="my-3 rounded-xl border bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-yellow-100/50 dark:bg-yellow-900/30 border-b border-yellow-200 dark:border-yellow-700">
        <HelpCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
        <span className="font-medium text-yellow-700 dark:text-yellow-300">Input Required</span>
      </div>

      {/* Content - Always visible */}
      {hasContent && (
        <div className="px-4 py-3">
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {xmlCall.content}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Question interface - defines task clarification question structure
 * Aligned with main frontend's Question interface
 */
interface Question {
  id: string;
  type: 'input' | 'option';
  label: string;
  default?: string;
  options?: string[];
  input_type?: 'text' | 'select' | 'radio' | 'checkbox' | 'multiselect' | 'theme' | 'presentation_theme' | 'word_theme' | 'excel_visualization_theme';
  description?: string;
}

// Theme data aligned with main Societas frontend (from lib/themes.ts)
interface ThemeOption {
  id: string;
  name: string;
  preview_url: string;
  description: string;
}

// Word themes (A4 ratio 1:1.414) - aligned with main frontend
const WORD_THEMES: ThemeOption[] = [
  { id: 'resume', name: 'Resume', preview_url: '/themes/word/resume.png', description: 'Professional and clean theme optimized for resume documents' },
  { id: 'poster', name: 'Poster', preview_url: '/themes/word/poster.png', description: 'Eye-catching and bold theme designed for posters and flyers' },
  { id: 'letter', name: 'Letter', preview_url: '/themes/word/letter.png', description: 'Classic and formal theme suitable for letters and official correspondence' },
];

// Presentation themes (3:2 ratio) - aligned with main frontend
const PRESENTATION_THEMES: ThemeOption[] = [
  { id: 'auto', name: 'Auto', preview_url: '/themes/presentation/auto.png', description: 'Intelligent adaptive theme' },
  { id: 'azure', name: 'Azure', preview_url: '/themes/presentation/azure.png', description: 'Minimalist clean design with soft blue accents' },
  { id: 'ocean', name: 'Ocean', preview_url: '/themes/presentation/ocean.png', description: 'Minimal and data-driven design' },
  { id: 'ivory_parchment', name: 'Ivory Parchment', preview_url: '/themes/presentation/ivory_parchment.png', description: 'Classic elegant theme' },
  { id: 'copilot', name: 'Copilot', preview_url: '/themes/presentation/copilot.png', description: 'Microsoft Copilot-inspired design' },
  { id: 'forest', name: 'Forest', preview_url: '/themes/presentation/forest.png', description: 'Fresh, bold design with vibrant greens' },
  { id: 'matrix_console_neon', name: 'Matrix Console Neon', preview_url: '/themes/presentation/matrix_console_neon.png', description: 'Futuristic console theme' },
  { id: 'copper', name: 'Copper', preview_url: '/themes/presentation/copper.png', description: 'Luxurious formal interface' },
  { id: 'pinkblack', name: 'Pink Black', preview_url: '/themes/presentation/pinkblack.png', description: 'Bold and modern design' },
];

// Excel visualization themes - aligned with main frontend
const EXCEL_THEMES: ThemeOption[] = [
  { id: 'auto', name: 'Auto', preview_url: '/themes/excel_visualization/auto.png', description: 'Auto selected theme' },
  { id: 'slate_mono_brief', name: 'Slate Mono', preview_url: '/themes/excel_visualization/slate.png', description: 'Slate Mono Brief' },
  { id: 'azure', name: 'Azure', preview_url: '/themes/excel_visualization/azure.png', description: 'Minimalist analytics theme' },
  { id: 'forest', name: 'Forest', preview_url: '/themes/excel_visualization/forest.png', description: 'Vibrant green theme' },
  { id: 'copilot', name: 'Copilot', preview_url: '/themes/excel_visualization/copilot.png', description: 'Microsoft-inspired design' },
  { id: 'sage_mist_minimal', name: 'Sage Mist', preview_url: '/themes/excel_visualization/sage.png', description: 'Sage Mist Minimal' },
  { id: 'copper', name: 'Copper', preview_url: '/themes/excel_visualization/copper.png', description: 'Luxurious warm-toned theme' },
  { id: 'executive', name: 'Executive', preview_url: '/themes/excel_visualization/executive.png', description: 'Professional corporate theme' },
  { id: 'teal', name: 'Teal', preview_url: '/themes/excel_visualization/teal.png', description: 'Fresh green and teal palette' },
];

/**
 * Theme Selector - aligned with main frontend's ThemeSelector
 * Shows a grid of selectable theme cards with preview images
 * Hover shows "Apply theme" button - clicking it submits the form
 */
function ThemeSelectorPlaceholder({
  themeType,
  selectedTheme,
  onSelectTheme,
  onApplyTheme,
  disabled,
}: {
  themeType: string;
  selectedTheme: string;
  onSelectTheme: (themeId: string) => void;
  onApplyTheme?: (themeId: string) => void;
  disabled: boolean;
}) {
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [hoveredTheme, setHoveredTheme] = useState<string | null>(null);

  // Get themes based on type
  const themes = themeType === 'word_theme' ? WORD_THEMES
    : themeType === 'excel_visualization_theme' ? EXCEL_THEMES
    : PRESENTATION_THEMES;

  // Aspect ratio: word uses A4 (1:1.414), others use 3:2
  const aspectRatio = themeType === 'word_theme' ? '1 / 1.414' : '3 / 2';

  // Get fallback gradient for theme
  const getGradient = (id: string) => {
    const gradients: Record<string, string> = {
      'auto': 'from-gray-300 to-gray-500',
      'azure': 'from-blue-300 to-blue-500',
      'forest': 'from-green-300 to-green-500',
      'copilot': 'from-purple-300 to-purple-500',
      'resume': 'from-slate-300 to-slate-500',
      'poster': 'from-amber-300 to-orange-500',
      'letter': 'from-blue-200 to-blue-400',
      'ocean': 'from-cyan-300 to-blue-500',
      'copper': 'from-amber-400 to-orange-600',
      'executive': 'from-slate-400 to-slate-600',
      'teal': 'from-teal-300 to-teal-500',
    };
    return gradients[id] || 'from-indigo-300 to-indigo-500';
  };

  const handleImageError = (themeId: string) => {
    setFailedImages(prev => new Set(prev).add(themeId));
  };

  const handleApply = (themeId: string) => {
    onSelectTheme(themeId);
    if (onApplyTheme) {
      onApplyTheme(themeId);
    }
  };

  return (
    <div className="space-y-3">
      {/* Header - aligned with main frontend: "Choose a template" */}
      <div className="text-sm text-gray-700 dark:text-gray-300 px-2">
        Choose a template
      </div>

      {/* Theme grid - 3 columns like main frontend */}
      <div className="grid grid-cols-3 gap-[1px]">
        {themes.map((theme) => {
          const isSelected = selectedTheme === theme.id;
          const imageFailed = failedImages.has(theme.id);
          const isHovered = hoveredTheme === theme.id;
          return (
            <div
              key={theme.id}
              onMouseEnter={() => !disabled && setHoveredTheme(theme.id)}
              onMouseLeave={() => setHoveredTheme(null)}
              style={{ aspectRatio }}
              className={`relative rounded-2xl p-[3px] overflow-hidden transition-all ${
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              } ${
                isSelected
                  ? 'border-[3px] border-indigo-500'
                  : 'border-[3px] border-transparent'
              }`}
            >
              {/* Theme preview container */}
              <div className="relative w-full h-full rounded-[10px] overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                {/* Fallback gradient background */}
                <div className={`absolute inset-0 bg-gradient-to-br ${getGradient(theme.id)}`} />

                {/* Theme preview image */}
                {!imageFailed && (
                  <img
                    src={theme.preview_url}
                    alt={theme.name}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                    onError={() => handleImageError(theme.id)}
                  />
                )}

                {/* Theme name label (shown when image fails) */}
                {imageFailed && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-medium text-white drop-shadow-md px-2 py-1 bg-black/30 rounded">
                      {theme.name}
                    </span>
                  </div>
                )}

                {/* Hover overlay with "Apply theme" button - positioned lower */}
                {isHovered && !disabled && (
                  <div className="absolute inset-0 bg-black/30 flex items-end justify-center pb-4 transition-opacity">
                    <button
                      onClick={() => handleApply(theme.id)}
                      className="px-4 py-2 bg-white text-gray-800
                        text-sm font-medium rounded-lg shadow-lg hover:bg-gray-100
                        transition-all"
                    >
                      Apply theme
                    </button>
                  </div>
                )}

                {/* Selection checkmark */}
                {isSelected && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center shadow">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Task Clarify Card - displays task clarification form (INLINE, not collapsible)
 * Parses JSON question list and renders interactive form
 * Aligned with main frontend: always expanded, full form visible
 */
export function TaskClarifyCard({ xmlCall, onSubmit, toolResult }: TaskClarifyCardProps) {
  const setSelectedToolCall = useSetAtom(selectedToolCallAtom);
  const setSidePanelTab = useSetAtom(sidePanelTabAtom);
  const [formValues, setFormValues] = useState<Record<string, string | string[]>>({});
  // If toolResult exists, form was already submitted
  const [isSubmitted, setIsSubmitted] = useState(!!toolResult);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Parse question list
  const questions: Question[] = (() => {
    if (!xmlCall.content) return [];
    try {
      const parsed = JSON.parse(xmlCall.content);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    } catch {
      return [];
    }
  })();

  // Click handler to show in right panel
  const handleShowInPanel = useCallback(() => {
    const selectedTool: SelectedToolCall = {
      type: 'xml',
      toolName: xmlCall.name || 'task-clarify',
      toolCallId: xmlCall.toolCallId || xmlCall.attributes['_tool_call_id'],
      arguments: xmlCall.attributes,
      content: xmlCall.content,
      rawXml: xmlCall.rawXml,
      result: toolResult ? {
        success: toolResult.success,
        output: toolResult.result,
      } : undefined,
    };
    setSelectedToolCall(selectedTool);
    setSidePanelTab('tool');
  }, [xmlCall, toolResult, setSelectedToolCall, setSidePanelTab]);

  // Initialize form default values
  useEffect(() => {
    const defaults: Record<string, string | string[]> = {};
    questions.forEach((q) => {
      if (q.default) {
        defaults[q.id] = q.default;
      } else if (q.input_type === 'checkbox' || q.input_type === 'multiselect') {
        defaults[q.id] = [];
      } else {
        defaults[q.id] = '';
      }
    });
    setFormValues(defaults);
  }, [questions.length]);

  // Update form value
  const updateValue = (id: string, value: string | string[]) => {
    setFormValues((prev) => ({ ...prev, [id]: value }));
  };

  // Toggle checkbox value
  const toggleCheckbox = (id: string, option: string) => {
    setFormValues((prev) => {
      const current = prev[id];
      const currentArray = Array.isArray(current) ? current : [];
      const newArray = currentArray.includes(option)
        ? currentArray.filter((v) => v !== option)
        : [...currentArray, option];
      return { ...prev, [id]: newArray };
    });
  };

  // If no content, show minimal card
  if (questions.length === 0 && !xmlCall.content) {
    return (
      <div className="my-2 rounded-lg border bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700 px-3 py-2">
        <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
          <HelpCircle className="w-5 h-5" />
          <span className="font-medium">Task Clarification</span>
          <span className="text-xs opacity-60">No questions</span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 rounded-xl border bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-indigo-100/50 dark:bg-indigo-900/30 border-b border-indigo-200 dark:border-indigo-700">
        <HelpCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        <span className="font-medium text-indigo-700 dark:text-indigo-300">Task Clarification</span>
        {isSubmitted && (
          <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
            Submitted
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={handleShowInPanel}
          className="p-1 rounded hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors"
          title="View in side panel"
        >
          <ExternalLink className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
        </button>
      </div>

      {/* Form Content - Always visible */}
      <div className="px-4 py-4">
        {questions.length === 0 ? (
          // Non-JSON format, show raw content
          <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {xmlCall.content}
          </div>
        ) : (
          // JSON format, render form
          <>
            {/* Question list */}
            <div className="space-y-5">
              {questions.map((question, index) => (
                <div key={question.id} className="space-y-2">
                  {/* Question label */}
                  <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
                    <span className="text-indigo-600 dark:text-indigo-400 mr-1.5">{index + 1}.</span>
                    {question.label}
                  </label>

                  {/* Description */}
                  {question.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 ml-4">{question.description}</p>
                  )}

                  {/* Form field */}
                  <div className="ml-4">
                    {/* Text input - for type="input" */}
                    {question.type === 'input' && (
                      <input
                        type="text"
                        value={(formValues[question.id] as string) || question.default || ''}
                        onChange={(e) => updateValue(question.id, e.target.value)}
                        placeholder={question.default || 'Enter your answer...'}
                        disabled={isSubmitted}
                        className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                          bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                          focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                          disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    )}

                    {/* Dropdown select - for type="option" + input_type="select" */}
                    {question.type === 'option' && question.input_type === 'select' && (
                      <select
                        value={(formValues[question.id] as string) || question.default || ''}
                        onChange={(e) => updateValue(question.id, e.target.value)}
                        disabled={isSubmitted}
                        className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                          bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                          focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                          disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">Select an option...</option>
                        {question.options?.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Radio buttons - for type="option" + input_type="radio" */}
                    {question.type === 'option' && question.input_type === 'radio' && (
                      <div className="space-y-2">
                        {question.options?.map((option) => {
                          const isSelected = (formValues[question.id] as string) === option;
                          return (
                            <label
                              key={option}
                              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer text-sm transition-all border ${
                                isSelected
                                  ? 'bg-indigo-50 dark:bg-indigo-900/40 border-indigo-400 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300'
                                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                              } ${isSubmitted ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                              <input
                                type="radio"
                                name={question.id}
                                value={option}
                                checked={isSelected}
                                onChange={() => updateValue(question.id, option)}
                                disabled={isSubmitted}
                                className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500
                                  disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                              <span className="font-medium">{option}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* Checkboxes - for type="option" + input_type="checkbox" or "multiselect" */}
                    {question.type === 'option' && (question.input_type === 'checkbox' || question.input_type === 'multiselect') && (
                      <div className="space-y-2">
                        {question.options?.map((option) => {
                          const currentValue = formValues[question.id];
                          const isChecked = Array.isArray(currentValue) && currentValue.includes(option);
                          return (
                            <label
                              key={option}
                              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer text-sm transition-all border ${
                                isChecked
                                  ? 'bg-indigo-50 dark:bg-indigo-900/40 border-indigo-400 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300'
                                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                              } ${isSubmitted ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleCheckbox(question.id, option)}
                                disabled={isSubmitted}
                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500
                                  disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                              <span className="font-medium">{option}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* Theme selector - for word_theme, presentation_theme, theme, excel_visualization_theme */}
                    {question.type === 'option' && (
                      question.input_type === 'theme' ||
                      question.input_type === 'word_theme' ||
                      question.input_type === 'presentation_theme' ||
                      question.input_type === 'excel_visualization_theme'
                    ) && (
                      <ThemeSelectorPlaceholder
                        themeType={question.input_type}
                        selectedTheme={(formValues[question.id] as string) || 'auto'}
                        onSelectTheme={(themeId) => updateValue(question.id, themeId)}
                        onApplyTheme={(themeId) => {
                          // Apply theme = submit with selected theme
                          if (onSubmit && !isSubmitted && !isSubmitting) {
                            setIsSubmitting(true);
                            setIsSubmitted(true);
                            const submitValues = {
                              ...formValues,
                              [question.id]: themeId,
                              _selected_themes: JSON.stringify([themeId]),
                            };
                            onSubmit(submitValues).catch((error) => {
                              console.error('Failed to apply theme:', error);
                              setIsSubmitted(false);
                            }).finally(() => setIsSubmitting(false));
                          }
                        }}
                        disabled={isSubmitted}
                      />
                    )}

                    {/* Fallback for unknown option types with options */}
                    {question.type === 'option' &&
                      !['select', 'radio', 'checkbox', 'multiselect', 'theme', 'word_theme', 'presentation_theme', 'excel_visualization_theme'].includes(question.input_type || '') &&
                      question.options && (
                      <select
                        value={(formValues[question.id] as string) || question.default || ''}
                        onChange={(e) => updateValue(question.id, e.target.value)}
                        disabled={isSubmitted}
                        className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                          bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                          focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                          disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">Select an option...</option>
                        {question.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Submit buttons - always show at bottom */}
            <div className="flex justify-center gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  if (onSubmit && !isSubmitted && !isSubmitting) {
                    setIsSubmitting(true);
                    setIsSubmitted(true);
                    // Skip = let agent decide
                    const skipValues = {
                      _selected_themes: JSON.stringify(['auto']),
                      user: 'Please decide the answer by yourself.',
                    };
                    onSubmit(skipValues).catch((error) => {
                      console.error('Failed to skip:', error);
                      setIsSubmitted(false);
                    }).finally(() => setIsSubmitting(false));
                  }
                }}
                disabled={isSubmitted || isSubmitting}
                className="px-6 py-2 text-sm font-medium rounded-lg
                  bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300
                  hover:bg-gray-200 dark:hover:bg-gray-600
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors"
              >
                Skip
              </button>
              <button
                onClick={() => {
                  if (onSubmit && !isSubmitted && !isSubmitting) {
                    setIsSubmitting(true);
                    setIsSubmitted(true);
                    onSubmit(formValues).catch((error) => {
                      console.error('Failed to submit:', error);
                      setIsSubmitted(false);
                    }).finally(() => setIsSubmitting(false));
                  }
                }}
                disabled={isSubmitted || isSubmitting}
                className="px-6 py-2 text-sm font-medium rounded-lg
                  bg-indigo-600 text-white
                  hover:bg-indigo-700
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors"
              >
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Presentation Planner Card (collapsible)
 */
export function PresentationPlannerCard({ xmlCall }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasContent = !!xmlCall.content;

  // Content preview
  const contentPreview = xmlCall.content
    ? xmlCall.content.length > 50
      ? `${xmlCall.content.slice(0, 50)}...`
      : xmlCall.content
    : '';

  return (
    <div className="my-2 rounded-lg border bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700">
      {/* Header */}
      <div
        className={`flex items-center gap-2 px-3 py-2 text-purple-700 dark:text-purple-400 ${hasContent ? 'cursor-pointer' : ''}`}
        onClick={() => hasContent && setIsExpanded(!isExpanded)}
      >
        {hasContent && (
          <button className="p-0.5 -ml-1">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        )}
        <Presentation className="w-5 h-5" />
        <span className="font-medium">Presentation Plan</span>
        {!isExpanded && contentPreview && (
          <span className="text-xs opacity-60 truncate max-w-[200px]" title={xmlCall.content}>
            {contentPreview}
          </span>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && hasContent && (
        <div className="border-t border-purple-200 dark:border-purple-700 px-3 py-2">
          <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {xmlCall.content}
          </div>
        </div>
      )}
    </div>
  );
}

interface DateTimeCardProps extends ToolCallCardProps {
  /** Force completed state (for saved messages) */
  forceCompleted?: boolean;
}

/**
 * DateTime Card - displays current datetime tool call
 * If toolResult exists, shows server-returned time
 * Otherwise shows client UTC time as reference
 */
export function DateTimeCard({ xmlCall, forceCompleted, toolResult }: DateTimeCardProps) {
  // For saved messages, treat as completed even if XML not fully closed
  const isStreaming = forceCompleted ? false : xmlCall.streaming;
  // If toolResult exists, tool execution is complete
  const hasResult = !!toolResult;

  // Extract server time from toolResult
  const serverTime = (() => {
    if (!toolResult?.result) return null;
    const output = toolResult.result;
    if (typeof output === 'object' && output !== null) {
      // Try to extract time info from output object
      const outputObj = output as Record<string, unknown>;
      if (typeof outputObj.datetime === 'string') {
        return outputObj.datetime;
      }
      if (typeof outputObj.utc === 'string') {
        return outputObj.utc;
      }
      if (typeof outputObj.iso === 'string') {
        return outputObj.iso;
      }
      // For ToolResult format, try to extract from result field
      if (typeof outputObj.result === 'string') {
        return outputObj.result;
      }
    }
    if (typeof output === 'string') {
      return output;
    }
    return null;
  })();

  // Format display time
  const displayTime = serverTime
    ? serverTime.slice(0, 16).replace('T', ' ')
    : (() => {
        const now = new Date();
        return now.toISOString().slice(0, 16).replace('T', ' ');
      })();

  // Get current client UTC time as reference display
  const [currentTime, setCurrentTime] = useState(() => displayTime);

  // Update client time every minute if no server time
  useEffect(() => {
    if (serverTime) {
      setCurrentTime(displayTime);
      return;
    }
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toISOString().slice(0, 16).replace('T', ' '));
    }, 60000);
    return () => clearInterval(interval);
  }, [serverTime, displayTime]);

  return (
    <div className={`my-2 rounded-lg border bg-sky-50 dark:bg-sky-900/20 border-sky-300 dark:border-sky-700 ${isStreaming && !hasResult ? 'animate-pulse' : ''}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 text-sky-700 dark:text-sky-400">
        <Clock className="w-5 h-5" />
        <span className="font-medium">Get Current DateTime</span>
        {isStreaming && !hasResult && (
          <Loader2 className="w-3 h-3 animate-spin opacity-70" />
        )}
      </div>

      {/* Content area */}
      <div className="border-t border-sky-200 dark:border-sky-700 px-3 py-3">
        <div className="flex items-center justify-center gap-3">
          {/* Time display */}
          <div className="text-center">
            <div className="text-2xl font-mono text-gray-800 dark:text-gray-200">
              {currentTime}
            </div>
            <div className="flex items-center justify-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1">
              <Globe className="w-3 h-3" />
              <span>{serverTime ? 'UTC (Server)' : 'UTC (Reference)'}</span>
            </div>
          </div>
        </div>

        {/* Status info */}
        <div className="flex items-center justify-center gap-1 mt-3 text-xs">
          {isStreaming && !hasResult ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-sky-500" />
              <span className="text-sky-600 dark:text-sky-400">Fetching server time...</span>
            </>
          ) : hasResult ? (
            <>
              <CheckCircle className="w-3 h-3 text-green-500" />
              <span className="text-green-600 dark:text-green-400">
                {toolResult.success ? 'Time retrieved successfully' : 'Failed to retrieve time'}
              </span>
            </>
          ) : (
            <>
              <CheckCircle className="w-3 h-3 text-green-500" />
              <span className="text-green-600 dark:text-green-400">Tool executed</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface NativeToolCallCardProps {
  toolCall: NativeToolCall;
  toolResult?: ToolResultData;
  /** Whether this tool call is still streaming */
  streaming?: boolean;
}

/**
 * Native Tool Call Card - renders OpenAI-format tool calls from DataPart
 * Uses button style to open detail panel (aligned with main frontend)
 */
export function NativeToolCallCard({ toolCall, toolResult, streaming = false }: NativeToolCallCardProps) {
  const setSelectedToolCall = useSetAtom(selectedToolCallAtom);
  const setSidePanelTab = useSetAtom(sidePanelTabAtom);

  const toolName = toolCall.function?.name || null;
  const Icon = getToolIcon(toolName);
  const colorClass = getToolColor(toolName);
  const args = parseToolArguments(toolCall);
  const humanName = getHumanReadableToolName(toolName);

  // Extract primary param for preview
  const primaryParam = (() => {
    if (args.path) return String(args.path);
    if (args.file_path) return String(args.file_path);
    if (args.command) return String(args.command);
    if (args.query) return String(args.query);
    if (args.url) return String(args.url);
    return null;
  })();

  // Click handler - select tool and switch to tool tab
  const handleClick = useCallback(() => {
    const selectedTool: SelectedToolCall = {
      type: 'native',
      toolName: toolName || 'unknown',
      toolCallId: toolCall.id,
      arguments: args,
      result: toolResult ? {
        success: toolResult.success,
        output: toolResult.result,
      } : undefined,
      streaming,
    };
    setSelectedToolCall(selectedTool);
    setSidePanelTab('tool');
  }, [toolCall, toolName, args, toolResult, streaming, setSelectedToolCall, setSidePanelTab]);

  return (
    <button
      onClick={handleClick}
      className={`my-2 flex items-center gap-2 px-3 py-2 rounded-lg border ${colorClass} ${
        streaming ? 'animate-pulse' : ''
      } hover:opacity-80 transition-all cursor-pointer text-left w-auto max-w-full group`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="font-medium text-sm">{humanName}</span>
      {primaryParam && (
        <span className="text-xs opacity-70 truncate max-w-[200px]" title={primaryParam}>
          {primaryParam}
        </span>
      )}
      {toolResult && (
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          toolResult.success
            ? 'bg-green-200/50 text-green-700 dark:bg-green-900/50 dark:text-green-400'
            : 'bg-red-200/50 text-red-700 dark:bg-red-900/50 dark:text-red-400'
        }`}>
          {toolResult.success ? 'success' : 'failed'}
        </span>
      )}
      {streaming && (
        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
          streaming
        </span>
      )}
      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity flex-shrink-0" />
    </button>
  );
}

/**
 * Native Complete Card - for native tool call "complete" (INLINE, always visible)
 */
export function NativeCompleteCard({ toolCall, toolResult, streaming = false }: NativeToolCallCardProps) {
  const args = parseToolArguments(toolCall);
  const message = args.message as string || '';
  const attachments = args.attachments as string || '';
  const hasContent = message || attachments;

  return (
    <div className="my-3 rounded-xl border bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-green-100/50 dark:bg-green-900/30 border-b border-green-200 dark:border-green-700">
        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
        <span className="font-medium text-green-700 dark:text-green-300">Task Complete</span>
        {streaming && (
          <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Streaming
          </span>
        )}
      </div>

      {/* Content - Always visible */}
      {hasContent && (
        <div className="px-4 py-3">
          {message && (
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {message}
            </p>
          )}
          {attachments && (
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <span className="font-medium">Attachments:</span>
              <span className="bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded">{attachments}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Native Ask Card - for native tool call "ask" (INLINE, always visible)
 */
export function NativeAskCard({ toolCall, streaming = false }: NativeToolCallCardProps) {
  const args = parseToolArguments(toolCall);
  const question = args.question as string || args.message as string || '';
  const hasContent = !!question;

  return (
    <div className="my-3 rounded-xl border bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-yellow-100/50 dark:bg-yellow-900/30 border-b border-yellow-200 dark:border-yellow-700">
        <HelpCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
        <span className="font-medium text-yellow-700 dark:text-yellow-300">Input Required</span>
        {streaming && (
          <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Streaming
          </span>
        )}
      </div>

      {/* Content - Always visible */}
      {hasContent && (
        <div className="px-4 py-3">
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {question}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Native Task Clarify Card - for native tool call "task_clarify" (INLINE form)
 * Renders the same questionnaire form as TaskClarifyCard but from native tool call arguments
 */
export function NativeTaskClarifyCard({ toolCall, toolResult, onSubmit, streaming = false }: NativeToolCallCardProps & {
  onSubmit?: (responses: Record<string, string | string[]>, toolCallId?: string) => Promise<void>;
}) {
  const setSelectedToolCall = useSetAtom(selectedToolCallAtom);
  const setSidePanelTab = useSetAtom(sidePanelTabAtom);
  const [formValues, setFormValues] = useState<Record<string, string | string[]>>({});
  const [isSubmitted, setIsSubmitted] = useState(!!toolResult);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Parse questions from tool arguments
  const args = parseToolArguments(toolCall);
  const questions: Question[] = (() => {
    // Try form_schema first (OpenAI format), then questions
    const questionData = args.form_schema || args.questions || args.form;
    if (!questionData) return [];

    if (typeof questionData === 'string') {
      try {
        const parsed = JSON.parse(questionData);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return Array.isArray(questionData) ? questionData : [];
  })();

  // Click handler to show in right panel
  const handleShowInPanel = useCallback(() => {
    const selectedTool: SelectedToolCall = {
      type: 'native',
      toolName: toolCall.function?.name || 'task-clarify',
      toolCallId: toolCall.id,
      arguments: args,
      result: toolResult ? {
        success: toolResult.success,
        output: toolResult.result,
      } : undefined,
      streaming,
    };
    setSelectedToolCall(selectedTool);
    setSidePanelTab('tool');
  }, [toolCall, args, toolResult, streaming, setSelectedToolCall, setSidePanelTab]);

  // Initialize form default values
  useEffect(() => {
    const defaults: Record<string, string | string[]> = {};
    questions.forEach((q) => {
      if (q.default) {
        defaults[q.id] = q.default;
      } else if (q.input_type === 'checkbox' || q.input_type === 'multiselect') {
        defaults[q.id] = [];
      } else {
        defaults[q.id] = '';
      }
    });
    setFormValues(defaults);
  }, [questions.length]);

  const updateValue = (id: string, value: string | string[]) => {
    setFormValues((prev) => ({ ...prev, [id]: value }));
  };

  const toggleCheckbox = (id: string, option: string) => {
    setFormValues((prev) => {
      const current = prev[id];
      const currentArray = Array.isArray(current) ? current : [];
      const newArray = currentArray.includes(option)
        ? currentArray.filter((v) => v !== option)
        : [...currentArray, option];
      return { ...prev, [id]: newArray };
    });
  };

  // If no questions, show minimal card
  if (questions.length === 0) {
    return (
      <div className="my-3 rounded-xl border bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-indigo-100/50 dark:bg-indigo-900/30">
          <HelpCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <span className="font-medium text-indigo-700 dark:text-indigo-300">Task Clarification</span>
          {streaming && (
            <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading questions...
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={handleShowInPanel}
            className="p-1 rounded hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors"
            title="View in side panel"
          >
            <ExternalLink className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 rounded-xl border bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-indigo-100/50 dark:bg-indigo-900/30 border-b border-indigo-200 dark:border-indigo-700">
        <HelpCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        <span className="font-medium text-indigo-700 dark:text-indigo-300">Task Clarification</span>
        {streaming && (
          <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Streaming
          </span>
        )}
        {isSubmitted && (
          <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
            Submitted
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={handleShowInPanel}
          className="p-1 rounded hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors"
          title="View in side panel"
        >
          <ExternalLink className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
        </button>
      </div>

      {/* Form Content */}
      <div className="px-4 py-4">
        <div className="space-y-5">
          {questions.map((question, index) => (
            <div key={question.id} className="space-y-2">
              {/* Question label */}
              <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
                <span className="text-indigo-600 dark:text-indigo-400 mr-1.5">{index + 1}.</span>
                {question.label}
              </label>

              {/* Description */}
              {question.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 ml-4">{question.description}</p>
              )}

              {/* Form field - same logic as TaskClarifyCard */}
              <div className="ml-4">
                {/* Text input */}
                {question.type === 'input' && (
                  <input
                    type="text"
                    value={(formValues[question.id] as string) || question.default || ''}
                    onChange={(e) => updateValue(question.id, e.target.value)}
                    placeholder={question.default || 'Enter your answer...'}
                    disabled={isSubmitted}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                      bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                      focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                )}

                {/* Dropdown select */}
                {question.type === 'option' && question.input_type === 'select' && (
                  <select
                    value={(formValues[question.id] as string) || question.default || ''}
                    onChange={(e) => updateValue(question.id, e.target.value)}
                    disabled={isSubmitted}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600
                      bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                      focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Select an option...</option>
                    {question.options?.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                )}

                {/* Radio buttons */}
                {question.type === 'option' && question.input_type === 'radio' && (
                  <div className="space-y-2">
                    {question.options?.map((option) => {
                      const isSelected = (formValues[question.id] as string) === option;
                      return (
                        <label
                          key={option}
                          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer text-sm transition-all border ${
                            isSelected
                              ? 'bg-indigo-50 dark:bg-indigo-900/40 border-indigo-400 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300'
                              : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                          } ${isSubmitted ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <input
                            type="radio"
                            name={question.id}
                            value={option}
                            checked={isSelected}
                            onChange={() => updateValue(question.id, option)}
                            disabled={isSubmitted}
                            className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                          />
                          <span className="font-medium">{option}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Checkboxes */}
                {question.type === 'option' && (question.input_type === 'checkbox' || question.input_type === 'multiselect') && (
                  <div className="space-y-2">
                    {question.options?.map((option) => {
                      const currentValue = formValues[question.id];
                      const isChecked = Array.isArray(currentValue) && currentValue.includes(option);
                      return (
                        <label
                          key={option}
                          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer text-sm transition-all border ${
                            isChecked
                              ? 'bg-indigo-50 dark:bg-indigo-900/40 border-indigo-400 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300'
                              : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                          } ${isSubmitted ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCheckbox(question.id, option)}
                            disabled={isSubmitted}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                          />
                          <span className="font-medium">{option}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Theme selector - use same ThemeSelectorPlaceholder as TaskClarifyCard */}
                {question.type === 'option' && (
                  question.input_type === 'theme' ||
                  question.input_type === 'word_theme' ||
                  question.input_type === 'presentation_theme' ||
                  question.input_type === 'excel_visualization_theme'
                ) && (
                  <ThemeSelectorPlaceholder
                    themeType={question.input_type}
                    selectedTheme={(formValues[question.id] as string) || 'auto'}
                    onSelectTheme={(themeId) => updateValue(question.id, themeId)}
                    onApplyTheme={(themeId) => {
                      // Apply theme = submit with selected theme (pass toolCallId for native format)
                      if (onSubmit && !isSubmitted && !isSubmitting) {
                        setIsSubmitting(true);
                        setIsSubmitted(true);
                        const submitValues = {
                          ...formValues,
                          [question.id]: themeId,
                          _selected_themes: JSON.stringify([themeId]),
                        };
                        onSubmit(submitValues, toolCall.id).catch((error) => {
                          console.error('Failed to apply theme:', error);
                          setIsSubmitted(false);
                        }).finally(() => setIsSubmitting(false));
                      }
                    }}
                    disabled={isSubmitted}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Submit buttons - always show at bottom */}
        <div className="flex justify-center gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => {
              if (onSubmit && !isSubmitted && !isSubmitting) {
                setIsSubmitting(true);
                setIsSubmitted(true);
                // Skip = let Societas decide (aligned with main frontend)
                const skipValues = {
                  _selected_themes: JSON.stringify(['auto']),
                  presentation_theme: JSON.stringify(['auto']),
                  word_theme: JSON.stringify(['auto']),
                  user: 'Please decide the answer by yourself.',
                };
                onSubmit(skipValues, toolCall.id).catch((error) => {
                  console.error('Failed to skip:', error);
                  setIsSubmitted(false);
                }).finally(() => setIsSubmitting(false));
              }
            }}
            disabled={isSubmitted || isSubmitting}
            className="px-6 py-2 text-sm font-medium rounded-lg
              bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300
              hover:bg-gray-200 dark:hover:bg-gray-600
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors"
          >
            Let Societas Decide
          </button>
          <button
            onClick={() => {
              if (onSubmit && !isSubmitted && !isSubmitting) {
                setIsSubmitting(true);
                setIsSubmitted(true);
                // Pass toolCallId for native tool call format
                onSubmit(formValues, toolCall.id).catch((error) => {
                  console.error('Failed to submit:', error);
                  setIsSubmitted(false);
                }).finally(() => setIsSubmitting(false));
              }
            }}
            disabled={isSubmitted || isSubmitting}
            className="px-6 py-2 text-sm font-medium rounded-lg
              bg-indigo-600 text-white
              hover:bg-indigo-700
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors"
          >
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
