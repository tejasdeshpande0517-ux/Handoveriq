import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BookOpenCheck,
  Bot,
  CheckCircle2,
  Download,
  FileText,
  Filter,
  HelpCircle,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { generateAndDownloadHandoverPDF } from '../../lib/pdfGenerator';
import type {
  Handover,
  Project,
  QAResponse,
  ReportItem,
  ReportSection,
  SourceDocument,
  UserProfile,
} from '../../types';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import { SourceCitationModal } from '../../components/common/SourceCitationModal';
import { ConfidenceBadge } from '../../components/common/StatusBadge';
import { FormattedQAAnswer } from '../../components/common/FormattedQAAnswer';

const SECTION_LABELS: { key: ReportSection; label: string }[] = [
  { key: 'PROJECT_SNAPSHOT', label: 'Project Overview & Snapshot' },
  { key: 'KEY_DECISIONS', label: 'Key Decisions' },
  { key: 'PENDING_WORK', label: 'Pending / Unfinished Work' },
  { key: 'PROBLEMS_ISSUES', label: 'Known Issues & Problems' },
  { key: 'DEPENDENCIES', label: 'Dependencies' },
  { key: 'RISKS', label: 'Risks' },
  { key: 'OPEN_QUESTIONS', label: 'Open Questions & Answers' },
];

