# A2A Debug App

A desktop application for testing and debugging [A2A (Agent-to-Agent) protocol](https://google.github.io/A2A/) interfaces. Built with Electron, React, and TypeScript.

## Features

- **A2A Protocol Client** - Send `message/send` and `message/stream` JSON-RPC requests to any A2A-compliant server
- **Agent Card Discovery** - Auto-fetch and display Agent Card from `/.well-known/agent.json`
- **Streaming Support** - Real-time SSE streaming with interleaved text and tool call rendering
- **Native Tool Calls** - Render and interact with native tool calls (task-clarify, presentation-planner, etc.)
- **Debug Panel** - Full JSON-RPC interaction log with request/response inspection, filtering, and message-to-log linking
- **Multi-Conversation** - Manage multiple conversations with independent streaming (switching doesn't interrupt background streams)
- **Authentication** - Bearer token support with auto-extraction from MSAL cache / SocietasSsoResult JSON, JWT expiry detection and countdown
- **Live Session Viewer** - Real-time monitoring of backend recording directories via file system watching
- **Backend Recording Import** - Import recorded sessions from backend recording directories
- **Artifacts Panel** - Display file artifacts (PPTX, XLSX, DOCX, PDF, etc.) with download links
- **Cross-Platform** - macOS (native title bar with vibrancy) and Windows/Linux (custom frameless title bar)

## Project Structure

```
src/
  main/                          # Electron main process
    index.ts                     # App entry, window creation, context menu
    ipc.ts                       # IPC handler registration
    lib/
      a2a-client.ts              # A2A HTTP client (JSON-RPC + SSE streaming)
      config-manager.ts          # Persistent app config (~/.a2a-debug-app/config.json)
      conversation-manager.ts    # Conversation/message/debug-log storage (JSONL)
      live-watcher.ts            # Real-time file watcher for live session monitoring

  preload/
    index.ts                     # Context bridge API exposed to renderer

  renderer/                      # React frontend (Vite)
    App.tsx                      # Root component
    main.tsx                     # Renderer entry
    atoms/
      chat-atoms.ts              # Jotai state management (conversations, messages, streaming, UI)
    components/
      agent/
        AgentCardDisplay.tsx     # Agent Card rendering
        ConnectionPanel.tsx      # Server endpoint + auth + feature flags config
      chat/
        ChatView.tsx             # Main chat view layout
        ChatHeader.tsx           # Header with view mode switcher, search, connection settings
        ChatInput.tsx            # Message input with streaming lifecycle management
        ChatMessages.tsx         # Message list with search filtering
        AssistantMessage.tsx     # Assistant message rendering (rendered/raw/content views)
        StreamingMessage.tsx     # Real-time streaming message with tool call interleaving
        ArtifactsPanel.tsx       # File artifacts display
        LiveSessionView.tsx      # Live session viewer
        TaskStatusBar.tsx        # A2A task state indicator
        ToolCallCard.tsx         # Native tool call card (function name, args, result)
      debug/
        DebugPanel.tsx           # JSON-RPC debug log panel with filtering
        JsonTree.tsx             # Compact collapsible JSON tree viewer
      sidebar/
        Sidebar.tsx              # Conversation list + live sessions sidebar
      titlebar/
        WindowsTitleBar.tsx      # Custom title bar for Windows/Linux
    hooks/
      useTaskClarify.ts          # Hook for input-required task responses (tool results)
    lib/
      xml-parser.ts              # XML tool call parser (for agent response text)
      xml-streaming-parser.ts    # Streaming XML parser (state machine based)
    styles/
      globals.css                # Tailwind + Apple Design System styles

  shared/
    types.ts                     # Shared type definitions (A2A protocol, messages, config)
```

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Bun](https://bun.sh/) (package manager and script runner)

## Development

```bash
# Install dependencies
bun install

# Start dev mode (Vite HMR + Electron with auto-reload)
bun run dev
```

This runs Vite dev server for the renderer and watches main/preload files with esbuild, using `electronmon` for auto-restart on main process changes.

## Build

```bash
# Build all (main + preload + renderer)
bun run build

# Run built app locally
bun run start
```

## Package & Distribute

```bash
# Package without installer (unpacked directory)
bun run pack

# Build distributable installer
bun run dist

# Platform-specific builds
bun run dist:mac    # macOS (.dmg) - arm64 + x64
bun run dist:win    # Windows (.exe via NSIS) - x64
bun run dist:all    # Both platforms
```

Output goes to the `out/` directory.

## Tech Stack

| Layer      | Technology                                                |
| ---------- | --------------------------------------------------------- |
| Framework  | Electron 39                                               |
| Frontend   | React 18 + TypeScript + Vite                              |
| Styling    | Tailwind CSS + Apple Design System custom theme           |
| State      | Jotai (atomic state management)                           |
| Bundler    | esbuild (main/preload) + Vite (renderer)                  |
| Packaging  | electron-builder                                          |
| Icons      | Lucide React                                              |
| Markdown   | react-markdown + remark-gfm                               |

## A2A 0.3.0 Protocol Compatibility

### JSON-RPC Methods

| Method | Status | Notes |
| ------ | ------ | ----- |
| `message/send` | Supported | Non-streaming request via `A2AClient.send()` |
| `message/stream` | Supported | SSE streaming via `A2AClient.stream()` |
| `tasks/get` | Not implemented | Cannot query task status on demand |
| `tasks/cancel` | Not implemented | Client-side abort only (`AbortController`), no JSON-RPC cancel request sent to server |
| `tasks/resubscribe` | Not implemented | |
| `tasks/pushNotificationConfig/set` | Not implemented | |
| `tasks/pushNotificationConfig/get` | Not implemented | |

### Streaming Events

| Event | Status | Notes |
| ----- | ------ | ----- |
| `TaskStatusUpdateEvent` (`status-update`) | Supported | Full parsing of taskId, contextId, state, message |
| `TaskArtifactUpdateEvent` (`artifact-update`) | Supported | Incremental `append`/`lastChunk` assembly via `ToolCallAccumulator` |
| `Message` event (`message`) | Supported | |

### Task States

| State | Status | Notes |
| ----- | ------ | ----- |
| `submitted` | UI only | Displayed in `TaskStatusBar` |
| `working` | Supported | Full state transition tracking |
| `completed` | Supported | Auto-clears taskId from conversation |
| `failed` | Supported | Auto-clears taskId from conversation |
| `canceled` | Supported | Auto-clears taskId from conversation |
| `input-required` | Supported | Deep implementation: persists taskId, `useTaskClarify` hook submits tool results back to the same task |
| `auth-required` | UI only | Displayed in status bar, but no automatic auth retry flow |

### Message Parts

| Part | Send | Receive | Notes |
| ---- | ---- | ------- | ----- |
| `TextPart` | Supported | Supported | Primary message format |
| `FilePart` | Not supported | Supported | Receives file artifacts (name, mimeType, bytes, uri) with download links; file upload not implemented |
| `DataPart` | Supported | Supported | Used for tool_calls and tool_results in native tool call flow |

### Other Features

| Feature | Status | Notes |
| ------- | ------ | ----- |
| Agent Card Discovery | Supported | Fetches `{baseUrl}/.well-known/agent.json`, displays capabilities and skills |
| `contextId` Session Tracking | Supported | Auto-extracted from responses, used for conversation continuity |
| Bearer Token Auth | Supported | Via `Authorization` header, with MSAL/JWT token import and expiry countdown |
| Push Notifications | Not implemented | AgentCard capability displayed, but no subscribe/receive logic |
| `stateTransitionHistory` | Not implemented | AgentCard capability displayed only |
| OAuth 2.0 Auth Flow | Not implemented | Manual token paste required |
| Multi-Agent Forwarding | Not implemented | Single-agent client only |

## Data Storage

App data is stored at `~/.a2a-debug-app/`:
- `config.json` - App configuration (endpoint, auth, theme, feature flags)
- `conversations/` - Conversation index and per-conversation JSONL files (messages + debug logs)
