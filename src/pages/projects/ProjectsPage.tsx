import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  FolderKanban,
  GitBranch,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import type { Project, UserProfile } from '../../types';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';

export const ProjectsPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Create Project Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [teamLeadId, setTeamLeadId] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [githubRepo, setGithubRepo] = useState('');
  const [redactionKeywords, setRedactionKeywords] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Delete Confirmation State
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [projRes, usrRes] = await Promise.all([
        api.projects.list(),
        api.users.list(),
      ]);
      setProjects(projRes.projects);
      setUsers(usrRes.users);

      const defaultLead =
        usrRes.users.find((u) => u.role === 'TEAM_LEADER') || usrRes.users[0];
      if (defaultLead && !teamLeadId) {
        setTeamLeadId(defaultLead.uid);
        setSelectedMembers(usrRes.users.map((u) => u.uid));
      }
    } catch (err: any) {
      showToast('error', 'Failed to load projects', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const canManageProjects =
    user?.role === 'ADMIN' || user?.role === 'TEAM_LEADER';

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const connectedSources: Project['connectedSources'] = [
        { type: 'FILE_UPLOAD', verifiedAt: new Date().toISOString() },
      ];
      if (githubRepo.trim()) {
        connectedSources.push({
          type: 'GITHUB',
          repoFullName: githubRepo.trim(),
          branch: 'main',
          verifiedAt: new Date().toISOString(),
        });
      }

      const keywords = redactionKeywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);

      const res = await api.projects.create({
        name,
        description,
        teamLeadId,
        memberIds: selectedMembers,
        connectedSources,
        redactionRules: keywords,
      });

      setProjects((prev) => [res.project, ...prev]);
      setModalOpen(false);
      setName('');
      setDescription('');
      setGithubRepo('');
      setRedactionKeywords('');
      showToast(
        'success',
        'Project Created',
        `"${res.project.name}" has been saved to Firestore.`
      );
    } catch (err: any) {
      showToast('error', 'Failed to create project', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await api.projects.delete(deleteTarget.id);
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      showToast(
        'success',
        'Project Deleted',
        `"${deleteTarget.name}" was removed.`
      );
      setDeleteTarget(null);
    } catch (err: any) {
      showToast('error', 'Delete failed', err.message);
    } finally {
      setDeleting(false);
    }
  };

  const toggleMember = (uid: string) => {
    setSelectedMembers((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const usersMap = Object.fromEntries(users.map((u) => [u.uid, u]));

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <LoadingSkeleton rows={4} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Project Management & Connected Sources
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Configure projects, assign Team Leaders and members, and define project-specific confidential redaction keywords.
          </p>
        </div>

        {canManageProjects && (
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 shadow-2xs"
          >
            <Plus className="w-4 h-4" />
            Create Project
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects by name or description..."
          className="w-full pl-10 pr-4 py-2 rounded-lg bg-white border border-slate-300 text-sm focus:ring-2 focus:ring-teal-600 focus:outline-none"
        />
      </div>

      {/* Project Grid */}
      {filteredProjects.length === 0 ? (
        <EmptyState
          title="No Projects Found"
          description="Create your first project workspace to organize team members, data sources, and handover requests."
          action={
            canManageProjects ? (
              <button
                onClick={() => setModalOpen(true)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-teal-700 text-white hover:bg-teal-800"
              >
                Create First Project
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredProjects.map((project) => {
            const lead = usersMap[project.teamLeadId];
            return (
              <div
                key={project.id}
                className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-between hover:border-teal-600/50 transition-all"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-teal-50 text-teal-700 border border-teal-200">
                        <FolderKanban className="w-5 h-5" />
                      </div>
                      <div>
                        <Link
                          to={`/projects/${project.id}`}
                          className="text-base font-bold text-slate-900 hover:text-teal-700"
                        >
                          {project.name}
                        </Link>
                        <p className="text-xs font-mono text-slate-400">
                          ID: {project.id}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {project.status}
                      </span>
                      {canManageProjects && (
                        <button
                          onClick={() => setDeleteTarget(project)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                          title="Delete Project"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                    {project.description}
                  </p>

                  {/* Metadata */}
                  <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 block">Team Leader</span>
                      <span className="font-semibold text-slate-800">
                        {lead ? lead.name : project.teamLeadId}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Assigned Team</span>
                      <span className="font-semibold text-slate-800 inline-flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-teal-700" />
                        {project.memberIds.length} member(s)
                      </span>
                    </div>
                  </div>

                  {/* Redaction Rules & Sources */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {project.connectedSources.map((cs, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 text-slate-700 border border-slate-200"
                      >
                        <GitBranch className="w-3 h-3 text-teal-700" />
                        {cs.type}
                        {cs.repoFullName ? `: ${cs.repoFullName}` : ''}
                      </span>
                    ))}
                    {project.redactionRules.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                        <ShieldAlert className="w-3 h-3 text-amber-700" />
                        {project.redactionRules.length} custom secret keyword(s)
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-mono">
                    Created {new Date(project.createdAt).toLocaleDateString()}
                  </span>
                  <Link
                    to={`/projects/${project.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"
                  >
                    Manage Project & Activity <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Project Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">
                Create New Project Workspace
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Project Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Core Billing & Entitlements Service"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Project Description & Scope *
                </label>
                <textarea
                  required
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the architecture, service boundaries, and critical responsibilities..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assigned Team Leader *
                </label>
                <select
                  value={teamLeadId}
                  onChange={(e) => setTeamLeadId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-teal-600 focus:outline-none"
                >
                  {users
                    .filter((u) => u.role === 'TEAM_LEADER' || u.role === 'ADMIN')
                    .map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.name} ({u.role} — {u.email})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Assign Project Team Members
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                  {users.map((u) => (
                    <label
                      key={u.uid}
                      className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedMembers.includes(u.uid)}
                        onChange={() => toggleMember(u.uid)}
                        className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                      />
                      <span className="truncate">
                        {u.name} <span className="text-slate-400">({u.role})</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Default GitHub Repository (Optional)
                  </label>
                  <input
                    type="text"
                    value={githubRepo}
                    onChange={(e) => setGithubRepo(e.target.value)}
                    placeholder="owner/repository"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Confidential Redaction Keywords
                  </label>
                  <input
                    type="text"
                    value={redactionKeywords}
                    onChange={(e) => setRedactionKeywords(e.target.value)}
                    placeholder="INTERNAL-KEY-1, VAULT-CODE"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Project Workspace"
        description={`Are you sure you want to permanently delete "${deleteTarget?.name}"? This action will be recorded in the immutable audit log.`}
        confirmLabel="Delete Project"
        variant="danger"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

