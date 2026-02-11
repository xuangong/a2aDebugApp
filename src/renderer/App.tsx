/**
 * 主应用组件
 */

import { useEffect, useState } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import {
  configAtom,
  conversationsAtom,
  currentConversationIdAtom,
  messagesAtom,
  endpointAtom,
  debugLogsAtom,
} from './atoms/chat-atoms';
import { Sidebar } from './components/sidebar/Sidebar';
import { ChatView } from './components/chat/ChatView';
import { WindowsTitleBar } from './components/titlebar/WindowsTitleBar';

export default function App() {
  const [config, setConfig] = useAtom(configAtom);
  const setConversations = useSetAtom(conversationsAtom);
  const [currentConversationId, setCurrentConversationId] = useAtom(currentConversationIdAtom);
  const setMessages = useSetAtom(messagesAtom);
  const setEndpoint = useSetAtom(endpointAtom);
  const setDebugLogs = useSetAtom(debugLogsAtom);

  // 平台检测
  const [platform, setPlatform] = useState<NodeJS.Platform | null>(null);
  const isMac = platform === 'darwin';

  // 初始化：加载配置、对话列表和平台信息
  useEffect(() => {
    const init = async () => {
      try {
        // 获取平台信息
        const currentPlatform = await window.electronAPI.getPlatform();
        setPlatform(currentPlatform);

        // 加载配置
        const loadedConfig = await window.electronAPI.getConfig();
        setConfig(loadedConfig);
        setEndpoint(loadedConfig.defaultEndpoint);

        // 加载对话列表
        const conversations = await window.electronAPI.listConversations();
        setConversations(conversations);

        // 如果有对话，选中第一个
        if (conversations.length > 0 && !currentConversationId) {
          setCurrentConversationId(conversations[0].id);
        }
      } catch (error) {
        console.error('Failed to initialize:', error);
      }
    };

    init();
  }, []);

  // 当对话切换时，加载消息和 debug logs
  useEffect(() => {
    const loadData = async () => {
      if (!currentConversationId) {
        setMessages([]);
        setDebugLogs([]);
        return;
      }

      try {
        // 并行加载消息和 debug logs
        const [messages, debugLogs] = await Promise.all([
          window.electronAPI.getMessages(currentConversationId),
          window.electronAPI.getDebugLogs(currentConversationId),
        ]);
        setMessages(messages);
        setDebugLogs(debugLogs);
      } catch (error) {
        console.error('Failed to load data:', error);
        setMessages([]);
        setDebugLogs([]);
      }
    };

    loadData();
  }, [currentConversationId, setMessages, setDebugLogs]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Windows/Linux 自定义标题栏 */}
      {platform && !isMac && <WindowsTitleBar />}

      <div className="flex flex-1 min-h-0">
        {/* 侧边栏 */}
        <Sidebar />

        {/* 主内容区 */}
        <main className="flex-1 flex flex-col min-w-0">
          <ChatView />
        </main>
      </div>
    </div>
  );
}
