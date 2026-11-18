import React, { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  Check,
  Columns,
  Download,
  Edit3,
  FileText,
  History,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import type {
  Handover,
  HandoverSummary,
  HandoverSummarySection,
  Project,
  SummaryFormat,
} from '../../types';
import { FormattedQAAnswer } from '../common/FormattedQAAnswer';

interface HandoverSummaryPanelProps {
  handover: Handover;
  project: Project | null;
  canEdit: boolean;
}

export const HandoverSummaryPanel: React.FC<HandoverSummaryPanelProps> = ({
  handover,
  project,
  canEdit,
}) => {
  const { showToast } = useToast();
  const [summaries, setSummaries] = useState<HandoverSummary[]>([]);
  const [selectedSummaryId, setSelectedSummaryId] = useState<string>('');
  const [compareSummaryId, setCompareSummaryId] = useState<string>('');
  const [compareMode, setCompareMode] = useState(false);
  const [format, setFormat] = useState<SummaryFormat>('MEDIUM');
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [draftSections, setDraftSections] = useState<HandoverSummarySection[]>(
    []
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadSummaries = async () => {
      try {
        setLoading(true);
        const res = await api.handovers.listSummaries(handover.id);
        setSummaries(res.summaries || []);
        if (res.summaries?.length > 0) {
          setSelectedSummaryId(res.summaries[0].id);
          if (res.summaries.length > 1) {
            setCompareSummaryId(res.summaries[1].id);
          }
        }
      } catch (err: any) {
        showToast('error', 'Failed to load AI summaries', err.message);
      } finally {
        setLoading(false);
      }
    };
    loadSummaries();
  }, [handover.id]);

  const activeSummary =
    summaries.find((s) => s.id === selectedSummaryId) || summaries[0] || null;
  const comparedSummary =
    summaries.find((s) => s.id === compareSummaryId) || summaries[1] || null;

  const handleGenerate = async (targetFormat?: SummaryFormat) => {
    const fmt = targetFormat || format;
    try {
      setGenerating(true);
      const res = await api.handovers.generateSummary(handover.id, fmt);
      setSummaries(res.summaries);
      setSelectedSummaryId(res.summary.id);
      if (res.summaries.length > 1) {
        const second = res.summaries.find((s) => s.id !== res.summary.id);
        if (second) setCompareSummaryId(second.id);
      }
      setEditing(false);
      showToast(
        'success',
        `AI Summary Generated (${fmt} • v${res.summary.version})`,
        'All 12 structured handover summary sections have been generated and stored.'
      );
    } catch (err: any) {
      showToast('error', 'Summary Generation Failed', err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleStartEdit = () => {
    if (!activeSummary) return;
    setDraftSections(activeSummary.sections.map((s) => ({ ...s })));
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!activeSummary) return;
    try {
      setSaving(true);
      const res = await api.handovers.updateSummary(
        handover.id,
        activeSummary.id,
        draftSections
      );
      setSummaries((prev) =>
        prev.map((s) => (s.id === res.summary.id ? res.summary : s))
      );
      setEditing(false);
      showToast(
        'success',
        'Summary Saved',
        `Version v${res.summary.version} updated and recorded in audit logs.`
      );
    } catch (err: any) {
      showToast('error', 'Failed to save summary', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExportPdf = async () => {
    if (!activeSummary) return;
    const blob = await api.handovers.downloadSummaryPdf(
      handover.id,
      activeSummary.id
    );
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `HandoverIQ_Summary_${handover.id}_v${activeSummary.version}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }

    // Client-side jsPDF fallback for static hosting mode
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 42;
    const contentWidth = pageWidth - margin * 2;
    let y = 48;

    doc.setFillColor(15, 118, 110);
    doc.rect(0, 0, pageWidth, 78, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('HANDOVERIQ — AI-POWERED HANDOVER SUMMARY', margin, 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(
      `Handover: ${handover.title} | Format: ${activeSummary.format} | Version: v${activeSummary.version}`,
      margin,
      52
    );
    y = 98;
    doc.setTextColor(15, 23, 42);

    for (const sec of activeSummary.sections) {
      if (y + 52 > pageHeight - 48) {
        doc.addPage();
        y = 48;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(
        `${sec.title} ${sec.isRecommendation ? '[AI Recommendation]' : '[Verified Fact]'}`,
        margin,
        y
      );
      y += 16;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      const lines = doc.splitTextToSize(sec.content, contentWidth);
      for (const l of lines) {
        if (y + 14 > pageHeight - 48) {
          doc.addPage();
          y = 48;
        }
        doc.text(l, margin, y);
        y += 13;
      }
      y += 10;
    }
    doc.save(`HandoverIQ_Summary_${handover.id}_v${activeSummary.version}.pdf`);
  };

  return (
    <div className="space-y-5">
      {/* Control Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
            <Sparkles className="w-3.5 h-3.5 text-teal-700" />
            12-Section AI Handover Summary Engine
          </span>
          <h2 className="text-lg font-bold text-slate-900 mt-1">
            Structured Executive & Technical Summary ({project?.name || handover.title})
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Automatically synthesizes ingested documents, GitHub activity, tasks, decisions, and risks while distinguishing verified facts from AI recommendations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Format Selector */}
          <div className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-0.5 text-xs">
            {(['SHORT', 'MEDIUM', 'DETAILED'] as SummaryFormat[]).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setFormat(fmt)}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                  format === fmt
                    ? 'bg-teal-700 text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-200/70'
                }`}
              >
                {fmt === 'SHORT'
                  ? 'Short'
                  : fmt === 'MEDIUM'
                  ? 'Medium'
                  : 'Detailed'}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={generating}
            onClick={() => handleGenerate(format)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
            {generating
              ? 'Generating Summary...'
              : summaries.length > 0
              ? `Regenerate (${format})`
              : `Generate Summary (${format})`}
          </button>

          {activeSummary && (
            <>
              {canEdit && !editing && (
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit Summary
                </button>
              )}
              {summaries.length > 1 && (
                <button
                  type="button"
                  onClick={() => setCompareMode((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border ${
                    compareMode
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Columns className="w-3.5 h-3.5" />
                  {compareMode ? 'Exit Compare' : 'Compare Versions'}
                </button>
              )}
              <button
                type="button"
                onClick={handleExportPdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white"
              >
                <Download className="w-3.5 h-3.5" />
                Export Summary PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Version Selector Bar */}
      {summaries.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-600 inline-flex items-center gap-1">
              <History className="w-3.5 h-3.5 text-teal-700" />
              Summary Version:
            </span>
            <select
              value={selectedSummaryId}
              onChange={(e) => {
                setSelectedSummaryId(e.target.value);
                setEditing(false);
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-900 bg-white"
            >
              {summaries.map((s) => (
                <option key={s.id} value={s.id}>
                  v{s.version} — {s.format} Summary ({new Date(s.updatedAt).toLocaleString()})
                </option>
              ))}
            </select>

            {compareMode && summaries.length > 1 && (
              <>
                <span className="font-semibold text-slate-500 ml-2">
                  Compare With:
                </span>
                <select
                  value={compareSummaryId}
                  onChange={(e) => setCompareSummaryId(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-900 bg-white"
                >
                  {summaries
                    .filter((s) => s.id !== selectedSummaryId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        v{s.version} — {s.format} Summary
                      </option>
                    ))}
                </select>
              </>
            )}
          </div>

          {activeSummary && (
            <div className="text-slate-500 font-mono">
              Generated by {activeSummary.generatedByName}
              {activeSummary.editedByName
                ? ` • Edited by ${activeSummary.editedByName}`
                : ''}{' '}
              • {activeSummary.sourceIds.length} source(s)
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && !activeSummary && (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center space-y-3">
          <FileText className="w-8 h-8 text-teal-700 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">
            No AI Handover Summary Generated Yet
          </h3>
          <p className="text-xs text-slate-600 max-w-lg mx-auto">
            Select Short, Medium, or Detailed format above and click "Generate Summary" to synthesize all 12 structured handover summary sections from your verified project sources.
          </p>
        </div>
      )}

      {/* Editing Mode */}
      {editing && activeSummary && (
        <div className="bg-white rounded-xl border border-teal-300 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-sm font-bold text-slate-900">
              Editing Summary v{activeSummary.version} ({activeSummary.format})
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveEdit}
                className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-teal-700 text-white"
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {draftSections.map((sec, idx) => (
              <div
                key={sec.key}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2"
              >
                <label className="text-xs font-bold text-slate-900 block">
                  {sec.title}
                </label>
                <textarea
                  rows={4}
                  value={sec.content}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDraftSections((prev) =>
                      prev.map((s, i) => (i === idx ? { ...s, content: val } : s))
                    );
                  }}
                  className="w-full p-2.5 rounded-lg border border-slate-300 bg-white text-xs font-mono"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Side-by-Side Comparison View */}
      {!editing && compareMode && activeSummary && comparedSummary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[activeSummary, comparedSummary].map((sum) => (
            <div
              key={sum.id}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden"
            >
              <div className="px-5 py-3 bg-slate-900 text-white flex items-center justify-between text-xs">
                <span className="font-bold">
                  Version v{sum.version} ({sum.format} Format)
                </span>
                <span className="text-slate-300 font-mono">
                  {new Date(sum.updatedAt).toLocaleString()}
                </span>
              </div>
              <div className="p-5 space-y-4 divide-y divide-slate-100">
                {sum.sections.map((sec) => (
                  <div key={sec.key} className="pt-3 first:pt-0 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900">
                        {sec.title}
                      </h4>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          sec.isRecommendation
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {sec.isRecommendation
                          ? 'AI Recommendation'
                          : 'Verified Fact'}
                      </span>
                    </div>
                    <FormattedQAAnswer text={sec.content} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Standard 12-Section Grid View */}
      {!editing && !compareMode && activeSummary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeSummary.sections.map((sec) => (
            <div
              key={sec.key}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-slate-900">
                    {sec.title}
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                      sec.isRecommendation
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {sec.isRecommendation ? (
                      <Sparkles className="w-2.5 h-2.5" />
                    ) : (
                      <ShieldCheck className="w-2.5 h-2.5" />
                    )}
                    {sec.isRecommendation
                      ? 'AI Recommendation'
                      : 'Verified Fact'}
                  </span>
                </div>
                <div className="p-4">
                  {sec.available ? (
                    <FormattedQAAnswer text={sec.content} />
                  ) : (
                    <p className="text-xs italic text-slate-400">
                      {sec.content}
                    </p>
                  )}
                </div>
              </div>
              {sec.sourceIds.length > 0 && (
                <div className="px-4 py-2 bg-slate-50/60 border-t border-slate-100 text-[10px] font-mono text-slate-500">
                  Cited Sources: {sec.sourceIds.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
