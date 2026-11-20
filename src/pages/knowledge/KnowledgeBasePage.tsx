import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Bot,
  Calendar,
  ExternalLink,
  FileText,
  Filter,
  HelpCircle,
  Search,
  Send,
  Sparkles,
  Star,
  User,
  X,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import type {
  Handover,
  KnowledgeAIQueryResult,
  KnowledgeBaseEntry,
  KnowledgeRecordType,
  Project,
  UserProfile,
} from '../../types';
import { FormattedQAAnswer } from '../../components/common/FormattedQAAnswer';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';

const RECORD_TYPE_LABELS: Record<KnowledgeRecordType, string> = {
  HANDOVER_REPORT: 'Handover Report',
  PROJECT_DOCUMENT: 'Project Document',
  GITHUB_README: 'GitHub README',
  GITHUB_ACTIVITY: 'GitHub Activity',
  KEY_DECISION: 'Key Decision / Risk',
  ISSUE_RECORD: 'Issue / Pending Work',
  AI_SUMMARY: 'AI Summary',
};

const SAMPLE_AI_QUERIES = [
  'What were the major problems in the previous project version?',
  'Which tasks were left incomplete during the last handover?',
  'What technical decisions were made previously?',
  'Which dependencies caused deployment problems?',
  'What should the new developer know before starting?',
];

