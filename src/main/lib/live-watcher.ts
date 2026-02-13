/**
 * Live Watcher - 实时监听录制目录
 *
 * 使用 chokidar 监听文件变化，实时推送会话更新到渲染进程
 */

import { watch, type FSWatcher } from 'chokidar';
import { existsSync, readFileSync, statSync } from 'fs';
import { join, basename } from 'path';
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS, type LiveSession, type LiveSessionStatus, type Message } from '../../shared/types';

interface ConversationMeta {
  id: string;
  title: string;
  endpoint: string;
  createdAt: number;
  updatedAt: number;
}

interface ConversationsIndex {
  version: number;
  conversations: ConversationMeta[];
}

interface SessionFileState {
  contextId: string;
  lastSize: number;
  lastModified: number;
  messageCount: number;
  lastMessage?: string;
}

export class LiveWatcher {
  private watcher: FSWatcher | null = null;
  private watchDir: string | null = null;
  private sessions: Map<string, SessionFileState> = new Map();
  private conversationsMeta: Map<string, ConversationMeta> = new Map();
  private updateTimer: NodeJS.Timeout | null = null;

  /**
   * 开始监听目录
   */
  startWatch(dir: string): boolean {
    if (this.watcher) {
      this.stopWatch();
    }

    if (!existsSync(dir)) {
      return false;
    }

    this.watchDir = dir;
    this.sessions.clear();
    this.conversationsMeta.clear();

    // 初始加载
    this.loadConversationsIndex();
    this.scanExistingSessions();

    // 创建 watcher
    this.watcher = watch(dir, {
      persistent: true,
      ignoreInitial: true,
      depth: 1,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on('change', (filePath) => this.handleFileChange(filePath));
    this.watcher.on('add', (filePath) => this.handleFileAdd(filePath));

    // 定期更新状态（检测 idle/inactive）
    this.updateTimer = setInterval(() => this.updateSessionStatuses(), 1000);

    return true;
  }

  /**
   * 停止监听
   */
  stopWatch(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    this.watchDir = null;
    this.sessions.clear();
    this.conversationsMeta.clear();
  }

  /**
   * 获取当前监听状态
   */
  isWatching(): boolean {
    return this.watcher !== null;
  }

  /**
   * 获取监听目录
   */
  getWatchDir(): string | null {
    return this.watchDir;
  }

  /**
   * 获取所有会话
   */
  getSessions(): LiveSession[] {
    const now = Date.now();
    const sessions: LiveSession[] = [];

    for (const [contextId, state] of this.sessions) {
      const meta = this.conversationsMeta.get(contextId);
      sessions.push({
        contextId,
        title: meta?.title || `Session ${contextId.slice(0, 8)}`,
        endpoint: meta?.endpoint || '',
        lastActivity: state.lastModified,
        status: this.calculateStatus(state.lastModified, now),
        messageCount: state.messageCount,
        lastMessage: state.lastMessage,
      });
    }

    // 按最后活动时间排序
    return sessions.sort((a, b) => b.lastActivity - a.lastActivity);
  }

  /**
   * 获取会话消息（只读）
   */
  getSessionMessages(contextId: string): Message[] {
    if (!this.watchDir) return [];

    const messagesPath = join(this.watchDir, 'conversations', `${contextId}.jsonl`);
    if (!existsSync(messagesPath)) return [];

    try {
      const content = readFileSync(messagesPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());
      return lines.map((line) => JSON.parse(line) as Message);
    } catch {
      return [];
    }
  }

  // ===== Private Methods =====

  private loadConversationsIndex(): void {
    if (!this.watchDir) return;

    const indexPath = join(this.watchDir, 'conversations.json');
    if (!existsSync(indexPath)) return;

    try {
      const content = readFileSync(indexPath, 'utf-8');
      const index = JSON.parse(content) as ConversationsIndex;
      this.conversationsMeta.clear();
      for (const conv of index.conversations) {
        this.conversationsMeta.set(conv.id, conv);
      }
    } catch {
      // Ignore parse errors
    }
  }

  private scanExistingSessions(): void {
    if (!this.watchDir) return;

    const conversationsDir = join(this.watchDir, 'conversations');
    if (!existsSync(conversationsDir)) return;

    // 从 index 中加载所有会话
    for (const [contextId] of this.conversationsMeta) {
      const messagesPath = join(conversationsDir, `${contextId}.jsonl`);
      if (existsSync(messagesPath)) {
        this.updateSessionState(contextId, messagesPath);
      }
    }
  }

  private handleFileChange(filePath: string): void {
    const fileName = basename(filePath);

    if (fileName === 'conversations.json') {
      this.loadConversationsIndex();
      this.notifyUpdate();
      return;
    }

    // 检查是否是消息文件
    if (fileName.endsWith('.jsonl') && !fileName.endsWith('.debug.jsonl')) {
      const contextId = fileName.replace('.jsonl', '');
      this.updateSessionState(contextId, filePath);
      this.notifyUpdate();
    }
  }

  private handleFileAdd(filePath: string): void {
    this.handleFileChange(filePath);
  }

  private updateSessionState(contextId: string, messagesPath: string): void {
    try {
      const stat = statSync(messagesPath);
      const content = readFileSync(messagesPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      let lastMessage: string | undefined;
      if (lines.length > 0) {
        try {
          const lastLine = JSON.parse(lines[lines.length - 1]);
          if (lastLine.content) {
            lastMessage = lastLine.content.slice(0, 100);
          }
        } catch {
          // Ignore parse error
        }
      }

      this.sessions.set(contextId, {
        contextId,
        lastSize: stat.size,
        lastModified: stat.mtimeMs,
        messageCount: lines.length,
        lastMessage,
      });
    } catch {
      // File might be locked, ignore
    }
  }

  private calculateStatus(lastModified: number, now: number): LiveSessionStatus {
    const elapsed = now - lastModified;

    if (elapsed < 1000) return 'streaming';
    if (elapsed < 10000) return 'active';
    if (elapsed < 60000) return 'idle';
    return 'inactive';
  }

  private updateSessionStatuses(): void {
    // 重新计算状态并通知（如果有变化）
    this.notifyUpdate();
  }

  private notifyUpdate(): void {
    const sessions = this.getSessions();
    const windows = BrowserWindow.getAllWindows();

    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.LIVE_SESSION_UPDATE, {
          watching: true,
          watchDir: this.watchDir,
          sessions,
        });
      }
    }
  }
}

// 单例
export const liveWatcher = new LiveWatcher();
