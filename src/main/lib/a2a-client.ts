/**
 * A2A HTTP Client
 *
 * Implements A2A 0.3.0 protocol client communication
 * Uses Electron net module to ensure network requests work after packaging
 */

import { net } from 'electron';
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
  /** Auth config */
  auth?: AuthConfig;
  /** Feature flags (x-fd-features header value) */
  featureFlags?: string;
}

export class A2AClient {
  private config: A2AClientConfig;
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(config: A2AClientConfig) {
    this.config = config;
  }

  /**
   * Update auth config
   */
  updateAuth(auth: AuthConfig | undefined): void {
    this.config.auth = auth;
  }

  /**
   * Update feature flags config
   */
  updateFeatureFlags(flags: string | undefined): void {
    this.config.featureFlags = flags;
  }

  /**
   * Build request headers (including auth)
   */
  private buildHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
    const featureFlags = this.config.featureFlags || 'enableA2A&enableNativeToolCall';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-fd-features': featureFlags,
      ...additionalHeaders,
    };

    // Add Bearer Token
    if (this.config.auth?.bearerToken) {
      headers['Authorization'] = `Bearer ${this.config.auth.bearerToken}`;
    }

    return headers;
  }

  /**
   * Get Agent Card
   * Agent Card is located at {baseUrl}/.well-known/agent.json
   */
  async getAgentCard(): Promise<AgentCard> {
    // Extract baseUrl from endpoint
    const url = new URL(this.config.endpoint);
    const agentCardUrl = `${url.origin}${url.pathname.replace(/\/$/, '')}/.well-known/agent.json`;

    const headers = this.buildHeaders({ 'Accept': 'application/json' });
    console.log('[A2A Debug] getAgentCard URL:', agentCardUrl);
    console.log('[A2A Debug] getAgentCard headers:', {
      ...headers,
      Authorization: headers.Authorization ? `Bearer ${headers.Authorization.substring(7, 30)}...` : 'NOT SET',
    });

    // Use Electron's net.fetch for better compatibility in packaged apps
    const response = await net.fetch(agentCardUrl, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Agent Card: HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Send non-streaming message
   */
  async send(message: string, session: A2ASession): Promise<A2AResponse> {
    const request = this.buildRequest('message/send', message, session);

    // Use Electron's net.fetch for better compatibility in packaged apps
    const response = await net.fetch(this.config.endpoint, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Send streaming message
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
      // Use Electron's net.fetch for better compatibility in packaged apps
      const response = await net.fetch(this.config.endpoint, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // SSE stream parsing
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let contextId: string | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Process remaining data in buffer
          if (buffer.trim()) {
            const event = buffer.trim();
            if (event.startsWith('data: ')) {
              const jsonStr = event.slice(6);
              try {
                const parsed = JSON.parse(jsonStr);
                const data: A2AResult = parsed.result || parsed;
                // Extract contextId (supports both message and status-update formats)
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

        // SSE events are separated by double newlines (\r\n\r\n, \n\n, or \r\r)
        const events = buffer.split(/\r\n\r\n|\n\n|\r\r/);
        buffer = events.pop() || '';

        for (const event of events) {
          const trimmedEvent = event.trim();
          if (!trimmedEvent.startsWith('data: ')) continue;

          const jsonStr = trimmedEvent.slice(6);
          try {
            const parsed = JSON.parse(jsonStr);

            // SSE data may be a complete JSON-RPC response or a direct result
            const data: A2AResult = parsed.result || parsed;

            // Extract contextId (supports both message and status-update formats)
            const extractedContextId = extractContextIdFromResult(data);
            if (extractedContextId) {
              contextId = extractedContextId;
            }

            yield { type: 'chunk', data };

            // Check if this is the final message (using helper for both formats)
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
   * Cancel streaming request
   */
  cancel(conversationId: string): void {
    const controller = this.abortControllers.get(conversationId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(conversationId);
    }
  }

  /**
   * Build A2A request
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
   * Build A2A request with custom Parts array
   * Supports any combination of TextPart, DataPart, FilePart
   */
  private buildRequestWithParts(
    method: 'message/send' | 'message/stream',
    parts: A2APart[],
    session: A2ASession
  ): A2ARequest {
    // Build metadata (if accountId present)
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
