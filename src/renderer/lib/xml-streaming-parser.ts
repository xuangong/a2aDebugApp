/**
 * XML Streaming Parser - Simplified
 * Parses XML tool call tags in Agent responses
 * Ported from frontend/src/lib/xml-streaming-parser.ts
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

/** Registered tool tag names - ported from frontend */
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
 * XML Streaming Parser
 * Uses a stack-based state machine to parse streaming XML data
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

      // If parsing attribute name, add to attributes
      if (this.context.currentAttributeName) {
        attributes[this.context.currentAttributeName] =
          attributes[this.context.currentAttributeName] || "";
      }

      // Calculate the XML fragment being parsed
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
      // Not a self-closing tag, fall back to TEXT
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

      // Special handling: encountering a new '<' means current closing tag is incorrect
      // Need to check if this is the start of a new registered tag
      if (char === '<') {
        // First add back the accumulated incorrect closing tag to content
        this.context.content += "<" + this.context.closingTagBuffer;
        this.context.closingTagBuffer = "";

        // Start checking new tag
        this.context.parseState = ParseState.CLOSING_TAG;
        this.position++;
        return;
      }

      this.context.closingTagBuffer += char;
      this.position++;

      // Check if this is the correct closing tag
      const expectedClosingTag = `/${this.context.tagName}>`;
      if (this.context.closingTagBuffer === expectedClosingTag) {
        // Parsing complete
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

      // Check if it cannot be a closing tag
      if (!expectedClosingTag.startsWith(this.context.closingTagBuffer)) {
        // Check if this is the start of another registered tag
        // closingTagBuffer doesn't include the leading '<', so we need to check if it's the start of another registered tag
        const potentialNewTag = this.context.closingTagBuffer;

        // Check if it's a complete registered tag name followed by space, >, /, or newline
        // e.g., "web-search " or "ask>" are valid, but "a " is not (no registered tag named "a")
        if (this.isCompleteRegisteredTag(potentialNewTag)) {
          // New registered tag, implicitly close current tag
          // Save current incomplete tag (streaming = true)
          const rawXml = this.buffer.slice(
            this.context.currentXmlStartPos!,
            this.position - this.context.closingTagBuffer.length - 1 // Excluding '<' and closingTagBuffer
          );
          this.parsedXmlCalls.push({
            name: this.context.tagName,
            toolCallId: this.context.attributes["_tool_call_id"] || "",
            content: this.context.content,
            attributes: { ...this.context.attributes },
            offsetInText: this.context.currentXmlStartPos!,
            streaming: true, // Marked as streaming (not properly closed)
            rawXml: rawXml,
          });

          // Reset position to the start of new tag (after '<')
          this.position = this.position - this.context.closingTagBuffer.length;

          // Reset context and start parsing new tag
          this.context = {
            parseState: ParseState.TAG,
            attributes: {},
            content: "",
            tagName: "",
            currentXmlStartPos: this.position - 1, // Position of '<'
            currentAttributeName: "",
            currentAttributeQuoteChar: "",
            isEscaped: false,
            closingTagBuffer: "",
          };
          return;
        }

        // Check if it could still become a registered tag (continue accumulating)
        if (this.isRegisteredTagPrefix(potentialNewTag)) {
          // Continue accumulating, no action needed
          continue;
        }

        // Not a closing tag nor a new registered tag, add parsed content back to content
        this.context.content += "<" + this.context.closingTagBuffer;
        this.context.closingTagBuffer = "";
        this.context.parseState = ParseState.CONTENT;
        return;
      }
    }
  }

  /**
   * Check if the given string is a complete registered tag name followed by a terminator
   * e.g., "web-search " or "ask>" returns true
   * but "a " or "we" returns false
   */
  private isCompleteRegisteredTag(buffer: string): boolean {
    if (buffer.startsWith('/')) {
      return false;
    }

    // Check if buffer starts with a registered tag name followed by space, >, /, or newline
    for (const tag of this.registeredTags) {
      if (buffer.startsWith(tag)) {
        const nextChar = buffer[tag.length];
        if (nextChar === undefined) {
          // Buffer is exactly the tag name with no trailing char, keep waiting
          return false;
        }
        // Tag name must be followed by space, >, /, or newline to be complete
        if (WHITESPACE_REGEX.test(nextChar) || nextChar === '>' || nextChar === '/') {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if the given string is a prefix of a registered tag
   */
  private isRegisteredTagPrefix(prefix: string): boolean {
    // Check tags that don't start with '/' (non-closing tags)
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
        // Skip whitespace
        if (this.context.currentAttributeName) {
          // Has attribute name but no value
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
 * Parse XML calls from text content
 * @param text The text to parse
 * @returns Parse result containing plain text and XML call list
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
