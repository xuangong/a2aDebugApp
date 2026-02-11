/**
 * XML 流式解析器 - 简化版
 * 用于解析 Agent 响应中的 XML 工具调用标签
 * 移植自 frontend/src/lib/xml-streaming-parser.ts
 */

enum ParseState {
  TEXT,
  TAG,
  SELF_CLOSING_TAG,
  ATTRIBUTE_NAME,
  ATTRIBUTE_CONTENT,
  ATTRIBUTE_CONTENT_QUOTED,
  ATTRIBUTE_CONTENT_UNQUOTED,
  CONTENT,
  CLOSING_TAG,
}

export interface XmlCall {
  /** Tag name, e.g., "create-file" */
  name: string;
  /** Tool call ID from _tool_call_id attribute */
  toolCallId: string;
  /** Content between opening and closing tags */
  content: string;
  /** All attributes */
  attributes: Record<string, string>;
  /** Position in the original text (for interleaving with markdown) */
  offsetInText: number;
  /** Whether this call is still being streamed */
  streaming: boolean;
  /** Raw XML string */
  rawXml: string;
}

interface ParseContext {
  parseState: ParseState;
  tagName: string;
  attributes: Record<string, string>;
  content: string;
  currentXmlStartPos?: number;
  currentAttributeName?: string;
  currentAttributeQuoteChar?: string;
  isEscaped: boolean;
  closingTagBuffer: string;
}

/** 注册的工具标签名 - 从 frontend 移植 */
const REGISTERED_TAGS: string[] = [
  "ask",
  "complete",
  "content-review",
  "content-review-batch",
  "excel-content-review",
  "crawl-webpage",
  "create-batch-slides",
  "read-batch-files",
  "delete-batch-files",
  "batch-str-replace",
  "create-file",
  "delete-file",
  "deploy-staticpage",
  "enterprise-search",
  "excel-addin-embedder",
  "find-titan-templates",
  "generate-titan-sql",
  "setup-excel-workspace",
  "establish-connection",
  "execute-command",
  "execute-data-provider-call",
  "execute-slide",
  "execute-titan-query",
  "expose-port",
  "full-file-rewrite",
  "get-app-downloads",
  "get-app-ratings",
  "get-current-datetime",
  "get-enterprise-document",
  "get-financial-data",
  "get-dashboard-details",
  "get-data-provider-endpoints",
  "get-supported-apps",
  "git-add",
  "git-clone",
  "git-commit",
  "git-create-pr",
  "git-create-repo",
  "git-push",
  "git-status",
  "local-browser-event",
  "parallel-execute-slides",
  "presentation-planner",
  "suggested-storylines",
  "browser-research-select",
  "read-file",
  "run-subagent",
  "search-dashboards",
  "search-images",
  "send-email",
  "search-news",
  "get-news-details",
  "start-mobileapp-dev-server",
  "start-webapp-dev-server",
  "stop-webapp-dev-server",
  "str-replace",
  "delete-workflow",
  "list-saved-workflows",
  "save-workflow",
  "task-clarify",
  "workflow-edit",
  "web-search",
  "webapp-clarify",
  "list-available-connectors",
  "load-skill",
  "browser-navigate-to",
  "browser-screenshot",
  "browser-act",
  "browser-extract-content",
  "query-data-from-connector",
  "rewrite-query",
  "crawl-images",
  "browser-operator",
];

const WHITESPACE_REGEX = /\s/;

/**
 * XML 流式解析器
 * 使用基于栈的状态机来解析流式 XML 数据
 */
export class XmlStreamingParser {
  private registeredTags: Set<string> = new Set();
  private parsedXmlCalls: XmlCall[] = [];
  private buffer: string = "";
  private position: number = 0;
  private textContent: string = "";
  private context: ParseContext = {
    parseState: ParseState.TEXT,
    attributes: {},
    content: "",
    tagName: "",
    currentXmlStartPos: 0,
    currentAttributeName: "",
    currentAttributeQuoteChar: "",
    isEscaped: false,
    closingTagBuffer: "",
  };

  public constructor(xmlTags: string[] = REGISTERED_TAGS) {
    this.registeredTags = new Set(xmlTags);
  }

  public addText(text: string) {
    this.buffer += text;
    this.parseBuffer();
  }

  public getParsedXmlCalls(): XmlCall[] {
    return [...this.parsedXmlCalls];
  }

  public getText(): string {
    return this.textContent;
  }

