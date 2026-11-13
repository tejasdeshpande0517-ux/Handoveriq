import React, { useEffect, useState } from 'react';
import { Activity, Lock, RefreshCw, Search } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import type { AuditLog } from '../../types';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import { RoleBadge } from '../../components/common/StatusBadge';

export const AuditLogsPage: React.FC = () => {
  const { showToast } = useToast();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');

  const loadLogs = async () => {
    try {
      setLoading(true);
      const res = await api.auditLogs.list();
      setLogs(res.logs);
    } catch (err: any) {
      showToast('error', 'Failed to load audit logs', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  if (loading) {
    return <LoadingSkeleton rows={6} />;
  }

  const uniqueActions = Array.from(new Set(logs.map((l) => l.action)));

  const filtered = logs.filter((l) => {
    const matchAction = actionFilter === 'ALL' || l.action === actionFilter;
    const matchSearch =
      !search.trim() ||
      l.target.toLowerCase().includes(search.toLowerCase()) ||
      l.userName.toLowerCase().includes(search.toLowerCase()) ||
      l.action.toLowerCase().includes(search.toLowerCase());
    return matchAction && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-teal-700" />
            <h1 className="text-2xl font-bold text-slate-900">
              Immutable Security & Governance Audit Logs
            </h1>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Append-only cryptographic event trail recording logins, project mutations, source uploads, redactions, AI report generations, human reviews, approvals, successor accesses, and PDF downloads.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-800 border border-slate-200 text-xs font-mono font-semibold">
            <Lock className="w-3.5 h-3.5 text-teal-700" />
            Append-Only (Modify/Delete Blocked)
          </span>
          <button
            onClick={loadLogs}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by user, action, or target resource..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-white border border-slate-300 text-sm focus:ring-2 focus:ring-teal-600 focus:outline-none"
          />
        </div>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3.5 py-2 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700"
        >
          <option value="ALL">All Event Actions ({logs.length})</option>
          {uniqueActions.map((act) => (
            <option key={act} value={act}>
              {act}
            </option>
          ))}
        </select>
      </div>

      {/* Audit Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-6">Timestamp (ISO)</th>
                <th className="py-3.5 px-4">Actor & Role</th>
                <th className="py-3.5 px-4">Action Type</th>
                <th className="py-3.5 px-4">Target Resource</th>
                <th className="py-3.5 px-6">Audit Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="py-3.5 px-6 font-mono text-slate-500 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {log.userName}
                      </span>
                      <RoleBadge role={log.userRole} />
                    </div>
                    <span className="font-mono text-[10px] text-slate-400">
                      UID: {log.userId}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="font-mono font-bold px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-medium text-slate-900">
                    {log.target}
                  </td>
                  <td className="py-3.5 px-6 font-mono text-[11px] text-slate-500 max-w-xs truncate">
                    {JSON.stringify(log.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

