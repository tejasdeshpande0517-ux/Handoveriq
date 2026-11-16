import React from 'react';
import { Code2, FileCheck2 } from 'lucide-react';

function renderInlineTokens(text: string): React.ReactNode[] {
  // Match `inline code`, **bold**, *italic*, or [Source: <id>]
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[Source:\s*[^\]]+\])/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }

    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      parts.push(
        <code
          key={`c_${keyIdx++}`}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-950 text-emerald-400 border border-emerald-500/40 font-mono text-[11.5px] font-semibold"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`b_${keyIdx++}`} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={`i_${keyIdx++}`} className="italic text-slate-600">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('[Source:')) {
      const sourceId = token.slice(8, -1).trim();
      const shortLabel =
        sourceId.length > 18 ? `${sourceId.slice(0, 14)}…` : sourceId;
      parts.push(
        <span
          key={`s_${keyIdx++}`}
          title={`Verified Source: ${sourceId}`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md text-[10px] font-mono font-semibold bg-teal-50 text-teal-800 border border-teal-200/90 align-middle"
        >
          <FileCheck2 className="w-2.5 h-2.5 text-teal-600 shrink-0" />
          {shortLabel}
        </span>
      );
    }

    lastIdx = tokenRegex.lastIndex;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts;
}

export function stripMarkdownForPreview(text: string): string {
  return text
    .replace(/\[Source:\s*[^\]]+\]/g, '')
    .replace(/```[\s\S]*?```/g, '[Code]')
    .replace(/^###\s+/gm, '')
    .replace(/^\s*-\s+/gm, '• ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export const FormattedQAAnswer: React.FC<{ text: string }> = ({ text }) => {
  // Split text into segments of fenced ```code``` blocks vs regular markdown lines
  const segments: { type: 'code' | 'text'; lang?: string; content: string }[] = [];
  const codeBlockRegex = /```([a-zA-Z0-9_+-]*)\r?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }
    segments.push({
      type: 'code',
      lang: (match[1] || 'code').toUpperCase(),
      content: match[2].replace(/\s+$/, ''),
    });
    lastIndex = codeBlockRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  return (
    <div className="space-y-2.5 text-[12.5px] text-slate-700 leading-relaxed">
      {segments.map((seg, segIdx) => {
        if (seg.type === 'code') {
          return (
            <div
              key={`code_${segIdx}`}
              className="rounded-xl overflow-hidden border border-emerald-500/40 bg-slate-950 shadow-xs my-2"
            >
              <div className="px-3.5 py-1.5 bg-slate-900 border-b border-emerald-500/30 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                  <Code2 className="w-3.5 h-3.5 text-emerald-400" />
                  {seg.lang || 'CODE'}
                </span>
                <span className="text-[10px] font-mono text-emerald-500/80">
                  Verified Code Snippet
                </span>
              </div>
              <pre className="p-3.5 overflow-x-auto font-mono text-xs leading-relaxed text-emerald-400 selection:bg-emerald-800 selection:text-white">
                <code>{seg.content}</code>
              </pre>
            </div>
          );
        }

        const lines = seg.content.split(/\r?\n/);
        return (
          <React.Fragment key={`txt_${segIdx}`}>
            {lines.map((rawLine, idx) => {
              const line = rawLine.trimEnd();
              if (!line.trim()) return null;

              // Headings (### or ##)
              if (/^#{1,4}\s+/.test(line.trim())) {
                const heading = line.trim().replace(/^#{1,4}\s+/, '').trim();
                return (
                  <div
                    key={idx}
                    className="pt-2 pb-0.5 border-b border-slate-100 flex items-center gap-1.5"
                  >
                    <span className="w-1.5 h-3.5 rounded-full bg-teal-600 shrink-0" />
                    <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-teal-900">
                      {heading}
                    </h4>
                  </div>
                );
              }

              // Nested sub-bullet (  - ...)
              if (/^\s{2,}[*-]\s+/.test(line)) {
                const content = line.replace(/^\s+[*-]\s+/, '');
                return (
                  <div
                    key={idx}
                    className="flex items-start gap-2 pl-5 text-[11.5px] text-slate-600"
                  >
                    <span className="w-1.5 h-1.5 rounded-full border border-teal-500 mt-1.5 shrink-0" />
                    <div className="flex-1">{renderInlineTokens(content)}</div>
                  </div>
                );
              }

              // Primary bullet (- ... or * ... or • ...)
              if (/^([*-]|•)\s+/.test(line.trim())) {
                const content = line.trim().replace(/^([*-]|•)\s+/, '');
                return (
                  <div key={idx} className="flex items-start gap-2 pl-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-600 mt-1.5 shrink-0" />
                    <div className="flex-1">{renderInlineTokens(content)}</div>
                  </div>
                );
              }

              // Auto-detect single-line code statements (e.g. print("Hello, World!"))
              if (
                /^(print\(.*\)|console\.log\(.*\)|System\.out\.println\(.*\)|#include\s+<.*>|fmt\.Println\(.*\)|def\s+\w+\(|function\s+\w+\(|SELECT\s+.*\s+FROM\s+)/i.test(
                  line.trim()
                )
              ) {
                return (
                  <pre
                    key={idx}
                    className="p-2.5 rounded-lg bg-slate-950 border border-emerald-500/40 font-mono text-xs text-emerald-400 overflow-x-auto"
                  >
                    <code>{line.trim()}</code>
                  </pre>
                );
              }

              // Normal paragraph
              return (
                <p key={idx} className="text-slate-800">
                  {renderInlineTokens(line.trim())}
                </p>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
};