export const SuccessorPortalPage: React.FC = () => {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [publishedHandovers, setPublishedHandovers] = useState<Handover[]>([]);
  const [selectedHandoverId, setSelectedHandoverId] = useState<string>('');
  const [handoverDetail, setHandoverDetail] = useState<{
    handover: Handover;
    project: Project | null;
    sources: SourceDocument[];
    reportItems: ReportItem[];
  } | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState<ReportSection | 'ALL'>(
    'ALL'
  );

  // Source Citation Inspector
  const [inspectedSource, setInspectedSource] = useState<SourceDocument | null>(
    null
  );
  const [inspectedEvidence, setInspectedEvidence] = useState<
    string | undefined
  >(undefined);

  // Grounded AI Q&A State
  const [questionInput, setQuestionInput] = useState('');
  const [qaHistory, setQaHistory] = useState<QAResponse[]>([]);
  const [askingQA, setAskingQA] = useState(false);

  useEffect(() => {
    const loadInitial = async () => {
      try {
        setLoading(true);
        const [hRes, uRes] = await Promise.all([
          api.handovers.list(),
          api.users.list(),
        ]);
        const pub = hRes.handovers.filter((h) => h.status === 'PUBLISHED');
        setPublishedHandovers(pub);
        setUsers(uRes.users);

        const paramId = searchParams.get('handoverId');
        const initialId =
          paramId && pub.some((h) => h.id === paramId)
            ? paramId
            : pub[0]?.id || '';
        setSelectedHandoverId(initialId);
      } catch (err: any) {
        showToast('error', 'Failed to load published handovers', err.message);
      } finally {
        setLoading(false);
      }
    };
    loadInitial();
  }, []);

  useEffect(() => {
    const loadSelected = async () => {
      if (!selectedHandoverId) {
        setHandoverDetail(null);
        return;
      }
      try {
        const [res, qaRes] = await Promise.all([
          api.handovers.get(selectedHandoverId),
          api.handovers.getQAHistory(selectedHandoverId).catch(() => ({ history: [] })),
        ]);
        setHandoverDetail(res);
        setQaHistory(qaRes.history || []);
      } catch (err: any) {
        showToast('error', 'Access Denied or Not Found', err.message);
      }
    };
    loadSelected();
  }, [selectedHandoverId]);

  const handleAskQuestion = async (customQ?: string) => {
    const q = (customQ !== undefined ? customQ : questionInput).trim();
    if (!q || !selectedHandoverId) return;

    try {
      setAskingQA(true);
      const res = await api.handovers.askQA(selectedHandoverId, q);
      setQaHistory((prev) => [res.qaResult, ...prev]);
      if (customQ === undefined) setQuestionInput('');
    } catch (err: any) {
      showToast('error', 'Q&A Query Failed', err.message);
    } finally {
      setAskingQA(false);
    }
  };

  if (loading) {
    return <LoadingSkeleton rows={4} />;
  }

  if (publishedHandovers.length === 0) {
    return (
      <EmptyState
        title="No Approved & Published Handover Reports Yet"
        description="Successors can only access handover reports after the Team Leader has verified all report items and published the report."
        icon={<BookOpenCheck className="w-6 h-6" />}
      />
    );
  }

  const usersMap = Object.fromEntries(users.map((u) => [u.uid, u]));
  const sourcesMap = Object.fromEntries(
    (handoverDetail?.sources || []).map((s) => [s.id, s])
  );

  const approvedItems = (handoverDetail?.reportItems || []).filter(
    (i) => i.reviewStatus === 'APPROVED'
  );

  const filteredItems = approvedItems.filter((item) => {
    const matchSec =
      sectionFilter === 'ALL' || item.section === sectionFilter;
    const matchQuery =
      !searchQuery.trim() ||
      item.statement.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.evidence.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSec && matchQuery;
  });

  const sampleGroundedQuestions = [
    'Why did the team migrate idempotency key storage to Redis 7.2 Redlock?',
    'What pending work or open PRs need to be completed before the Q1 traffic spike?',
    'What are the known problems and Kafka consumer lag risks?',
    'What is the failover threshold for the secondary PostgreSQL logical replication slot?',
    'What is the cafeteria lunch menu on Mars? (Test Unrelated Out-of-Scope Query)',
  ];

  return (
    <div className="space-y-6">
      {/* Header & Published Report Selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Leader-Verified Successor Portal
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-1.5">
            Approved Handover Knowledge Explorer & Grounded AI Assistant
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Explore verified project decisions, pending tasks, risks, source citations, and ask source-grounded questions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedHandoverId}
            onChange={(e) => {
              setSelectedHandoverId(e.target.value);
              setSearchParams({ handoverId: e.target.value });
              setQaHistory([]);
            }}
            className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-semibold bg-white text-slate-900 focus:ring-2 focus:ring-teal-600"
          >
            {publishedHandovers.map((h) => (
              <option key={h.id} value={h.id}>
                {h.title} ({h.id})
              </option>
            ))}
          </select>

          {handoverDetail && (
            <button
              onClick={() =>
                generateAndDownloadHandoverPDF({
                  handover: handoverDetail.handover,
                  project: handoverDetail.project,
                  reportItems: approvedItems,
                  sources: handoverDetail.sources,
                  usersMap,
                })
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 shadow-2xs"
            >
              <Download className="w-4 h-4" />
              Download Official PDF Report
            </button>
          )}
        </div>
      </div>

      {handoverDetail && (
        <>
          {/* Project & Approval Attestation Banner */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 uppercase font-semibold block">
                Project
              </span>
              <p className="text-sm font-bold text-slate-900 mt-0.5">
                {handoverDetail.project?.name ||
                  handoverDetail.handover.projectId}
              </p>
              <p className="text-slate-500 mt-0.5 line-clamp-2">
                {handoverDetail.project?.description}
              </p>
            </div>
            <div>
              <span className="text-slate-400 uppercase font-semibold block">
                Departing Engineer
              </span>
              <p className="text-sm font-bold text-slate-900 mt-0.5">
                {usersMap[handoverDetail.handover.departingMemberId]?.name ||
                  handoverDetail.handover.departingMemberId}
              </p>
              <p className="text-slate-500 font-mono">
                {usersMap[handoverDetail.handover.departingMemberId]?.email}
              </p>
            </div>
            <div>
              <span className="text-slate-400 uppercase font-semibold block">
                Authorized Successor
              </span>
              <p className="text-sm font-bold text-teal-800 mt-0.5">
                {usersMap[handoverDetail.handover.successorId]?.name ||
                  handoverDetail.handover.successorId}
              </p>
              <p className="text-slate-500 font-mono">
                {usersMap[handoverDetail.handover.successorId]?.email}
              </p>
            </div>
            <div>
              <span className="text-slate-400 uppercase font-semibold block">
                Team Leader Verification • v{handoverDetail.handover.approvalSummary?.version || 1}
              </span>
              <p className="text-sm font-bold text-emerald-700 mt-0.5 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                Approved by{' '}
                {handoverDetail.handover.approvalSummary?.approvedByName ||
                  'Team Leader'}
              </p>
              <p className="text-slate-500 mt-0.5">
                {handoverDetail.handover.approvalSummary?.approvedAt
                  ? `Approved ${new Date(handoverDetail.handover.approvalSummary.approvedAt).toLocaleDateString()} • `
                  : ''}
                {handoverDetail.handover.approvalSummary?.leaderComments}
              </p>
            </div>
          </div>

          {/* Main 12-Column Split: Left 7 Cols Approved Report + Right 5 Cols Grounded AI Q&A Assistant */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 Columns: Searchable, Filterable Approved Report & Source Index */}
            <div className="lg:col-span-7 space-y-5">
              {/* Search & Section Filter Bar */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search approved statements, tasks, risks, or source evidence..."
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1" />
                  <button
                    onClick={() => setSectionFilter('ALL')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap ${
                      sectionFilter === 'ALL'
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    All Sections ({approvedItems.length})
                  </button>
                  {SECTION_LABELS.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setSectionFilter(s.key)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap ${
                        sectionFilter === s.key
                          ? 'bg-teal-700 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Approved Report Sections */}
              {SECTION_LABELS.filter(
                (s) => sectionFilter === 'ALL' || sectionFilter === s.key
              ).map((sec) => {
                const secItems = filteredItems.filter(
                  (i) => i.section === sec.key
                );
                if (secItems.length === 0 && searchQuery.trim()) return null;

                return (
                  <div
                    key={sec.key}
                    className="bg-white rounded-xl border border-slate-200 overflow-hidden"
                  >
                    <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <h2 className="text-sm font-bold text-slate-900">
                        {sec.label}
                      </h2>
                      <span className="text-xs font-mono text-slate-500">
                        {secItems.length} verified item(s)
                      </span>
                    </div>

                    <div className="divide-y divide-slate-200">
                      {secItems.length === 0 ? (
                        <p className="p-5 text-xs text-slate-500 italic">
                          Not found in available sources.
                        </p>
                      ) : (
                        secItems.map((item) => {
                          const qAns =
                            handoverDetail.handover.openQuestionAnswers?.[
                              item.id
                            ];
                          return (
                            <div key={item.id} className="p-5 space-y-2.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <ConfidenceBadge
                                  confidence={item.confidence}
                                  score={item.confidenceScore}
                                />
                                <div className="flex flex-wrap gap-1.5">
                                  {item.sourceIds.map((sid) => {
                                    const src = sourcesMap[sid];
                                    const hasExternalUrl =
                                      src?.url && /^https?:\/\//i.test(src.url);
                                    return (
                                      <span key={sid} className="inline-flex items-center gap-1">
                                        <button
                                          onClick={() => {
                                            if (src) {
                                              setInspectedSource(src);
                                              setInspectedEvidence(item.evidence);
                                            }
                                          }}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-semibold bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200"
                                        >
                                          <FileText className="w-3 h-3" />
                                          [{sid}]
                                        </button>
                                        {hasExternalUrl && (
                                          <a
                                            href={src.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-1.5 py-0.5 rounded text-[11px] font-medium text-teal-700 hover:underline bg-slate-50 border border-slate-200"
                                          >
                                            Open Source ↗
                                          </a>
                                        )}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>

                              <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                                {item.statement}
                              </p>

                              {item.evidence &&
                                item.statement !==
                                  'Not found in available sources.' && (
                                  <p className="text-xs font-mono text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                                    Evidence: "{item.evidence}"
                                  </p>
                                )}

                              {qAns && (
                                <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-900">
                                  <strong>
                                    Departing Member Answer ({qAns.answeredByName}):
                                  </strong>{' '}
                                  {qAns.answer}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Source Index Card */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200">
                  <h2 className="text-sm font-bold text-slate-900">
                    Source Index ({handoverDetail.sources.length} Verified Sources)
                  </h2>
                </div>
                <div className="divide-y divide-slate-200">
                  {handoverDetail.sources.map((src) => (
                    <div
                      key={src.id}
                      onClick={() => {
                        setInspectedSource(src);
                        setInspectedEvidence(undefined);
                      }}
                      className="p-4 hover:bg-slate-50 cursor-pointer flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-teal-800">
                          [{src.id}]
                        </span>{' '}
                        <span className="font-semibold text-slate-900">
                          {src.title}
                        </span>
                        <p className="text-slate-500 mt-0.5">
                          {src.type} • Author: {src.author} •{' '}
                          {new Date(src.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="text-teal-700 font-semibold shrink-0">
                        View Excerpt →
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right 5 Columns: Grounded AI Question-Answering Assistant */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-teal-200 shadow-xs overflow-hidden sticky top-20">
              <div className="p-5 bg-slate-900 text-white">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-teal-600 text-white">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold">
                      Grounded AI Handover Assistant
                    </h2>
                    <p className="text-[11px] text-slate-300">
                      Answers strictly using approved report items & verified sources
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* Input Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAskQuestion();
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={questionInput}
                    onChange={(e) => setQuestionInput(e.target.value)}
                    placeholder="Ask about decisions, pending work, risks, or architecture..."
                    className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={askingQA || !questionInput.trim()}
                    className="px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {askingQA ? 'Searching...' : 'Ask'}
                  </button>
                </form>

                {/* Suggested Grounded & Out-of-Scope Verification Prompts */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                    Click to Test Grounded Retrieval & Anti-Hallucination Guard:
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {sampleGroundedQuestions.map((sq, i) => (
                      <button
                        key={i}
                        type="button"
                        disabled={askingQA}
                        onClick={() => handleAskQuestion(sq)}
                        className="text-left px-3 py-2 rounded-lg text-xs bg-slate-50 hover:bg-teal-50 text-slate-700 hover:text-teal-900 border border-slate-200 transition-colors flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{sq}</span>
                        <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Q&A Conversation Responses */}
                <div className="space-y-3 max-h-[460px] overflow-y-auto pt-2 border-t border-slate-200">
                  {qaHistory.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Ask any question above to retrieve a citation-backed answer grounded exclusively in this handover's approved sources.
                    </div>
                  ) : (
                    qaHistory.map((qa, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs"
                      >
                        <p className="font-bold text-slate-900">
                          Q: {qa.question}
                        </p>
                        <div
                          className={`p-3 rounded-lg border leading-relaxed ${
                            qa.grounded
                              ? 'bg-white border-teal-200 text-slate-800'
                              : 'bg-amber-50 border-amber-200 text-amber-900 font-semibold'
                          }`}
                        >
                          {qa.grounded ? (
                            <FormattedQAAnswer text={qa.answer} />
                          ) : (
                            qa.answer
                          )}
                        </div>

                        {qa.citations.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[11px] font-semibold text-slate-500 block">
                              Supporting Approved Citations (Click to Inspect):
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {qa.citations.map((cit) => (
                                <button
                                  key={cit.sourceId}
                                  type="button"
                                  onClick={() => {
                                    const fullSrc = sourcesMap[cit.sourceId];
                                    if (fullSrc) {
                                      setInspectedSource(fullSrc);
                                      setInspectedEvidence(cit.excerpt);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-teal-50 text-teal-800 border border-teal-200 font-mono text-[11px] font-semibold hover:bg-teal-100"
                                >
                                  <FileText className="w-3 h-3" />
                                  [{cit.sourceId}] {cit.title}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <SourceCitationModal
        source={inspectedSource}
        highlightEvidence={inspectedEvidence}
        onClose={() => setInspectedSource(null)}
      />
    </div>
  );
};

