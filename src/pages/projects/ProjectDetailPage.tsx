import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Edit3,
  GitPullRequestDraft,
  Plus,
  Save,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import type { AuditLog, Handover, Project, UserProfile } from '../../types';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import { HandoverStatusBadge, RoleBadge } from '../../components/common/StatusBadge';

export const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [activityLogs, setActivityLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [teamLeadId, setTeamLeadId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [keywordsInput, setKeywordsInput] = useState('');
  const [saving, setSaving] = useState(false);

  const loadDetail = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [detailRes, usrRes] = await Promise.all([
        api.projects.get(id),
        api.users.list(),
      ]);
      setProject(detailRes.project);
      setHandovers(detailRes.handovers);
      setActivityLogs(detailRes.activityLogs);
      setUsers(usrRes.users);

      setName(detailRes.project.name);
      setDescription(detailRes.project.description);
      setTeamLeadId(detailRes.project.teamLeadId);
      setMemberIds(detailRes.project.memberIds);
      setKeywordsInput(detailRes.project.redactionRules.join(', '));
    } catch (err: any) {
      showToast('error', 'Failed to load project', err.message);
      navigate('/projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [id]);

  if (loading || !project) {
    return <LoadingSkeleton rows={4} />;
  }

  const canEdit =
    user?.role === 'ADMIN' ||
    (user?.role === 'TEAM_LEADER' && project.teamLeadId === user.uid);

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const rules = keywordsInput
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      const res = await api.projects.update(project.id, {
        name,
        description,
        teamLeadId,
        memberIds,
        redactionRules: rules,
      });
      setProject(res.project);
      setEditing(false);
      showToast('success', 'Project Updated', 'Changes saved to Firestore.');
    } catch (err: any) {
      showToast('error', 'Update failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleMember = (uid: string) => {
    setMemberIds((prev) =>
      prev.includes(uid) ? prev.filter((m) => m !== uid) : [...prev, uid]
    );
  };

  const usersMap = Object.fromEntries(users.map((u) => [u.uid, u]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Projects
        </Link>

        <div className="flex items-center gap-2.5">
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Project Configuration
            </button>
          )}
          {(user?.role === 'ADMIN' || user?.role === 'TEAM_LEADER') && (
            <Link
              to={`/handovers/new?projectId=${project.id}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800"
            >
              <Plus className="w-4 h-4" />
              Initiate Handover for Project
            </Link>
          )}
        </div>
      </div>

      {/* Project Overview or Edit Form */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        {editing ? (
          <form onSubmit={handleSaveChanges} className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              Edit Project Settings & Team Assignments
            </h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Project Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Description
              </label>
              <textarea
                rows={3}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Team Leader
                </label>
                <select
                  value={teamLeadId}
                  onChange={(e) => setTeamLeadId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  {users
                    .filter((u) => u.role === 'TEAM_LEADER' || u.role === 'ADMIN')
                    .map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Project Confidential Keywords (Comma-Separated)
                </label>
                <input
                  type="text"
                  value={keywordsInput}
                  onChange={(e) => setKeywordsInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Assigned Team Members
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
                {users.map((u) => (
                  <label
                    key={u.uid}
                    className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={memberIds.includes(u.uid)}
                      onChange={() => toggleMember(u.uid)}
                      className="rounded border-slate-300 text-teal-700"
                    />
                    <span>
                      {u.name} ({u.role})
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-2xl font-bold text-slate-900">
                {project.name}
              </h1>
              <span className="font-mono text-xs text-slate-500">
                Project ID: {project.id}
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              {project.description}
            </p>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 pt-5 border-t border-slate-200">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase">
                  <Users className="w-4 h-4 text-teal-700" />
                  Team Leader & Roster
                </div>
                <p className="text-sm font-bold text-slate-900 mt-2">
                  Lead: {usersMap[project.teamLeadId]?.name || project.teamLeadId}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {project.memberIds.map((uid) => {
                    const m = usersMap[uid];
                    return (
                      <span
                        key={uid}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 text-xs text-slate-700"
                      >
                        {m ? m.name : uid}
                        {m && <RoleBadge role={m.role} />}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase">
                  <ShieldAlert className="w-4 h-4 text-amber-700" />
                  Project Redaction Keywords
                </div>
                <p className="text-xs text-slate-600 mt-1.5">
                  Automatically replaced with <code className="font-mono">[REDACTED]</code> prior to AI analysis:
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {project.redactionRules.length === 0 ? (
                    <span className="text-xs text-slate-400">
                      Using global redaction rules only
                    </span>
                  ) : (
                    project.redactionRules.map((kw) => (
                      <span
                        key={kw}
                        className="px-2 py-0.5 rounded font-mono text-xs bg-amber-50 text-amber-800 border border-amber-200"
                      >
                        {kw}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase">
                  <GitPullRequestDraft className="w-4 h-4 text-teal-700" />
                  Handovers in Project
                </div>
                <p className="text-2xl font-bold font-mono text-slate-900 mt-2">
                  {handovers.length}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {handovers.filter((h) => h.status === 'PUBLISHED').length} published •{' '}
                  {handovers.filter((h) => h.status !== 'PUBLISHED').length} in progress
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Project Handovers & Activity Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              Project Handover Requests
            </h2>
          </div>
          <div className="divide-y divide-slate-200">
            {handovers.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">
                No handovers created for this project yet.
              </p>
            ) : (
              handovers.map((h) => (
                <div
                  key={h.id}
                  onClick={() =>
                    navigate(
                      user?.role === 'SUCCESSOR'
                        ? `/successor?handoverId=${h.id}`
                        : `/handovers/${h.id}`
                    )
                  }
                  className="p-4 sm:px-6 hover:bg-slate-50 cursor-pointer flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {h.title}
                      </span>
                      <HandoverStatusBadge status={h.status} />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Departing: {usersMap[h.departingMemberId]?.name || h.departingMemberId} → Successor:{' '}
                      {usersMap[h.successorId]?.name || h.successorId}
                    </p>
                  </div>
                  <span className="text-xs font-mono text-slate-500">
                    {h.dateRange.startDate} → {h.dateRange.endDate}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-teal-700" />
            <h2 className="text-base font-bold text-slate-900">
              Project Activity Trail
            </h2>
          </div>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {activityLogs.map((l) => (
              <div key={l.id} className="px-6 py-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-teal-800">
                    {l.action}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {new Date(l.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-slate-800">{l.target}</p>
                <p className="text-slate-500">By {l.userName}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