  public getParsingXmlCall(): XmlCall | undefined {
    if (this.registeredTags.has(this.context.tagName)) {
      const attributes = { ...this.context.attributes };

      // 如果正在解析属性名，添加到 attributes
      if (this.context.currentAttributeName) {
        attributes[this.context.currentAttributeName] =
          attributes[this.context.currentAttributeName] || "";
      }

      // 计算正在解析的 XML 片段
      const rawXml = this.buffer.slice(
        this.context.currentXmlStartPos!,
        this.position
      );

      return {
        name: this.context.tagName,
        toolCallId: this.context.attributes["_tool_call_id"] || "",
        content: this.context.content,
        attributes: attributes,
        offsetInText: this.context.currentXmlStartPos!,
        streaming: true,
        rawXml: rawXml,
      };
    }

    return undefined;
  }

  private parseBuffer() {
    while (this.position < this.buffer.length) {
      switch (this.context.parseState) {
        case ParseState.TEXT:
          this.parseText();
          break;
        case ParseState.TAG:
          this.parseTag();
          break;
        case ParseState.SELF_CLOSING_TAG:
          this.parseSelfClosingTag();
          break;
        case ParseState.CONTENT:
          this.parseContent();
          break;
        case ParseState.ATTRIBUTE_NAME:
          this.parseAttributeName();
          break;
        case ParseState.ATTRIBUTE_CONTENT:
          this.parseAttributeContent();
          break;
        case ParseState.ATTRIBUTE_CONTENT_QUOTED:
          this.parseAttributeContentQuoted();
          break;
        case ParseState.ATTRIBUTE_CONTENT_UNQUOTED:
          this.parseAttributeContentUnquoted();
          break;
        case ParseState.CLOSING_TAG:
          this.parseClosingTag();
          break;
      }
    }
  }

  private parseText() {
    const nextTagStart = this.buffer.indexOf("<", this.position);
    if (nextTagStart === -1) {
      this.textContent += this.buffer.slice(this.position);
      this.position = this.buffer.length;
    } else {
      this.textContent += this.buffer.slice(this.position, nextTagStart);
      this.position = nextTagStart + 1;
      this.context.parseState = ParseState.TAG;
      this.context.currentXmlStartPos = nextTagStart;
    }
  }

  private prefixOfRegisteredTag(buffer: string): boolean {
    return Array.from(this.registeredTags).some((tag) =>
      tag.startsWith(buffer)
    );
  }

  private parseTag() {
    while (
      this.position < this.buffer.length &&
      !this.registeredTags.has(this.context.tagName)
    ) {
      const tagName = this.context.tagName + this.buffer[this.position];
      if (!this.prefixOfRegisteredTag(tagName)) {
        this.textContent += this.buffer.slice(
          this.context.currentXmlStartPos,
          this.position
        );
        this.context.tagName = "";
        this.context.parseState = ParseState.TEXT;
        return;
      }
      this.context.tagName = tagName;
      this.position++;
    }

    if (this.registeredTags.has(this.context.tagName)) {
      if (this.position >= this.buffer.length) {
        return;
      }

      if (WHITESPACE_REGEX.test(this.buffer[this.position])) {
        this.context.parseState = ParseState.ATTRIBUTE_NAME;
      } else if (this.buffer[this.position] === "/") {
        this.context.parseState = ParseState.SELF_CLOSING_TAG;
      } else if (this.buffer[this.position] === ">") {
        this.context.parseState = ParseState.CONTENT;
      } else {
        this.context.tagName += this.buffer[this.position];
      }
      this.position++;
      return;
    }
  }

  private parseSelfClosingTag() {
    if (this.position >= this.buffer.length) {
      return;
    }
    if (this.buffer[this.position] === ">") {
      if (this.registeredTags.has(this.context.tagName)) {
        const rawXml = this.buffer.slice(
          this.context.currentXmlStartPos!,
          this.position + 1
        );
        this.parsedXmlCalls.push({
          name: this.context.tagName,
          toolCallId: this.context.attributes["_tool_call_id"] || "",
          content: this.context.content,
          attributes: { ...this.context.attributes },
          offsetInText: this.context.currentXmlStartPos!,
          streaming: false,
          rawXml: rawXml,
        });
      } else {
        this.textContent += this.buffer.slice(
          this.context.currentXmlStartPos,
          this.position + 1
        );
      }
      this.resetContext();
      this.position++;
    } else {
      // 不是自闭合标签，回退到 TEXT
      this.textContent += this.buffer.slice(
        this.context.currentXmlStartPos,
        this.position
      );
      this.context.tagName = "";
      this.context.parseState = ParseState.TEXT;
    }
  }

