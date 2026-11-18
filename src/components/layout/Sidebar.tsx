import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  FileText,
  FolderClosed,
  LayoutGrid,
  LogOut,
  MessageSquareMore,
  Network,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { UserRole } from '../../types';

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggle: () => void;
  onCloseMobile: () => void;
}

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  badge?: string;
  roles: UserRole[];
}

const QUICK_ROLES = [
  {
    name: 'Marcus Vance',
    roleLabel: 'Team Leader',
    email: 'leader@handoveriq.io',
    pass: 'HandoverLead#2026',
    initials: 'MV',
    color: 'from-teal-400 to-emerald-600',
  },
  {
    name: 'Elena Rostova',
    roleLabel: 'Admin',
    email: 'admin@handoveriq.io',
    pass: 'HandoverAdmin#2026',
    initials: 'ER',
    color: 'from-cyan-400 to-teal-700',
  },
  {
    name: 'Dr. Aris Thorne',
    roleLabel: 'Departing Member',
    email: 'departing@handoveriq.io',
    pass: 'HandoverDept#2026',
    initials: 'AT',
    color: 'from-amber-400 to-orange-600',
  },
  {
    name: 'Priya Nair',
    roleLabel: 'Successor',
    email: 'successor@handoveriq.io',
    pass: 'HandoverSucc#2026',
    initials: 'PN',
    color: 'from-indigo-400 to-purple-600',
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  mobileOpen,
  onToggle,
  onCloseMobile,
}) => {
  const { user, login, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [aiTourOpen, setAiTourOpen] = useState(false);

  if (!user) return null;

  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      to: '/dashboard',
      icon: <LayoutGrid className="w-5 h-5 shrink-0" />,
      roles: ['ADMIN', 'TEAM_LEADER', 'DEPARTING_MEMBER', 'SUCCESSOR'],
    },
    {
      label: 'Projects',
      to: '/projects',
      icon: <FolderClosed className="w-5 h-5 shrink-0" />,
      roles: ['ADMIN', 'TEAM_LEADER', 'DEPARTING_MEMBER', 'SUCCESSOR'],
    },
    {
      label: 'Handovers',
      to: '/handovers',
      icon: <FileText className="w-5 h-5 shrink-0" />,
      roles: ['ADMIN', 'TEAM_LEADER', 'DEPARTING_MEMBER'],
    },
    {
      label: 'Tasks',
      to: '/tasks',
      icon: <ClipboardList className="w-5 h-5 shrink-0" />,
      roles: ['ADMIN', 'TEAM_LEADER', 'DEPARTING_MEMBER', 'SUCCESSOR'],
    },
    {
      label: 'Knowledge Base',
      to: '/knowledge-base',
      icon: <BookOpen className="w-5 h-5 shrink-0" />,
      roles: ['ADMIN', 'TEAM_LEADER', 'DEPARTING_MEMBER', 'SUCCESSOR'],
    },
    {
      label: 'Q&A Assistant',
      to: '/successor',
      icon: <MessageSquareMore className="w-5 h-5 shrink-0" />,
      badge: 'New',
      roles: ['SUCCESSOR', 'TEAM_LEADER', 'ADMIN', 'DEPARTING_MEMBER'],
    },
    {
      label: 'Integrations',
      to: '/admin/integrations',
      icon: <Network className="w-5 h-5 shrink-0" />,
      roles: ['ADMIN', 'TEAM_LEADER', 'DEPARTING_MEMBER', 'SUCCESSOR'],
    },
    {
      label: 'Audit Logs',
      to: '/admin/audit-logs',
      icon: <FileCheck2 className="w-5 h-5 shrink-0" />,
      roles: ['ADMIN', 'TEAM_LEADER', 'DEPARTING_MEMBER', 'SUCCESSOR'],
    },
    {
      label: 'Settings',
      to: user.role === 'ADMIN' ? '/admin/users' : '/admin/redaction',
      icon: <Settings className="w-5 h-5 shrink-0" />,
      roles: ['ADMIN', 'TEAM_LEADER', 'DEPARTING_MEMBER', 'SUCCESSOR'],
    },
  ];

  const allowedItems = navItems.filter((item) =>
    item.roles.includes(user.role)
  );

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const roleDisplay: Record<string, string> = {
    ADMIN: 'Administrator',
    TEAM_LEADER: 'Team Leader',
    DEPARTING_MEMBER: 'Departing Member',
    SUCCESSOR: 'Successor',
  };

  const handleRoleSwitch = async (email: string, pass: string) => {
    try {
      const switched = await login(email, pass);
      setRoleMenuOpen(false);
      onCloseMobile();
      showToast(
        'info',
        `Switched to ${switched.name}`,
        `Active Role: ${roleDisplay[switched.role] || switched.role}`
      );
      if (switched.role === 'SUCCESSOR') {
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
    showToast('info', 'Signed out', 'Session closed safely.');
    navigate('/login');
  };

  const sidebarContent = (
    <div
      className={`relative h-full flex flex-col justify-between text-white select-none overflow-hidden transition-all duration-300 ease-out ${
        collapsed ? 'w-20' : 'w-68'
      }`}
      style={{
        background:
          'linear-gradient(165deg, #052528 0%, #08373a 42%, #052225 78%, #0c4447 100%)',
      }}
    >
      {/* Decorative glowing aurora orbs inside sidebar */}
      <div className="pointer-events-none absolute -top-16 -left-16 w-48 h-48 rounded-full bg-teal-400/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-28 -right-12 w-56 h-56 rounded-full bg-cyan-400/15 blur-3xl" />

      {/* Top Brand Logo & Collapse Button */}
      <div className="relative z-10">
        <div className="px-5 pt-6 pb-5 flex items-center justify-between gap-2">
          <div
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            {/* Custom Geometric Glowing H Ribbon Logo */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2df5dc] via-[#14b8a6] to-[#0d9488] p-0.5 shadow-[0_0_24px_rgba(45,245,220,0.45)] group-hover:scale-105 transition-transform shrink-0">
              <div className="w-full h-full bg-[#06292c] rounded-[10px] flex items-center justify-center">
                <svg
                  viewBox="0 0 32 32"
                  className="w-6 h-6"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M7 6C7 4.89543 7.89543 4 9 4H12C13.1046 4 14 4.89543 14 6V13H18V6C18 4.89543 18.8954 4 20 4H23C24.1046 4 25 4.89543 25 6V26C25 27.1046 24.1046 28 23 28H20C18.8954 28 18 27.1046 18 26V19H14V26C14 27.1046 13.1046 28 12 28H9C7.89543 28 7 27.1046 7 26V6Z"
                    fill="url(#hLogoGrad)"
                  />
                  <defs>
                    <linearGradient
                      id="hLogoGrad"
                      x1="7"
                      y1="4"
                      x2="25"
                      y2="28"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop stopColor="#5eead4" />
                      <stop offset="0.5" stopColor="#2dd4bf" />
                      <stop offset="1" stopColor="#0d9488" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

            {!collapsed && (
              <div className="leading-tight">
                <span className="text-lg font-extrabold tracking-tight text-white">
                  Handover<span className="text-[#4ef2dc]">IQ</span>
                </span>
                <p className="text-[10px] text-teal-200/75 font-medium">
                  Smart Handover. Seamless Transition.
                </p>
              </div>
            )}
          </div>

          <button
            onClick={onToggle}
            className="hidden lg:flex p-1.5 rounded-lg text-teal-200/70 hover:text-white hover:bg-white/10 transition-colors"
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-teal-200/70 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links with Smooth Sliding Active Pill */}
        <nav className="px-3.5 space-y-1.5 mt-1">
          {allowedItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `group relative flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-[#c4fbf2] via-[#a7f5e8] to-[#87eadb] text-[#052c2e] font-bold shadow-[0_8px_22px_rgba(45,212,191,0.28)] translate-x-0.5'
                    : 'text-teal-100/80 hover:text-white hover:bg-white/8 hover:translate-x-1'
                }`
              }
              title={collapsed ? item.label : undefined}
            >
              <div className="flex items-center gap-3 min-w-0">
                {item.icon}
                {!collapsed && <span className="truncate">{item.label}</span>}
              </div>

              {!collapsed && item.badge && (
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-gradient-to-r from-amber-500/30 to-yellow-500/30 text-amber-200 border border-amber-400/40 shadow-2xs">
                  <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Bottom Section: AI Promo Card + User Profile Switcher + Logout */}
      <div className="relative z-10 px-3.5 pb-4 space-y-3 mt-4">
        {/* AI-Powered Project Handover Promo Card */}
        {!collapsed && (
          <div className="relative rounded-2xl p-4 overflow-hidden border border-teal-400/25 bg-gradient-to-b from-[#0b4448]/90 to-[#06292c]/95 shadow-lg group">
            <div className="pointer-events-none absolute -right-6 -top-6 w-24 h-24 rounded-full bg-teal-400/20 blur-xl group-hover:scale-125 transition-transform" />
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-400/15 border border-teal-300/30 flex items-center justify-center text-[#4ef2dc] shadow-inner shrink-0 animate-pulse-glow">
                <Zap className="w-4 h-4 fill-current" />
              </div>
              <div className="leading-tight">
                <p className="text-xs font-bold text-white">
                  AI-Powered
                </p>
                <p className="text-xs font-bold text-[#6df7e5]">
                  Project Handover
                </p>
              </div>
            </div>
            <p className="text-[11px] text-teal-100/75 mt-2.5 leading-relaxed">
              Turn project activity into a trusted handover.
            </p>
            <button
              type="button"
              onClick={() => setAiTourOpen(true)}
              className="mt-3 w-full py-2 px-3 rounded-xl text-xs font-semibold bg-[#115e63] hover:bg-[#157278] text-white border border-teal-300/30 flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <span>Learn More</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Frosted User Profile Card with Slide-Up Role Switcher */}
        <div className="relative">
          {roleMenuOpen && !collapsed && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#072d30] border border-teal-400/30 rounded-2xl p-2 shadow-2xl animate-slide-in-up z-30">
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-300/80 px-2.5 py-1">
                Switch Role View Instantly
              </p>
              <div className="space-y-1 mt-1">
                {QUICK_ROLES.map((qr) => {
                  const active =
                    user.email.toLowerCase() === qr.email.toLowerCase();
                  return (
                    <button
                      key={qr.email}
                      onClick={() => handleRoleSwitch(qr.email, qr.pass)}
                      className={`w-full text-left px-2.5 py-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
                        active
                          ? 'bg-teal-500/25 text-white font-bold border border-teal-400/40'
                          : 'text-teal-100/80 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-6 h-6 rounded-full bg-gradient-to-br ${qr.color} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}
                        >
                          {qr.initials}
                        </span>
                        <div className="truncate">
                          <p className="truncate leading-tight">{qr.name}</p>
                          <p className="text-[10px] text-teal-300/80">
                            {qr.roleLabel}
                          </p>
                        </div>
                      </div>
                      {active && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setRoleMenuOpen((o) => !o)}
            className="w-full p-2.5 rounded-2xl bg-gradient-to-r from-[#d2f4f0] to-[#b8ebe5] text-[#062b2d] flex items-center justify-between gap-2.5 shadow-md hover:brightness-105 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0d6e72] to-[#06393c] text-white font-bold text-xs flex items-center justify-center ring-2 ring-white">
                  {initials}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-[#d2f4f0]" />
              </div>
              {!collapsed && (
                <div className="text-left truncate">
                  <p className="text-xs font-extrabold text-slate-900 truncate">
                    {user.name}
                  </p>
                  <p className="text-[11px] font-medium text-teal-900/80 truncate">
                    {roleDisplay[user.role] || user.role}
                  </p>
                </div>
              )}
            </div>
            {!collapsed && (
              <ChevronDown
                className={`w-4 h-4 text-slate-700 shrink-0 transition-transform ${
                  roleMenuOpen ? 'rotate-180' : ''
                }`}
              />
            )}
          </button>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-teal-100/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Logout"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>

      {/* Interactive Slide-Over AI Handover Workflow Drawer */}
      {aiTourOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/45 backdrop-blur-xs">
          <div className="bg-white text-slate-900 w-full max-w-md h-full p-6 shadow-2xl flex flex-col justify-between animate-slide-in-right">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-teal-50 text-teal-700 border border-teal-200">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      How HandoverIQ Works
                    </h3>
                    <p className="text-xs text-slate-500">
                      Source-Backed • Redacted • Leader-Verified
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setAiTourOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                {[
                  {
                    step: '01',
                    title: 'Multi-Source Activity Ingestion',
                    desc: 'Import GitHub commits, pull requests, issues, branches, review comments, or upload CSV, JSON, PDF, DOCX, and TXT files.',
                  },
                  {
                    step: '02',
                    title: 'Pre-AI Sensitive Data Redaction',
                    desc: 'API keys, tokens, passwords, emails, phone numbers, bank accounts, and confidential keywords are replaced with [REDACTED] before storage or Gemini processing.',
                  },
                  {
                    step: '03',
                    title: 'Structured AI Analysis & Citation Verification',
                    desc: 'Extracts 8 structured sections where every claim cites its source ID and verbatim evidence. Unverified claims move automatically to Open Questions.',
                  },
                  {
                    step: '04',
                    title: 'Departing Context & Mandatory Leader Approval',
                    desc: 'Departing engineers confirm/dispute items and answer open questions. Team Leaders approve every item before publishing to the Successor.',
                  },
                ].map((s) => (
                  <div
                    key={s.step}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-teal-700 text-white font-mono font-bold text-[10px]">
                        STEP {s.step}
                      </span>
                      <span className="font-bold text-slate-900">{s.title}</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed">{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex gap-2.5">
              <button
                onClick={() => {
                  setAiTourOpen(false);
                  navigate('/handovers/new');
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold"
              >
                Create New Handover →
              </button>
              <button
                onClick={() => setAiTourOpen(false)}
                className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block shrink-0 h-screen sticky top-0 z-30 shadow-xl">
        {sidebarContent}
      </aside>

      {/* Mobile & Tablet Sliding Drawer Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <aside className="relative z-10 h-full animate-slide-in-right">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};
