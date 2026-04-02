/**
 * Connection Configuration Panel
 * Apple Design System
 */

import { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { Server, RefreshCw, Check, X, Link, Key, User, HelpCircle, Clock, Settings, Bot } from 'lucide-react';
import {
  endpointAtom,
  agentCardAtom,
  agentCardLoadingAtom,
  agentCardErrorAtom,
  authConfigAtom,
  featureFlagsAtom,
} from '../../atoms/chat-atoms';
import { AgentCardDisplay } from './AgentCardDisplay';

interface ConnectionPanelProps {
  onClose?: () => void;
}

/**
 * Calculate remaining time
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
  const [featureFlags, setFeatureFlags] = useAtom(featureFlagsAtom);

  const [tempEndpoint, setTempEndpoint] = useState(endpoint);
  const [tempBearerToken, setTempBearerToken] = useState(authConfig.bearerToken || '');
  const [tempFeatureFlags, setTempFeatureFlags] = useState(featureFlags);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showAuthFields, setShowAuthFields] = useState(false);
  const [showFeatureFlags, setShowFeatureFlags] = useState(false);
  const [showAgentCard, setShowAgentCard] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [tokenExpiresOn, setTokenExpiresOn] = useState<number | null>(authConfig.expiresOn || null);

  // Sync tempBearerToken with authConfig on mount and when authConfig changes
  useEffect(() => {
    if (authConfig.bearerToken) {
      setTempBearerToken(authConfig.bearerToken);
    }
    if (authConfig.expiresOn) {
      setTokenExpiresOn(authConfig.expiresOn);
    }
  }, [authConfig.bearerToken, authConfig.expiresOn]);

  // Check if current token is expired
  const isTokenExpired = tokenExpiresOn ? Date.now() / 1000 > tokenExpiresOn : false;
  const hasValidToken = !!authConfig.bearerToken && !isTokenExpired;

  // Validate endpoint format
  const validateEndpoint = (url: string): { valid: boolean; error?: string } => {
    if (!url.trim()) {
      return { valid: false, error: 'Endpoint is required' };
    }
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { valid: false, error: 'Invalid protocol. Use http:// or https://' };
      }
      if (!url.endsWith('/')) {
        return { valid: false, error: 'Endpoint should end with /' };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
  };

  const endpointValidation = validateEndpoint(tempEndpoint);

  const handleConnect = async () => {
    // Pre-connect validation
    if (tokenExpiresOn) {
      const now = Math.floor(Date.now() / 1000);
      if (tokenExpiresOn <= now) {
        setError('Token has expired. Please get a new token from the browser.');
        setConnectionStatus('error');
        return;
      }
    }

    setLoading(true);
    setError(null);
    setConnectionStatus('idle');

    // Update auth config (includes bearerToken and expiresOn)
    const newAuth = {
      bearerToken: tempBearerToken.trim() || undefined,
      expiresOn: tokenExpiresOn || undefined,
    };
    setAuthConfig(newAuth);

    // Update Feature Flags
    const newFeatureFlags = tempFeatureFlags.trim() || 'enableA2A&enableNativeToolCall';
    setFeatureFlags(newFeatureFlags);

    try {
      const card = await window.electronAPI.getAgentCard(tempEndpoint, newAuth);
      setAgentCard(card);
      setEndpoint(tempEndpoint);
      await window.electronAPI.setConfig({ defaultEndpoint: tempEndpoint, auth: newAuth, featureFlags: newFeatureFlags });
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
                className={`apple-input pl-9 ${!endpointValidation.valid && tempEndpoint ? 'border-apple-red' : ''}`}
              />
            </div>
            <button
              onClick={handleConnect}
              disabled={loading || !endpointValidation.valid}
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
          {/* Endpoint validation error */}
          {!endpointValidation.valid && tempEndpoint && (
            <p className="text-apple-xs text-apple-red flex items-center gap-1">
              <X className="w-3 h-3" />
              {endpointValidation.error}
            </p>
          )}
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
            {/* Auth status indicator */}
            {hasValidToken && tokenExpiresOn ? (
              <span className={`ml-1 px-1.5 py-0.5 text-[10px] rounded-full ${
                formatTimeRemaining(tokenExpiresOn).isWarning
                  ? 'bg-apple-orange/20 text-apple-orange'
                  : 'bg-apple-green/20 text-apple-green'
              }`}>
                ● {formatTimeRemaining(tokenExpiresOn).text}
              </span>
            ) : hasValidToken ? (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-apple-green/20 text-apple-green rounded-full">
                ● Set
              </span>
            ) : authConfig.bearerToken && isTokenExpired ? (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-apple-red/20 text-apple-red rounded-full">
                ● Expired
              </span>
            ) : (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-apple-gray-200 dark:bg-apple-gray-600 text-apple-gray-500 dark:text-apple-gray-400 rounded-full">
                ○ Not Set
              </span>
            )}
            <span className={`text-apple-xs transition-transform ${showAuthFields ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {showAuthFields && (
            <div className="space-y-3 p-3 bg-apple-gray-50 dark:bg-[#2C2C2E] rounded-apple">
              {/* Help Toggle */}
              <div className="flex items-center justify-end">
                <button
                  onClick={() => setShowHelp(!showHelp)}
                  className="flex items-center gap-1 text-apple-xs text-apple-blue hover:underline"
                >
                  <HelpCircle className="w-3 h-3" />
                  How to get token
                </button>
              </div>

              {/* Help Instructions - Network Tab only */}
              {showHelp && (
                <div className="p-3 bg-apple-blue/5 rounded-apple border border-apple-blue/20 text-apple-xs space-y-2">
                  <p className="font-medium text-apple-blue">
                    How to get Bearer Token from Browser:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-apple-gray-600 dark:text-apple-gray-400 pl-2">
                    <li>Open Societas frontend and login</li>
                    <li>DevTools (F12) → Network tab</li>
                    <li>Do any action that triggers an API call (e.g. send a message)</li>
                    <li>Find any request to the backend API</li>
                    <li>In request Headers, copy the <code className="px-1 bg-apple-gray-200 dark:bg-[#38383A] rounded-apple-sm">Authorization</code> header value</li>
                    <li>Paste into the <strong>Bearer Token</strong> field below</li>
                  </ol>
                  <p className="text-apple-gray-500 text-[10px]">✓ Works everywhere, no code changes needed. "Bearer " prefix is auto-stripped.</p>
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
                  <div className="flex items-center justify-between">
                    <label className="block text-apple-xs font-medium text-apple-gray-600 dark:text-apple-gray-400">
                      Bearer Token
                    </label>
                    {tempBearerToken && (
                      <button
                        onClick={() => {
                          setTempBearerToken('');
                          setTokenExpiresOn(null);
                          setAuthConfig({ bearerToken: undefined, expiresOn: undefined });
                        }}
                        className="text-apple-xs text-apple-red hover:underline flex items-center gap-1"
                      >
                        <X className="w-3 h-3" />
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" />
                    <input
                      type="password"
                      value={tempBearerToken}
                      onChange={(e) => {
                        let val = e.target.value;
                        // Auto-strip "Bearer " prefix if pasted from Network tab
                        if (val.startsWith('Bearer ')) {
                          val = val.slice(7);
                        }
                        setTempBearerToken(val);
                        // Try to extract expiration from JWT payload
                        try {
                          const parts = val.split('.');
                          if (parts.length === 3) {
                            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                            if (payload.exp && typeof payload.exp === 'number') {
                              setTokenExpiresOn(payload.exp);
                            }
                          }
                        } catch {
                          // Not a valid JWT, ignore
                        }
                      }}
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

        {/* Feature Flags Section */}
        <div className="space-y-2">
          <button
            onClick={() => setShowFeatureFlags(!showFeatureFlags)}
            className="flex items-center gap-2 text-apple-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 hover:text-apple-blue transition-colors"
          >
            <Settings className="w-4 h-4" />
            Feature Flags
            <span className={`text-apple-xs transition-transform ${showFeatureFlags ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {showFeatureFlags && (
            <div className="space-y-2 p-3 bg-apple-gray-50 dark:bg-[#2C2C2E] rounded-apple">
              <label className="block text-apple-xs font-medium text-apple-gray-600 dark:text-apple-gray-400">
                x-fd-features Header
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tempFeatureFlags}
                  onChange={(e) => setTempFeatureFlags(e.target.value)}
                  placeholder="enableA2A&enableNativeToolCall"
                  className="apple-input text-apple-xs flex-1"
                />
                <button
                  onClick={async () => {
                    const newFlags = tempFeatureFlags.trim() || 'enableA2A&enableNativeToolCall';
                    setFeatureFlags(newFlags);
                    await window.electronAPI.setConfig({ featureFlags: newFlags });
                  }}
                  disabled={tempFeatureFlags === featureFlags}
                  className="btn-apple text-apple-xs flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  Set
                </button>
              </div>
              <p className="text-[10px] text-apple-gray-500">
                Use &amp; to separate multiple flags.
              </p>
            </div>
          )}
        </div>

        {/* Agent Card Display */}
        {(agentCard || loading || error) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowAgentCard(!showAgentCard)}
                className="flex items-center gap-2 text-apple-sm font-medium text-apple-gray-700 dark:text-apple-gray-300 hover:text-apple-blue transition-colors"
              >
                <Bot className="w-4 h-4" />
                Agent Card
                <span className={`text-apple-xs transition-transform ${showAgentCard ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
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
            {showAgentCard && (
              <AgentCardDisplay
                agentCard={agentCard!}
                loading={loading}
                error={error}
              />
            )}
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
