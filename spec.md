# A2A Debug App 规格文档

> 一个用于调试 Societas A2A 协议接口的 Electron 桌面应用

## 1. 项目概述

### 1.1 目标

构建一个 Electron Chat 应用，用于：
- 测试和调试 Societas 后端的 A2A 协议接口
- 支持 Raw 格式和渲染格式双重展示响应数据
- 保存完整的请求/响应历史记录，用于回放调试

### 1.2 核心功能

| 功能 | 描述 | 优先级 |
|------|------|--------|
| **Chat 交互** | 类似 Proma 的聊天界面 | P0 |
| **A2A 协议通信** | 支持 message/send 和 message/stream | P0 |
| **历史记录** | 保存对话历史，支持回放 | P0 |
| **双重渲染** | Raw JSON + 渲染视图切换 | P1 |
| **流式响应** | SSE 实时流式显示 | P0 |

---

## 2. 参考项目

### 2.1 Proma (主要参考)

**路径**: `/Users/zhangxian/projects/Proma`

**参考内容**:

| 方面 | 参考文件 | 说明 |
|------|----------|------|
| **项目结构** | `apps/electron/` | Monorepo 架构，Electron + React + Vite |
| **构建配置** | `package.json`, `electron-builder.yml` | Bun + esbuild + Vite 混合构建 |
| **状态管理** | `src/renderer/atoms/chat-atoms.ts` | Jotai 原子状态管理 |
| **Chat UI** | `src/renderer/components/chat/` | 消息列表、输入框、流式渲染 |
| **历史存储** | `src/main/lib/conversation-manager.ts` | JSONL 格式本地存储 |
| **IPC 通信** | `src/main/ipc.ts`, `src/preload/index.ts` | 主进程/渲染进程通信 |
| **流式渲染** | `packages/ui/src/hooks/useSmoothStream.ts` | 平滑流式文本渲染 |

**Proma 关键架构**:

```
Proma/
├── apps/electron/
│   ├── src/
│   │   ├── main/           # Electron 主进程
│   │   │   ├── index.ts    # 应用入口
│   │   │   ├── ipc.ts      # IPC 处理器
│   │   │   └── lib/
│   │   │       ├── chat-service.ts          # 聊天服务（SSE 处理）
│   │   │       └── conversation-manager.ts  # 对话管理（JSONL 存储）
│   │   ├── preload/        # 预加载脚本
│   │   └── renderer/       # React 渲染进程
│   │       ├── atoms/      # Jotai 状态
│   │       └── components/
│   │           └── chat/   # Chat 组件
│   ├── package.json
│   ├── vite.config.ts
│   └── electron-builder.yml
├── packages/
│   ├── core/               # 核心逻辑（SSE 解析）
│   ├── shared/             # 共享类型
│   └── ui/                 # 复用组件（useSmoothStream）
└── package.json            # Workspace 配置
```

**历史记录存储格式 (JSONL)**:

```
~/.proma/
├── conversations.json      # 对话索引
└── conversations/
    └── {uuid}.jsonl       # 消息记录
```

```jsonl
{"id":"msg-1","role":"user","content":"Hello","createdAt":1234567890}
{"id":"msg-2","role":"assistant","content":"Hi!","model":"claude-3","createdAt":1234567891}
```

### 2.2 Societas Frontend (渲染参考)

**路径**: `/Users/zhangxian/projects/Societas.a2a_integration/frontend`

**参考内容**:

| 方面 | 参考文件 | 说明 |
|------|----------|------|
| **消息渲染** | `src/features/message-renderer/` | 消息组件架构 |
| **Markdown** | `src/components/fluent/markdown.tsx` | react-markdown + remark-gfm |
| **工具调用** | `src/lib/markdown-helpers.tsx` | XML 工具调用解析和渲染 |

**消息渲染流程**:

