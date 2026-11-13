import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Cpu,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  FileText,
  GitBranch,
  History,
  Lock,
  MessageSquarePlus,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { generateAndDownloadHandoverPDF } from '../../lib/pdfGenerator';
import {
  storageService,
  type FileUploadProgress,
} from '../../services/storageService';
import type {
  Handover,
  IntegrationConfig,
  Project,
  ReportItem,
  ReportSection,
  SourceDocument,
  UserProfile,
} from '../../types';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import { SourceCitationModal } from '../../components/common/SourceCitationModal';
import {
  ConfidenceBadge,
  DepartingStatusBadge,
  HandoverStatusBadge,
  ReviewStatusBadge,
} from '../../components/common/StatusBadge';

const SECTION_META: { key: ReportSection; title: string; badge: string }[] = [
  { key: 'PROJECT_SNAPSHOT', title: '1. Project Snapshot', badge: 'Overview' },
  { key: 'KEY_DECISIONS', title: '2. Key Decisions', badge: 'Architecture' },
  {
    key: 'PENDING_WORK',
    title: '3. Pending / Unfinished Work',
    badge: 'Action Required',
  },
  {
    key: 'PROBLEMS_ISSUES',
    title: '4. Problems & Known Issues',
    badge: 'Defects',
  },
  { key: 'DEPENDENCIES', title: '5. Dependencies', badge: 'Upstream/Downstream' },
  { key: 'RISKS', title: '6. Risks', badge: 'Operational Risk' },
  { key: 'OPEN_QUESTIONS', title: '7. Open Questions', badge: 'Clarification' },
];

