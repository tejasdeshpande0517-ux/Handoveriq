import React from 'react';
import { FileCheck2 } from 'lucide-react';

function renderInlineTokens(text: string): React.ReactNode[] {
  // Match **bold**, *italic*, or [Source: <id>]
  const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|\[Source:\s*[^\]]+\])/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }

    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
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
    .replace(/^###\s+/gm, '')
    .replace(/^\s*-\s+/gm, '• ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export const FormattedQAAnswer: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split(/\r?\n/);

  return (
    <div className="space-y-2 text-[12.5px] text-slate-700 leading-relaxed">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trimEnd();
        if (!line.trim()) return null;

        // Section Heading (### Title)
        if (line.trim().startsWith('### ')) {
          const heading = line.trim().slice(4).trim();
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
        if (/^\s{2,}-\s+/.test(line)) {
          const content = line.replace(/^\s+-\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-5 text-[11.5px] text-slate-600">
              <span className="w-1.5 h-1.5 rounded-full border border-teal-500 mt-1.5 shrink-0" />
              <div className="flex-1">{renderInlineTokens(content)}</div>
            </div>
          );
        }

        // Primary bullet (- ...)
        if (/^-\s+/.test(line.trim())) {
          const content = line.trim().slice(2);
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-600 mt-1.5 shrink-0" />
              <div className="flex-1">{renderInlineTokens(content)}</div>
            </div>
          );
        }

        // Normal paragraph
        return (
          <p key={idx} className="text-slate-800">
            {renderInlineTokens(line.trim())}
          </p>
        );
      })}
    </div>
  );
};