```
UnifiedMessage[] → groupMessages() → MessageGroup[] → MessageGroupComponent
                                                        ├─ UserMessage
                                                        └─ AssistantGroup
                                                            └─ AssistantMessage
                                                                └─ Markdown 渲染
```

### 2.3 Societas Backend A2A (协议参考)

**路径**: `/Users/zhangxian/projects/Societas.a2a_integration/backend`

**参考文件**:
- `A2A-Agent-Service-Integration-Guide.md` - 协议详细说明
- `office_a2a/` - A2A 实现模块
  - `executor.py` - AgentExecutor 实现，展示消息解析和响应格式
  - `session.py` - 会话管理，展示 contextId 的使用方式
  - `config.py` - 配置管理
  - `server.py` - A2A 应用工厂

**关键实现参考** (来自当前 repo 的修改):

1. **A2A SDK Part 对象结构**:
   ```python
   # Part 对象使用 discriminated union 模式
   # 实际内容在 part.root 下，不是直接在 part 上
   for part in message.parts:
       # TextPart: part.root.text
       if hasattr(part, "root") and hasattr(part.root, "text"):
           text = part.root.text
       # FilePart: part.root.file.bytes (base64)
       if hasattr(part, "root") and hasattr(part.root, "file"):
           file_data = part.root.file
           name = file_data.name
           content = base64.b64decode(file_data.bytes)
   ```

2. **contextId 会话管理**:
   - `contextId` 用于维护多轮对话的上下文
   - 客户端应在首次请求时获取 `contextId`，后续请求携带
   - 服务端通过 `contextId` 找到对应的对话线程

---

## 3. 开发原则

### 3.1 架构原则

| 原则 | 说明 |
|------|------|
| **模仿 Proma** | 项目结构、构建配置、交互模式尽量与 Proma 保持一致 |
| **本地优先** | 所有数据存储在本地，无需后端服务（除被调试的 A2A 服务） |
| **单一职责** | 专注于 A2A 调试，不添加无关功能 |
| **渐进增强** | 先实现 Raw 展示，再添加渲染功能 |

### 3.2 技术栈选择

| 技术 | 选择 | 理由 |
|------|------|------|
| **运行时** | Bun | 与 Proma 保持一致，更快的构建速度 |
| **框架** | Electron + React | 与 Proma 保持一致 |
| **构建** | Vite (renderer) + esbuild (main) | 与 Proma 保持一致 |
| **状态管理** | Jotai | 与 Proma 保持一致，轻量原子状态 |
| **样式** | Tailwind CSS | 与 Proma 保持一致 |
| **Markdown** | react-markdown + remark-gfm | 与 frontend 保持一致 |

### 3.3 开发优先级

1. **P0 - 核心功能**
   - Chat 界面基础框架
   - A2A message/send 和 message/stream 通信
   - 历史记录保存和加载

2. **P1 - 增强功能**
   - Raw/Rendered 视图切换
   - Markdown 渲染
   - 流式平滑渲染

3. **P2 - 调试功能**
   - 请求/响应详情查看
   - 历史记录回放
   - 错误详情展示

---

## 4. 数据结构

### 4.1 消息格式

```typescript
// 用户消息
interface UserMessage {
  id: string;                    // UUID
  role: 'user';
  content: string;               // 用户输入
  createdAt: number;             // 时间戳
}

// 助手消息
interface AssistantMessage {
  id: string;                    // UUID
  role: 'assistant';
  content: string;               // 渲染内容
  rawResponse: A2AResponse;      // 原始 A2A 响应（用于 Raw 视图）
  createdAt: number;
  streaming?: boolean;           // 是否为流式消息
}

// A2A 原始响应
interface A2AResponse {
  jsonrpc: '2.0';
  id: string;
  result?: {
    kind: 'message';
    role: 'agent';
    messageId: string;
    parts: Array<{
      kind: 'text' | 'file';
      text?: string;
      file?: { name: string; mimeType: string; data: string };
    }>;
    final?: boolean;
  };
  error?: {
    code: number;
    message: string;
  };
}

// 对话
interface Conversation {
  id: string;                    // UUID
  title: string;
  createdAt: number;
  updatedAt: number;
  endpoint: string;              // A2A 服务端点
}
```