  private parseContent() {
    while (this.position < this.buffer.length) {
      const char = this.buffer[this.position];
      if (char === "<") {
        this.context.parseState = ParseState.CLOSING_TAG;
        this.context.closingTagBuffer = "";
        this.position++;
        return;
      }
      this.context.content += char;
      this.position++;
    }
  }

  private parseClosingTag() {
    while (this.position < this.buffer.length) {
      const char = this.buffer[this.position];

      // 特殊处理：遇到新的 '<' 时，说明当前闭合标签不正确
      // 需要检查是否是新的注册标签开始
      if (char === '<') {
        // 先把之前累积的错误闭合标签加回 content
        this.context.content += "<" + this.context.closingTagBuffer;
        this.context.closingTagBuffer = "";

        // 开始检查新标签
        this.context.parseState = ParseState.CLOSING_TAG;
        this.position++;
        return;
      }

      this.context.closingTagBuffer += char;
      this.position++;

      // 检查是否是正确的闭合标签
      const expectedClosingTag = `/${this.context.tagName}>`;
      if (this.context.closingTagBuffer === expectedClosingTag) {
        // 完成解析
        const rawXml = this.buffer.slice(
          this.context.currentXmlStartPos!,
          this.position
        );
        this.parsedXmlCalls.push({
          name: this.context.tagName,
          toolCallId: this.context.attributes["_tool_call_id"] || "",
          content: this.context.content,
          attributes: { ...this.context.attributes },
          offsetInText: this.context.currentXmlStartPos!,
          streaming: false,
          rawXml: rawXml,
        });
        this.resetContext();
        return;
      }

      // 检查是否不可能是闭合标签
      if (!expectedClosingTag.startsWith(this.context.closingTagBuffer)) {
        // 检查是否是另一个注册的标签开始
        // closingTagBuffer 不包含开头的 '<'，所以我们需要检查它是否是另一个注册标签的开头
        const potentialNewTag = this.context.closingTagBuffer;

        // 检查是否是完整的注册标签名后跟着空格、>、/ 或换行
        // 例如 "web-search " 或 "ask>" 是有效的，但 "a " 不是（因为没有注册标签叫 "a"）
        if (this.isCompleteRegisteredTag(potentialNewTag)) {
          // 是新的注册标签，隐式关闭当前标签
          // 保存当前未完成的标签（streaming = true）
          const rawXml = this.buffer.slice(
            this.context.currentXmlStartPos!,
            this.position - this.context.closingTagBuffer.length - 1 // 不包括 '<' 和 closingTagBuffer
          );
          this.parsedXmlCalls.push({
            name: this.context.tagName,
            toolCallId: this.context.attributes["_tool_call_id"] || "",
            content: this.context.content,
            attributes: { ...this.context.attributes },
            offsetInText: this.context.currentXmlStartPos!,
            streaming: true, // 标记为流式（未正确关闭）
            rawXml: rawXml,
          });

          // 回退 position 到新标签的开始位置（'<' 之后）
          this.position = this.position - this.context.closingTagBuffer.length;

          // 重置 context 并开始解析新标签
          this.context = {
            parseState: ParseState.TAG,
            attributes: {},
            content: "",
            tagName: "",
            currentXmlStartPos: this.position - 1, // '<' 的位置
            currentAttributeName: "",
            currentAttributeQuoteChar: "",
            isEscaped: false,
            closingTagBuffer: "",
          };
          return;
        }

        // 检查是否还可能成为注册标签（继续累积）
        if (this.isRegisteredTagPrefix(potentialNewTag)) {
          // 继续累积，不做任何处理
          continue;
        }

        // 不是闭合标签也不是新的注册标签，将已解析的内容加回 content
        this.context.content += "<" + this.context.closingTagBuffer;
        this.context.closingTagBuffer = "";
        this.context.parseState = ParseState.CONTENT;
        return;
      }
    }
  }

