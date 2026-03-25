/**
 * 连接配置面板
 * Apple Design System
 */

import { useState } from 'react';
import { useAtom } from 'jotai';
import { Server, RefreshCw, Check, X, Link, Key, User, HelpCircle, Clock, Clipboard } from 'lucide-react';
import {
  endpointAtom,
  agentCardAtom,
  agentCardLoadingAtom,
  agentCardErrorAtom,
  authConfigAtom,
} from '../../atoms/chat-atoms';
import { AgentCardDisplay } from './AgentCardDisplay';

interface ConnectionPanelProps {
  onClose?: () => void;
}

/**
 * 计算剩余时间
 */
function formatTimeRemaining(expiresOn: number): { text: string; isExpired: boolean; isWarning: boolean } {
  const now = Math.floor(Date.now() / 1000);
  const remaining = expiresOn - now;

  if (remaining <= 0) {
    return { text: 'Expired', isExpired: true, isWarning: false };
  }

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);

  if (hours > 0) {
    return { text: `${hours}h ${minutes}m remaining`, isExpired: false, isWarning: remaining < 600 };
  }
  return { text: `${minutes}m remaining`, isExpired: false, isWarning: remaining < 600 };
}

export function ConnectionPanel({ onClose }: ConnectionPanelProps) {
  const [endpoint, setEndpoint] = useAtom(endpointAtom);
  const [agentCard, setAgentCard] = useAtom(agentCardAtom);
  const [loading, setLoading] = useAtom(agentCardLoadingAtom);
  const [error, setError] = useAtom(agentCardErrorAtom);
  const [authConfig, setAuthConfig] = useAtom(authConfigAtom);

  const [tempEndpoint, setTempEndpoint] = useState(endpoint);
  const [tempBearerToken, setTempBearerToken] = useState(authConfig.bearerToken || '');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showAuthFields, setShowAuthFields] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [tokenExpiresOn, setTokenExpiresOn] = useState<number | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  // 解析粘贴的 JSON
  const handleParseJson = () => {
    setParseError(null);
    try {
      const data = JSON.parse(jsonInput.trim());

      // 提取 Bearer Token (支持多种格式)
      // 本地开发: idToken (普通 JWT，可解码)
      // 生产环境: accessToken (JWE，需 MISE 验证)
      if (data.credentialType === 'IdToken' && data.secret) {
        // MSAL idtoken 格式 (推荐用于本地开发)
        setTempBearerToken(data.secret);
      } else if (data.access_token) {
        // SocietasCacheToken 格式 (Societas 内部 token)
        setTempBearerToken(data.access_token);
      } else if (data.secret) {
        // MSAL accesstoken 格式 (生产环境 JWE token)
        setTempBearerToken(data.secret);
      }

      // Account ID 不再需要手动填写，服务器会从 token 自动解析

      // 提取过期时间
      if (data.expiresOn) {
        const expiresOn = typeof data.expiresOn === 'string' ? parseInt(data.expiresOn, 10) : data.expiresOn;
        setTokenExpiresOn(expiresOn);
      } else if (data.expires_on) {
        const expiresOn = typeof data.expires_on === 'string' ? parseInt(data.expires_on, 10) : data.expires_on;
        setTokenExpiresOn(expiresOn);
      }

      setJsonInput('');
    } catch {
      setParseError('Invalid JSON format');
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    setConnectionStatus('idle');

    // 更新认证配置 (只需要 bearerToken，accountId 由服务器自动解析)
    const newAuth = {
      bearerToken: tempBearerToken.trim() || undefined,
    };
    setAuthConfig(newAuth);

    try {
      const card = await window.electronAPI.getAgentCard(tempEndpoint, newAuth);
      setAgentCard(card);
      setEndpoint(tempEndpoint);
      await window.electronAPI.setConfig({ defaultEndpoint: tempEndpoint, auth: newAuth });
      setConnectionStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setAgentCard(null);
      setConnectionStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!endpoint) return;
    setLoading(true);
    setError(null);

    try {
      const card = await window.electronAPI.getAgentCard(endpoint, authConfig);
      setAgentCard(card);
      setConnectionStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
      setConnectionStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-96 apple-card shadow-apple-xl max-h-[80vh] overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-apple-gray-300/60 dark:border-[#38383A] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-apple-blue" />
          <h3 className="text-apple-sm font-semibold text-apple-gray-900 dark:text-apple-gray-100">
            A2A Server Connection
          </h3>
        </div>
        {onClose && (
          <button onClick={onClose} className="btn-apple-icon w-7 h-7">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Endpoint Input */}
        <div className="space-y-2">
          <label className="block text-apple-xs font-medium text-apple-gray-600 dark:text-apple-gray-400">
            Server Endpoint
          </label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" />
              <input
                type="text"
                value={tempEndpoint}
                onChange={(e) => setTempEndpoint(e.target.value)}
                placeholder="http://localhost:8000/a2a/"
                className="apple-input pl-9"
              />
            </div>
            <button
              onClick={handleConnect}
              disabled={loading || !tempEndpoint.trim()}
              className="btn-apple flex items-center gap-2"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Connect
            </button>
          </div>
          {connectionStatus === 'success' && (
            <p className="text-apple-xs text-apple-green flex items-center gap-1">
              <Check className="w-3 h-3" />
              Connected successfully
            </p>
          )}
        </div>

        {/* Authentication Section */}
        <div className="space-y-2">
          <button
            onClick={() => setShowAuthFields(!showAuthFields)}
            className="flex items-center gap-2 text-apple-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 hover:text-apple-blue transition-colors"
          >
            <Key className="w-4 h-4" />
            Authentication Settings
            <span className={`text-apple-xs transition-transform ${showAuthFields ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {showAuthFields && (
            <div className="space-y-3 p-3 bg-apple-gray-50 dark:bg-[#2C2C2E] rounded-apple">
              {/* Quick Paste JSON */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-apple-xs font-medium text-apple-gray-600 dark:text-apple-gray-400 flex items-center gap-1">
                    <Clipboard className="w-3 h-3" />
                    Quick Import from Browser
                  </label>
                  <button
                    onClick={() => setShowHelp(!showHelp)}
                    className="flex items-center gap-1 text-apple-xs text-apple-blue hover:underline"
                  >
                    <HelpCircle className="w-3 h-3" />
                    Help
                  </button>
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    placeholder='Paste the accesstoken JSON from browser LocalStorage here...'
                    className="apple-input text-apple-xs resize-none"
                    rows={2}
                  />
                  <button
                    onClick={handleParseJson}
                    disabled={!jsonInput.trim()}
                    className="btn-apple text-apple-xs"
                  >
                    Extract
                  </button>
                </div>
                {parseError && (
                  <p className="text-apple-xs text-apple-red">{parseError}</p>
                )}
              </div>

              {/* Help Instructions */}
              {showHelp && (
                <div className="p-3 bg-apple-blue/5 rounded-apple border border-apple-blue/20 text-apple-xs space-y-3">
                  <p className="font-medium text-apple-blue">
                    How to get Token from Browser:
                  </p>

                  {/* Local Development */}
                  <div className="space-y-2 p-2 bg-apple-green/5 rounded-apple border border-apple-green/20">
                    <p className="font-medium text-apple-green">🏠 Local Development (localhost)</p>
                    <ol className="list-decimal list-inside space-y-1 text-apple-gray-600 dark:text-apple-gray-400 pl-2">
                      <li>Open Societas frontend (localhost:3000) and login</li>
                      <li>DevTools (F12) → Application → Local Storage</li>
                      <li>Filter by <code className="px-1 bg-apple-gray-200 dark:bg-[#38383A] rounded-apple-sm">idtoken</code></li>
                      <li>Copy the JSON with key containing <code className="px-1 bg-apple-gray-200 dark:bg-[#38383A] rounded-apple-sm">-idtoken-</code></li>
                      <li>Paste → Extract → Connect</li>
                    </ol>
                    <p className="text-apple-gray-500 text-[10px]">✓ Account ID is automatically resolved from the token</p>
                  </div>

                  {/* Production / Remote */}
                  <div className="space-y-2 p-2 bg-apple-purple/5 rounded-apple border border-apple-purple/20">
                    <p className="font-medium text-apple-purple">☁️ Production / Remote Environment</p>
                    <ol className="list-decimal list-inside space-y-1 text-apple-gray-600 dark:text-apple-gray-400 pl-2">
                      <li>Open Societas frontend (production URL) and login</li>
                      <li>DevTools (F12) → Application → Local Storage</li>
                      <li>Filter by <code className="px-1 bg-apple-gray-200 dark:bg-[#38383A] rounded-apple-sm">accesstoken</code></li>
                      <li>Copy the JSON with key containing <code className="px-1 bg-apple-gray-200 dark:bg-[#38383A] rounded-apple-sm">-accesstoken-</code></li>
                      <li>Paste → Extract → Connect</li>
                    </ol>
                    <p className="text-apple-gray-500 text-[10px]">Note: accessToken is JWE (encrypted), validated by MISE Container on server</p>
                  </div>
                </div>
              )}

              {/* Token Expiry Status */}
              {tokenExpiresOn && (
                <div className={`flex items-center gap-2 p-2 rounded-apple text-apple-xs ${
                  formatTimeRemaining(tokenExpiresOn).isExpired
                    ? 'bg-apple-red/10 text-apple-red'
                    : formatTimeRemaining(tokenExpiresOn).isWarning
                    ? 'bg-apple-orange/10 text-apple-orange'
                    : 'bg-apple-green/10 text-apple-green'
                }`}>
                  <Clock className="w-4 h-4" />
                  <span className="font-medium">Token: {formatTimeRemaining(tokenExpiresOn).text}</span>
                </div>
              )}

              <div className="border-t border-apple-gray-200 dark:border-[#38383A] pt-3 space-y-3">
                {/* Bearer Token */}
                <div className="space-y-1">
                  <label className="block text-apple-xs font-medium text-apple-gray-600 dark:text-apple-gray-400">
                    Bearer Token
                  </label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" />
                    <input
                      type="password"
                      value={tempBearerToken}
                      onChange={(e) => setTempBearerToken(e.target.value)}
                      placeholder="Auto-filled from JSON or paste manually..."
                      className="apple-input pl-9"
                    />
                  </div>
                  {tempBearerToken && (
                    <p className="text-apple-xs text-apple-green flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Token set ({tempBearerToken.substring(0, 20)}...)
                    </p>
                  )}
                </div>

                {/* Account ID - Auto resolved notice */}
                <div className="p-2 bg-apple-gray-100 dark:bg-[#38383A] rounded-apple">
                  <p className="text-apple-xs text-apple-gray-600 dark:text-apple-gray-400 flex items-center gap-1">
                    <User className="w-3 h-3" />
                    Account ID will be auto-resolved from token by the server
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Agent Card Display */}
        {(agentCard || loading || error) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-apple-sm font-medium text-apple-gray-700 dark:text-apple-gray-300">
                Agent Card
              </h4>
              {agentCard && (
                <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="btn-apple-icon w-7 h-7"
                  title="Refresh Agent Card"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
            <AgentCardDisplay
              agentCard={agentCard!}
              loading={loading}
              error={error}
            />
          </div>
        )}

        {/* Quick Actions */}
        <div className="pt-2 border-t border-apple-gray-200 dark:border-[#38383A]">
          <p className="text-apple-xs text-apple-gray-500">
            Enter the A2A server endpoint URL and click Connect to fetch the Agent Card
            and start chatting.
          </p>
        </div>
      </div>
    </div>
  );
}