### 4.2 存储格式

```
~/.a2a-debug-app/
├── config.json                  # 应用配置
│   {
│     "defaultEndpoint": "http://localhost:8000/a2a/",
│     "theme": "dark"
│   }
├── conversations.json           # 对话索引
│   {
│     "version": 1,
│     "conversations": [
│       {"id": "...", "title": "...", "endpoint": "...", ...}
│     ]
│   }
└── conversations/
    └── {uuid}.jsonl            # 消息记录（包含原始响应）
```

---

## 5. A2A 协议通信

### 5.1 协议版本

本应用作为 **A2A 客户端**，需要遵循 A2A 0.3.0 协议规范：

| 特性 | A2A 0.3.0 规范 |
|------|----------------|
| **Part discriminator** | 使用 `kind` (同时兼容 `type`) |
| **Message 元字段** | 包含 `kind: "message"`, `messageId` |
| **流式方法** | `message/stream` |
| **响应格式** | SSE (`data: {...}\n\n`) |

### 5.2 支持的方法

| 方法 | 说明 | 响应类型 | 优先级 |
|------|------|----------|--------|
| `message/send` | 非流式消息 | JSON | P0 必须 |
| `message/stream` | 流式消息 | SSE | P0 必须 |

### 5.3 请求格式

#### 基础请求结构

```typescript
interface A2ARequest {
  jsonrpc: '2.0';
  method: 'message/send' | 'message/stream';
  params: {
    message: A2AMessage;
    contextId?: string;        // 会话上下文 ID（多轮对话）
  };
  id: string;                  // 请求 ID
}

interface A2AMessage {
  role: 'user';
  kind: 'message';             // A2A 0.3.0 必须
  messageId: string;           // UUID
  parts: A2APart[];
}

// Part 使用 discriminated union
type A2APart = A2ATextPart | A2AFilePart;

interface A2ATextPart {
  kind: 'text';                // 推荐同时包含 type: 'text' 以兼容旧版
  type?: 'text';
  text: string;
}

interface A2AFilePart {
  kind: 'file';
  type?: 'file';
  file: {
    name: string;
    mimeType: string;
    bytes: string;             // Base64 编码
  };
}
```

#### 示例请求

```json
{
  "jsonrpc": "2.0",
  "method": "message/stream",
  "params": {
    "message": {
      "role": "user",
      "kind": "message",
      "messageId": "550e8400-e29b-41d4-a716-446655440000",
      "parts": [
        {
          "kind": "text",
          "type": "text",
          "text": "帮我创建一个项目提案文档"
        }
      ]
    },
    "contextId": "ctx-12345"
  },
  "id": "req-001"
}
```

### 5.4 响应格式

#### 非流式响应 (message/send)

```typescript
interface A2AResponse {
  jsonrpc: '2.0';
  id: string;
  result?: A2AResult;
  error?: A2AError;
}

interface A2AResult {
  kind: 'message';
  role: 'agent';
  messageId: string;
  parts: A2APart[];
  contextId?: string;          // 服务端返回的上下文 ID
}

interface A2AError {
  code: number;                // JSON-RPC 错误码
  message: string;
}
```

#### 流式响应 (message/stream)

响应头:
```http
Content-Type: text/event-stream
Cache-Control: no-cache
```

响应体 (SSE 格式):
```
data: {"kind":"message","role":"agent","messageId":"msg-001","parts":[{"kind":"text","text":"正在处理..."}]}

data: {"kind":"message","role":"agent","messageId":"msg-002","parts":[{"kind":"text","text":"处理完成"}],"final":true}

```

**SSE 解析规则**:
- 每行以 `data: ` 开头
- 每个事件以 `\n\n` (两个换行) 结尾
- 最后一个事件包含 `"final": true`

