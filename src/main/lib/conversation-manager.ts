/**
 * 对话管理器
 *
 * 使用 JSONL 格式存储对话历史，参考 Proma 实现
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import type { Conversation, Message, JsonRpcLogEntry } from '../../shared/types';

const APP_DATA_DIR = join(app.getPath('home'), '.a2a-debug-app');
const CONVERSATIONS_INDEX = join(APP_DATA_DIR, 'conversations.json');
const CONVERSATIONS_DIR = join(APP_DATA_DIR, 'conversations');

interface ConversationsIndex {
  version: number;
  conversations: Conversation[];
}

export class ConversationManager {
  constructor() {
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!existsSync(APP_DATA_DIR)) {
      mkdirSync(APP_DATA_DIR, { recursive: true });
    }
    if (!existsSync(CONVERSATIONS_DIR)) {
      mkdirSync(CONVERSATIONS_DIR, { recursive: true });
    }
    if (!existsSync(CONVERSATIONS_INDEX)) {
      this.saveIndex({ version: 1, conversations: [] });
    }
  }

  private loadIndex(): ConversationsIndex {
    try {
      const content = readFileSync(CONVERSATIONS_INDEX, 'utf-8');
      return JSON.parse(content);
    } catch {
      return { version: 1, conversations: [] };
    }
  }

  private saveIndex(index: ConversationsIndex): void {
    writeFileSync(CONVERSATIONS_INDEX, JSON.stringify(index, null, 2));
  }

  private getMessagesPath(conversationId: string): string {
    return join(CONVERSATIONS_DIR, `${conversationId}.jsonl`);
  }

  private getDebugLogsPath(conversationId: string): string {
    return join(CONVERSATIONS_DIR, `${conversationId}.debug.jsonl`);
  }

  /**
   * 列出所有对话
   */
  listConversations(): Conversation[] {
    const index = this.loadIndex();
    return index.conversations.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * 创建新对话
   */
  createConversation(title: string, endpoint: string): Conversation {
    const index = this.loadIndex();
    const now = Date.now();

    const conversation: Conversation = {
      id: crypto.randomUUID(),
      title: title || 'New Conversation',
      createdAt: now,
      updatedAt: now,
      endpoint,
    };

    index.conversations.push(conversation);
    this.saveIndex(index);

    // 创建空的消息文件
    writeFileSync(this.getMessagesPath(conversation.id), '');

    return conversation;
  }

  /**
   * 删除对话
   */
  deleteConversation(id: string): void {
    const index = this.loadIndex();
    index.conversations = index.conversations.filter((c) => c.id !== id);
    this.saveIndex(index);

    // 删除消息文件
    const messagesPath = this.getMessagesPath(id);
    if (existsSync(messagesPath)) {
      unlinkSync(messagesPath);
    }

    // 删除 debug logs 文件
    const debugLogsPath = this.getDebugLogsPath(id);
    if (existsSync(debugLogsPath)) {
      unlinkSync(debugLogsPath);
    }
  }

  /**
   * 更新对话
   */
  updateConversation(id: string, updates: Partial<Conversation>): Conversation | null {
    const index = this.loadIndex();
    const conversation = index.conversations.find((c) => c.id === id);

    if (!conversation) return null;

    Object.assign(conversation, updates, { updatedAt: Date.now() });
    this.saveIndex(index);

    return conversation;
  }

  /**
   * 获取对话消息
   */
  getMessages(conversationId: string): Message[] {
    const messagesPath = this.getMessagesPath(conversationId);

    if (!existsSync(messagesPath)) {
      return [];
    }

    const content = readFileSync(messagesPath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    return lines.map((line) => JSON.parse(line) as Message);
  }

  /**
   * 保存消息
   */
  saveMessage(conversationId: string, message: Message): void {
    const messagesPath = this.getMessagesPath(conversationId);
    appendFileSync(messagesPath, JSON.stringify(message) + '\n');

    // 更新对话的 updatedAt
    this.updateConversation(conversationId, {});
  }

  /**
   * 更新消息（用于流式更新）
   */
  updateMessage(conversationId: string, messageId: string, updates: Partial<Message>): void {
    const messages = this.getMessages(conversationId);
    const messageIndex = messages.findIndex((m) => m.id === messageId);

    if (messageIndex === -1) return;

    Object.assign(messages[messageIndex], updates);

    // 重写整个文件
    const messagesPath = this.getMessagesPath(conversationId);
    const content = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
    writeFileSync(messagesPath, content);
  }

  // ===== Debug Logs 管理 =====

  /**
   * 获取对话的 debug logs
   */
  getDebugLogs(conversationId: string): JsonRpcLogEntry[] {
    const logsPath = this.getDebugLogsPath(conversationId);

    if (!existsSync(logsPath)) {
      return [];
    }

    const content = readFileSync(logsPath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    return lines.map((line) => JSON.parse(line) as JsonRpcLogEntry);
  }

  /**
   * 保存单条 debug log
   */
  saveDebugLog(conversationId: string, log: JsonRpcLogEntry): void {
    const logsPath = this.getDebugLogsPath(conversationId);
    appendFileSync(logsPath, JSON.stringify(log) + '\n');
  }

  /**
   * 批量保存 debug logs（覆盖写入）
   */
  saveDebugLogs(conversationId: string, logs: JsonRpcLogEntry[]): void {
    const logsPath = this.getDebugLogsPath(conversationId);
    const content = logs.map((log) => JSON.stringify(log)).join('\n') + (logs.length > 0 ? '\n' : '');
    writeFileSync(logsPath, content);
  }

  /**
   * 清空对话的 debug logs
   */
  clearDebugLogs(conversationId: string): void {
    const logsPath = this.getDebugLogsPath(conversationId);
    writeFileSync(logsPath, '');
  }
}
