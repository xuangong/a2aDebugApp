/**
 * A2A HTTP 客户端
 *
 * 实现 A2A 0.3.0 协议的客户端通信
 */

import type {
  A2APart,
  A2ARequest,
  A2AResponse,
  A2AResult,
  A2ASession,
  A2AStreamEvent,
  AgentCard,
  AuthConfig,
} from '../../shared/types';
import { extractContextIdFromResult, isFinalResult } from '../../shared/types';

export interface A2AClientConfig {
  endpoint: string;
  timeout?: number;
  /** 认证配置 */
  auth?: AuthConfig;
}

export class A2AClient {
  private config: A2AClientConfig;
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(config: A2AClientConfig) {
    this.config = config;
  }

  /**
   * 更新认证配置
   */
  updateAuth(auth: AuthConfig | undefined): void {
    this.config.auth = auth;
  }

  /**
   * 构建请求头（包含认证）
   */
  private buildHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...additionalHeaders,
    };

    // 添加 Bearer Token
    if (this.config.auth?.bearerToken) {
      headers['Authorization'] = `Bearer ${this.config.auth.bearerToken}`;
    }

    return headers;
  }

  /**
   * 获取 Agent Card
   * Agent Card 位于 {baseUrl}/.well-known/agent.json
   */
  async getAgentCard(): Promise<AgentCard> {
    // 从 endpoint 提取 baseUrl
    const url = new URL(this.config.endpoint);
    const agentCardUrl = `${url.origin}${url.pathname.replace(/\/$/, '')}/.well-known/agent.json`;

    const response = await fetch(agentCardUrl, {
      method: 'GET',
      headers: this.buildHeaders({ 'Accept': 'application/json' }),
      signal: AbortSignal.timeout(this.config.timeout || 10000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Agent Card: HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * 发送非流式消息
   */
  async send(message: string, session: A2ASession): Promise<A2AResponse> {
    const request = this.buildRequest('message/send', message, session);

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.config.timeout || 30000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * 发送流式消息
   */
  async *stream(
    message: string,
    session: A2ASession
  ): AsyncGenerator<A2AStreamEvent> {
    const request = this.buildRequest('message/stream', message, session);
    const abortController = new AbortController();
    this.abortControllers.set(session.conversationId, abortController);

    console.log('[A2A] Starting stream request:', {
      endpoint: this.config.endpoint,
      contextId: session.contextId,
    });

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(request),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // SSE 流解析
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let contextId: string | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // 处理 buffer 中剩余的数据
          if (buffer.trim()) {
            const event = buffer.trim();
            if (event.startsWith('data: ')) {
              const jsonStr = event.slice(6);
              try {
                const parsed = JSON.parse(jsonStr);
                const data: A2AResult = parsed.result || parsed;
                // 提取 contextId（支持 message 和 status-update 两种格式）
                const extractedContextId = extractContextIdFromResult(data);
                if (extractedContextId) {
                  contextId = extractedContextId;
                }
                yield { type: 'chunk', data };
              } catch {
                // ignore parse errors in remaining buffer
              }
            }
          }
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // SSE 事件使用双换行符分隔 (可以是 \r\n\r\n, \n\n, 或 \r\r)
        const events = buffer.split(/\r\n\r\n|\n\n|\r\r/);
        buffer = events.pop() || '';

        for (const event of events) {
          const trimmedEvent = event.trim();
          if (!trimmedEvent.startsWith('data: ')) continue;

          const jsonStr = trimmedEvent.slice(6);
          try {
            const parsed = JSON.parse(jsonStr);

            // SSE 数据可能是完整的 JSON-RPC 响应或直接的 result
            const data: A2AResult = parsed.result || parsed;

            // 提取 contextId（支持 message 和 status-update 两种格式）
            const extractedContextId = extractContextIdFromResult(data);
            if (extractedContextId) {
              contextId = extractedContextId;
            }

            yield { type: 'chunk', data };

            // 检查是否为最终消息（使用辅助函数支持两种格式）
            if (isFinalResult(data)) {
              yield { type: 'complete', contextId };
              return;
            }
          } catch (parseError) {
            console.error('[A2A] Failed to parse SSE data:', parseError);
          }
        }
      }

      yield { type: 'complete', contextId };
    } catch (error) {
      console.error('[A2A] Stream error:', error);
      if ((error as Error).name === 'AbortError') {
        yield { type: 'error', error: { code: -32000, message: 'Request cancelled' } };
      } else {
        yield { type: 'error', error: { code: -32603, message: (error as Error).message } };
      }
    } finally {
      this.abortControllers.delete(session.conversationId);
    }
  }

  /**
   * 取消流式请求
   */
  cancel(conversationId: string): void {
    const controller = this.abortControllers.get(conversationId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(conversationId);
    }
  }

  /**
   * 构建 A2A 请求
   */
  private buildRequest(
    method: 'message/send' | 'message/stream',
    text: string,
    session: A2ASession
  ): A2ARequest {
    return this.buildRequestWithParts(
      method,
      [{ kind: 'text', type: 'text', text }],
      session,
    );
  }

  /**
   * 构建带有自定义 Parts 数组的 A2A 请求
   * 支持 TextPart, DataPart, FilePart 的任意组合
   */
  private buildRequestWithParts(
    method: 'message/send' | 'message/stream',
    parts: A2APart[],
    session: A2ASession
  ): A2ARequest {
    // 构建 metadata（如果有 accountId）
    const metadata = this.config.auth?.accountId
      ? { accountId: this.config.auth.accountId }
      : undefined;

    return {
      jsonrpc: '2.0',
      method,
      params: {
        message: {
          role: 'user',
          kind: 'message',
          messageId: crypto.randomUUID(),
          parts,
          // contextId must be inside message object per A2A protocol
          ...(session.contextId && { contextId: session.contextId }),
          // taskId for continuing input-required tasks
          ...(session.taskId && { taskId: session.taskId }),
        },
        ...(metadata && { metadata }),
      },
      id: `req-${Date.now()}`,
    };
  }
}
