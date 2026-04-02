/**
 * Artifacts Panel Component
 * Displays documents generated in the current conversation (file_artifacts data from backend)
 */

import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { Package, FileText, FileSpreadsheet, Presentation, Image, File, Code, FileType } from 'lucide-react';
import { messagesAtom, streamingFileArtifactsAtom } from '../../atoms/chat-atoms';
import type { AssistantMessage, FileArtifact, Message } from '../../../shared/types';
import { getFileArtifactType } from '../../../shared/types';

/** Get icon for file type */
function getIcon(type: FileArtifact['type']) {
  switch (type) {
    case 'pptx':
      return <Presentation className="w-4 h-4 text-orange-500" />;
    case 'xlsx':
      return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
    case 'docx':
      return <FileText className="w-4 h-4 text-blue-600" />;
    case 'pdf':
      return <FileText className="w-4 h-4 text-red-500" />;
    case 'html':
      return <Code className="w-4 h-4 text-purple-500" />;
    case 'md':
      return <FileType className="w-4 h-4 text-gray-600" />;
    case 'image':
      return <Image className="w-4 h-4 text-pink-500" />;
    case 'csv':
      return <FileSpreadsheet className="w-4 h-4 text-green-500" />;
    default:
      return <File className="w-4 h-4 text-gray-500" />;
  }
}

interface ArtifactsPanelProps {
  /** Optional external messages (for Live mode) - if not provided, uses atom */
  messages?: Message[];
}

export function ArtifactsPanel({ messages: externalMessages }: ArtifactsPanelProps) {
  const atomMessages = useAtomValue(messagesAtom);
  const atomStreamingFileArtifacts = useAtomValue(streamingFileArtifactsAtom);

  // Use external messages if provided (Live mode), otherwise use atom (Debug mode)
  const messages = externalMessages ?? atomMessages;
  // In Live mode (externalMessages provided), don't use streaming artifacts (Live is read-only)
  const streamingFileArtifacts = externalMessages ? [] : atomStreamingFileArtifacts;

  // Get file artifacts directly from assistant messages (backend-provided)
  const artifacts = useMemo(() => {
    const allArtifacts: FileArtifact[] = [];
    // Use file_path for deduplication (more unique than file_name)
    const seenFilePaths = new Set<string>();

    // From completed messages - use fileArtifacts stored in message
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      const assistantMsg = msg as AssistantMessage;

      // Use fileArtifacts directly from the message (backend-provided)
      if (Array.isArray(assistantMsg.fileArtifacts)) {
        for (const fa of assistantMsg.fileArtifacts) {
          if (!seenFilePaths.has(fa.file_path)) {
            allArtifacts.push(fa);
            seenFilePaths.add(fa.file_path);
          }
        }
      }
    }

    // Add streaming artifacts (dedupe by file_path)
    for (const streamArtifact of streamingFileArtifacts) {
      if (!seenFilePaths.has(streamArtifact.file_path)) {
        allArtifacts.push(streamArtifact);
        seenFilePaths.add(streamArtifact.file_path);
      }
    }

    return allArtifacts;
  }, [messages, streamingFileArtifacts, externalMessages]);

  if (artifacts.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
        <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No artifacts generated yet</p>
        <p className="text-xs mt-1 opacity-75">Documents will appear here when the agent completes a task</p>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2 py-1 uppercase">
        Generated Files ({artifacts.length})
      </div>
      {artifacts.map((artifact) => (
        <ArtifactItem key={artifact.id} artifact={artifact} />
      ))}
    </div>
  );
}

function ArtifactItem({ artifact }: { artifact: FileArtifact }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
      <span className="flex-shrink-0">{getIcon(artifact.type)}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate" title={artifact.file_name}>
          {artifact.file_name}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate" title={artifact.file_path}>
          {artifact.file_path}
        </div>
      </div>
      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 uppercase flex-shrink-0">
        {artifact.type}
      </span>
    </div>
  );
}
