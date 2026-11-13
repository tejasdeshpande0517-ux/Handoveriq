import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  Filter,
  GitPullRequestDraft,
  Plus,
  Search,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import type { Handover, HandoverStatus, Project, UserProfile } from '../../types';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import { HandoverStatusBadge } from '../../components/common/StatusBadge';

export const HandoversPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    const loadAll = async () => {
      try {
        setLoading(true);
        const [hRes, pRes, uRes] = await Promise.all([
          api.handovers.list(),
          api.projects.list(),
          api.users.list(),
        ]);
        setHandovers(hRes.handovers);
        setProjects(pRes.projects);
        setUsers(uRes.users);
      } catch (err: any) {
        showToast('error', 'Failed to load handovers', err.message);
      } finally {
        setLoading(false);
      }
    };
    loadAll();
  }, []);

  if (loading) {
    return <LoadingSkeleton rows={4} />;
  }

  const projectsMap = Object.fromEntries(projects.map((p) => [p.id, p]));
  const usersMap = Object.fromEntries(users.map((u) => [u.uid, u]));
  const canCreate = user?.role === 'ADMIN' || user?.role === 'TEAM_LEADER';

  const filtered = handovers.filter((h) => {
    const matchSearch =
      h.title.toLowerCase().includes(search.toLowerCase()) ||
      (projectsMap[h.projectId]?.name || '')
        .toLowerCase()
        .includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || h.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statuses: HandoverStatus[] = [
    'DRAFT',
    'INGESTING',
    'DEPARTING_REVIEW',
    'LEADER_REVIEW',
    'PUBLISHED',
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Handover Management & Verification Pipeline
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Track source ingestion, pre-AI redaction, Departing Member review, and Team Leader approval.
          </p>
        </div>

        {canCreate && (
          <Link
            to="/handovers/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 shadow-2xs"
          >
            <Plus className="w-4 h-4" />
            Create Handover Request
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search handovers by title or project..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-white border border-slate-300 text-sm focus:ring-2 focus:ring-teal-600 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              statusFilter === 'ALL'
                ? 'bg-teal-700 text-white border-teal-700'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            All ({handovers.length})
          </button>
          {statuses.map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-teal-700 text-white border-teal-700'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Handovers Table / Cards */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No Matching Handovers"
          description="No handover requests match your current filter criteria."
          icon={<GitPullRequestDraft className="w-6 h-6" />}
          action={
            canCreate ? (
              <Link
                to="/handovers/new"
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-teal-700 text-white hover:bg-teal-800"
              >
                Create Handover Request
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-6">Handover Request & Project</th>
                  <th className="py-3.5 px-4">Transition Participants</th>
                  <th className="py-3.5 px-4">Date Range</th>
                  <th className="py-3.5 px-4">Sources</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filtered.map((h) => {
                  const proj = projectsMap[h.projectId];
                  const dept = usersMap[h.departingMemberId];
                  const succ = usersMap[h.successorId];
                  return (
                    <tr
                      key={h.id}
                      onClick={() => navigate(`/handovers/${h.id}`)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="py-4 px-6">
                        <p className="font-semibold text-slate-900 hover:text-teal-700">
                          {h.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Project:{' '}
                          <span className="font-medium text-slate-700">
                            {proj?.name || h.projectId}
                          </span>{' '}
                          • <span className="font-mono text-[11px]">{h.id}</span>
                        </p>
                      </td>
                      <td className="py-4 px-4 text-xs">
                        <div>
                          <span className="text-slate-400">Departing:</span>{' '}
                          <span className="font-semibold text-slate-800">
                            {dept?.name || h.departingMemberId}
                          </span>
                        </div>
                        <div className="mt-1">
                          <span className="text-slate-400">Successor:</span>{' '}
                          <span className="font-semibold text-teal-800">
                            {succ?.name || h.successorId}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-xs font-mono text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {h.dateRange.startDate} → {h.dateRange.endDate}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-1">
                          {h.selectedDataSources.map((ds) => (
                            <span
                              key={ds}
                              className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-slate-100 text-slate-700 border border-slate-200"
                            >
                              {ds}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <HandoverStatusBadge status={h.status} />
                      </td>
                      <td className="py-4 px-6 text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700">
                          Open Workspace <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

