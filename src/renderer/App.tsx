/**
 * Main Application Component
 * Apple Design System
 */

import { useEffect, useState, useCallback } from 'react';
import { useAtom, useSetAtom, useAtomValue } from 'jotai';
import {
  configAtom,
  conversationsAtom,
  currentConversationIdAtom,
  messagesMapAtom,
  endpointAtom,
  debugLogsMapAtom,
  appModeAtom,
  liveSelectedContextIdAtom,
  authConfigAtom,
  featureFlagsAtom,
} from './atoms/chat-atoms';
import { Sidebar } from './components/sidebar/Sidebar';
import { ChatView } from './components/chat/ChatView';
import { LiveSessionView } from './components/chat/LiveSessionView';
import { WindowsTitleBar } from './components/titlebar/WindowsTitleBar';
import { Radio } from 'lucide-react';

export default function App() {
  const [config, setConfig] = useAtom(configAtom);
  const setConversations = useSetAtom(conversationsAtom);
  const [currentConversationId, setCurrentConversationId] = useAtom(currentConversationIdAtom);
  const setMessagesMap = useSetAtom(messagesMapAtom);
  const setEndpoint = useSetAtom(endpointAtom);
  const setDebugLogsMap = useSetAtom(debugLogsMapAtom);
  const setAuthConfig = useSetAtom(authConfigAtom);
  const setFeatureFlags = useSetAtom(featureFlagsAtom);
  const appMode = useAtomValue(appModeAtom);
  const liveSelectedContextId = useAtomValue(liveSelectedContextIdAtom);

  const [platform, setPlatform] = useState<NodeJS.Platform | null>(null);
  const isMac = platform === 'darwin';
  const [isDark, setIsDark] = useState(() => {
    // Sync initial state with theme settings in index.html
    return document.documentElement.classList.contains('dark');
  });

  const toggleTheme = useCallback(() => {
    const html = document.documentElement;
    html.classList.add('transitioning');
    const newIsDark = !isDark;
    if (newIsDark) {
      html.classList.add('dark');
      localStorage.setItem('a2a-theme-mode', 'dark');
    } else {
      html.classList.remove('dark');
      localStorage.setItem('a2a-theme-mode', 'light');
    }
    setIsDark(newIsDark);
    setTimeout(() => html.classList.remove('transitioning'), 250);
  }, [isDark]);

  useEffect(() => {
    const init = async () => {
      try {
        const currentPlatform = await window.electronAPI.getPlatform();
        setPlatform(currentPlatform);

        const loadedConfig = await window.electronAPI.getConfig();
        setConfig(loadedConfig);
        setEndpoint(loadedConfig.defaultEndpoint);

        // Load saved auth config
        if (loadedConfig.auth) {
          setAuthConfig(loadedConfig.auth);
        }

        // Load saved feature flags
        if (loadedConfig.featureFlags) {
          setFeatureFlags(loadedConfig.featureFlags);
        }

        const conversations = await window.electronAPI.listConversations();
        setConversations(conversations);

        if (conversations.length > 0 && !currentConversationId) {
          setCurrentConversationId(conversations[0].id);
        }
      } catch (error) {
        console.error('Failed to initialize:', error);
      }
    };
    init();
  }, []);

  useEffect(() => {
    const loadData = async () => {
      if (!currentConversationId) {
        return;
      }
      try {
        const [messages, debugLogs] = await Promise.all([
          window.electronAPI.getMessages(currentConversationId),
          window.electronAPI.getDebugLogs(currentConversationId),
        ]);
        // Load messages into the map for this conversation (only if not already loaded)
        setMessagesMap((map) => {
          // Don't overwrite if messages already exist (e.g., from streaming)
          if (map.has(currentConversationId) && map.get(currentConversationId)!.length > 0) {
            return map;
          }
          const newMap = new Map(map);
          newMap.set(currentConversationId, messages);
          return newMap;
        });
        // Load debug logs into the map (only if not already loaded)
        setDebugLogsMap((map) => {
          if (map.has(currentConversationId) && map.get(currentConversationId)!.length > 0) {
            return map;
          }
          const newMap = new Map(map);
          newMap.set(currentConversationId, debugLogs);
          return newMap;
        });
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };
    loadData();
  }, [currentConversationId, setMessagesMap, setDebugLogsMap]);

  return (
    <div className="flex flex-col h-full bg-apple-gray-100 dark:bg-black overflow-hidden">
      {platform && !isMac && <WindowsTitleBar />}

      <div className="flex flex-1 min-h-0">
        <Sidebar isDark={isDark} onToggleTheme={toggleTheme} />

        <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#1C1C1E]">
          {appMode === 'live' ? (
            liveSelectedContextId ? (
              <LiveSessionView contextId={liveSelectedContextId} />
            ) : (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center animate-fade-in">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-apple-gray-200 dark:bg-[#38383A] flex items-center justify-center">
                    <Radio className="w-6 h-6 text-apple-gray-500" />
                  </div>
                  <h3 className="text-apple-lg font-semibold text-apple-gray-900 dark:text-apple-gray-100 mb-1">
                    Live Session Viewer
                  </h3>
                  <p className="text-apple-sm text-apple-gray-500 max-w-[280px]">
                    Select a live session from the sidebar to preview
                  </p>
                </div>
              </div>
            )
          ) : (
            <ChatView />
          )}
        </main>
      </div>
    </div>
  );
}