### 5.5 A2A 客户端实现

#### 核心类型定义

```typescript
// src/main/lib/a2a-types.ts

export interface A2AClientConfig {
  endpoint: string;
  timeout?: number;            // 默认 30000ms
}

export interface A2ASession {
  contextId: string | null;    // 首次请求后获得
  conversationId: string;      // 本地对话 ID
}

// 流式事件类型
export type A2AStreamEvent =
  | { type: 'chunk'; data: A2AResult }
  | { type: 'complete'; contextId?: string }
  | { type: 'error'; error: A2AError };
```

#### A2A HTTP 客户端

```typescript
// src/main/lib/a2a-client.ts
// 参考: Societas backend office_a2a/executor.py

export class A2AClient {
  private config: A2AClientConfig;
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(config: A2AClientConfig) {
    this.config = config;
  }

  /**
   * 发送非流式消息
   */
  async send(message: string, session: A2ASession): Promise<A2AResponse> {
    const request = this.buildRequest('message/send', message, session);

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
   * 参考: Proma packages/core/src/sse/sse-parser.ts
   */
  async *stream(
    message: string,
    session: A2ASession
  ): AsyncGenerator<A2AStreamEvent> {
    const request = this.buildRequest('message/stream', message, session);
    const abortController = new AbortController();
    this.abortControllers.set(session.conversationId, abortController);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          if (!event.startsWith('data: ')) continue;

          const jsonStr = event.slice(6);
          const data = JSON.parse(jsonStr) as A2AResult;

          // 提取 contextId（用于后续请求）
          if (data.contextId) {
            contextId = data.contextId;
          }

          yield { type: 'chunk', data };

          // 检查是否为最终消息
          if ((data as any).final) {
            yield { type: 'complete', contextId };
            return;
          }
        }
      }

      yield { type: 'complete', contextId };
    } catch (error) {
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
   * 参考: A2A-Agent-Service-Integration-Guide.md
   */
  private buildRequest(
    method: 'message/send' | 'message/stream',
    text: string,
    session: A2ASession
  ): A2ARequest {
    return {
      jsonrpc: '2.0',
      method,
      params: {
        message: {
          role: 'user',
          kind: 'message',
          messageId: crypto.randomUUID(),
          parts: [
            {
              kind: 'text',
              type: 'text',  // 兼容旧版
              text,
            },
          ],
        },
        // 只有在有 contextId 时才包含
        ...(session.contextId && { contextId: session.contextId }),
      },
      id: `req-${Date.now()}`,
    };
  }
}
```

### 5.6 会话管理 (contextId)

参考 `Societas backend office_a2a/session.py`:

```typescript
// src/main/lib/session-manager.ts

export class SessionManager {
  private sessions: Map<string, A2ASession> = new Map();

  /**
   * 获取或创建会话
   */
  getOrCreate(conversationId: string): A2ASession {
    let session = this.sessions.get(conversationId);
    if (!session) {
      session = {
        contextId: null,  // 首次请求后从响应中获取
        conversationId,
      };
      this.sessions.set(conversationId, session);
    }
    return session;
  }

  /**
   * 更新 contextId（从响应中获取）
   */
  updateContextId(conversationId: string, contextId: string): void {
    const session = this.sessions.get(conversationId);
    if (session && !session.contextId) {
      session.contextId = contextId;
    }
  }

  /**
   * 删除会话
   */
  delete(conversationId: string): void {
    this.sessions.delete(conversationId);
  }
}
```

### 5.7 错误处理

遵循 JSON-RPC 2.0 标准错误码:

| 错误码 | 含义 | 处理方式 |
|--------|------|----------|
| `-32700` | Parse error | 显示 JSON 解析错误 |
| `-32600` | Invalid request | 显示请求格式错误 |
| `-32601` | Method not found | 显示不支持的方法 |
| `-32602` | Invalid params | 显示参数错误 |
| `-32603` | Internal error | 显示服务器内部错误 |
| `-32000` | 自定义错误 | 显示具体错误信息 |

