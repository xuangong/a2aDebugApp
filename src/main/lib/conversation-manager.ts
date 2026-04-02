/**
 * Conversation Manager
 *
 * Stores conversation history in JSONL format, inspired by Proma implementation
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync, copyFileSync } from 'fs';
import { join, basename } from 'path';
import { app } from 'electron';
import type { Conversation, Message, JsonRpcLogEntry, BackendConversation, ImportResult, ImportSource } from '../../shared/types';

const APP_DATA_DIR = join(app.getPath('home'), '.a2a-debug-app');
const CONVERSATIONS_INDEX = join(APP_DATA_DIR, 'conversations.json');
const CONVERSATIONS_DIR = join(APP_DATA_DIR, 'conversations');

interface ConversationsIndex {
  version: number;
  conversations: Conversation[];
}

/** Backend recorded conversations index (may have contextId field from old format) */
interface BackendConversationsIndex {
  version: number;
  conversations: Array<{
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    endpoint: string;
    contextId?: string;
  }>;
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
   * List all conversations
   */
  listConversations(): Conversation[] {
    const index = this.loadIndex();
    return index.conversations.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Create new conversation
   * id is the contextId, backend uses it as thread_id
   */
  createConversation(title: string, endpoint: string): Conversation {
    const index = this.loadIndex();
    const now = Date.now();

    // id = contextId = thread_id (all the same)
    const id = crypto.randomUUID();

    const conversation: Conversation = {
      id,
      title: title || 'New Conversation',
      createdAt: now,
      updatedAt: now,
      endpoint,
    };

    index.conversations.push(conversation);
    this.saveIndex(index);

    // Create empty messages file
    writeFileSync(this.getMessagesPath(conversation.id), '');

    return conversation;
  }

  /**
   * Delete conversation
   */
  deleteConversation(id: string): void {
    const index = this.loadIndex();
    index.conversations = index.conversations.filter((c) => c.id !== id);
    this.saveIndex(index);

    // Delete messages file
    const messagesPath = this.getMessagesPath(id);
    if (existsSync(messagesPath)) {
      unlinkSync(messagesPath);
    }

    // Delete debug logs file
    const debugLogsPath = this.getDebugLogsPath(id);
    if (existsSync(debugLogsPath)) {
      unlinkSync(debugLogsPath);
    }
  }

  /**
   * Update conversation
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
   * Get conversation messages
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
   * Save message
   */
  saveMessage(conversationId: string, message: Message): void {
    const messagesPath = this.getMessagesPath(conversationId);
    appendFileSync(messagesPath, JSON.stringify(message) + '\n');

    // Update conversation's updatedAt
    this.updateConversation(conversationId, {});
  }

  /**
   * Update message (for streaming updates)
   */
  updateMessage(conversationId: string, messageId: string, updates: Partial<Message>): void {
    const messages = this.getMessages(conversationId);
    const messageIndex = messages.findIndex((m) => m.id === messageId);

    if (messageIndex === -1) return;

    Object.assign(messages[messageIndex], updates);

    // Rewrite the entire file
    const messagesPath = this.getMessagesPath(conversationId);
    const content = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
    writeFileSync(messagesPath, content);
  }

  // ===== Debug Logs Management =====

  /**
   * Get conversation debug logs
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
   * Save a single debug log
   */
  saveDebugLog(conversationId: string, log: JsonRpcLogEntry): void {
    const logsPath = this.getDebugLogsPath(conversationId);
    appendFileSync(logsPath, JSON.stringify(log) + '\n');
  }

  /**
   * Batch save debug logs (overwrite)
   */
  saveDebugLogs(conversationId: string, logs: JsonRpcLogEntry[]): void {
    const logsPath = this.getDebugLogsPath(conversationId);
    const content = logs.map((log) => JSON.stringify(log)).join('\n') + (logs.length > 0 ? '\n' : '');
    writeFileSync(logsPath, content);
  }

  /**
   * Clear conversation debug logs
   */
  clearDebugLogs(conversationId: string): void {
    const logsPath = this.getDebugLogsPath(conversationId);
    writeFileSync(logsPath, '');
  }

  // ===== Backend Recording Import =====

  /**
   * List recorded sessions in the specified directory
   */
  listBackendConversations(sourceDir: string): BackendConversation[] {
    const backendIndexPath = join(sourceDir, 'conversations.json');

    if (!existsSync(backendIndexPath)) {
      return [];
    }

    try {
      const content = readFileSync(backendIndexPath, 'utf-8');
      const backendIndex = JSON.parse(content) as ConversationsIndex;
      const localIndex = this.loadIndex();
      const localIds = new Set(localIndex.conversations.map((c) => c.id));

      return backendIndex.conversations.map((conv) => ({
        ...conv,
        imported: localIds.has(conv.id),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Import recorded sessions from the specified directory
   */
  importBackendConversations(sourceDir: string, conversationIds: string[]): ImportResult {
    const result: ImportResult = {
      success: true,
      importedCount: 0,
      skippedCount: 0,
      errors: [],
    };

    const backendIndexPath = join(sourceDir, 'conversations.json');
    const backendConversationsDir = join(sourceDir, 'conversations');

    if (!existsSync(backendIndexPath)) {
      result.success = false;
      result.errors.push('conversations.json not found in selected directory');
      return result;
    }

    try {
      const backendContent = readFileSync(backendIndexPath, 'utf-8');
      const backendIndex = JSON.parse(backendContent) as BackendConversationsIndex;
      const localIndex = this.loadIndex();
      const localIds = new Set(localIndex.conversations.map((c) => c.id));

      for (const convId of conversationIds) {
        const backendConv = backendIndex.conversations.find((c) => c.id === convId);

        if (!backendConv) {
          result.errors.push(`Conversation ${convId} not found in source`);
          continue;
        }

        if (localIds.has(convId)) {
          result.skippedCount++;
          continue;
        }

        try {
          // Copy messages file
          const backendMessagesPath = join(backendConversationsDir, `${convId}.jsonl`);
          const localMessagesPath = this.getMessagesPath(convId);
          if (existsSync(backendMessagesPath)) {
            copyFileSync(backendMessagesPath, localMessagesPath);
          } else {
            writeFileSync(localMessagesPath, '');
          }

          // Copy debug logs file
          const backendDebugPath = join(backendConversationsDir, `${convId}.debug.jsonl`);
          const localDebugPath = this.getDebugLogsPath(convId);
          if (existsSync(backendDebugPath)) {
            copyFileSync(backendDebugPath, localDebugPath);
          }

          // Add to local index, record import source
          // Note: imported conversations may have contextId from old format
          // Use contextId if available for backward compatibility, otherwise use id
          const importedConv: Conversation = {
            id: backendConv.contextId ?? backendConv.id,
            title: backendConv.title,
            createdAt: backendConv.createdAt,
            updatedAt: backendConv.updatedAt,
            endpoint: backendConv.endpoint,
            importSource: sourceDir,
          };

          localIndex.conversations.push(importedConv);
          result.importedCount++;
        } catch (err) {
          result.errors.push(`Failed to import ${convId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      // Save updated index
      this.saveIndex(localIndex);

      if (result.errors.length > 0) {
        result.success = result.importedCount > 0;
      }
    } catch (err) {
      result.success = false;
      result.errors.push(`Failed to read source index: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Get all import sources
   */
  listImportSources(): ImportSource[] {
    const index = this.loadIndex();
    const sourceMap = new Map<string, number>();

    for (const conv of index.conversations) {
      if (conv.importSource) {
        sourceMap.set(conv.importSource, (sourceMap.get(conv.importSource) || 0) + 1);
      }
    }

    return Array.from(sourceMap.entries()).map(([path, count]) => ({
      path,
      name: basename(path),
      conversationCount: count,
    }));
  }

  /**
   * Uninstall all sessions from specified source
   */
  uninstallImportSource(sourcePath: string): { success: boolean; removedCount: number } {
    const index = this.loadIndex();
    const toRemove = index.conversations.filter((c) => c.importSource === sourcePath);

    // Delete files
    for (const conv of toRemove) {
      const messagesPath = this.getMessagesPath(conv.id);
      const debugPath = this.getDebugLogsPath(conv.id);

      if (existsSync(messagesPath)) {
        unlinkSync(messagesPath);
      }
      if (existsSync(debugPath)) {
        unlinkSync(debugPath);
      }
    }

    // Update index
    index.conversations = index.conversations.filter((c) => c.importSource !== sourcePath);
    this.saveIndex(index);

    return {
      success: true,
      removedCount: toRemove.length,
    };
  }
}
