import React from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  GitBranch,
  GitCommit,
  GitPullRequest,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import type { SourceDocument } from '../../types';

interface SourceCitationModalProps {
  source: SourceDocument | null;
  highlightEvidence?: string;
  onClose: () => void;
}

export const SourceCitationModal: React.FC<SourceCitationModalProps> = ({
  source,
  highlightEvidence,
  onClose,
}) => {
  if (!source) return null;

  const getIcon = () => {
    if (source.type === 'GITHUB_COMMIT') return <GitCommit className="w-5 h-5 text-teal-700" />;
    if (source.type === 'GITHUB_PR') return <GitPullRequest className="w-5 h-5 text-teal-700" />;
    if (source.type === 'GITHUB_BRANCH') return <GitBranch className="w-5 h-5 text-teal-700" />;
    return <FileText className="w-5 h-5 text-teal-700" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white h-full w-full max-w-2xl border-l border-slate-200 shadow-2xl flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal-50 border border-teal-200">
              {getIcon()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-teal-100 text-teal-800">
                  {source.id}
                </span>
                <span className="text-xs font-medium text-slate-500">
                  {source.type}
                </span>
              </div>
              <h3 className="text-base font-semibold text-slate-900 mt-0.5">
                {source.title}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Provenance Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 text-xs text-slate-700">
              <User className="w-4 h-4 text-slate-400" />
              <span className="text-slate-500">Author:</span>
              <span className="font-semibold text-slate-900">{source.author}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-700">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="text-slate-500">Timestamp:</span>
              <span className="font-mono text-slate-900">
                {new Date(source.timestamp).toLocaleString()}
              </span>
            </div>
            <div className="sm:col-span-2 flex items-center gap-2 text-xs text-slate-700">
              <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-slate-500">Source URL / URI:</span>
              {source.url.startsWith('http') ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-teal-700 hover:underline truncate"
                >
                  {source.url}
                </a>
              ) : (
                <span className="font-mono text-slate-800 truncate">{source.url}</span>
              )}
            </div>
          </div>

          {/* Redaction Security Banner */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-teal-50/70 border border-teal-200 text-xs">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
              <div>
                <span className="font-semibold text-teal-900">
                  Pre-AI Redaction Verified:
                </span>{' '}
                <span className="text-teal-800">
                  {source.redactionSummary?.totalRedactions || 0} sensitive pattern(s) replaced with{' '}
                  <code className="font-mono font-semibold">[REDACTED]</code> prior to storage & AI processing.
                </span>
              </div>
            </div>
          </div>

          {/* Cited Evidence Excerpt */}
          {highlightEvidence && (
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 mb-1.5">
                <CheckCircle2 className="w-4 h-4 text-amber-700" />
                Supporting Evidence Excerpt Cited by Report Item
              </div>
              <p className="text-xs font-mono text-slate-800 leading-relaxed bg-white p-3 rounded-lg border border-amber-200/80">
                "{highlightEvidence}"
              </p>
            </div>
          )}

          {/* Full Redacted Source Content */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Full Redacted Source Text ({source.chunks?.length || 1} semantic chunk(s))
            </h4>
            <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 text-xs font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto border border-slate-800">
              {source.redactedText}
            </pre>
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800"
          >
            Close Source Inspector
          </button>
        </div>
      </div>
    </div>
  );
};