```typescript
// 错误处理示例
function handleA2AError(error: A2AError): string {
  const errorMessages: Record<number, string> = {
    [-32700]: '服务器无法解析请求',
    [-32600]: '请求格式无效',
    [-32601]: '不支持的方法',
    [-32602]: '参数无效',
    [-32603]: '服务器内部错误',
  };

  return errorMessages[error.code] || error.message;
}
```

### 5.8 调试功能支持

为了支持调试目的，需要完整保存请求/响应数据:

```typescript
// 调试记录结构
interface DebugRecord {
  timestamp: number;

  // 请求信息
  request: {
    endpoint: string;
    method: string;
    body: A2ARequest;
  };

  // 响应信息
  response: {
    status: number;
    headers: Record<string, string>;
    body: A2AResponse | A2AResult[];  // 非流式 | 流式事件数组
    timing: {
      start: number;
      firstByte?: number;    // 流式首字节时间
      complete: number;
    };
  };

  // 错误信息（如果有）
  error?: {
    type: 'network' | 'parse' | 'protocol';
    message: string;
    stack?: string;
  };
}
```

---

## 6. UI 组件结构

### 6.1 主要组件

```
App
├── Sidebar                      # 对话列表
│   ├── ConversationList
│   └── NewConversationButton
├── ChatView                     # 聊天主区域
│   ├── ChatHeader               # 标题 + 端点配置
│   ├── ChatMessages             # 消息列表
│   │   ├── UserMessage
│   │   └── AssistantMessage
│   │       ├── RawView          # JSON 原始数据
│   │       └── RenderedView     # Markdown 渲染
│   └── ChatInput                # 输入框
└── SettingsDialog               # 设置对话框
```

### 6.2 状态管理 (Jotai Atoms)

```typescript
// 对话管理
export const conversationsAtom = atom<Conversation[]>([]);
export const currentConversationIdAtom = atom<string | null>(null);
export const currentMessagesAtom = atom<Message[]>([]);

// 流式状态
export const streamingAtom = atom(false);
export const streamingContentAtom = atom('');

// UI 状态
export const viewModeAtom = atom<'raw' | 'rendered'>('rendered');
export const endpointAtom = atom('http://localhost:8000/a2a/');
```

---

## 7. IPC 通信

### 7.1 渲染进程 → 主进程

| Channel | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `a2a:send` | `{ endpoint, message }` | `A2AResponse` | 发送非流式消息 |
| `a2a:stream` | `{ endpoint, message }` | `void` | 开始流式消息 |
| `a2a:stop` | `{ conversationId }` | `void` | 停止流式 |
| `conversations:list` | `void` | `Conversation[]` | 获取对话列表 |
| `conversations:create` | `{ title, endpoint }` | `Conversation` | 创建对话 |
| `conversations:delete` | `{ id }` | `void` | 删除对话 |
| `messages:list` | `{ conversationId }` | `Message[]` | 获取消息列表 |
| `messages:save` | `{ conversationId, message }` | `void` | 保存消息 |

### 7.2 主进程 → 渲染进程 (流式事件)

| Channel | 数据 | 说明 |
|---------|------|------|
| `a2a:stream:chunk` | `{ conversationId, data }` | 流式数据块 |
| `a2a:stream:complete` | `{ conversationId }` | 流式完成 |
| `a2a:stream:error` | `{ conversationId, error }` | 流式错误 |

---

## 8. 项目结构