  /**
   * 检查给定字符串是否是一个完整的注册标签名后跟终止字符
   * 例如 "web-search " 或 "ask>" 返回 true
   * 但 "a " 或 "we" 返回 false
   */
  private isCompleteRegisteredTag(buffer: string): boolean {
    if (buffer.startsWith('/')) {
      return false;
    }

    // 检查 buffer 是否以注册标签名开头，后面跟着空格、>、/ 或换行
    for (const tag of this.registeredTags) {
      if (buffer.startsWith(tag)) {
        const nextChar = buffer[tag.length];
        if (nextChar === undefined) {
          // buffer 正好是标签名，没有后续字符，继续等待
          return false;
        }
        // 标签名后面必须跟着空格、>、/ 或换行才算完整
        if (WHITESPACE_REGEX.test(nextChar) || nextChar === '>' || nextChar === '/') {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 检查给定字符串是否是某个注册标签的前缀
   */
  private isRegisteredTagPrefix(prefix: string): boolean {
    // 需要检查的是不以 '/' 开头的标签（非闭合标签）
    if (prefix.startsWith('/')) {
      return false;
    }
    return Array.from(this.registeredTags).some((tag) =>
      tag.startsWith(prefix)
    );
  }

  private parseAttributeName() {
    while (this.position < this.buffer.length) {
      const char = this.buffer[this.position];

      if (char === ">") {
        this.context.parseState = ParseState.CONTENT;
        this.position++;
        return;
      }

      if (char === "/") {
        this.context.parseState = ParseState.SELF_CLOSING_TAG;
        this.position++;
        return;
      }

      if (char === "=") {
        this.context.parseState = ParseState.ATTRIBUTE_CONTENT;
        this.position++;
        return;
      }

      if (WHITESPACE_REGEX.test(char)) {
        // 跳过空白
        if (this.context.currentAttributeName) {
          // 已有属性名，但没有值
          this.context.attributes[this.context.currentAttributeName] = "";
          this.context.currentAttributeName = "";
        }
        this.position++;
        continue;
      }

      this.context.currentAttributeName =
        (this.context.currentAttributeName || "") + char;
      this.position++;
    }
  }

  private parseAttributeContent() {
    if (this.position >= this.buffer.length) {
      return;
    }

    const char = this.buffer[this.position];
    if (char === '"' || char === "'") {
      this.context.currentAttributeQuoteChar = char;
      this.context.parseState = ParseState.ATTRIBUTE_CONTENT_QUOTED;
      this.context.attributes[this.context.currentAttributeName!] = "";
      this.position++;
    } else if (!WHITESPACE_REGEX.test(char)) {
      this.context.parseState = ParseState.ATTRIBUTE_CONTENT_UNQUOTED;
      this.context.attributes[this.context.currentAttributeName!] = "";
    } else {
      this.position++;
    }
  }

  private parseAttributeContentQuoted() {
    while (this.position < this.buffer.length) {
      const char = this.buffer[this.position];

      if (this.context.isEscaped) {
        this.context.attributes[this.context.currentAttributeName!] += char;
        this.context.isEscaped = false;
        this.position++;
        continue;
      }

      if (char === "\\") {
        this.context.isEscaped = true;
        this.position++;
        continue;
      }

      if (char === this.context.currentAttributeQuoteChar) {
        this.context.currentAttributeName = "";
        this.context.currentAttributeQuoteChar = "";
        this.context.parseState = ParseState.ATTRIBUTE_NAME;
        this.position++;
        return;
      }

      this.context.attributes[this.context.currentAttributeName!] += char;
      this.position++;
    }
  }

  private parseAttributeContentUnquoted() {
    while (this.position < this.buffer.length) {
      const char = this.buffer[this.position];

      if (WHITESPACE_REGEX.test(char) || char === ">" || char === "/") {
        this.context.currentAttributeName = "";
        this.context.parseState = ParseState.ATTRIBUTE_NAME;
        return;
      }

      this.context.attributes[this.context.currentAttributeName!] += char;
      this.position++;
    }
  }

  private resetContext() {
    this.context = {
      parseState: ParseState.TEXT,
      attributes: {},
      content: "",
      tagName: "",
      currentAttributeName: "",
      currentAttributeQuoteChar: "",
      isEscaped: false,
      closingTagBuffer: "",
    };
  }
}

/**
 * 解析文本内容中的 XML 调用
 * @param text 要解析的文本
 * @returns 解析结果，包含纯文本和 XML 调用列表
 */
export function parseXmlContent(text: string): {
  plainText: string;
  xmlCalls: XmlCall[];
  parsingXmlCall?: XmlCall;
} {
  const parser = new XmlStreamingParser();
  parser.addText(text);

  return {
    plainText: parser.getText(),
    xmlCalls: parser.getParsedXmlCalls(),
    parsingXmlCall: parser.getParsingXmlCall(),
  };
}