export const HandoverWorkspacePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [handover, setHandover] = useState<Handover | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const [reportItems, setReportItems] = useState<ReportItem[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Workspace Tab
  const [activeTab, setActiveTab] = useState<
    'REPORT_REVIEW' | 'INGESTION' | 'DEPARTING_CONTEXT' | 'SOURCE_INDEX' | 'HISTORY'
  >('REPORT_REVIEW');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<
    ReportSection | 'ALL'
  >('ALL');

  // File Upload & GitHub Ingestion States
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] =
    useState<FileUploadProgress | null>(null);
  const [githubRepoInput, setGithubRepoInput] = useState('');
  const [importingGithub, setImportingGithub] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [requestingRevision, setRequestingRevision] = useState(false);

  // Source Citation Inspector Modal
  const [inspectedSource, setInspectedSource] = useState<SourceDocument | null>(
    null
  );
  const [inspectedEvidence, setInspectedEvidence] = useState<
    string | undefined
  >(undefined);

  // Item Editing State (Team Leader)
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editStatementText, setEditStatementText] = useState('');
  const [editCommentText, setEditCommentText] = useState('');

  // Departing Member Context & Open Question Answer State
  const [departingNotesInput, setDepartingNotesInput] = useState('');
  const [questionAnswersInput, setQuestionAnswersInput] = useState<
    Record<string, string>
  >({});
  const [submittingContext, setSubmittingContext] = useState(false);

  // Publish State
  const [leaderPublishNotes, setLeaderPublishNotes] = useState(
    'Verified all 7 report sections and source citations. Approved for Successor access.'
  );
  const [publishing, setPublishing] = useState(false);

  const loadWorkspace = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [hRes, uRes, intRes] = await Promise.all([
        api.handovers.get(id),
        api.users.list(),
        api.integrations.list(),
      ]);
      setHandover(hRes.handover);
      setProject(hRes.project);
      setSources(hRes.sources);
      setReportItems(hRes.reportItems);
      setUsers(uRes.users);
      setIntegrations(intRes.integrations);
      setGithubRepoInput(hRes.handover.githubRepo || 'octocat/Hello-World');
      setDepartingNotesInput(hRes.handover.departingMemberNotes || '');

      if (hRes.reportItems.length === 0) {
        setActiveTab('INGESTION');
      }
    } catch (err: any) {
      showToast('error', 'Cannot open handover workspace', err.message);
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, [id, user?.uid]);

  if (loading || !handover || !user) {
    return <LoadingSkeleton rows={5} />;
  }

  const usersMap = Object.fromEntries(users.map((u) => [u.uid, u]));
  const sourcesMap = Object.fromEntries(sources.map((s) => [s.id, s]));
  const isLeaderOrAdmin = user.role === 'ADMIN' || user.role === 'TEAM_LEADER';
  const isDeparting =
    user.role === 'DEPARTING_MEMBER' && handover.departingMemberId === user.uid;

  const geminiIntegration = integrations.find((i) => i.id === 'gemini');
  const isGeminiConnected = geminiIntegration?.status === 'CONNECTED';

  // File Upload Handler (Supports .csv, .json, .pdf, .docx, .txt with validation & progress)
  const handleFileInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingFile(true);
      const res = await storageService.uploadHandoverSourceFile(
        handover.id,
        file,
        (state) => setUploadProgress(state)
      );

      setSources((prev) => [res.source, ...prev]);
      showToast(
        'success',
        `Uploaded & Redacted "${file.name}"`,
        `${res.source.redactionSummary.totalRedactions} sensitive item(s) replaced with [REDACTED].`
      );
    } catch (err: any) {
      showToast('error', 'File Upload Failed', err.message);
    } finally {
      setUploadingFile(false);
      setTimeout(() => setUploadProgress(null), 1500);
      e.target.value = '';
    }
  };

  // Authorized Source File Deletion
  const handleDeleteSourceFile = async (
    src: SourceDocument,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    try {
      await storageService.deleteHandoverSourceFile(handover.id, src);
      setSources((prev) => prev.filter((s) => s.id !== src.id));
      if (inspectedSource?.id === src.id) {
        setInspectedSource(null);
      }
      showToast(
        'info',
        `Deleted Source "${src.title}"`,
        'File removed from storage and recorded in audit logs.'
      );
    } catch (err: any) {
      showToast('error', 'Cannot Delete Source', err.message);
    }
  };

  // Team Leader Request Revision (unlocks versionLocked if needed)
  const handleRequestRevision = async () => {
    try {
      setRequestingRevision(true);
      const res = await api.handovers.requestRevision(
        handover.id,
        'Team Leader requested additional source verification and revision.'
      );
      setHandover(res.handover);
      showToast(
        'info',
        'Revision Requested',
        'Handover unlocked for Departing Member revisions and recorded in audit logs.'
      );
    } catch (err: any) {
      showToast('error', 'Failed to request revision', err.message);
    } finally {
      setRequestingRevision(false);
    }
  };

  // Upload Realistic Sample Engineering Artifact (to demonstrate CSV/JSON/TXT + Redaction)
  const handleUploadSampleEngineeringArtifact = async (
    format: 'CSV' | 'JSON' | 'TXT'
  ) => {
    try {
      setUploadingFile(true);
      let fileName = '';
      let rawText = '';

      if (format === 'TXT') {
        fileName = `sprint-handover-notes-${Date.now().toString().slice(-4)}.txt`;
        rawText = `Engineering Handover Log — ${project?.name || handover.title}
Author: ${usersMap[handover.departingMemberId]?.name || 'Departing Engineer'} (eng.secret@handoveriq.io | Phone: +1-555-234-8899)
Credentials to Strip: api_key=AIzaSyD99887766554433221100AbCdEfGhIjK | DB_PASSWORD=ProdVaultPass!9922
Architecture Overview: Service processes distributed transaction queues using active-active worker nodes and Cloud Firestore state checkpoints.
Key Decision: Decided to adopt exponential backoff with jitter on all webhook dispatchers to prevent downstream cascade failures.
Pending Work: TODO: Complete integration tests for multi-region failover controller before release v3.4 (PR #512 open).
Known Problem: Bug in metrics exporter causes memory spike when batch size exceeds 10,000 events.
Dependency: Depends on internal Auth Token Mesh v2 and Stripe Settlement Webhook API.
Risk: Critical risk of SLA breach if dead-letter queue consumer is not scaled prior to Black Friday traffic window.
Open Question: Should we increase the default webhook timeout from 3000ms to 6000ms for legacy enterprise tenants?`;
      } else if (format === 'CSV') {
        fileName = `issue-backlog-export-${Date.now().toString().slice(-4)}.csv`;
        rawText = `IssueID,Category,Statement,OwnerEmail,SecretToken,Status
ISS-401,PENDING_WORK,Complete automated schema migration script for partition table,aris.thorne@handoveriq.io,ghp_1234567890abcdef1234567890abcdef,OPEN
ISS-402,PROBLEMS_ISSUES,Bug in connection pool causes timeout under >500 concurrent requests,aris.thorne@handoveriq.io,sk-live00998877665544332211,OPEN
ISS-403,RISKS,Critical risk of certificate expiration on internal webhook gateway if cron monitor fails,marcus.vance@handoveriq.io,NONE,ACTIVE`;
      } else {
        fileName = `architecture-decisions-${Date.now().toString().slice(-4)}.json`;
        rawText = JSON.stringify(
          {
            service: project?.name || handover.title,
            maintainerContact: 'aris.thorne@handoveriq.io',
            emergencyApiKey: 'AIzaSyTestSecretKey987654321000',
            decisions: [
              'Decided to standardize all inter-service payloads on strict JSON Schema validation prior to queue ingestion.',
            ],
            dependencies: [
              'Depends on Cloud Firestore composite indexes and Redis 7.2 cache cluster.',
            ],
            openQuestions: [
              'Which on-call rotation group will own the secondary region failover runbook starting next month?',
            ],
          },
          null,
          2
        );
      }

      const res = await api.handovers.uploadFile(handover.id, {
        fileName,
        rawText,
      });
      setSources((prev) => [res.source, ...prev]);
      showToast(
        'success',
        `Ingested & Redacted ${fileName}`,
        `Applied ${res.source.redactionSummary.totalRedactions} automatic secret redactions.`
      );
    } catch (err: any) {
      showToast('error', 'Upload failed', err.message);
    } finally {
      setUploadingFile(false);
    }
  };

  // Real GitHub Repository Ingestion
  const handleGitHubImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubRepoInput.trim()) {
      showToast('error', 'Repository Required', 'Enter owner/repo');
      return;
    }
    try {
      setImportingGithub(true);
      const res = await api.handovers.importGitHub(handover.id, {
        repoFullName: githubRepoInput.trim(),
      });
      setSources((prev) => [...res.sources, ...prev]);
      showToast(
        'success',
        `Imported ${res.importedCount} GitHub Artifacts`,
        `Commits, PRs, issues, branches & review comments ingested (${res.totalRedactions} secrets redacted).`
      );
    } catch (err: any) {
      showToast('error', 'GitHub API Import Failed', err.message);
    } finally {
      setImportingGithub(false);
    }
  };

  // Run Analysis Engine (Gemini API or Grounded Extractive Mode)
  const handleRunAnalysis = async (mode: 'GEMINI' | 'EXTRACTIVE') => {
    try {
      setAnalyzing(true);
      const res = await api.handovers.analyze(handover.id, mode);
      setHandover(res.handover);
      setReportItems(res.reportItems);
      setActiveTab('REPORT_REVIEW');
      showToast(
        'success',
        `Handover Report Generated (${res.engineUsed})`,
        `Generated & citation-verified ${res.reportItems.length} items across all 7 required sections.`
      );
    } catch (err: any) {
      showToast('error', 'Analysis Engine Alert', err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // Team Leader Review Item Action
  const handleLeaderItemAction = async (
    item: ReportItem,
    reviewStatus: 'APPROVED' | 'REJECTED',
    customComment?: string
  ) => {
    try {
      const res = await api.handovers.leaderReviewItem(item.id, {
        reviewStatus,
        reviewerComment:
          customComment !== undefined ? customComment : item.reviewerComment,
      });
      setReportItems((prev) =>
        prev.map((i) => (i.id === item.id ? res.item : i))
      );
      showToast(
        'success',
        `Item ${reviewStatus}`,
        `Section: ${item.section.replace(/_/g, ' ')}`
      );
    } catch (err: any) {
      showToast('error', 'Review update failed', err.message);
    }
  };

  // Team Leader Save Edited Statement
  const handleSaveItemEdit = async (item: ReportItem) => {
    try {
      const res = await api.handovers.leaderReviewItem(item.id, {
        statement: editStatementText,
        reviewerComment: editCommentText,
        reviewStatus: 'APPROVED',
      });
      setReportItems((prev) =>
        prev.map((i) => (i.id === item.id ? res.item : i))
      );
      setEditingItemId(null);
      showToast(
        'success',
        'Statement Updated & Approved',
        'Edit history and citation verification updated.'
      );
    } catch (err: any) {
      showToast('error', 'Failed to edit item', err.message);
    }
  };

  // Team Leader Approve All Verified Pending Items
  const handleApproveAllRemaining = async () => {
    const pending = reportItems.filter((i) => i.reviewStatus === 'PENDING');
    if (pending.length === 0) return;
    try {
      for (const p of pending) {
        const res = await api.handovers.leaderReviewItem(p.id, {
          reviewStatus: 'APPROVED',
          reviewerComment: 'Verified against source citation.',
        });
        setReportItems((prev) =>
          prev.map((i) => (i.id === p.id ? res.item : i))
        );
      }
      showToast(
        'success',
        `Approved ${pending.length} Pending Item(s)`,
        'All report sections are now ready for publication.'
      );
    } catch (err: any) {
      showToast('error', 'Bulk approval failed', err.message);
    }
  };

  // Team Leader Publish Verified Report
  const handlePublishReport = async () => {
    try {
      setPublishing(true);
      const res = await api.handovers.publish(handover.id, leaderPublishNotes);
      setHandover(res.handover);
      showToast(
        'success',
        'Handover Report Published!',
        `Successor ${
          usersMap[handover.successorId]?.name || handover.successorId
        } can now access the verified report and Grounded AI Q&A.`
      );
    } catch (err: any) {
      showToast('error', 'Publication Blocked', err.message);
    } finally {
      setPublishing(false);
    }
  };

  // Departing Member Confirm / Dispute Item
  const handleDepartingItemFeedback = async (
    item: ReportItem,
    status: 'CONFIRMED' | 'DISPUTED'
  ) => {
    const comment =
      status === 'DISPUTED'
        ? 'Disputed by Departing Member: Requires clarification or updated source context.'
        : 'Confirmed accurate by Departing Member.';
    try {
      const res = await api.handovers.departingItemFeedback(item.id, {
        departingReviewStatus: status,
        departingComment: comment,
      });
      setReportItems((prev) =>
        prev.map((i) => (i.id === item.id ? res.item : i))
      );
      showToast('info', `Marked item as ${status}`);
    } catch (err: any) {
      showToast('error', 'Failed to update feedback', err.message);
    }
  };

  // Departing Member Submit Context & Open Question Answers
  const handleSubmitDepartingContext = async (
    submitToLeader: boolean,
    questionItemId?: string
  ) => {
    try {
      setSubmittingContext(true);
      const res = await api.handovers.submitDepartingContext(handover.id, {
        notes: departingNotesInput,
        questionItemId,
        questionAnswer: questionItemId
          ? questionAnswersInput[questionItemId]
          : undefined,
        submitToLeader,
      });
      setHandover(res.handover);
      await loadWorkspace();
      showToast(
        'success',
        submitToLeader
          ? 'Context Submitted to Team Leader'
          : 'Context & Answer Saved (Redacted)',
        'Your notes were redacted and added to the handover source index.'
      );
    } catch (err: any) {
      showToast('error', 'Failed to submit context', err.message);
    } finally {
      setSubmittingContext(false);
    }
  };

  const pendingReviewCount = reportItems.filter(
    (i) => i.reviewStatus === 'PENDING'
  ).length;
  const approvedCount = reportItems.filter(
    (i) => i.reviewStatus === 'APPROVED'
  ).length;
  const rejectedCount = reportItems.filter(
    (i) => i.reviewStatus === 'REJECTED'
  ).length;

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/handovers"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Handovers
        </Link>

        <div className="flex flex-wrap items-center gap-2.5">
          {handover.status === 'PUBLISHED' && (
            <Link
              to={`/successor?handoverId=${handover.id}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100"
            >
              <Eye className="w-3.5 h-3.5" />
              View in Successor Portal & AI Q&A
            </Link>
          )}

          {reportItems.length > 0 && (
            <button
              onClick={() =>
                generateAndDownloadHandoverPDF({
                  handover,
                  project,
                  reportItems,
                  sources,
                  usersMap,
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-teal-700" />
              Export PDF Report
            </button>
          )}
        </div>
      </div>

      {/* Handover Header Card & Progress Stepper */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                {handover.title}
              </h1>
              <HandoverStatusBadge status={handover.status} />
              {handover.versionLocked && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-900 text-white border border-slate-800">
                  <Lock className="w-3 h-3 text-teal-400" />
                  Version Locked (v{handover.approvalSummary?.version || 1})
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              Project:{' '}
              <span className="font-semibold text-slate-800">
                {project?.name || handover.projectId}
              </span>{' '}
              • Departing:{' '}
              <span className="font-semibold text-slate-800">
                {usersMap[handover.departingMemberId]?.name ||
                  handover.departingMemberId}
              </span>{' '}
              → Successor:{' '}
              <span className="font-semibold text-teal-800">
                {usersMap[handover.successorId]?.name || handover.successorId}
              </span>{' '}
              • Window:{' '}
              <span className="font-mono">
                {handover.dateRange.startDate} to {handover.dateRange.endDate}
              </span>
            </p>
          </div>

          {/* Review Progress Summary */}
          <div className="flex items-center gap-3 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 block">Sources</span>
              <span className="font-mono font-bold text-slate-900 text-sm">
                {sources.length}
              </span>
            </div>
            <div className="h-7 w-px bg-slate-200" />
            <div>
              <span className="text-slate-400 block">Approved</span>
              <span className="font-mono font-bold text-emerald-700 text-sm">
                {approvedCount}
              </span>
            </div>
            <div className="h-7 w-px bg-slate-200" />
            <div>
              <span className="text-slate-400 block">Pending Review</span>
              <span className="font-mono font-bold text-amber-700 text-sm">
                {pendingReviewCount}
              </span>
            </div>
            <div className="h-7 w-px bg-slate-200" />
            <div>
              <span className="text-slate-400 block">Rejected</span>
              <span className="font-mono font-bold text-red-700 text-sm">
                {rejectedCount}
              </span>
            </div>
          </div>
        </div>

        {/* Interactive Animated Stage Slider Bar */}
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/90 p-2 rounded-2xl border border-slate-200">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                {
                  id: 'REPORT_REVIEW',
                  label: `1. Report & Review (${reportItems.length})`,
                },
                {
                  id: 'INGESTION',
                  label: `2. Ingestion & AI (${sources.length})`,
                },
                {
                  id: 'DEPARTING_CONTEXT',
                  label: '3. Departing Context',
                },
                {
                  id: 'SOURCE_INDEX',
                  label: `4. Source Index (${sources.length})`,
                },
                {
                  id: 'HISTORY',
                  label: `5. Version History (v${handover.approvalSummary?.version || 1})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-[#074246] to-[#0d8288] text-white shadow-md scale-[1.02]'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Prev / Next Stage Slide Controls */}
          <div className="flex items-center gap-1.5 shrink-0 pr-1">
            <button
              type="button"
              onClick={() => {
                const order = [
                  'REPORT_REVIEW',
                  'INGESTION',
                  'DEPARTING_CONTEXT',
                  'SOURCE_INDEX',
                  'HISTORY',
                ] as const;
                const idx = order.indexOf(activeTab);
                const prevIdx = (idx - 1 + order.length) % order.length;
                setActiveTab(order[prevIdx]);
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-teal-50 hover:text-teal-900 transition-colors cursor-pointer"
            >
              ← Prev Slide
            </button>
            <button
              type="button"
              onClick={() => {
                const order = [
                  'REPORT_REVIEW',
                  'INGESTION',
                  'DEPARTING_CONTEXT',
                  'SOURCE_INDEX',
                  'HISTORY',
                ] as const;
                const idx = order.indexOf(activeTab);
                const nextIdx = (idx + 1) % order.length;
                setActiveTab(order[nextIdx]);
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-teal-50 hover:text-teal-900 transition-colors cursor-pointer"
            >
              Next Slide →
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================================
          TAB 2: DATA INGESTION & AI ANALYSIS ENGINE
      ===================================================================== */}
      {activeTab === 'INGESTION' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* File Uploads & Sample Artifacts */}
          <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-teal-700" />
                  Multi-Format File Ingestion (.csv, .json, .pdf, .docx, .txt)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  All uploaded files are parsed and redacted server-side before storage or AI analysis.
                </p>
              </div>
            </div>

            <label className="block border-2 border-dashed border-slate-300 hover:border-teal-600 rounded-xl p-6 text-center cursor-pointer bg-slate-50/70 transition-colors">
              <Upload className="w-7 h-7 text-teal-700 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-900">
                {uploadingFile
                  ? 'Parsing & Redacting File...'
                  : 'Click to Upload Engineering File'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Supported formats: CSV, JSON, PDF, DOCX, TXT (Max 15 MB)
              </p>
              <input
                type="file"
                accept=".csv,.json,.pdf,.docx,.txt"
                onChange={handleFileInputChange}
                disabled={uploadingFile || Boolean(handover.versionLocked)}
                className="hidden"
              />
            </label>

            {uploadProgress && (
              <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200 space-y-1.5 text-xs">
                <div className="flex items-center justify-between font-semibold text-teal-900">
                  <span>
                    {uploadProgress.status}: {uploadProgress.fileName}
                  </span>
                  <span className="font-mono">{uploadProgress.progressPercent}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-teal-100 overflow-hidden">
                  <div
                    className="h-full bg-teal-600 transition-all duration-200"
                    style={{ width: `${uploadProgress.progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Quick Test Artifact Generators */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <p className="text-xs font-semibold text-slate-700">
                One-Click Verification Upload (Contains Test Secrets to Verify Redaction):
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={uploadingFile}
                  onClick={() => handleUploadSampleEngineeringArtifact('TXT')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-teal-50 hover:border-teal-300"
                >
                  <FileText className="w-3.5 h-3.5 text-teal-700" />
                  Ingest Sample .TXT Log (with API Keys & Emails)
                </button>
                <button
                  type="button"
                  disabled={uploadingFile}
                  onClick={() => handleUploadSampleEngineeringArtifact('CSV')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-teal-50 hover:border-teal-300"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-teal-700" />
                  Ingest Sample .CSV Backlog
                </button>
                <button
                  type="button"
                  disabled={uploadingFile}
                  onClick={() => handleUploadSampleEngineeringArtifact('JSON')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-teal-50 hover:border-teal-300"
                >
                  <FileText className="w-3.5 h-3.5 text-teal-700" />
                  Ingest Sample .JSON Architecture
                </button>
              </div>
            </div>

            {/* Live GitHub Repository Ingestion */}
            <form
              onSubmit={handleGitHubImport}
              className="pt-4 border-t border-slate-200 space-y-3"
            >
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-teal-700" />
                Live GitHub Repository Ingestion (REST API v3)
              </h3>
              <p className="text-xs text-slate-500">
                Fetches live commits, pull requests, issues, branch metadata, review comments, timestamps, and author info from GitHub.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={githubRepoInput}
                  onChange={(e) => setGithubRepoInput(e.target.value)}
                  placeholder="owner/repo (e.g., octocat/Hello-World)"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                />
                <button
                  type="submit"
                  disabled={importingGithub}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white shrink-0 disabled:opacity-50"
                >
                  {importingGithub ? 'Fetching GitHub API...' : 'Import from GitHub'}
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: AI Analysis Trigger & Connection Status */}
          <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-teal-700" />
                AI Analysis & Citation Verification Engine
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Analyzes all {sources.length} redacted source document(s) for this handover, extracts structured findings across all 7 required sections, and verifies every citation against its source text.
              </p>

              {/* Honest Gemini API Connection Status */}
              <div
                className={`p-4 rounded-xl border text-xs ${
                  isGeminiConnected
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-center justify-between font-bold mb-1">
                  <span>
                    Google Gemini API Status: {geminiIntegration?.status || 'DISCONNECTED'}
                  </span>
                  <Link
                    to="/admin/integrations"
                    className="underline text-teal-800 font-semibold"
                  >
                    Configure API Keys
                  </Link>
                </div>
                <p className="leading-relaxed">
                  {isGeminiConnected
                    ? 'GEMINI_API_KEY is verified and active. Clicking "Generate with Google Gemini AI" will invoke Gemini with structured JSON schema and text-embedding-004.'
                    : 'GEMINI_API_KEY is not currently configured. In accordance with platform governance rules, HandoverIQ never simulates fake LLM responses. Configure your GEMINI_API_KEY in Admin > Integrations, or use the Deterministic Source-Grounded Extractive Analyzer below.'}
                </p>
              </div>

              {isLeaderOrAdmin ? (
                <div className="space-y-3 pt-2">
                  <button
                    type="button"
                    disabled={analyzing || sources.length === 0}
                    onClick={() => handleRunAnalysis('GEMINI')}
                    className="w-full py-3 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-2xs disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                    {analyzing
                      ? 'Running Analysis & Citation Verification...'
                      : 'Generate Analysis with Google Gemini API (Requires GEMINI_API_KEY)'}
                  </button>

                  <button
                    type="button"
                    disabled={analyzing || sources.length === 0}
                    onClick={() => handleRunAnalysis('EXTRACTIVE')}
                    className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Cpu className="w-4 h-4 text-teal-400" />
                    {analyzing
                      ? 'Extracting & Verifying Citations...'
                      : 'Run Source-Grounded Extractive Analysis (Deterministic Verbatim Parser)'}
                  </button>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                  Only a Team Leader or Administrator can trigger report generation. You may continue uploading sources and adding context notes.
                </div>
              )}
            </div>

            {/* Ingested Sources Quick Summary */}
            <div className="pt-4 border-t border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Ingested & Redacted Sources ({sources.length})
              </h3>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {sources.map((src) => (
                  <div
                    key={src.id}
                    onClick={() => {
                      setInspectedSource(src);
                      setInspectedEvidence(undefined);
                    }}
                    className="p-3 rounded-lg bg-slate-50 hover:bg-teal-50/50 border border-slate-200 cursor-pointer flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-teal-800">
                        [{src.id}]
                      </span>{' '}
                      <span className="font-semibold text-slate-900">
                        {src.title}
                      </span>
                      <p className="text-[11px] text-slate-500">
                        {src.type} • By {src.author} •{' '}
                        {src.redactionSummary?.totalRedactions || 0} redaction(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-teal-700 font-semibold">
                        Inspect →
                      </span>
                      {(isLeaderOrAdmin || isDeparting) &&
                        !handover.versionLocked && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteSourceFile(src, e)}
                            title="Delete source file"
                            className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 1: STRUCTURED HANDOVER REPORT & TEAM LEADER REVIEW
      ===================================================================== */}
      {activeTab === 'REPORT_REVIEW' && (
        <div className="space-y-6">
          {/* Team Leader Publication Control Bar */}
          {isLeaderOrAdmin && reportItems.length > 0 && (
            <div className="bg-white rounded-xl border border-teal-200 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-2xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-teal-700" />
                  <h2 className="text-base font-bold text-slate-900">
                    Team Leader Verification & Publication Gate
                  </h2>
                </div>
                <p className="text-xs text-slate-600">
                  {pendingReviewCount > 0 ? (
                    <>
                      <span className="font-bold text-amber-700">
                        {pendingReviewCount} report item(s) remain PENDING.
                      </span>{' '}
                      Every item must be reviewed (Approved or Rejected) before publishing to the Successor.
                    </>
                  ) : handover.status === 'PUBLISHED' ? (
                    <span className="font-semibold text-emerald-700">
                      This handover report is verified and PUBLISHED. Successor access is active.
                    </span>
                  ) : (
                    <span className="font-semibold text-emerald-700">
                      All {reportItems.length} items have been reviewed! You may now publish the verified report.
                    </span>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {pendingReviewCount > 0 && !handover.versionLocked && (
                  <button
                    onClick={handleApproveAllRemaining}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white"
                  >
                    Approve All {pendingReviewCount} Pending Items
                  </button>
                )}

                {handover.status !== 'REVISION_REQUESTED' && (
                  <button
                    type="button"
                    onClick={handleRequestRevision}
                    disabled={requestingRevision}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {requestingRevision
                      ? 'Requesting...'
                      : handover.versionLocked
                      ? 'Unlock & Request Revision'
                      : 'Request Revision'}
                  </button>
                )}

                {handover.status !== 'PUBLISHED' && (
                  <button
                    onClick={handlePublishReport}
                    disabled={publishing || pendingReviewCount > 0}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white shadow-2xs disabled:opacity-50"
                    title={
                      pendingReviewCount > 0
                        ? 'Review all pending items before publishing'
                        : 'Publish Verified Report'
                    }
                  >
                    {publishing
                      ? 'Publishing...'
                      : 'Publish Approved Report to Successor'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Section Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedSectionFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap ${
                selectedSectionFilter === 'ALL'
                  ? 'bg-teal-700 text-white border-teal-700'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              All 7 Sections ({reportItems.length})
            </button>
            {SECTION_META.map((sec) => {
              const count = reportItems.filter(
                (i) => i.section === sec.key
              ).length;
              return (
                <button
                  key={sec.key}
                  onClick={() => setSelectedSectionFilter(sec.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap ${
                    selectedSectionFilter === sec.key
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {sec.title} ({count})
                </button>
              );
            })}
          </div>

          {/* Sections & Report Items */}
          {SECTION_META.filter(
            (sec) =>
              selectedSectionFilter === 'ALL' ||
              selectedSectionFilter === sec.key
          ).map((sec) => {
            const items = reportItems.filter((i) => i.section === sec.key);
            return (
              <div
                key={sec.key}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden"
              >
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-bold text-slate-900">
                      {sec.title}
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-teal-50 text-teal-800 border border-teal-200">
                      {sec.badge}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-slate-500">
                    {items.length} item(s)
                  </span>
                </div>

                <div className="divide-y divide-slate-200">
                  {items.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500 italic">
                      Not found in available sources.
                    </div>
                  ) : (
                    items.map((item) => {
                      const isEditingThis = editingItemId === item.id;
                      const questionAnswer =
                        handover.openQuestionAnswers?.[item.id];

                      return (
                        <div key={item.id} className="p-6 space-y-3">
                          {/* Top Badges Row */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <ReviewStatusBadge status={item.reviewStatus} />
                              <ConfidenceBadge
                                confidence={item.confidence}
                                score={item.confidenceScore}
                              />
                              <DepartingStatusBadge
                                status={item.departingReviewStatus}
                              />
                              {item.citationVerified ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                  Citation Verified
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                  Unverified Claim
                                </span>
                              )}
                            </div>

                            {/* Source Citation Pills */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              {item.sourceIds.map((sid) => {
                                const srcDoc = sourcesMap[sid];
                                return (
                                  <button
                                    key={sid}
                                    type="button"
                                    onClick={() => {
                                      if (srcDoc) {
                                        setInspectedSource(srcDoc);
                                        setInspectedEvidence(item.evidence);
                                      }
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200 transition-colors"
                                  >
                                    <FileText className="w-3 h-3" />
                                    Source: {sid}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Statement or Inline Editor */}
                          {isEditingThis ? (
                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-300 space-y-3">
                              <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                  Edit Report Statement
                                </label>
                                <textarea
                                  rows={3}
                                  value={editStatementText}
                                  onChange={(e) =>
                                    setEditStatementText(e.target.value)
                                  }
                                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                  Team Leader Review Comment
                                </label>
                                <input
                                  type="text"
                                  value={editCommentText}
                                  onChange={(e) =>
                                    setEditCommentText(e.target.value)
                                  }
                                  placeholder="Reason for edit or approval note..."
                                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                                />
                              </div>
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingItemId(null)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-300"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveItemEdit(item)}
                                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800"
                                >
                                  Save & Approve Statement
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                              {item.statement}
                            </p>
                          )}

                          {/* Verbatim Evidence Excerpt Box */}
                          {item.evidence &&
                            item.statement !==
                              'Not found in available sources.' && (
                              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                                <span className="font-semibold text-slate-500 block">
                                  Supporting Source Evidence Excerpt:
                                </span>
                                <p className="font-mono text-slate-700">
                                  "{item.evidence}"
                                </p>
                              </div>
                            )}

                          {/* Open Question Answer if answered */}
                          {questionAnswer && (
                            <div className="p-3 rounded-lg bg-teal-50/70 border border-teal-200 text-xs">
                              <span className="font-bold text-teal-900">
                                Departing Member Answer ({questionAnswer.answeredByName}):
                              </span>{' '}
                              <span className="text-teal-900">
                                {questionAnswer.answer}
                              </span>
                            </div>
                          )}

                          {/* Comments & Edit History */}
                          {(item.departingComment ||
                            item.reviewerComment ||
                            item.editHistory.length > 0) && (
                            <div className="flex flex-wrap gap-3 text-xs text-slate-600 pt-1">
                              {item.departingComment && (
                                <span className="bg-amber-50/80 text-amber-900 px-2.5 py-1 rounded border border-amber-200">
                                  <strong>Departing Note:</strong>{' '}
                                  {item.departingComment}
                                </span>
                              )}
                              {item.reviewerComment && (
                                <span className="bg-slate-100 text-slate-800 px-2.5 py-1 rounded border border-slate-200">
                                  <strong>Leader Comment:</strong>{' '}
                                  {item.reviewerComment}
                                </span>
                              )}
                              {item.editHistory.length > 0 && (
                                <span className="text-slate-400 font-mono">
                                  Edited {item.editHistory.length} time(s)
                                </span>
                              )}
                            </div>
                          )}

                          {/* Action Bar: Team Leader Controls OR Departing Member Controls */}
                          <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
                            <span className="text-[11px] text-slate-400 font-mono">
                              {item.citationValidationNote}
                            </span>

                            <div className="flex flex-wrap items-center gap-2">
                              {/* Departing Member Confirm / Dispute Buttons */}
                              {(isDeparting || isLeaderOrAdmin) && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDepartingItemFeedback(
                                        item,
                                        'CONFIRMED'
                                      )
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-teal-50 hover:text-teal-800"
                                    title="Departing Member: Confirm accuracy"
                                  >
                                    <ThumbsUp className="w-3.5 h-3.5" />
                                    Confirm Finding
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDepartingItemFeedback(
                                        item,
                                        'DISPUTED'
                                      )
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-red-50 hover:text-red-700"
                                    title="Departing Member: Dispute finding"
                                  >
                                    <ThumbsDown className="w-3.5 h-3.5" />
                                    Dispute
                                  </button>
                                </>
                              )}

                              {/* Team Leader Approve / Edit / Reject Controls */}
                              {isLeaderOrAdmin && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingItemId(item.id);
                                      setEditStatementText(item.statement);
                                      setEditCommentText(
                                        item.reviewerComment || ''
                                      );
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleLeaderItemAction(item, 'APPROVED')
                                    }
                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleLeaderItemAction(item, 'REJECTED')
                                    }
                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold text-white bg-red-600 hover:bg-red-700"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    Reject
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =====================================================================
          TAB 3: DEPARTING MEMBER CONTEXT & OPEN QUESTIONS
      ===================================================================== */}
      {activeTab === 'DEPARTING_CONTEXT' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <MessageSquarePlus className="w-5 h-5 text-teal-700" />
              Add Missing Handover Context (Departing Member)
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Provide additional operational knowledge, runbook instructions, or architectural context. Any secrets or PII entered here are automatically redacted before being added to the handover Source Index.
            </p>

            <textarea
              rows={6}
              value={departingNotesInput}
              onChange={(e) => setDepartingNotesInput(e.target.value)}
              placeholder="Enter supplemental context, deployment caveats, or escalation contacts..."
              className="w-full p-3.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-teal-600 focus:outline-none"
            />

            <div className="flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={submittingContext}
                onClick={() => handleSubmitDepartingContext(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50"
              >
                Save Context Notes
              </button>
              <button
                type="button"
                disabled={submittingContext}
                onClick={() => handleSubmitDepartingContext(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800"
              >
                <Send className="w-3.5 h-3.5" />
                Submit Context & Notify Team Leader
              </button>
            </div>
          </div>

          <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Answer Open Questions ({
                reportItems.filter((i) => i.section === 'OPEN_QUESTIONS').length
              })
            </h2>
            <div className="space-y-4">
              {reportItems
                .filter((i) => i.section === 'OPEN_QUESTIONS')
                .map((qItem) => {
                  const existingAnswer =
                    handover.openQuestionAnswers?.[qItem.id];
                  return (
                    <div
                      key={qItem.id}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5"
                    >
                      <p className="text-sm font-semibold text-slate-900">
                        {qItem.statement}
                      </p>
                      {existingAnswer && (
                        <div className="p-2.5 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-900">
                          <strong>Recorded Answer ({existingAnswer.answeredByName}):</strong>{' '}
                          {existingAnswer.answer}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={questionAnswersInput[qItem.id] || ''}
                          onChange={(e) =>
                            setQuestionAnswersInput((prev) => ({
                              ...prev,
                              [qItem.id]: e.target.value,
                            }))
                          }
                          placeholder="Write answer to resolve this open question..."
                          className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                        />
                        <button
                          type="button"
                          disabled={submittingContext}
                          onClick={() =>
                            handleSubmitDepartingContext(false, qItem.id)
                          }
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800"
                        >
                          Save Answer
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: SOURCE INDEX & REDACTION REGISTRY
      ===================================================================== */}
      {activeTab === 'SOURCE_INDEX' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                8. Complete Source Index & Pre-AI Redaction Registry
              </h2>
              <p className="text-xs text-slate-500">
                Click any source record to inspect its provenance metadata and full redacted content.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-200">
            {sources.map((src) => (
              <div
                key={src.id}
                onClick={() => {
                  setInspectedSource(src);
                  setInspectedEvidence(undefined);
                }}
                className="p-5 hover:bg-slate-50 cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                      {src.id}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {src.type}
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      {src.title}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Author: <strong className="text-slate-700">{src.author}</strong> • Timestamp:{' '}
                    <span className="font-mono">
                      {new Date(src.timestamp).toLocaleString()}
                    </span>{' '}
                    • URL: <span className="font-mono">{src.url}</span>
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
                    {src.redactionSummary?.totalRedactions || 0} Redacted
                  </span>
                  <span className="text-xs font-semibold text-teal-700">
                    Inspect Source →
                  </span>
                  {(isLeaderOrAdmin || isDeparting) &&
                    !handover.versionLocked && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSourceFile(src, e)}
                        title="Delete source file"
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 5: VERSION & APPROVAL HISTORY
      ===================================================================== */}
      {activeTab === 'HISTORY' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-teal-700" />
            <h2 className="text-base font-bold text-slate-900">
              Handover Report Version & Approval History
            </h2>
          </div>

          <div className="space-y-3">
            {(handover.versionHistory || []).map((v) => (
              <div
                key={v.version}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-mono font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 mr-2">
                    Version v{v.version}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {v.summary}
                  </span>
                  <p className="text-slate-500 mt-1">
                    Actor: {v.actorName} ({v.actorRole}) • Approved Items:{' '}
                    {v.approvedCount} / {v.itemCount}
                  </p>
                </div>
                <span className="font-mono text-slate-400">
                  {new Date(v.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Source Citation Modal */}
      <SourceCitationModal
        source={inspectedSource}
        highlightEvidence={inspectedEvidence}
        onClose={() => setInspectedSource(null)}
      />
    </div>
  );
};