```
a2aDebugApp/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts             # 应用入口
│   │   ├── ipc.ts               # IPC 处理器
│   │   └── lib/
│   │       ├── a2a-client.ts    # A2A HTTP 客户端
│   │       ├── conversation-manager.ts  # 对话管理
│   │       └── message-store.ts # 消息存储
│   ├── preload/
│   │   └── index.ts             # 预加载脚本
│   └── renderer/                # React 渲染进程
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       ├── atoms/               # Jotai 状态
│       │   └── chat-atoms.ts
│       ├── components/
│       │   ├── chat/
│       │   │   ├── ChatView.tsx
│       │   │   ├── ChatMessages.tsx
│       │   │   ├── ChatInput.tsx
│       │   │   ├── UserMessage.tsx
│       │   │   └── AssistantMessage.tsx
│       │   ├── sidebar/
│       │   │   └── Sidebar.tsx
│       │   └── ui/              # 基础 UI 组件
│       ├── hooks/
│       │   └── useSmoothStream.ts
│       └── lib/
│           └── markdown.tsx     # Markdown 渲染
├── package.json
├── tsconfig.json
├── vite.config.ts
├── electron-builder.yml
└── spec.md                      # 本文档
```

---

## 9. 开发计划

### Phase 1: 基础框架 (P0)

- [ ] 项目初始化（参考 Proma 配置）
- [ ] Electron 主进程框架
- [ ] React 渲染进程框架
- [ ] IPC 通信基础
- [ ] 基础 Chat UI

### Phase 2: A2A 通信 (P0)

- [ ] A2A HTTP 客户端
- [ ] message/send 支持
- [ ] message/stream SSE 支持
- [ ] 错误处理

### Phase 3: 历史记录 (P0)

- [ ] 对话管理（JSONL 存储）
- [ ] 消息保存（包含原始响应）
- [ ] 对话列表侧边栏
- [ ] 历史记录加载

### Phase 4: 渲染增强 (P1)

- [ ] Raw JSON 视图
- [ ] Markdown 渲染视图
- [ ] 视图切换
- [ ] 流式平滑渲染

### Phase 5: 调试功能 (P2)

- [ ] 请求详情面板
- [ ] 响应时间统计
- [ ] 错误详情展示
- [ ] 历史回放功能

---

## 10. 注意事项

### 10.1 与 Proma 的差异

| 方面 | Proma | A2A Debug App |
|------|-------|---------------|
| **用途** | 通用 AI 聊天 | A2A 协议调试 |
| **后端** | 多种 LLM Provider | 单一 A2A 服务 |
| **消息存储** | 仅存储内容 | 存储内容 + 原始响应 |
| **视图** | 仅渲染视图 | Raw + 渲染双视图 |
| **复杂度** | 完整功能 | 精简调试功能 |

### 10.2 A2A 协议注意事项

- 必须支持 `kind` 和 `type` 双重 discriminator
- SSE 响应以 `data: ` 开头，`\n\n` 分隔
- 最后一个事件包含 `final: true`
- 错误使用 JSON-RPC 标准错误码

### 10.3 安全注意事项

- 仅用于开发调试，不要连接生产服务
- 历史记录可能包含敏感数据，注意存储安全
- 不要在日志中记录完整的请求/响应内容

---

## 附录

### A. 相关文档链接

- Proma 项目: `/Users/zhangxian/projects/Proma`
- Societas Frontend: `/Users/zhangxian/projects/Societas.a2a_integration/frontend`
- A2A 集成指南: `/Users/zhangxian/projects/Societas.a2a_integration/backend/A2A-Agent-Service-Integration-Guide.md`
- A2A 协议规范: https://github.com/google/a2a

### B. Proma 关键代码参考

**历史记录管理**: `apps/electron/src/main/lib/conversation-manager.ts`
**流式渲染**: `packages/ui/src/hooks/useSmoothStream.ts`
**Chat 组件**: `apps/electron/src/renderer/components/chat/`
**状态管理**: `apps/electron/src/renderer/atoms/chat-atoms.ts`

### C. Frontend 关键代码参考

**消息渲染**: `src/features/message-renderer/`
**Markdown**: `src/components/fluent/markdown.tsx`
**工具调用解析**: `src/lib/markdown-helpers.tsx`
