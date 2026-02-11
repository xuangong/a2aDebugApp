/**
 * Agent Card 展示组件
 */

import { Bot, Zap, Globe, FileText, Tag, CheckCircle, XCircle } from 'lucide-react';
import type { AgentCard } from '../../../shared/types';

interface AgentCardDisplayProps {
  agentCard: AgentCard;
  loading?: boolean;
  error?: string | null;
}

export function AgentCardDisplay({ agentCard, loading, error }: AgentCardDisplayProps) {
  if (loading) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          <div className="flex-1">
            <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
            <div className="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <XCircle className="w-5 h-5" />
          <span className="text-sm font-medium">Failed to load Agent Card</span>
        </div>
        <p className="text-xs text-red-500 dark:text-red-400 mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center">
          <Bot className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 truncate">
            {agentCard.name}
          </h3>
          {agentCard.version && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              v{agentCard.version}
            </span>
          )}
          {agentCard.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
              {agentCard.description}
            </p>
          )}
        </div>
      </div>

      {/* Capabilities */}
      {agentCard.capabilities && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Capabilities
          </h4>
          <div className="flex flex-wrap gap-2">
            <CapabilityBadge
              label="Streaming"
              enabled={agentCard.capabilities.streaming}
            />
            <CapabilityBadge
              label="Push Notifications"
              enabled={agentCard.capabilities.pushNotifications}
            />
            <CapabilityBadge
              label="State History"
              enabled={agentCard.capabilities.stateTransitionHistory}
            />
          </div>
        </div>
      )}

      {/* Skills */}
      {agentCard.skills && agentCard.skills.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Skills ({agentCard.skills.length})
          </h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {agentCard.skills.map((skill) => (
              <div
                key={skill.id}
                className="p-2 bg-white dark:bg-gray-700 rounded-md border border-gray-100 dark:border-gray-600"
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {skill.name}
                  </span>
                </div>
                {skill.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                    {skill.description}
                  </p>
                )}
                {skill.tags && skill.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 ml-6">
                    {skill.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-600 text-xs text-gray-600 dark:text-gray-300 rounded"
                      >
                        <Tag className="w-3 h-3" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Provider & Documentation */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
        {agentCard.provider?.organization && (
          <div className="flex items-center gap-1">
            <Globe className="w-3 h-3" />
            <span>{agentCard.provider.organization}</span>
          </div>
        )}
        {agentCard.documentationUrl && (
          <a
            href={agentCard.documentationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-primary-500 hover:underline"
          >
            <FileText className="w-3 h-3" />
            <span>Documentation</span>
          </a>
        )}
      </div>

      {/* URL */}
      <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
        {agentCard.url}
      </div>
    </div>
  );
}

function CapabilityBadge({ label, enabled }: { label: string; enabled?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
        enabled
          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
      }`}
    >
      {enabled ? (
        <CheckCircle className="w-3 h-3" />
      ) : (
        <XCircle className="w-3 h-3" />
      )}
      {label}
    </span>
  );
}