export const KnowledgeBasePage: React.FC = () => {
  const { showToast } = useToast();

  const [entries, setEntries] = useState<KnowledgeBaseEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Quick Views
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [handoverFilter, setHandoverFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [userFilter, setUserFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('ALL');
  const [quickView, setQuickView] = useState<
    'ALL' | 'RECENT' | 'UPDATED' | 'IMPORTANT' | 'HISTORICAL'
  >('ALL');

  // Smart AI Search State
  const [aiQueryInput, setAiQueryInput] = useState('');
  const [aiSearching, setAiSearching] = useState(false);
  const [aiResult, setAiResult] = useState<KnowledgeAIQueryResult | null>(null);

  // Full Document Modal Inspector
  const [inspectedEntry, setInspectedEntry] =
    useState<KnowledgeBaseEntry | null>(null);

  useEffect(() => {
    const loadInitial = async () => {
      try {
        setLoading(true);
        const [kbRes, pRes, hRes, uRes] = await Promise.all([
          api.knowledgeBase.list(),
          api.projects.list(),
          api.handovers.list(),
          api.users.list(),
        ]);
        setEntries(kbRes.entries || []);
        setProjects(pRes.projects || []);
        setHandovers(hRes.handovers || []);
        setUsers(uRes.users || []);
      } catch (err: any) {
        showToast('error', 'Failed to load Knowledge Base', err.message);
      } finally {
        setLoading(false);
      }
    };
    loadInitial();
  }, []);

  const handleAiSearch = async (customQuery?: string) => {
    const q = (customQuery !== undefined ? customQuery : aiQueryInput).trim();
    if (!q) return;
    try {
      setAiSearching(true);
      const res = await api.knowledgeBase.ask(
        q,
        projectFilter !== 'ALL' ? projectFilter : undefined
      );
      setAiResult(res.result);
      if (customQuery !== undefined) setAiQueryInput(customQuery);
    } catch (err: any) {
      showToast('error', 'AI Knowledge Search Failed', err.message);
    } finally {
      setAiSearching(false);
    }
  };

  if (loading) {
    return <LoadingSkeleton rows={5} />;
  }

  const nowMs = Date.now();
  const filteredEntries = entries
    .filter((e) => {
      if (projectFilter !== 'ALL' && e.projectId !== projectFilter)
        return false;
      if (handoverFilter !== 'ALL' && e.handoverId !== handoverFilter)
        return false;
      if (typeFilter !== 'ALL' && e.recordType !== typeFilter) return false;
      if (
        userFilter !== 'ALL' &&
        !e.author.toLowerCase().includes(userFilter.toLowerCase())
      )
        return false;
      if (dateFilter === 'LAST_7_DAYS') {
        if (nowMs - new Date(e.updatedAt).getTime() > 86400000 * 7)
          return false;
      } else if (dateFilter === 'LAST_30_DAYS') {
        if (nowMs - new Date(e.updatedAt).getTime() > 86400000 * 30)
          return false;
      }
      if (quickView === 'IMPORTANT' && !e.isImportant) return false;
      if (
        quickView === 'HISTORICAL' &&
        e.handoverStatus !== 'PUBLISHED' &&
        e.recordType !== 'HANDOVER_REPORT'
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${e.title} ${e.content} ${e.projectName} ${e.author} ${e.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (quickView === 'RECENT') {
        return (
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
            <BookOpen className="w-3.5 h-3.5 text-teal-700" />
            Centralized Searchable Handover Knowledge Base
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-1.5">
            Project Handovers, Technical Documentation & AI Semantic Archive
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Search across authorized handover reports, GitHub READMEs, uploaded documents, key decisions, issues, and AI summaries.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-slate-600 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200">
          <span>
            Authorized Records: <strong>{entries.length}</strong>
          </span>
          <span>•</span>
          <span>
            Projects: <strong>{projects.length}</strong>
          </span>
        </div>
      </div>

      {/* Smart AI Natural-Language Search Panel */}
      <div className="bg-white rounded-xl border border-teal-200 p-5 space-y-4 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-teal-700 text-white">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Smart AI Knowledge Base Search (RAG & Semantic Retrieval)
            </h2>
            <p className="text-xs text-slate-500">
              Ask natural-language questions across all your authorized projects, previous handovers, and technical documents.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAiSearch();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={aiQueryInput}
            onChange={(e) => setAiQueryInput(e.target.value)}
            placeholder="e.g., What were the major problems in the previous project version?"
            className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-teal-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={aiSearching || !aiQueryInput.trim()}
            className="px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {aiSearching ? 'Searching...' : 'AI Search'}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-400 mr-1 inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-teal-700" />
            Sample Queries:
          </span>
          {SAMPLE_AI_QUERIES.map((sq) => (
            <button
              key={sq}
              type="button"
              onClick={() => handleAiSearch(sq)}
              className="px-2.5 py-1 rounded-md text-[11px] bg-slate-50 hover:bg-teal-50 text-slate-700 hover:text-teal-900 border border-slate-200 transition-colors inline-flex items-center gap-1"
            >
              <HelpCircle className="w-3 h-3 text-slate-400" />
              {sq}
            </button>
          ))}
        </div>

        {aiResult && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">
                Q: {aiResult.query}
              </span>
              <button
                type="button"
                onClick={() => setAiResult(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3.5 rounded-lg bg-white border border-teal-200">
              <FormattedQAAnswer text={aiResult.answer} />
            </div>
            {aiResult.citations.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-500 block">
                  Retrieved Knowledge Base Citations ({aiResult.citations.length}):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {aiResult.citations.map((cit) => {
                    const matched = entries.find((e) => e.id === cit.entryId);
                    return (
                      <button
                        key={cit.entryId}
                        type="button"
                        onClick={() => matched && setInspectedEntry(matched)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-teal-50 text-teal-800 border border-teal-200 font-mono text-[11px] font-semibold hover:bg-teal-100"
                      >
                        <FileText className="w-3 h-3" />
                        [{cit.projectName}] {cit.title.slice(0, 48)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick View Tabs + Keyword Search & Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Quick View Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: `All Records (${entries.length})` },
                { id: 'RECENT', label: 'Recent Documents' },
                { id: 'UPDATED', label: 'Recently Updated' },
                {
                  id: 'IMPORTANT',
                  label: `Important Documents (${
                    entries.filter((e) => e.isImportant).length
                  })`,
                },
                { id: 'HISTORICAL', label: 'Historical Handovers' },
              ] as const
            ).map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setQuickView(v.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  quickView === v.id
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Keyword Search Input */}
          <div className="relative min-w-[260px] flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter records by keyword, source title, tag, or excerpt..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs"
            />
          </div>
        </div>

        {/* Multi-Facet Filters */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <span className="inline-flex items-center gap-1 font-semibold text-slate-500">
            <Filter className="w-3.5 h-3.5 text-teal-700" />
            Filter by:
          </span>

          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
          >
            <option value="ALL">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
          >
            <option value="ALL">All Document Types</option>
            {Object.entries(RECORD_TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={handoverFilter}
            onChange={(e) => setHandoverFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
          >
            <option value="ALL">All Handovers</option>
            {handovers.map((h) => (
              <option key={h.id} value={h.id}>
                {h.title}
              </option>
            ))}
          </select>

          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
          >
            <option value="ALL">All Authors / Users</option>
            {users.map((u) => (
              <option key={u.uid} value={u.name}>
                {u.name}
              </option>
            ))}
          </select>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
          >
            <option value="ALL">All Dates</option>
            <option value="LAST_7_DAYS">Updated in Last 7 Days</option>
            <option value="LAST_30_DAYS">Updated in Last 30 Days</option>
          </select>
        </div>
      </div>

      {/* Knowledge Base Results Grid */}
      {filteredEntries.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-xs text-slate-500">
          No authorized knowledge base records match the selected filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between gap-3 hover:border-teal-300 transition-colors"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                    {RECORD_TYPE_LABELS[entry.recordType]}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {entry.isImportant && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                        <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                        Important
                      </span>
                    )}
                    <span className="text-[11px] font-semibold text-slate-500">
                      {entry.projectName}
                    </span>
                  </div>
                </div>

                <h3 className="text-sm font-bold text-slate-900">
                  {entry.title}
                </h3>

                <p className="text-xs text-slate-600 line-clamp-3 font-mono bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                  {entry.excerpt}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <User className="w-3 h-3 text-slate-400" />
                    {entry.author}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    {new Date(entry.updatedAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setInspectedEntry(entry)}
                    className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold"
                  >
                    Inspect Record
                  </button>
                  {entry.handoverId && (
                    <Link
                      to={
                        entry.handoverStatus === 'PUBLISHED'
                          ? `/successor?handoverId=${entry.handoverId}`
                          : `/handovers/${entry.handoverId}`
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-semibold"
                    >
                      Open Handover
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full Record Inspector Modal */}
      {inspectedEntry && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                  {RECORD_TYPE_LABELS[inspectedEntry.recordType]} •{' '}
                  {inspectedEntry.projectName}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {inspectedEntry.title}
                </h3>
                <p className="text-xs text-slate-500">
                  Author: {inspectedEntry.author} • Updated:{' '}
                  {new Date(inspectedEntry.updatedAt).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedEntry(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 max-h-96 overflow-y-auto text-xs font-mono whitespace-pre-wrap text-slate-800 leading-relaxed">
              {inspectedEntry.content}
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex flex-wrap gap-1.5">
                {inspectedEntry.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-mono"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {inspectedEntry.url &&
                  /^https?:\/\//i.test(inspectedEntry.url) && (
                    <a
                      href={inspectedEntry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                    >
                      Open External Source ↗
                    </a>
                  )}
                <button
                  type="button"
                  onClick={() => setInspectedEntry(null)}
                  className="px-4 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

