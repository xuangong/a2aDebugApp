/**
 * 紧凑的 JSON 树形显示组件
 * 支持折叠/展开，显示紧凑
 */

import { useState, useMemo, useCallback } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

const INDENT_PX = 16; // 每层缩进像素

interface JsonTreeProps {
  data: unknown;
  /** 默认展开层级 */
  defaultExpandLevel?: number;
  /** 根节点名称 */
  rootName?: string;
}

interface JsonNodeProps {
  name: string;
  value: unknown;
  level: number;
  defaultExpandLevel: number;
  isLast: boolean;
}

/** 获取值的类型标签 */
function getTypeLabel(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === 'object') return `{${Object.keys(value as object).length}}`;
  return typeof value;
}

/** 获取值的颜色 */
function getValueColor(value: unknown): string {
  if (value === null) return 'text-gray-500';
  if (typeof value === 'string') return 'text-green-400';
  if (typeof value === 'number') return 'text-blue-400';
  if (typeof value === 'boolean') return 'text-yellow-400';
  return 'text-gray-300';
}

/** 格式化显示值 */
function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    // 长字符串截断显示
    if (value.length > 100) {
      return `"${value.slice(0, 100)}..."`;
    }
    return `"${value}"`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function JsonNode({ name, value, level, defaultExpandLevel, isLast }: JsonNodeProps) {
  const isExpandable = value !== null && typeof value === 'object';
  const [isExpanded, setIsExpanded] = useState(level < defaultExpandLevel);

  const entries = useMemo(() => {
    if (!isExpandable) return [];
    if (Array.isArray(value)) {
      return value.map((item, index) => ({ key: String(index), value: item }));
    }
    return Object.entries(value as Record<string, unknown>).map(([k, v]) => ({ key: k, value: v }));
  }, [value, isExpandable]);

  const toggleExpand = useCallback(() => {
    if (isExpandable) {
      setIsExpanded(!isExpanded);
    }
  }, [isExpandable, isExpanded]);

  const comma = isLast ? '' : ',';
  const indent = level * INDENT_PX;

  if (!isExpandable) {
    // 叶子节点 - 单行显示
    return (
      <div className="flex items-start leading-5" style={{ paddingLeft: indent }}>
        <span className="text-purple-400">{name}</span>
        <span className="text-gray-500 mx-0.5">:</span>
        <span className={`${getValueColor(value)} break-all`}>{formatValue(value)}</span>
        <span className="text-gray-500">{comma}</span>
      </div>
    );
  }

  const bracket = Array.isArray(value) ? ['[', ']'] : ['{', '}'];

  if (!isExpanded) {
    // 折叠状态 - 单行显示
    return (
      <div
        className="flex items-center cursor-pointer hover:bg-gray-800/50 rounded leading-5"
        style={{ paddingLeft: indent }}
        onClick={toggleExpand}
      >
        <ChevronRight className="w-3 h-3 text-gray-500 flex-shrink-0" />
        <span className="text-purple-400">{name}</span>
        <span className="text-gray-500 mx-0.5">:</span>
        <span className="text-gray-400">{bracket[0]}</span>
        <span className="text-gray-500 text-[9px]">{getTypeLabel(value)}</span>
        <span className="text-gray-400">{bracket[1]}</span>
        <span className="text-gray-500">{comma}</span>
      </div>
    );
  }

  // 展开状态
  return (
    <>
      <div
        className="flex items-center cursor-pointer hover:bg-gray-800/50 rounded leading-5"
        style={{ paddingLeft: indent }}
        onClick={toggleExpand}
      >
        <ChevronDown className="w-3 h-3 text-gray-500 flex-shrink-0" />
        <span className="text-purple-400">{name}</span>
        <span className="text-gray-500 mx-0.5">:</span>
        <span className="text-gray-400">{bracket[0]}</span>
      </div>
      {entries.map((entry, index) => (
        <JsonNode
          key={entry.key}
          name={entry.key}
          value={entry.value}
          level={level + 1}
          defaultExpandLevel={defaultExpandLevel}
          isLast={index === entries.length - 1}
        />
      ))}
      <div className="leading-5" style={{ paddingLeft: indent + INDENT_PX }}>
        <span className="text-gray-400">{bracket[1]}</span>
        <span className="text-gray-500">{comma}</span>
      </div>
    </>
  );
}

export function JsonTree({ data, defaultExpandLevel = 2, rootName = 'data' }: JsonTreeProps) {
  return (
    <div className="font-mono text-[11px] select-text">
      <JsonNode
        name={rootName}
        value={data}
        level={0}
        defaultExpandLevel={defaultExpandLevel}
        isLast={true}
      />
    </div>
  );
}
