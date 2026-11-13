import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  CheckSquare,
  FolderKanban,
  GitBranch,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import type { DataSourceType, Project, UserProfile } from '../../types';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';

const AVAILABLE_SOURCES: {
  type: DataSourceType;
  label: string;
  desc: string;
}[] = [
  {
    type: 'GITHUB',
    label: 'GitHub Repository (Commits, PRs, Issues, Branches, Reviews)',
    desc: 'Verified REST API v3 ingestion',
  },
  {
    type: 'CSV',
    label: 'CSV Structured Exports (.csv)',
    desc: 'Task exports, issue tables, metric logs',
  },
  {
    type: 'JSON',
    label: 'JSON Artifacts (.json)',
    desc: 'API configurations, backlog snapshots, architecture manifests',
  },
  {
    type: 'PDF',
    label: 'PDF Documents (.pdf)',
    desc: 'Design specs, postmortems, RFC documents',
  },
  {
    type: 'DOCX',
    label: 'Word Documents (.docx)',
    desc: 'Operational runbooks and engineering handover notes',
  },
  {
    type: 'TXT',
    label: 'Plaintext / Markdown Logs (.txt)',
    desc: 'Architecture notes, incident logs, release notes',
  },
];

export const CreateHandoverPage: React.FC = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [departingMemberId, setDepartingMemberId] = useState('');
  const [successorId, setSuccessorId] = useState('');
  const [startDate, setStartDate] = useState('2026-09-01');
  const [endDate, setEndDate] = useState('2026-11-12');
  const [deadline, setDeadline] = useState('2026-11-28');
  const [selectedSources, setSelectedSources] = useState<DataSourceType[]>([
    'GITHUB',
    'CSV',
    'JSON',
    'TXT',
  ]);
  const [githubRepo, setGithubRepo] = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const [pRes, uRes] = await Promise.all([
          api.projects.list(),
          api.users.list(),
        ]);
        setProjects(pRes.projects);
        setUsers(uRes.users);

        const preselectedProj =
          searchParams.get('projectId') || pRes.projects[0]?.id || '';
        setProjectId(preselectedProj);

        const deptUser =
          uRes.users.find((u) => u.role === 'DEPARTING_MEMBER') ||
          uRes.users[0];
        const succUser =
          uRes.users.find((u) => u.role === 'SUCCESSOR') || uRes.users[1];

        if (deptUser) setDepartingMemberId(deptUser.uid);
        if (succUser) setSuccessorId(succUser.uid);
      } catch (err: any) {
        showToast('error', 'Failed to load form options', err.message);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  if (loading) {
    return <LoadingSkeleton rows={4} />;
  }

  const toggleSource = (type: DataSourceType) => {
    setSelectedSources((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (departingMemberId === successorId) {
      showToast(
        'error',
        'Validation Error',
        'Departing Member and Successor Member must be two distinct individuals.'
      );
      return;
    }
    if (selectedSources.length === 0) {
      showToast(
        'error',
        'Validation Error',
        'Select at least one data source for collection.'
      );
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.handovers.create({
        title,
        projectId,
        departingMemberId,
        successorId,
        dateRange: { startDate, endDate },
        deadline,
        selectedDataSources: selectedSources,
        githubRepo: githubRepo.trim(),
      });

      showToast(
        'success',
        'Handover Request Created',
        'Proceeding to Data Ingestion & Redaction Workspace.'
      );
      navigate(`/handovers/${res.handover.id}`);
    } catch (err: any) {
      showToast('error', 'Failed to create handover', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link
        to="/handovers"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Handover Registry
      </Link>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-2xs">
        <div className="pb-6 border-b border-slate-200">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
            <ShieldCheck className="w-3.5 h-3.5" />
            Leader-Initiated Handover Workflow
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            Create New Handover Request
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Configure the project scope, departing and incoming engineers, activity date window, and supported ingestion sources.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {/* 1. Title & Project Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Handover Request Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Q4 Principal Backend Engineer Transition — Settlement Service"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-teal-600 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <FolderKanban className="w-4 h-4 text-teal-700" />
                Target Project *
              </label>
              <select
                required
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-teal-600 focus:outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (ID: {p.id})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 2. Departing Member & Successor Member */}
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-amber-700" />
                Select Departing Member *
              </label>
              <select
                required
                value={departingMemberId}
                onChange={(e) => setDepartingMemberId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-teal-600 focus:outline-none"
              >
                {users.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.name} — {u.role} ({u.email})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Can upload sources, answer open questions, and confirm/dispute AI findings.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-teal-700" />
                Select Successor Member *
              </label>
              <select
                required
                value={successorId}
                onChange={(e) => setSuccessorId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-teal-600 focus:outline-none"
              >
                {users.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.name} — {u.role} ({u.email})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Blocked from viewing this handover until Team Leader approval & publication.
              </p>
            </div>
          </div>

          {/* 3. Date Range & Deadline */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-teal-700" />
                Activity Start Date *
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-teal-700" />
                Activity End Date *
              </label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Target Completion Deadline
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
              />
            </div>
          </div>

          {/* 4. Select Available Data Sources (Only Real Implemented Connectors) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
              <CheckSquare className="w-4 h-4 text-teal-700" />
              Select Enabled Data Ingestion Sources *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {AVAILABLE_SOURCES.map((src) => {
                const checked = selectedSources.includes(src.type);
                return (
                  <label
                    key={src.type}
                    className={`p-3.5 rounded-xl border cursor-pointer flex items-start gap-3 transition-colors ${
                      checked
                        ? 'bg-teal-50/60 border-teal-600'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSource(src.type)}
                      className="mt-1 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                    />
                    <div>
                      <p className="text-xs font-bold text-slate-900">
                        {src.label}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {src.desc}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Optional GitHub Repository Target */}
          {selectedSources.includes('GITHUB') && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <GitBranch className="w-4 h-4 text-teal-700" />
                GitHub Repository Identifier (owner/repo)
              </label>
              <input
                type="text"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                placeholder="e.g., facebook/react or octocat/Hello-World"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-mono bg-white"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Retrieves live commits, pull requests, issues, branches, review comments, timestamps, and author metadata via GitHub REST API.
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <Link
              to="/handovers"
              className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 shadow-2xs disabled:opacity-50"
            >
              {submitting
                ? 'Initializing Handover...'
                : 'Initialize Handover & Proceed to Ingestion'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

