/**
 * 工具调用卡片组件
 * 用于在渲染视图中显示 XML 工具调用
 */

import { useState, useEffect } from 'react';
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
  Copy,
  Check,
  Loader2,
} from 'lucide-react';
import type { XmlCall } from '../lib/xml-streaming-parser';
import type { ToolResultData } from '../../shared/types';
import { getHumanReadableToolName, extractPrimaryParam } from '../lib/xml-parser';

interface ToolCallCardProps {
  xmlCall: XmlCall;
  /** 强制显示为已完成状态（用于已保存的消息） */
  forceCompleted?: boolean;
  /** 工具执行结果（通过 tool_call_id 匹配） */
  toolResult?: ToolResultData;
}

interface TaskClarifyCardProps extends ToolCallCardProps {
  /** 提交表单时的回调 */
  onSubmit?: (responses: Record<string, string | string[]>) => Promise<void>;
}

// 根据工具名称获取图标
function getToolIcon(toolName: string) {
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

  return iconMap[toolName] || Globe;
}

// 获取工具类型的颜色
function getToolColor(toolName: string): string {
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

  return colorMap[toolName] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-300 dark:border-gray-600';
}

export function ToolCallCard({ xmlCall, forceCompleted }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const Icon = getToolIcon(xmlCall.name);
  const toolName = getHumanReadableToolName(xmlCall.name);
  const paramDisplay = extractPrimaryParam(xmlCall);
  const colorClass = getToolColor(xmlCall.name);
  const isStreaming = forceCompleted ? false : xmlCall.streaming;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(xmlCall.rawXml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasContent = xmlCall.content && xmlCall.content.length > 0;
  const hasAttributes = Object.keys(xmlCall.attributes).filter(k => !k.startsWith('_')).length > 0;
  const isExpandable = hasContent || hasAttributes;

  return (
    <div className={`my-2 rounded-lg border ${colorClass} ${isStreaming ? 'animate-pulse' : ''}`}>
      {/* 头部 */}
      <div
        className={`flex items-center gap-2 px-3 py-2 ${isExpandable ? 'cursor-pointer' : ''}`}
        onClick={() => isExpandable && setIsExpanded(!isExpanded)}
      >
        {isExpandable && (
          <button className="p-0.5 -ml-1">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        )}
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
        <div className="flex-1" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopy();
          }}
          className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors"
          title="Copy raw XML"
        >
          {copied ? (
            <Check className="w-3 h-3 text-green-500" />
          ) : (
            <Copy className="w-3 h-3 opacity-50" />
          )}
        </button>
      </div>

      {/* 展开的内容 */}
      {isExpanded && (
        <div className="border-t border-current/20 px-3 py-2 space-y-2">
          {/* 属性 */}
          {hasAttributes && (
            <div className="space-y-1">
              <div className="text-xs font-medium opacity-70">Attributes:</div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                {Object.entries(xmlCall.attributes)
                  .filter(([key]) => !key.startsWith('_'))
                  .map(([key, value]) => (
                    <div key={key} className="flex gap-1">
                      <span className="opacity-60">{key}:</span>
                      <span className="truncate" title={value}>{value}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* 内容 */}
          {hasContent && (
            <div className="space-y-1">
              <div className="text-xs font-medium opacity-70">Content:</div>
              <pre className="text-xs bg-black/10 dark:bg-white/10 p-2 rounded overflow-x-auto max-h-48">
                <code>{xmlCall.content}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Complete 卡片 - 显示完成信息和附件（可折叠）
 */
export function CompleteCard({ xmlCall }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const attachments = xmlCall.attributes['attachments'];
  const hasContent = xmlCall.content || attachments;

  // 内容预览（截取前 50 个字符）
  const contentPreview = xmlCall.content
    ? xmlCall.content.length > 50
      ? `${xmlCall.content.slice(0, 50)}...`
      : xmlCall.content
    : '';

  return (
    <div className="my-2 rounded-lg border bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700">
      {/* 头部 - 可点击折叠 */}
      <div
        className={`flex items-center gap-2 px-3 py-2 text-green-700 dark:text-green-400 ${hasContent ? 'cursor-pointer' : ''}`}
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
        <CheckCircle className="w-5 h-5" />
        <span className="font-medium">Task Complete</span>
        {!isExpanded && contentPreview && (
          <span className="text-xs opacity-60 truncate max-w-[200px]" title={xmlCall.content}>
            {contentPreview}
          </span>
        )}
      </div>

      {/* 展开的内容 */}
      {isExpanded && hasContent && (
        <div className="border-t border-green-200 dark:border-green-700 px-3 py-2">
          {xmlCall.content && (
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {xmlCall.content}
            </p>
          )}
          {attachments && (
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              <span className="font-medium">Attachments:</span> {attachments}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Ask 卡片 - 显示询问信息（可折叠）
 */
export function AskCard({ xmlCall }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasContent = !!xmlCall.content;

  // 内容预览
  const contentPreview = xmlCall.content
    ? xmlCall.content.length > 50
      ? `${xmlCall.content.slice(0, 50)}...`
      : xmlCall.content
    : '';

  return (
    <div className="my-2 rounded-lg border bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700">
      {/* 头部 */}
      <div
        className={`flex items-center gap-2 px-3 py-2 text-yellow-700 dark:text-yellow-400 ${hasContent ? 'cursor-pointer' : ''}`}
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
        <HelpCircle className="w-5 h-5" />
        <span className="font-medium">Input Required</span>
        {!isExpanded && contentPreview && (
          <span className="text-xs opacity-60 truncate max-w-[200px]" title={xmlCall.content}>
            {contentPreview}
          </span>
        )}
      </div>

      {/* 展开的内容 */}
      {isExpanded && hasContent && (
        <div className="border-t border-yellow-200 dark:border-yellow-700 px-3 py-2">
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {xmlCall.content}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Question 接口 - 定义任务澄清问题的结构
 */
interface Question {
  id: string;
  type: 'input' | 'option';
  label: string;
  default?: string;
  options?: string[];
  input_type?: 'text' | 'select' | 'radio' | 'checkbox' | 'multiselect';
  description?: string;
}

/**
 * Task Clarify 卡片 - 显示任务澄清表单（可折叠）
 * 解析 JSON 格式的问题列表并渲染交互式表单
 */
export function TaskClarifyCard({ xmlCall, onSubmit, toolResult }: TaskClarifyCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string | string[]>>({});
  // 如果有 toolResult，说明已经提交过了
  const [isSubmitted, setIsSubmitted] = useState(!!toolResult);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 解析问题列表
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

  // 初始化表单默认值
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

  // 更新表单值
  const updateValue = (id: string, value: string | string[]) => {
    setFormValues((prev) => ({ ...prev, [id]: value }));
  };

  // 切换 checkbox 值
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

  const hasContent = questions.length > 0 || !!xmlCall.content;

  // 生成预览文本
  const previewText = questions.length > 0
    ? `${questions.length} questions`
    : xmlCall.content
      ? (xmlCall.content.length > 40 ? `${xmlCall.content.slice(0, 40)}...` : xmlCall.content)
      : '';

  return (
    <div className="my-2 rounded-lg border bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700">
      {/* 头部 - 可折叠 */}
      <div
        className={`flex items-center gap-2 px-3 py-2 text-indigo-700 dark:text-indigo-400 ${hasContent ? 'cursor-pointer' : ''}`}
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
        <HelpCircle className="w-5 h-5" />
        <span className="font-medium">Task Clarification</span>
        {!isExpanded && previewText && (
          <span className="text-xs opacity-60 truncate max-w-[200px]">
            {previewText}
          </span>
        )}
      </div>

      {/* 展开的内容 */}
      {isExpanded && hasContent && (
        <div className="border-t border-indigo-200 dark:border-indigo-700 px-3 py-3">
          {questions.length === 0 ? (
            // 非 JSON 格式，显示原始内容
            <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {xmlCall.content}
            </div>
          ) : (
            // JSON 格式，渲染表单
            <>
              {/* 问题列表 */}
              <div className="space-y-4">
                {questions.map((question, index) => (
                  <div key={question.id} className="space-y-2">
                    {/* 问题标签 */}
                    <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">
                      <span className="text-indigo-600 dark:text-indigo-400 mr-1">{index + 1}.</span>
                      {question.label}
                    </label>

                    {/* 描述 */}
                    {question.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{question.description}</p>
                    )}

                    {/* 表单字段 */}
                    {question.type === 'input' ? (
                      // 文本输入
                      <input
                        type="text"
                        value={(formValues[question.id] as string) || question.default || ''}
                        onChange={(e) => updateValue(question.id, e.target.value)}
                        placeholder={question.default || 'Enter your answer...'}
                        disabled={isSubmitted}
                        className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600
                          bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                          focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                          disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    ) : question.input_type === 'select' ? (
                      // 下拉选择
                      <select
                        value={(formValues[question.id] as string) || question.default || ''}
                        onChange={(e) => updateValue(question.id, e.target.value)}
                        disabled={isSubmitted}
                        className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600
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
                    ) : question.input_type === 'radio' ? (
                      // 单选按钮
                      <div className="space-y-2">
                        {question.options?.map((option) => (
                          <label
                            key={option}
                            className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300"
                          >
                            <input
                              type="radio"
                              name={question.id}
                              value={option}
                              checked={(formValues[question.id] as string) === option}
                              onChange={() => updateValue(question.id, option)}
                              disabled={isSubmitted}
                              className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500
                                disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            {option}
                          </label>
                        ))}
                      </div>
                    ) : question.input_type === 'checkbox' || question.input_type === 'multiselect' ? (
                      // 多选复选框
                      <div className="space-y-2">
                        {question.options?.map((option) => {
                          const currentValue = formValues[question.id];
                          const isChecked = Array.isArray(currentValue) && currentValue.includes(option);
                          return (
                            <label
                              key={option}
                              className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleCheckbox(question.id, option)}
                                disabled={isSubmitted}
                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500
                                  disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                              {option}
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      // 默认：下拉选择（当有 options 时）或文本输入
                      question.options ? (
                        <select
                          value={(formValues[question.id] as string) || question.default || ''}
                          onChange={(e) => updateValue(question.id, e.target.value)}
                          disabled={isSubmitted}
                          className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600
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
                      ) : (
                        <input
                          type="text"
                          value={(formValues[question.id] as string) || question.default || ''}
                          onChange={(e) => updateValue(question.id, e.target.value)}
                          placeholder={question.default || 'Enter your answer...'}
                          disabled={isSubmitted}
                          className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600
                            bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                            focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                            disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      )
                    )}
                  </div>
                ))}
              </div>

              {/* 按钮区域 */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-indigo-200 dark:border-indigo-700">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {isSubmitted ? '✓ Form submitted' : (onSubmit ? 'Fill in and submit to continue' : 'Form preview (read-only)')}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsSubmitted(false); setFormValues({}); }}
                    disabled={isSubmitting}
                    className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200
                      hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                  >
                    Reset
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (onSubmit && !isSubmitted && !isSubmitting) {
                        setIsSubmitting(true);
                        try {
                          // 立即标记为已提交，不等待流式响应完成
                          setIsSubmitted(true);
                          // 异步提交，不阻塞 UI
                          onSubmit(formValues).catch((error) => {
                            console.error('Failed to submit task clarify:', error);
                            // 如果提交失败，回滚状态
                            setIsSubmitted(false);
                          });
                        } finally {
                          setIsSubmitting(false);
                        }
                      } else if (!onSubmit) {
                        // Demo mode
                        setIsSubmitted(true);
                      }
                    }}
                    disabled={isSubmitted || isSubmitting}
                    className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700
                      disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSubmitting ? 'Submitting...' : (isSubmitted ? 'Submitted' : 'Submit')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Presentation Planner 卡片（可折叠）
 */
export function PresentationPlannerCard({ xmlCall }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasContent = !!xmlCall.content;

  // 内容预览
  const contentPreview = xmlCall.content
    ? xmlCall.content.length > 50
      ? `${xmlCall.content.slice(0, 50)}...`
      : xmlCall.content
    : '';

  return (
    <div className="my-2 rounded-lg border bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700">
      {/* 头部 */}
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

      {/* 展开的内容 */}
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
  /** 强制显示为已完成状态（用于已保存的消息） */
  forceCompleted?: boolean;
}

/**
 * DateTime 卡片 - 显示当前日期时间工具调用
 * 如果有 toolResult，显示服务器返回的实际时间
 * 否则显示客户端 UTC 时间作为参考
 */
export function DateTimeCard({ xmlCall, forceCompleted, toolResult }: DateTimeCardProps) {
  // 如果是已保存的消息，即使 XML 未完全闭合也认为已完成
  const isStreaming = forceCompleted ? false : xmlCall.streaming;
  // 如果有 toolResult，则表示工具已执行完成
  const hasResult = !!toolResult;

  // 从 toolResult 提取服务器时间
  const serverTime = (() => {
    if (!toolResult?.output) return null;
    const output = toolResult.output;
    if (typeof output === 'object' && output !== null) {
      // 尝试从 output 对象中提取时间信息
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
      // 如果是 ToolResult 格式，尝试从 output 字段提取
      if (typeof outputObj.output === 'string') {
        return outputObj.output;
      }
    }
    if (typeof output === 'string') {
      return output;
    }
    return null;
  })();

  // 格式化显示时间
  const displayTime = serverTime
    ? serverTime.slice(0, 16).replace('T', ' ')
    : (() => {
        const now = new Date();
        return now.toISOString().slice(0, 16).replace('T', ' ');
      })();

  // 获取当前客户端 UTC 时间作为参考显示
  const [currentTime, setCurrentTime] = useState(() => displayTime);

  // 如果没有服务器时间，每分钟更新一次客户端时间
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
      {/* 头部 */}
      <div className="flex items-center gap-2 px-3 py-2 text-sky-700 dark:text-sky-400">
        <Clock className="w-5 h-5" />
        <span className="font-medium">Get Current DateTime</span>
        {isStreaming && !hasResult && (
          <Loader2 className="w-3 h-3 animate-spin opacity-70" />
        )}
      </div>

      {/* 内容区域 */}
      <div className="border-t border-sky-200 dark:border-sky-700 px-3 py-3">
        <div className="flex items-center justify-center gap-3">
          {/* 时间显示 */}
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

        {/* 状态信息 */}
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
