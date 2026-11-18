import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  Bot,
  ChevronDown,
  FileText,
  FolderClosed,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import type { AppNotification, Handover, Project } from '../../types';
import { RoleBadge } from '../common/StatusBadge';

interface HeaderProps {
  onToggleMobileSidebar: () => void;
}

const DEMO_ACCOUNTS = [
  {
    label: 'Marcus Vance (Team Leader)',
    short: 'Team Lead',
    role: 'TEAM_LEADER',
    email: 'leader@handoveriq.io',
    pass: 'HandoverLead#2026',
  },
  {
    label: 'Elena Rostova (Admin)',
    short: 'Admin',
    role: 'ADMIN',
    email: 'admin@handoveriq.io',
    pass: 'HandoverAdmin#2026',
  },
  {
    label: 'Dr. Aris Thorne (Departing)',
    short: 'Departing',
    role: 'DEPARTING_MEMBER',
    email: 'departing@handoveriq.io',
    pass: 'HandoverDept#2026',
  },
  {
    label: 'Priya Nair (Successor)',
    short: 'Successor',
    role: 'SUCCESSOR',
    email: 'successor@handoveriq.io',
    pass: 'HandoverSucc#2026',
  },
];

export const Header: React.FC<HeaderProps> = ({ onToggleMobileSidebar }) => {
  const { user, login, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);

  const loadHeaderData = async () => {
    try {
      const [nRes, pRes, hRes] = await Promise.all([
        api.notifications.list(),
        api.projects.list(),
        api.handovers.list(),
      ]);
      setNotifications(nRes.notifications);
      setProjects(pRes.projects);
      setHandovers(hRes.handovers);
    } catch {
      // Ignore background header load error
    }
  };

  useEffect(() => {
    if (user) {
      loadHeaderData();
    }
  }, [user?.uid]);

  // Global Ctrl+K shortcut for Command Palette
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setCommandOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!user) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;
  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleQuickRoleSwitch = async (email: string, pass: string) => {
    try {
      const switchedUser = await login(email, pass);
      setProfileMenuOpen(false);
      showToast(
        'info',
        `Switched session to ${switchedUser.name}`,
        `Active Role: ${switchedUser.role}`
      );
      if (switchedUser.role === 'SUCCESSOR') {
        navigate('/successor');
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      showToast('error', 'Failed to switch role', err.message);
    }
  };

  const handleLogout = async () => {
    await logout();
    showToast('info', 'Signed out', 'Your session has been closed.');
    navigate('/login');
  };

  const matchedProjects = projects.filter(
    (p) =>
      !commandQuery.trim() ||
      p.name.toLowerCase().includes(commandQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(commandQuery.toLowerCase())
  );

  const matchedHandovers = handovers.filter(
    (h) =>
      !commandQuery.trim() ||
      h.title.toLowerCase().includes(commandQuery.toLowerCase())
  );

  return (
    <>
      <header className="h-18 px-4 sm:px-7 flex items-center justify-between gap-4 sticky top-0 z-20 backdrop-blur-md bg-white/75 border-b border-teal-900/8">
        <div className="flex items-center gap-3 flex-1 max-w-xl">
          <button
            onClick={onToggleMobileSidebar}
            className="p-2 rounded-xl text-slate-700 hover:bg-teal-50 lg:hidden"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Pill Search Bar matching Reference Image */}
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-full bg-white hover:bg-teal-50/40 border border-slate-200/90 shadow-[0_2px_12px_rgba(15,118,110,0.05)] hover:border-teal-400/60 transition-all text-left cursor-pointer group"
          >
            <div className="flex items-center gap-2.5 text-slate-400 group-hover:text-teal-700 transition-colors min-w-0">
              <Search className="w-4 h-4 shrink-0" />
              <span className="text-xs sm:text-sm text-slate-500 truncate">
                Search projects, handovers, or ask a question...
              </span>
            </div>
            <kbd className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
              Ctrl + K
            </kbd>
          </button>
        </div>

        {/* Right Side: Role Pill Switcher + Notification Bell + User Avatar Dropdown */}
        <div className="flex items-center gap-3">
          {/* Quick Role Switcher Pills on Desktop */}
          <div className="hidden xl:flex items-center gap-1 bg-white/90 border border-slate-200/90 rounded-full p-1 shadow-2xs">
            {DEMO_ACCOUNTS.map((acc) => {
              const isActive =
                user.role === acc.role ||
                user.email.toLowerCase() === acc.email.toLowerCase();
              return (
                <button
                  key={acc.email}
                  onClick={() => handleQuickRoleSwitch(acc.email, acc.pass)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#0b5c60] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {acc.short}
                </button>
              );
            })}
          </div>

          {/* Notification Bell with Red Counter Badge */}
          <div className="relative">
            <button
              onClick={() => {
                setNotifOpen((o) => !o);
                setProfileMenuOpen(false);
              }}
              className="relative w-10 h-10 rounded-full bg-white hover:bg-teal-50/50 border border-slate-200/90 flex items-center justify-center text-slate-700 shadow-2xs transition-transform active:scale-95 cursor-pointer"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                {unreadCount > 0 ? unreadCount : notifications.length}
              </span>
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2.5 w-84 bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden animate-slide-in-up">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
                  <span className="text-xs font-bold text-slate-900">
                    Activity Notifications ({notifications.length})
                  </span>
                  <button
                    onClick={loadHeaderData}
                    className="text-slate-500 hover:text-teal-700 p-1 rounded"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <p className="p-5 text-xs text-slate-500 text-center">
                      No notifications yet.
                    </p>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={async () => {
                          await api.notifications.markRead(n.id);
                          setNotifOpen(false);
                          loadHeaderData();
                          if (n.link) navigate(n.link);
                        }}
                        className={`p-3.5 cursor-pointer hover:bg-teal-50/40 transition-colors ${
                          !n.read ? 'bg-teal-50/25' : ''
                        }`}
                      >
                        <p className="text-xs font-bold text-slate-900">
                          {n.title}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                          {n.message}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1 font-mono">
                          {new Date(n.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Avatar Pill ("MV v") matching Reference Image */}
          <div className="relative">
            <button
              onClick={() => {
                setProfileMenuOpen((o) => !o);
                setNotifOpen(false);
              }}
              className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-white hover:bg-teal-50/40 border border-slate-200/90 shadow-2xs transition-all cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-[#094e52] text-white text-xs font-bold flex items-center justify-center">
                {initials}
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-600 transition-transform ${
                  profileMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {profileMenuOpen && (
              <div className="absolute right-0 mt-2.5 w-68 bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 p-2 animate-slide-in-up">
                <div className="px-3 py-2.5 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">
                      {user.name}
                    </span>
                    <RoleBadge role={user.role} />
                  </div>
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                    {user.email}
                  </p>
                </div>

                <div className="py-1.5">
                  <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <UserCheck className="w-3 h-3 text-teal-700" />
                    Switch Role Session
                  </p>
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.email}
                      onClick={() => handleQuickRoleSwitch(acc.email, acc.pass)}
                      className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-slate-700 hover:bg-teal-50 hover:text-teal-900 font-medium transition-colors"
                    >
                      {acc.label}
                    </button>
                  ))}
                </div>

                <div className="pt-1.5 border-t border-slate-100">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Ctrl + K Global Search & Command Palette Slide Modal */}
      {commandOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-slate-900/45 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full overflow-hidden animate-slide-in-up">
            <div className="px-4 py-3.5 border-b border-slate-200 flex items-center gap-3">
              <Search className="w-4 h-4 text-teal-700 shrink-0" />
              <input
                type="text"
                autoFocus
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                placeholder="Search projects, handovers, or jump to AI Q&A..."
                className="flex-1 text-sm text-slate-900 focus:outline-none"
              />
              <button
                onClick={() => setCommandOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 max-h-96 overflow-y-auto space-y-4 text-xs">
              {/* Quick Actions */}
              <div>
                <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Quick Navigation & AI Actions
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1">
                  <button
                    onClick={() => {
                      setCommandOpen(false);
                      navigate('/handovers/new');
                    }}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-teal-50/70 hover:bg-teal-100 text-teal-900 font-semibold transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-teal-700" />
                      Create New Handover
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setCommandOpen(false);
                      navigate('/successor');
                    }}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-indigo-50/70 hover:bg-indigo-100 text-indigo-900 font-semibold transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-indigo-700" />
                      Ask Grounded AI Assistant
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setCommandOpen(false);
                      navigate('/admin/redaction');
                    }}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/70 hover:bg-amber-100 text-amber-900 font-semibold transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-700" />
                      Test Pre-AI Secret Redaction
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Handovers */}
              <div>
                <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Handover Requests ({matchedHandovers.length})
                </p>
                <div className="space-y-1 mt-1">
                  {matchedHandovers.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => {
                        setCommandOpen(false);
                        navigate(
                          user.role === 'SUCCESSOR'
                            ? `/successor?handoverId=${h.id}`
                            : `/handovers/${h.id}`
                        );
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2 font-medium text-slate-800 truncate">
                        <FileText className="w-4 h-4 text-teal-700 shrink-0" />
                        {h.title}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        {h.status}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Projects */}
              <div>
                <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Projects ({matchedProjects.length})
                </p>
                <div className="space-y-1 mt-1">
                  {matchedProjects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setCommandOpen(false);
                        navigate(`/projects/${p.id}`);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2 font-medium text-slate-800 truncate">
                        <FolderClosed className="w-4 h-4 text-sky-600 shrink-0" />
                        {p.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {p.id}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
