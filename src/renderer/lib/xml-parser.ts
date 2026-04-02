/**
 * Simplified XML parser for parsing tool calls in agent responses
 */

export interface XmlCall {
  name: string;
  toolCallId: string;
  attributes: Record<string, string>;
  content: string;
  offsetInText: number;
  rawXml: string;
}

// Registered tool tags
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
 * Parse XML tool calls from text
 */
export function parseXmlCalls(text: string): { cleanText: string; xmlCalls: XmlCall[] } {
  const xmlCalls: XmlCall[] = [];
  let cleanText = text;

  // Regex for matching XML tags
  // Supports self-closing tags and tags with content
  const tagPattern = /<(\w[\w-]*)\s*([^>]*?)\s*(?:\/>|>([\s\S]*?)<\/\1>)/g;

  let match;
  while ((match = tagPattern.exec(text)) !== null) {
    const [fullMatch, tagName, attributesStr, content] = match;

    // Only process registered tags
    if (!REGISTERED_TAGS.has(tagName)) {
      continue;
    }

    // Parse attributes
    const attributes: Record<string, string> = {};
    const attrPattern = /(\w[\w-_]*)=["']([^"']*)["']/g;
    let attrMatch;
    while ((attrMatch = attrPattern.exec(attributesStr)) !== null) {
      attributes[attrMatch[1]] = attrMatch[2];
    }

    // Extract tool_call_id
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

  // Remove all matched XML tags from cleanText
  // Remove from back to front by offset to avoid index shifts
  const sortedCalls = [...xmlCalls].sort((a, b) => b.offsetInText - a.offsetInText);
  for (const call of sortedCalls) {
    cleanText = cleanText.substring(0, call.offsetInText) + cleanText.substring(call.offsetInText + call.rawXml.length);
  }

  return { cleanText, xmlCalls };
}

/**
 * Get human-readable name for tool
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
 * Extract primary parameters for display
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
      // Prefer query attribute
      if (attributes['query']) {
        return attributes['query'];
      }
      // Try parsing JSON array format query list
      if (content) {
        try {
          const queries = JSON.parse(content);
          if (Array.isArray(queries) && queries.length > 0) {
            // Show first query with total count hint
            const firstQuery = String(queries[0]);
            if (queries.length > 1) {
              return `${firstQuery} (+${queries.length - 1} more)`;
            }
            return firstQuery;
          }
        } catch {
          // Not JSON, truncate and display directly
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
