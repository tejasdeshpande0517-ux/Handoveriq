import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Filter,
  History,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import type {
  Handover,
  HandoverTask,
  Project,
  TaskDashboardStats,
  TaskPriority,
  TaskStatus,
  UserProfile,
} from '../../types';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';

const PRIORITY_RANK: Record<TaskPriority, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  CRITICAL: 'bg-red-50 text-red-800 border-red-200',
  HIGH: 'bg-amber-50 text-amber-800 border-amber-200',
  MEDIUM: 'bg-teal-50 text-teal-800 border-teal-200',
  LOW: 'bg-slate-100 text-slate-700 border-slate-200',
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  TODO: 'bg-slate-100 text-slate-700 border-slate-300',
  IN_PROGRESS: 'bg-blue-50 text-blue-800 border-blue-200',
  UNDER_REVIEW: 'bg-purple-50 text-purple-800 border-purple-200',
  COMPLETED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  BLOCKED: 'bg-red-50 text-red-800 border-red-200',
};

export const TasksPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();

  const [tasks, setTasks] = useState<HandoverTask[]>([]);
  const [stats, setStats] = useState<TaskDashboardStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Sorting
  const [projectFilter, setProjectFilter] = useState(
    searchParams.get('projectId') || 'ALL'
  );
  const [handoverFilter, setHandoverFilter] = useState('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [deadlineFilter, setDeadlineFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'DEADLINE' | 'PRIORITY' | 'CREATED'>(
    'DEADLINE'
  );

  // Create Task Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [newHandoverId, setNewHandoverId] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('HIGH');
  const [newStartDate, setNewStartDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [newDeadline, setNewDeadline] = useState(
    new Date(Date.now() + 86400000 * 5).toISOString().slice(0, 10)
  );
  const [newAttachmentUrl, setNewAttachmentUrl] = useState('');
  const [creating, setCreating] = useState(false);

  // Expanded Task Drawer (Comments & History)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>(
    {}
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const [tRes, pRes, hRes, uRes] = await Promise.all([
        api.tasks.list(),
        api.projects.list(),
        api.handovers.list(),
        api.users.list(),
      ]);
      setTasks(tRes.tasks || []);
      setStats(tRes.stats || null);
      setProjects(pRes.projects || []);
      setHandovers(hRes.handovers || []);
      setUsers(uRes.users || []);
      if (pRes.projects?.length > 0 && !newProjectId) {
        const firstProj = pRes.projects[0];
        setNewProjectId(firstProj.id);
        setNewAssigneeId(firstProj.memberIds[0] || firstProj.teamLeadId);
      }
    } catch (err: any) {
      showToast('error', 'Failed to load task dashboard', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const canCreateTasks =
    user?.role === 'ADMIN' ||
    user?.role === 'TEAM_LEADER' ||
    user?.role === 'DEPARTING_MEMBER';

  const selectedProjectForCreate = projects.find((p) => p.id === newProjectId);
  const authorizedMembersForCreate = users.filter(
    (u) =>
      u.role === 'ADMIN' ||
      (selectedProjectForCreate &&
        (selectedProjectForCreate.memberIds.includes(u.uid) ||
          selectedProjectForCreate.teamLeadId === u.uid))
  );

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newProjectId || !newAssigneeId) return;
    try {
      setCreating(true);
      const attachments = newAttachmentUrl.trim()
        ? [{ name: 'Attached Documentation', url: newAttachmentUrl.trim() }]
        : [];
      await api.tasks.create({
        title: newTitle.trim(),
        description: newDesc.trim(),
        projectId: newProjectId,
        handoverId: newHandoverId || undefined,
        assignedUserId: newAssigneeId,
        priority: newPriority,
        startDate: newStartDate,
        deadline: newDeadline,
        attachments,
      });
      setNewTitle('');
      setNewDesc('');
      setNewAttachmentUrl('');
      setShowCreateModal(false);
      await loadData();
      showToast('success', 'Task Created & Assigned', 'Task added to project tracker.');
    } catch (err: any) {
      showToast('error', 'Failed to create task', err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateTask = async (
    taskId: string,
    patch: Parameters<typeof api.tasks.update>[1]
  ) => {
    try {
      await api.tasks.update(taskId, patch);
      await loadData();
      showToast('success', 'Task Updated', 'Progress and history updated.');
    } catch (err: any) {
      showToast('error', 'Task Update Denied', err.message);
    }
  };

  const handleAddComment = async (taskId: string) => {
    const text = (commentInputs[taskId] || '').trim();
    if (!text) return;
    try {
      await api.tasks.addComment(taskId, text);
      setCommentInputs((prev) => ({ ...prev, [taskId]: '' }));
      await loadData();
    } catch (err: any) {
      showToast('error', 'Failed to post comment', err.message);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await api.tasks.delete(taskId);
      await loadData();
      showToast('success', 'Task Deleted', 'Task removed from tracker.');
    } catch (err: any) {
      showToast('error', 'Failed to delete task', err.message);
    }
  };

  if (loading) {
    return <LoadingSkeleton rows={5} />;
  }

  const projectsMap = Object.fromEntries(projects.map((p) => [p.id, p]));
  const handoversMap = Object.fromEntries(handovers.map((h) => [h.id, h]));

  const filteredTasks = tasks
    .filter((t) => {
      if (projectFilter !== 'ALL' && t.projectId !== projectFilter) return false;
      if (handoverFilter !== 'ALL' && t.handoverId !== handoverFilter)
        return false;
      if (assigneeFilter === 'ME' && t.assignedUserId !== user?.uid)
        return false;
      if (
        assigneeFilter !== 'ALL' &&
        assigneeFilter !== 'ME' &&
        t.assignedUserId !== assigneeFilter
      )
        return false;
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'ALL' && t.priority !== priorityFilter)
        return false;
      if (deadlineFilter === 'OVERDUE' && !t.isOverdue) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'PRIORITY') {
        return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
      }
      if (sortBy === 'CREATED') {
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
            <ClipboardList className="w-3.5 h-3.5 text-teal-700" />
            Smart Task Tracking & Assignment
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-1.5">
            Project & Handover Task Execution Tracker
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Assign transition tasks to authorized project members, track real completion progress, and monitor deadlines.
          </p>
        </div>

        {canCreateTasks && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 shadow-2xs shrink-0"
          >
            <Plus className="w-4 h-4" />
            Create & Assign Task
          </button>
        )}
      </div>

      {/* 7-Metric Task Dashboard */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Total Tasks', val: stats.totalTasks, color: 'text-slate-900' },
            { label: 'Pending (To Do)', val: stats.pendingTasks, color: 'text-slate-700' },
            { label: 'In Progress', val: stats.inProgressTasks, color: 'text-blue-700' },
            { label: 'Completed', val: stats.completedTasks, color: 'text-emerald-700' },
            { label: 'Overdue Tasks', val: stats.overdueTasks, color: 'text-red-700' },
            { label: 'Blocked Tasks', val: stats.blockedTasks, color: 'text-amber-700' },
            { label: 'Assigned to Me', val: stats.tasksAssignedToMe, color: 'text-teal-700' },
          ].map((m) => (
            <div
              key={m.label}
              className="bg-white rounded-xl border border-slate-200 p-4"
            >
              <span className="text-[11px] font-semibold uppercase text-slate-400 block">
                {m.label}
              </span>
              <span className={`text-2xl font-bold font-mono mt-1 block ${m.color}`}>
                {m.val}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Project-Level & Handover-Level Real Task Progress */}
      {stats && projects.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Live Calculated Project & Handover Task Completion Progress
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {projects.slice(0, 3).map((proj) => {
              const pct = stats.projectProgress[proj.id] ?? 0;
              return (
                <div
                  key={proj.id}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900 truncate">
                      {proj.name}
                    </span>
                    <span className="font-mono font-bold text-teal-800">
                      {pct}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-teal-600 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter & Sort Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
          <Filter className="w-3.5 h-3.5 text-teal-700" />
          Filters:
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
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
        >
          <option value="ALL">All Assignees</option>
          <option value="ME">Assigned to Me</option>
          {users.map((u) => (
            <option key={u.uid} value={u.uid}>
              {u.name} ({u.role})
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
        >
          <option value="ALL">All Statuses</option>
          <option value="TODO">To Do</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="COMPLETED">Completed</option>
          <option value="BLOCKED">Blocked</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
        >
          <option value="ALL">All Priorities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>

        <select
          value={deadlineFilter}
          onChange={(e) => setDeadlineFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
        >
          <option value="ALL">All Deadlines</option>
          <option value="OVERDUE">Overdue Only</option>
        </select>

        <div className="ml-auto flex items-center gap-1.5">
          <span className="font-semibold text-slate-500">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
          >
            <option value="DEADLINE">Deadline</option>
            <option value="PRIORITY">Priority</option>
            <option value="CREATED">Creation Date</option>
          </select>
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-xs text-slate-500">
            No tasks match the current filter criteria.
          </div>
        ) : (
          filteredTasks.map((task) => {
            const proj = projectsMap[task.projectId];
            const hnd = task.handoverId ? handoversMap[task.handoverId] : null;
            const isExpanded = expandedTaskId === task.id;
            const projMembers = users.filter(
              (u) =>
                u.role === 'ADMIN' ||
                (proj &&
                  (proj.memberIds.includes(u.uid) || proj.teamLeadId === u.uid))
            );

            return (
              <div
                key={task.id}
                className={`bg-white rounded-xl border p-5 space-y-3 ${
                  task.isOverdue
                    ? 'border-red-300 bg-red-50/15'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          PRIORITY_STYLES[task.priority]
                        }`}
                      >
                        {task.priority}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          STATUS_STYLES[task.status]
                        }`}
                      >
                        {task.status.replace('_', ' ')}
                      </span>
                      {task.isOverdue && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white">
                          <AlertTriangle className="w-3 h-3" />
                          OVERDUE
                        </span>
                      )}
                      <span className="text-xs font-semibold text-teal-800">
                        {proj?.name || task.projectId}
                      </span>
                      {hnd && (
                        <span className="text-xs text-slate-500">
                          • Handover: {hnd.title}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {task.title}
                    </h3>
                    {task.description && (
                      <p className="text-xs text-slate-600">
                        {task.description}
                      </p>
                    )}
                  </div>

                  {/* Interactive Controls */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {/* Status Selector */}
                    <select
                      value={task.status}
                      onChange={(e) =>
                        handleUpdateTask(task.id, {
                          status: e.target.value as TaskStatus,
                        })
                      }
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                    >
                      <option value="TODO">To Do</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="UNDER_REVIEW">Under Review</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="BLOCKED">Blocked</option>
                    </select>

                    {/* Priority Selector */}
                    <select
                      value={task.priority}
                      onChange={(e) =>
                        handleUpdateTask(task.id, {
                          priority: e.target.value as TaskPriority,
                        })
                      }
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </select>

                    {/* Reassign Dropdown (Authorized Project Members Only) */}
                    <select
                      value={task.assignedUserId}
                      onChange={(e) =>
                        handleUpdateTask(task.id, {
                          assignedUserId: e.target.value,
                        })
                      }
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                    >
                      {projMembers.map((u) => (
                        <option key={u.uid} value={u.uid}>
                          Assignee: {u.name}
                        </option>
                      ))}
                    </select>

                    {/* Progress Selector */}
                    <select
                      value={task.progressPercent}
                      onChange={(e) =>
                        handleUpdateTask(task.id, {
                          progressPercent: Number(e.target.value),
                        })
                      }
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono"
                    >
                      {[0, 25, 50, 75, 100].map((pct) => (
                        <option key={pct} value={pct}>
                          {pct}%
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedTaskId(isExpanded ? null : task.id)
                      }
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 font-semibold inline-flex items-center gap-1"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-teal-700" />
                      {task.comments.length} • History ({task.history.length})
                    </button>

                    {(user?.role === 'ADMIN' ||
                      user?.role === 'TEAM_LEADER') && (
                      <button
                        type="button"
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                        title="Delete task"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar & Metadata Footer */}
                <div className="space-y-1.5 pt-1">
                  <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        task.status === 'COMPLETED'
                          ? 'bg-emerald-600'
                          : task.isOverdue
                          ? 'bg-red-600'
                          : 'bg-teal-600'
                      }`}
                      style={{ width: `${task.progressPercent}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5 text-teal-700" />
                        Assigned to <strong>{task.assignedUserName}</strong>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        Start: {task.startDate} • Deadline:{' '}
                        <strong
                          className={
                            task.isOverdue ? 'text-red-700' : 'text-slate-700'
                          }
                        >
                          {task.deadline}
                        </strong>
                      </span>
                      {task.attachments?.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-teal-700">
                          <Paperclip className="w-3 h-3" />
                          {task.attachments.length} attachment(s)
                        </span>
                      )}
                    </div>
                    <span className="font-mono">
                      Created by {task.createdByName}
                    </span>
                  </div>
                </div>

                {/* Expanded Comments & History Drawer */}
                {isExpanded && (
                  <div className="pt-3 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                    {/* Comments */}
                    <div className="space-y-2.5">
                      <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-teal-700" />
                        Task Discussion & Review Notes ({task.comments.length})
                      </h4>
                      <div className="space-y-2 max-h-44 overflow-y-auto">
                        {task.comments.length === 0 ? (
                          <p className="text-slate-400 italic">
                            No comments yet.
                          </p>
                        ) : (
                          task.comments.map((c) => (
                            <div
                              key={c.id}
                              className="p-2.5 rounded-lg bg-slate-50 border border-slate-200"
                            >
                              <div className="flex items-center justify-between font-semibold text-slate-800">
                                <span>{c.authorName}</span>
                                <span className="text-[10px] font-mono text-slate-400">
                                  {new Date(c.createdAt).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-slate-600 mt-1">{c.text}</p>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={commentInputs[task.id] || ''}
                          onChange={(e) =>
                            setCommentInputs((prev) => ({
                              ...prev,
                              [task.id]: e.target.value,
                            }))
                          }
                          placeholder="Add a task update or review comment..."
                          className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddComment(task.id)}
                          className="px-3 py-1.5 rounded-lg bg-teal-700 text-white font-semibold inline-flex items-center gap-1"
                        >
                          <Send className="w-3 h-3" />
                          Post
                        </button>
                      </div>
                    </div>

                    {/* Task History */}
                    <div className="space-y-2">
                      <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-teal-700" />
                        Task Audit & Status History ({task.history.length})
                      </h4>
                      <div className="space-y-1.5 max-h-52 overflow-y-auto">
                        {task.history.map((h) => (
                          <div
                            key={h.id}
                            className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                          >
                            <div>
                              <span className="font-mono font-bold text-teal-800 mr-1.5">
                                [{h.action}]
                              </span>
                              <span className="text-slate-700">
                                {h.details}
                              </span>
                              <span className="text-slate-400 ml-1">
                                by {h.actorName}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400 shrink-0">
                              {new Date(h.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Create & Assign Handover Task
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g., Verify Redis 7.2 failover script on staging"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Task Description
                </label>
                <textarea
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Acceptance criteria, runbook references, and expected outcome..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Project *
                  </label>
                  <select
                    value={newProjectId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      setNewProjectId(pid);
                      const p = projects.find((pr) => pr.id === pid);
                      if (p) {
                        setNewAssigneeId(p.memberIds[0] || p.teamLeadId);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Related Handover
                  </label>
                  <select
                    value={newHandoverId}
                    onChange={(e) => setNewHandoverId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="">None (Project-wide)</option>
                    {handovers
                      .filter((h) => h.projectId === newProjectId)
                      .map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.title}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Assign To (Authorized Members) *
                  </label>
                  <select
                    value={newAssigneeId}
                    onChange={(e) => setNewAssigneeId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                  >
                    {authorizedMembersForCreate.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Priority *
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) =>
                      setNewPriority(e.target.value as TaskPriority)
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Deadline *
                  </label>
                  <input
                    type="date"
                    required
                    value={newDeadline}
                    onChange={(e) => setNewDeadline(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Documentation / Runbook Link (Optional)
                </label>
                <input
                  type="text"
                  value={newAttachmentUrl}
                  onChange={(e) => setNewAttachmentUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo/blob/main/docs/runbook.md"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold"
                >
                  {creating ? 'Creating...' : 'Create & Assign Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

