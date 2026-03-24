/**
 * 简化的 XML 解析器，用于解析 agent 响应中的工具调用
 */

export interface XmlCall {
  name: string;
  toolCallId: string;
  attributes: Record<string, string>;
  content: string;
  offsetInText: number;
  rawXml: string;
}

// 注册的工具标签
const REGISTERED_TAGS = new Set([
  'ask',
  'complete',
  'create-file',
  'delete-file',
  'read-file',
  'str-replace',
  'full-file-rewrite',
  'execute-command',
  'task-clarify',
  'webapp-clarify',
  'mobileapp-clarify',
  'presentation-planner',
  'web-search',
  'enterprise-search',
  'create-webapp',
  'create-mobileapp',
  'deploy-webapp',
  'preview-webapp',
  'preview-mobileapp',
  'git-clone',
  'git-commit',
  'git-push',
  'git-status',
  'get-current-datetime',
  'get-financial-data',
]);

/**
 * 解析文本中的 XML 工具调用
 */
export function parseXmlCalls(text: string): { cleanText: string; xmlCalls: XmlCall[] } {
  const xmlCalls: XmlCall[] = [];
  let cleanText = text;

  // 匹配 XML 标签的正则表达式
  // 支持自闭合标签和带内容的标签
  const tagPattern = /<(\w[\w-]*)\s*([^>]*?)\s*(?:\/>|>([\s\S]*?)<\/\1>)/g;

  let match;
  while ((match = tagPattern.exec(text)) !== null) {
    const [fullMatch, tagName, attributesStr, content] = match;

    // 只处理注册的标签
    if (!REGISTERED_TAGS.has(tagName)) {
      continue;
    }

    // 解析属性
    const attributes: Record<string, string> = {};
    const attrPattern = /(\w[\w-_]*)=["']([^"']*)["']/g;
    let attrMatch;
    while ((attrMatch = attrPattern.exec(attributesStr)) !== null) {
      attributes[attrMatch[1]] = attrMatch[2];
    }

    // 提取 tool_call_id
    const toolCallId = attributes['_tool_call_id'] || attributes['tool_call_id'] || `tool-${Date.now()}-${xmlCalls.length}`;

    xmlCalls.push({
      name: tagName,
      toolCallId,
      attributes,
      content: content?.trim() || '',
      offsetInText: match.index,
      rawXml: fullMatch,
    });
  }

  // 从 cleanText 中移除所有匹配的 XML 标签
  // 需要按偏移量从后向前移除，避免索引变化
  const sortedCalls = [...xmlCalls].sort((a, b) => b.offsetInText - a.offsetInText);
  for (const call of sortedCalls) {
    cleanText = cleanText.substring(0, call.offsetInText) + cleanText.substring(call.offsetInText + call.rawXml.length);
  }

  return { cleanText, xmlCalls };
}

/**
 * 获取工具的人类可读名称
 */
export function getHumanReadableToolName(tagName: string | null | undefined): string {
  if (!tagName) {
    return 'Unknown Tool';
  }

  const nameMap: Record<string, string> = {
    'ask': 'Ask User',
    'complete': 'Complete',
    'create-file': 'Create File',
    'delete-file': 'Delete File',
    'read-file': 'Read File',
    'str-replace': 'Edit File',
    'full-file-rewrite': 'Rewrite File',
    'execute-command': 'Run Command',
    'task-clarify': 'Clarify Task',
    'webapp-clarify': 'Web App Setup',
    'mobileapp-clarify': 'Mobile App Setup',
    'presentation-planner': 'Presentation Plan',
    'web-search': 'Web Search',
    'enterprise-search': 'Enterprise Search',
    'create-webapp': 'Create Web App',
    'create-mobileapp': 'Create Mobile App',
    'deploy-webapp': 'Deploy Web App',
    'preview-webapp': 'Preview Web App',
    'preview-mobileapp': 'Preview Mobile App',
    'git-clone': 'Git Clone',
    'git-commit': 'Git Commit',
    'git-push': 'Git Push',
    'git-status': 'Git Status',
    'get-current-datetime': 'Get DateTime',
    'get-financial-data': 'Get Financial Data',
  };

  return nameMap[tagName] || tagName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * 提取主要参数用于显示
 */
export function extractPrimaryParam(xmlCall: XmlCall): string | null {
  const { name, attributes, content } = xmlCall;

  switch (name) {
    case 'create-file':
    case 'delete-file':
    case 'read-file':
      return attributes['file_path'] || attributes['file_name'] || null;
    case 'str-replace':
    case 'full-file-rewrite':
      return attributes['file_path'] || null;
    case 'execute-command':
      return attributes['command'] || content.slice(0, 50) || null;
    case 'web-search':
    case 'enterprise-search': {
      // 优先使用 query 属性
      if (attributes['query']) {
        return attributes['query'];
      }
      // 尝试解析 JSON 数组格式的查询列表
      if (content) {
        try {
          const queries = JSON.parse(content);
          if (Array.isArray(queries) && queries.length > 0) {
            // 显示第一个查询，加上总数提示
            const firstQuery = String(queries[0]);
            if (queries.length > 1) {
              return `${firstQuery} (+${queries.length - 1} more)`;
            }
            return firstQuery;
          }
        } catch {
          // 不是 JSON，直接截取显示
        }
        return content.slice(0, 50);
      }
      return null;
    }
    case 'git-clone':
      return attributes['url'] || attributes['repo'] || null;
    case 'git-commit':
      return attributes['message'] || null;
    case 'complete':
    case 'ask':
      return attributes['attachments'] || null;
    default:
      return null;
  }
}
