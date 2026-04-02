/**
 * Agent Card Display Component
 * Apple Design System
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
      <div className="p-4 bg-apple-gray-100 dark:bg-[#2C2C2E] rounded-apple border border-apple-gray-200 dark:border-[#38383A]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-apple-gray-200 dark:bg-[#38383A] rounded-apple animate-pulse" />
          <div className="flex-1">
            <div className="h-4 w-32 bg-apple-gray-200 dark:bg-[#38383A] rounded animate-pulse mb-2" />
            <div className="h-3 w-48 bg-apple-gray-200 dark:bg-[#38383A] rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-apple-red/10 rounded-apple border border-apple-red/20">
        <div className="flex items-center gap-2 text-apple-red">
          <XCircle className="w-5 h-5" />
          <span className="text-apple-sm font-medium">Failed to load Agent Card</span>
        </div>
        <p className="text-apple-xs text-apple-red/80 mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-apple-gray-100 dark:bg-[#2C2C2E] rounded-apple border border-apple-gray-200 dark:border-[#38383A] space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 bg-apple-blue/10 rounded-apple flex items-center justify-center flex-shrink-0">
          <Bot className="w-6 h-6 text-apple-blue" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-apple-base font-semibold text-apple-gray-900 dark:text-apple-gray-100 truncate">
            {agentCard.name}
          </h3>
          {agentCard.version && (
            <span className="text-apple-xs text-apple-gray-500">
              v{agentCard.version}
            </span>
          )}
          {agentCard.description && (
            <p className="text-apple-sm text-apple-gray-600 dark:text-apple-gray-400 mt-1 line-clamp-2">
              {agentCard.description}
            </p>
          )}
        </div>
      </div>

      {/* Capabilities */}
      {agentCard.capabilities && (
        <div className="space-y-2">
          <h4 className="text-apple-xs font-medium text-apple-gray-500 uppercase tracking-wide">
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
          <h4 className="text-apple-xs font-medium text-apple-gray-500 uppercase tracking-wide">
            Skills ({agentCard.skills.length})
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {agentCard.skills.map((skill) => (
              <div
                key={skill.id}
                className="p-2 bg-white dark:bg-[#1C1C1E] rounded-apple-sm border border-apple-gray-200 dark:border-[#38383A]"
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-apple-orange" />
                  <span className="text-apple-sm font-medium text-apple-gray-800 dark:text-apple-gray-200">
                    {skill.name}
                  </span>
                </div>
                {skill.description && (
                  <p className="text-apple-xs text-apple-gray-500 mt-1 ml-6">
                    {skill.description}
                  </p>
                )}
                {skill.tags && skill.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 ml-6">
                    {skill.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-apple-gray-200 dark:bg-[#38383A] text-apple-xs text-apple-gray-600 dark:text-apple-gray-400 rounded-apple-sm"
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
      <div className="flex flex-wrap gap-4 text-apple-xs text-apple-gray-500">
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
            className="flex items-center gap-1 text-apple-blue hover:underline"
          >
            <FileText className="w-3 h-3" />
            <span>Documentation</span>
          </a>
        )}
      </div>

      {/* URL - hide if empty or just a path like "/" */}
      {agentCard.url && agentCard.url.trim().length > 1 && !/^\/+$/.test(agentCard.url.trim()) && (
        <div className="text-apple-xs text-apple-gray-400 truncate">
          {agentCard.url}
        </div>
      )}
    </div>
  );
}

function CapabilityBadge({ label, enabled }: { label: string; enabled?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-apple-xs ${
        enabled
          ? 'bg-apple-green/10 text-apple-green'
          : 'bg-apple-gray-200 dark:bg-[#38383A] text-apple-gray-500'
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
