import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code2,
  Cuboid,
  FileText,
  Folder,
  Info,
  MessageSquare,
  MoreVertical,
  Puzzle,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AnimatedRobotAvatar } from '../../components/common/AnimatedRobotAvatar';
import { api } from '../../lib/api';
import type {
  DashboardStats,
  IntegrationConfig,
  QAResponse,
} from '../../types';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';
import {
  FormattedQAAnswer,
  stripMarkdownForPreview,
} from '../../components/common/FormattedQAAnswer';

type ChartRange = '7D' | '30D' | '90D';

interface ChartPoint {
  label: string;
  dateLabel: string;
  value: number;
  x: number;
  y: number;
}

const CHART_DATASETS: Record<ChartRange, ChartPoint[]> = {
  '7D': [
    { label: 'Nov 7', dateLabel: 'Nov 7', value: 1, x: 25, y: 112 },
    { label: 'Nov 8', dateLabel: 'Nov 8', value: 2, x: 78, y: 78 },
    { label: 'Nov 9', dateLabel: 'Nov 9', value: 2, x: 132, y: 84 },
    { label: 'Nov 10', dateLabel: 'Nov 10', value: 3, x: 186, y: 54 },
    { label: 'Nov 11', dateLabel: 'Nov 11', value: 4, x: 240, y: 34 },
    { label: 'Nov 12', dateLabel: 'Nov 12', value: 3, x: 294, y: 52 },
    { label: 'Nov 13', dateLabel: 'Nov 13', value: 3, x: 345, y: 56 },
  ],
  '30D': [
    { label: 'Wk 1', dateLabel: 'Oct 15', value: 1, x: 25, y: 110 },
    { label: 'Wk 2', dateLabel: 'Oct 22', value: 2, x: 90, y: 82 },
    { label: 'Wk 3', dateLabel: 'Oct 29', value: 3, x: 155, y: 56 },
    { label: 'Wk 4', dateLabel: 'Nov 05', value: 3, x: 220, y: 58 },
    { label: 'Wk 5', dateLabel: 'Nov 10', value: 4, x: 285, y: 32 },
    { label: 'Now', dateLabel: 'Nov 12', value: 4, x: 345, y: 36 },
  ],
  '90D': [
    { label: 'Sep', dateLabel: 'Sep 01', value: 1, x: 25, y: 115 },
    { label: 'Sep 15', dateLabel: 'Sep 15', value: 2, x: 90, y: 88 },
    { label: 'Oct 01', dateLabel: 'Oct 01', value: 2, x: 155, y: 80 },
    { label: 'Oct 15', dateLabel: 'Oct 15', value: 3, x: 220, y: 55 },
    { label: 'Nov 01', dateLabel: 'Nov 01', value: 4, x: 285, y: 35 },
    { label: 'Nov 12', dateLabel: 'Nov 12', value: 4, x: 345, y: 30 },
  ],
};

function buildSmoothSvgPath(pts: ChartPoint[]): string {
  if (pts.length === 0) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const curr = pts[i];
    const next = pts[i + 1];
    const ctrlX1 = curr.x + (next.x - curr.x) / 2;
    const ctrlY1 = curr.y;
    const ctrlX2 = curr.x + (next.x - curr.x) / 2;
    const ctrlY2 = next.y;
    d += ` C ${ctrlX1} ${ctrlY1}, ${ctrlX2} ${ctrlY2}, ${next.x} ${next.y}`;
  }
  return d;
}

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Interactive Chart & Slider States
  const [chartRange, setChartRange] = useState<ChartRange>('7D');
  const [selectedPointIdx, setSelectedPointIdx] = useState<number>(3);
  const kpiSliderRef = useRef<HTMLDivElement>(null);
  const integrationsSliderRef = useRef<HTMLDivElement>(null);

  // Interactive Slide-Over Drawers
  const [docsDrawerOpen, setDocsDrawerOpen] = useState(false);
  const [openMenuRowId, setOpenMenuRowId] = useState<string | null>(null);

  // Inline "Ask HandoverIQ" Widget State
  const [inlineQuestion, setInlineQuestion] = useState('');
  const [drawerQuestion, setDrawerQuestion] = useState('');
  const [inlineQaResult, setInlineQaResult] = useState<QAResponse | null>(null);
  const [qaHistory, setQaHistory] = useState<QAResponse[]>([]);
  const [askingInline, setAskingInline] = useState(false);
  const [qaDrawerOpen, setQaDrawerOpen] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [dashRes, intRes] = await Promise.all([
        api.dashboard.getStats(),
        api.integrations.list(),
      ]);
      setStats(dashRes.stats);
      setIntegrations(intRes.integrations);
    } catch (err: any) {
      showToast('error', 'Failed to load dashboard metrics', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [user?.uid]);

  if (loading || !stats || !user) {
    return <LoadingSkeleton rows={5} />;
  }

  const firstName = user.name.split(' ')[0] || user.name;
  const activePoints = CHART_DATASETS[chartRange];
  const safeIdx = Math.min(selectedPointIdx, activePoints.length - 1);
  const activePoint = activePoints[safeIdx];
  const linePath = buildSmoothSvgPath(activePoints);
  const areaPath = `${linePath} L ${
    activePoints[activePoints.length - 1].x
  } 140 L ${activePoints[0].x} 140 Z`;

  const scrollContainer = (
    ref: React.RefObject<HTMLDivElement | null>,
    dir: 'left' | 'right'
  ) => {
    if (!ref.current) return;
    const amount = dir === 'left' ? -280 : 280;
    ref.current.scrollBy({ left: amount, behavior: 'smooth' });
  };

  const handleInlineAsk = async (
    e?: React.FormEvent,
    customPrompt?: string,
    fromDrawer = false
  ) => {
    if (e) e.preventDefault();
    const q = (
      customPrompt ||
      (fromDrawer ? drawerQuestion : inlineQuestion)
    ).trim();
    if (!q) {
      setQaDrawerOpen(true);
      return;
    }

    try {
      setAskingInline(true);
      setQaError(null);
      setQaDrawerOpen(true);
      const res = await api.handovers.askQA('all', q);
      setInlineQaResult(res.qaResult);
      setQaHistory((prev) => [res.qaResult, ...prev]);
      if (!customPrompt) {
        if (fromDrawer) {
          setDrawerQuestion('');
        } else {
          setInlineQuestion('');
        }
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to reach Grounded Q&A service.';
      setQaError(msg);
      showToast('error', 'Grounded Q&A Alert', msg);
    } finally {
      setAskingInline(false);
    }
  };

  const githubInt = integrations.find((i) => i.id === 'github');
  const geminiInt = integrations.find((i) => i.id === 'gemini');

  // 5 Wave Sparkline KPI Cards matching the Reference Image
  const kpiCards = [
    {
      id: 'projects',
      label: 'Total Projects',
      value: stats.totalProjects,
      trend: '+1',
      icon: <Folder className="w-5 h-5 text-blue-600 fill-blue-500/20" />,
      iconBg: 'bg-blue-100/80 border-blue-200',
      strokeColor: '#3b82f6',
      fillId: 'waveBlue',
      colorStop1: 'rgba(59, 130, 246, 0.32)',
      colorStop2: 'rgba(59, 130, 246, 0.0)',
      wavePath:
        'M0,28 C35,26 55,14 90,18 C125,22 150,8 185,14 C220,20 245,6 280,10 L280,45 L0,45 Z',
      linePath:
        'M0,28 C35,26 55,14 90,18 C125,22 150,8 185,14 C220,20 245,6 280,10',
      link: '/projects',
    },
    {
      id: 'active',
      label: 'Active Handovers',
      value: stats.activeHandovers,
      trend: '+0',
      icon: <Users className="w-5 h-5 text-violet-600 fill-violet-500/20" />,
      iconBg: 'bg-violet-100/80 border-violet-200',
      strokeColor: '#7c3aed',
      fillId: 'waveViolet',
      colorStop1: 'rgba(124, 58, 237, 0.30)',
      colorStop2: 'rgba(124, 58, 237, 0.0)',
      wavePath:
        'M0,30 C40,22 70,28 110,16 C150,4 180,22 220,12 C250,6 265,14 280,8 L280,45 L0,45 Z',
      linePath:
        'M0,30 C40,22 70,28 110,16 C150,4 180,22 220,12 C250,6 265,14 280,8',
      link: user.role === 'SUCCESSOR' ? '/successor' : '/handovers',
    },
    {
      id: 'pending',
      label: 'Pending Approvals',
      value: stats.pendingApprovals,
      trend: '+1',
      icon: <Clock className="w-5 h-5 text-orange-600 fill-orange-500/20" />,
      iconBg: 'bg-orange-100/80 border-orange-200',
      strokeColor: '#f97316',
      fillId: 'waveOrange',
      colorStop1: 'rgba(249, 115, 22, 0.32)',
      colorStop2: 'rgba(249, 115, 22, 0.0)',
      wavePath:
        'M0,32 C35,28 75,14 115,22 C155,30 190,10 230,16 C255,20 268,8 280,12 L280,45 L0,45 Z',
      linePath:
        'M0,32 C35,28 75,14 115,22 C155,30 190,10 230,16 C255,20 268,8 280,12',
      link: user.role === 'SUCCESSOR' ? '/successor' : '/handovers',
    },
    {
      id: 'completed',
      label: 'Completed Handovers',
      value: stats.completedHandovers,
      trend: '+0',
      icon: (
        <CheckCircle2 className="w-5 h-5 text-emerald-600 fill-emerald-500/20" />
      ),
      iconBg: 'bg-emerald-100/80 border-emerald-200',
      strokeColor: '#10b981',
      fillId: 'waveEmerald',
      colorStop1: 'rgba(16, 185, 129, 0.32)',
      colorStop2: 'rgba(16, 185, 129, 0.0)',
      wavePath:
        'M0,28 C45,28 75,18 120,20 C165,22 195,8 235,14 C260,18 270,8 280,6 L280,45 L0,45 Z',
      linePath:
        'M0,28 C45,28 75,18 120,20 C165,22 195,8 235,14 C260,18 270,8 280,6',
      link: '/successor',
    },
    {
      id: 'integrations',
      label: 'Connected Integrations',
      value: stats.connectedIntegrations,
      trend: `${stats.totalSourcesIngested} src`,
      icon: <Puzzle className="w-5 h-5 text-purple-600 fill-purple-500/20" />,
      iconBg: 'bg-purple-100/80 border-purple-200',
      strokeColor: '#9333ea',
      fillId: 'wavePurple',
      colorStop1: 'rgba(147, 51, 234, 0.30)',
      colorStop2: 'rgba(147, 51, 234, 0.0)',
      wavePath:
        'M0,30 C35,20 75,28 115,16 C155,6 195,22 235,12 C260,8 270,12 280,8 L280,45 L0,45 Z',
      linePath:
        'M0,30 C35,20 75,28 115,16 C155,6 195,22 235,12 C260,8 270,12 280,8',
      link: '/admin/integrations',
    },
  ];

  return (
    <div className="space-y-5 pb-6">
      {/* =====================================================================
          ROW 1: HERO BANNER + "TRUSTED & SECURE" CARD
      ===================================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left Hero Banner (9 Columns) */}
        <div
          className="xl:col-span-9 relative rounded-3xl p-6 sm:p-8 overflow-hidden border border-teal-500/20 shadow-[0_10px_35px_rgba(13,148,136,0.08)] flex flex-col md:flex-row items-center justify-between gap-6"
          style={{
            background:
              'linear-gradient(125deg, #ffffff 0%, #e4f9f5 48%, #c1efe8 100%)',
          }}
        >
          {/* Subtle decorative wave background */}
          <div className="pointer-events-none absolute -right-12 -bottom-16 w-80 h-80 rounded-full bg-teal-400/20 blur-2xl" />

          <div className="relative z-10 max-w-lg space-y-3">
            <h1 className="text-2xl sm:text-3xl lg:text-[34px] font-extrabold tracking-tight text-slate-900 leading-tight">
              Welcome back,{' '}
              <span className="text-[#0c857b]">{firstName}!</span>{' '}
              <span className="inline-block animate-bounce">👋</span>
            </h1>
            <p className="text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
              Manage your project handovers with the power of AI and verified sources.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={() =>
                  navigate(
                    user.role === 'SUCCESSOR'
                      ? '/successor'
                      : user.role === 'DEPARTING_MEMBER'
                      ? '/handovers'
                      : '/handovers/new'
                  )
                }
                className="group inline-flex items-center gap-2.5 pl-3 pr-5 py-2.5 rounded-full text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-[#074246] via-[#0b5c60] to-[#0e7479] hover:brightness-110 shadow-[0_8px_20px_rgba(11,92,96,0.3)] transition-all hover:-translate-y-0.5 cursor-pointer"
              >
                <span className="w-6 h-6 rounded-full bg-teal-400/25 border border-teal-300/40 flex items-center justify-center text-[#5eead4]">
                  <Sparkles className="w-3.5 h-3.5" />
                </span>
                <span>
                  {user.role === 'SUCCESSOR'
                    ? 'Explore Approved Reports'
                    : 'Create New Handover'}
                </span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={() => setDocsDrawerOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold text-slate-700 bg-white/90 hover:bg-white border border-slate-300/80 shadow-2xs transition-all hover:-translate-y-0.5 cursor-pointer"
              >
                <BookOpen className="w-4 h-4 text-teal-700" />
                <span>View Documentation</span>
              </button>
            </div>
          </div>

          {/* Right Animated 3D Isometric Laptop & Floating Source Cards Illustration */}
          <div className="relative z-10 w-64 sm:w-76 h-40 sm:h-44 shrink-0 select-none">
            <svg
              viewBox="0 0 340 190"
              className="w-full h-full drop-shadow-xl"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Isometric Glowing Platform Base */}
              <path
                d="M170 115L285 152L170 186L55 152L170 115Z"
                fill="url(#isoBaseGrad)"
                stroke="#5eead4"
                strokeWidth="1.5"
              />
              <path
                d="M75 148L170 118L265 148L170 176L75 148Z"
                fill="#0b4649"
                fillOpacity="0.18"
              />

              {/* Floating Left Source Card (Animated) */}
              <g className="animate-float-slow">
                <rect
                  x="24"
                  y="36"
                  width="78"
                  height="52"
                  rx="10"
                  fill="white"
                  fillOpacity="0.92"
                  stroke="#99f6e4"
                  strokeWidth="1.5"
                />
                <rect
                  x="34"
                  y="46"
                  width="18"
                  height="18"
                  rx="5"
                  fill="#0d9488"
                />
                <rect
                  x="58"
                  y="48"
                  width="34"
                  height="6"
                  rx="3"
                  fill="#0f766e"
                />
                <rect
                  x="58"
                  y="58"
                  width="24"
                  height="5"
                  rx="2.5"
                  fill="#94a3b8"
                />
                <rect
                  x="34"
                  y="72"
                  width="56"
                  height="6"
                  rx="3"
                  fill="#ccfbf1"
                />
              </g>

              {/* Center 3D Laptop Screen & Keyboard */}
              <g>
                {/* Laptop Screen */}
                <rect
                  x="114"
                  y="24"
                  width="112"
                  height="76"
                  rx="10"
                  fill="#052a2d"
                  stroke="#2dd4bf"
                  strokeWidth="2"
                />
                {/* Glowing H Logo inside Laptop Screen */}
                <path
                  d="M155 46H163V58H177V46H185V78H177V65H163V78H155V46Z"
                  fill="#2dd4bf"
                />
                {/* Laptop Keyboard Deck */}
                <path
                  d="M100 102H240L258 126H82L100 102Z"
                  fill="url(#laptopDeckGrad)"
                  stroke="#94a3b8"
                  strokeWidth="1"
                />
                <path d="M152 118H188L192 124H148L152 118Z" fill="#cbd5e1" />
              </g>

              {/* Floating Right Shield & Document Card (Animated Reverse) */}
              <g className="animate-float-reverse">
                <rect
                  x="236"
                  y="28"
                  width="82"
                  height="56"
                  rx="10"
                  fill="white"
                  fillOpacity="0.92"
                  stroke="#99f6e4"
                  strokeWidth="1.5"
                />
                <circle cx="256" cy="48" r="10" fill="#14b8a6" />
                <path
                  d="M252 48L255 51L261 45"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <rect
                  x="272"
                  y="43"
                  width="36"
                  height="6"
                  rx="3"
                  fill="#0f766e"
                />
                <rect
                  x="272"
                  y="53"
                  width="26"
                  height="5"
                  rx="2.5"
                  fill="#94a3b8"
                />
                <rect
                  x="246"
                  y="68"
                  width="60"
                  height="6"
                  rx="3"
                  fill="#ccfbf1"
                />
              </g>

              <defs>
                <linearGradient
                  id="isoBaseGrad"
                  x1="55"
                  y1="115"
                  x2="285"
                  y2="186"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor="#e6fcf9" />
                  <stop offset="1" stopColor="#99f6e4" />
                </linearGradient>
                <linearGradient
                  id="laptopDeckGrad"
                  x1="82"
                  y1="102"
                  x2="258"
                  y2="126"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor="#f8fafc" />
                  <stop offset="1" stopColor="#cbd5e1" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* Right "Trusted & Secure" Card (3 Columns) */}
        <div
          onClick={() => navigate('/admin/redaction')}
          className="xl:col-span-3 relative rounded-3xl bg-white p-6 border border-slate-200/90 shadow-[0_10px_30px_rgba(15,118,110,0.06)] hover:shadow-lg transition-all hover:-translate-y-0.5 cursor-pointer overflow-hidden flex flex-col justify-between group"
        >
          {/* Bottom Mint Wave Accent */}
          <svg
            viewBox="0 0 260 80"
            className="pointer-events-none absolute bottom-0 right-0 w-full h-20 opacity-85"
            preserveAspectRatio="none"
          >
            <path
              d="M0,65 C80,55 140,20 260,30 L260,80 L0,80 Z"
              fill="url(#secureMintWave)"
            />
            <defs>
              <linearGradient id="secureMintWave" x1="0" y1="0" x2="1" y2="1">
                <stop stopColor="#ccfbf1" />
                <stop offset="1" stopColor="#5eead4" />
              </linearGradient>
            </defs>
          </svg>

          <div className="relative z-10 flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#ecfdf5] to-[#ccfbf1] border border-teal-200 flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
              <Shield className="w-6 h-6 text-[#0d9488] fill-[#14b8a6]/25" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Trusted & Secure
              </h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Your data is protected with enterprise-grade security.
              </p>
            </div>
          </div>

          <div className="relative z-10 mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-teal-800">
            <span>{stats.totalRedactionsApplied} Secrets Redacted</span>
            <span className="inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              Inspect Rules <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          ROW 2: 5 WAVE SPARKLINE KPI CARDS (Interactive Horizontal Slider + Grid)
      ===================================================================== */}
      <div className="relative">
        {/* Mobile/Tablet Slide Controls */}
        <div className="flex lg:hidden items-center justify-end gap-1.5 mb-2">
          <button
            onClick={() => scrollContainer(kpiSliderRef, 'left')}
            className="p-1.5 rounded-full bg-white border border-slate-200 text-slate-600 shadow-2xs"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scrollContainer(kpiSliderRef, 'right')}
            className="p-1.5 rounded-full bg-white border border-slate-200 text-slate-600 shadow-2xs"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div
          ref={kpiSliderRef}
          className="flex lg:grid lg:grid-cols-5 gap-4 overflow-x-auto lg:overflow-visible snap-x snap-mandatory pb-1"
        >
          {kpiCards.map((card) => (
            <Link
              key={card.id}
              to={card.link}
              className="snap-start shrink-0 w-64 sm:w-68 lg:w-auto relative bg-white rounded-2xl border border-slate-200/90 pt-4 px-5 pb-11 shadow-[0_4px_20px_rgba(15,23,42,0.04)] hover:shadow-[0_12px_28px_rgba(13,148,136,0.12)] hover:-translate-y-1 transition-all duration-200 overflow-hidden group"
            >
              <div className="relative z-10 flex items-start justify-between gap-2">
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform ${card.iconBg}`}
                  >
                    {card.icon}
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-slate-900 leading-none">
                      {card.value}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 mt-1.5">
                      {card.label}
                    </p>
                  </div>
                </div>

                {card.id === 'integrations' ? (
                  <span className="w-6 h-6 rounded-full bg-purple-50 border border-purple-200 text-purple-600 flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                    ↑ {card.trend}
                  </span>
                )}
              </div>

              {/* Bottom SVG Smooth Wave Chart */}
              <svg
                viewBox="0 0 280 45"
                className="pointer-events-none absolute bottom-0 left-0 right-0 w-full h-11"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id={card.fillId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={card.colorStop1} />
                    <stop offset="100%" stopColor={card.colorStop2} />
                  </linearGradient>
                </defs>
                <path d={card.wavePath} fill={`url(#${card.fillId})`} />
                <path
                  d={card.linePath}
                  fill="none"
                  stroke={card.strokeColor}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </Link>
          ))}
        </div>
      </div>

      {/* =====================================================================
          ROW 3: UPCOMING HANDOVER DEADLINES TABLE + RECENT ACTIVITIES TIMELINE
      ===================================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left 8 Columns: Upcoming Handover Deadlines */}
        <div className="xl:col-span-8 bg-white rounded-3xl border border-slate-200/90 shadow-[0_6px_24px_rgba(15,23,42,0.04)] overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200/80 flex items-center justify-center text-teal-700">
                <Calendar className="w-4 h-4" />
              </div>
              <h2 className="text-base font-extrabold text-slate-900">
                Upcoming Handover Deadlines
              </h2>
            </div>
            <Link
              to={user.role === 'SUCCESSOR' ? '/successor' : '/handovers'}
              className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900 transition-colors"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-6">Project</th>
                  <th className="py-3 px-4">Handover</th>
                  <th className="py-3 px-4">Target Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                {stats.upcomingDeadlines.map((row, idx) => {
                  const isPublished = row.status === 'PUBLISHED';
                  const iconConfigs = [
                    {
                      bg: 'bg-violet-100 text-violet-700 border-violet-200',
                      icon: <Code2 className="w-4 h-4" />,
                    },
                    {
                      bg: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                      icon: <ShieldCheck className="w-4 h-4" />,
                    },
                    {
                      bg: 'bg-blue-100 text-blue-700 border-blue-200',
                      icon: <Cuboid className="w-4 h-4" />,
                    },
                  ];
                  const ic = iconConfigs[idx % iconConfigs.length];

                  const formattedDate = new Date(
                    row.deadline
                  ).toLocaleDateString('en-US', {
                    month: 'short',
                    day: '2-digit',
                    year: 'numeric',
                  });

                  return (
                    <tr
                      key={row.handoverId}
                      onClick={() =>
                        navigate(
                          user.role === 'SUCCESSOR'
                            ? `/successor?handoverId=${row.handoverId}`
                            : `/handovers/${row.handoverId}`
                        )
                      }
                      className="hover:bg-teal-50/35 cursor-pointer transition-colors group"
                    >
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${ic.bg}`}
                          >
                            {ic.icon}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 group-hover:text-teal-800 transition-colors">
                              {row.projectName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {row.departingName} → {row.successorName}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-700">
                        <span className="line-clamp-1 max-w-[200px]">
                          {row.title}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {formattedDate}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isPublished ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            On Track
                          </span>
                        ) : row.status === 'DEPARTING_REVIEW' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                            Departing Review
                          </span>
                        ) : row.status === 'LEADER_REVIEW' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                            Leader Review
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-violet-50 text-violet-800 border border-violet-200">
                            <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                            Active Sync
                          </span>
                        )}
                      </td>
                      <td
                        className="py-3.5 px-4 text-right relative"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuRowId(
                            openMenuRowId === row.handoverId
                              ? null
                              : row.handoverId
                          );
                        }}
                      >
                        <button className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {openMenuRowId === row.handoverId && (
                          <div className="absolute right-6 top-11 w-48 bg-white rounded-xl border border-slate-200 shadow-xl z-30 p-1.5 text-left text-xs animate-slide-in-up">
                            <button
                              onClick={() =>
                                navigate(
                                  user.role === 'SUCCESSOR'
                                    ? `/successor?handoverId=${row.handoverId}`
                                    : `/handovers/${row.handoverId}`
                                )
                              }
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-teal-50 text-slate-800 font-semibold"
                            >
                              Open Handover Workspace
                            </button>
                            <button
                              onClick={() =>
                                navigate(
                                  `/successor?handoverId=${row.handoverId}`
                                )
                              }
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-teal-50 text-teal-800 font-semibold"
                            >
                              Ask AI Q&A Assistant
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 4 Columns: Recent Activities Timeline */}
        <div className="xl:col-span-4 bg-white rounded-3xl border border-slate-200/90 shadow-[0_6px_24px_rgba(15,23,42,0.04)] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-teal-700" />
                <h2 className="text-base font-extrabold text-slate-900">
                  Recent Activities
                </h2>
              </div>
              <Link
                to="/admin/audit-logs"
                className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Vertical Timeline */}
            <div className="mt-4 relative space-y-4 before:absolute before:top-3 before:bottom-3 before:left-4 before:w-0.5 before:bg-slate-100">
              {stats.recentActivities.slice(0, 4).map((act, idx) => {
                const badgeStyles = [
                  {
                    bg: 'bg-emerald-500 text-white ring-emerald-100',
                    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
                  },
                  {
                    bg: 'bg-purple-600 text-white ring-purple-100',
                    icon: <UploadCloud className="w-3.5 h-3.5" />,
                  },
                  {
                    bg: 'bg-blue-600 text-white ring-blue-100',
                    icon: <MessageSquare className="w-3.5 h-3.5" />,
                  },
                  {
                    bg: 'bg-orange-500 text-white ring-orange-100',
                    icon: <Info className="w-3.5 h-3.5" />,
                  },
                ];
                const b = badgeStyles[idx % badgeStyles.length];

                return (
                  <div
                    key={act.id}
                    className="relative flex items-start gap-3.5 pl-0.5"
                  >
                    <div
                      className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center ring-4 shrink-0 mt-0.5 ${b.bg}`}
                    >
                      {b.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 leading-snug truncate">
                        {act.target}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        by <span className="font-semibold text-slate-700">{act.userName}</span> •{' '}
                        {new Date(act.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          ROW 4: 3 BOTTOM INTERACTIVE WIDGETS
          (1. Project Overview Chart | 2. Integrations Status | 3. Ask HandoverIQ)
      ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Widget 1 (4 Cols): Project Overview Interactive Spline Chart */}
        <div
          className="lg:col-span-4 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden flex flex-col justify-between"
          style={{
            background:
              'linear-gradient(150deg, #06282b 0%, #093a3e 55%, #052023 100%)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#4ef2dc]" />
              <h3 className="text-base font-extrabold text-white">
                Project Overview
              </h3>
            </div>

            {/* Interactive 7D | 30D | 90D Sliding Tabs */}
            <div className="flex items-center bg-[#041d1f]/80 p-1 rounded-full border border-teal-400/20">
              {(['7D', '30D', '90D'] as ChartRange[]).map((rng) => (
                <button
                  key={rng}
                  onClick={() => {
                    setChartRange(rng);
                    setSelectedPointIdx(3);
                  }}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                    chartRange === rng
                      ? 'bg-[#14b8a6] text-[#041f21] shadow-xs'
                      : 'text-teal-200/70 hover:text-white'
                  }`}
                >
                  {rng}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive SVG Spline Chart with Hoverable/Clickable Points & Floating Tooltip */}
          <div className="relative mt-4 pt-2">
            <svg
              viewBox="0 0 370 155"
              className="w-full h-40 overflow-visible select-none"
            >
              <defs>
                <linearGradient id="overviewArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(45, 245, 220, 0.42)" />
                  <stop offset="100%" stopColor="rgba(45, 245, 220, 0.0)" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid Lines & Y-Axis Labels */}
              {[
                { val: 4, y: 32 },
                { val: 3, y: 58 },
                { val: 2, y: 84 },
                { val: 1, y: 110 },
                { val: 0, y: 136 },
              ].map((g) => (
                <g key={g.val}>
                  <text
                    x="4"
                    y={g.y + 4}
                    fill="#99f6e4"
                    fillOpacity="0.6"
                    fontSize="10"
                    fontWeight="600"
                  >
                    {g.val}
                  </text>
                  <line
                    x1="22"
                    y1={g.y}
                    x2="355"
                    y2={g.y}
                    stroke="#2dd4bf"
                    strokeOpacity="0.12"
                    strokeDasharray="3 3"
                  />
                </g>
              ))}

              {/* Glowing Area Fill */}
              <path d={areaPath} fill="url(#overviewArea)" />

              {/* Glowing Animated Spline Curve */}
              <path
                key={chartRange}
                d={linePath}
                fill="none"
                stroke="#4ef2dc"
                strokeWidth="3"
                strokeLinecap="round"
                className="animate-chart-line"
              />

              {/* Vertical Highlight Line for Active Node */}
              {activePoint && (
                <line
                  x1={activePoint.x}
                  y1={activePoint.y}
                  x2={activePoint.x}
                  y2={136}
                  stroke="#5eead4"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              )}

              {/* Interactive Data Points */}
              {activePoints.map((pt, i) => {
                const isSelected = i === safeIdx;
                return (
                  <g
                    key={pt.label}
                    onClick={() => setSelectedPointIdx(i)}
                    onMouseEnter={() => setSelectedPointIdx(i)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isSelected ? 7 : 4.5}
                      fill={isSelected ? '#ffffff' : '#4ef2dc'}
                      stroke="#08373a"
                      strokeWidth="2"
                    />
                    <text
                      x={pt.x}
                      y={152}
                      textAnchor="middle"
                      fill="#ccfbf1"
                      fillOpacity={isSelected ? '1' : '0.65'}
                      fontSize="10"
                      fontWeight={isSelected ? '700' : '500'}
                    >
                      {pt.label}
                    </text>
                  </g>
                );
              })}

              {/* Floating White Callout Badge matching Reference Screenshot ("3 Projects / Nov 10") */}
              {activePoint && (
                <g
                  transform={`translate(${Math.min(
                    Math.max(activePoint.x - 42, 24),
                    265
                  )}, ${Math.max(activePoint.y - 46, 2)})`}
                >
                  <rect
                    width="84"
                    height="36"
                    rx="8"
                    fill="#ffffff"
                    filter="drop-shadow(0px 4px 10px rgba(0,0,0,0.25))"
                  />
                  <text
                    x="42"
                    y="15"
                    textAnchor="middle"
                    fill="#0f172a"
                    fontSize="10.5"
                    fontWeight="800"
                  >
                    {activePoint.value} Projects
                  </text>
                  <text
                    x="42"
                    y="28"
                    textAnchor="middle"
                    fill="#64748b"
                    fontSize="9.5"
                    fontWeight="600"
                  >
                    {activePoint.dateLabel}
                  </text>
                </g>
              )}
            </svg>
          </div>
        </div>

        {/* Widget 2 (4 Cols): Integrations Status Interactive Slide Card */}
        <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-200/90 shadow-[0_6px_24px_rgba(15,23,42,0.04)] p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
                <Puzzle className="w-4 h-4" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">
                Integrations Status
              </h3>
            </div>
            <Link
              to="/admin/integrations"
              className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900"
            >
              <span>Manage</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* 4 Connector Cards matching Reference Screenshot */}
          <div
            ref={integrationsSliderRef}
            className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4"
          >
            {/* 1. GitHub */}
            <div
              onClick={() => navigate('/admin/integrations')}
              className="p-3 rounded-2xl bg-slate-50/80 hover:bg-teal-50/50 border border-slate-200/90 flex flex-col items-center text-center cursor-pointer transition-all hover:-translate-y-0.5"
            >
              <div className="w-11 h-11 rounded-full bg-white shadow-xs border border-slate-200 flex items-center justify-center mb-2">
                <svg className="w-6 h-6 text-slate-900" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
              </div>
              <span className="text-xs font-bold text-slate-800">GitHub</span>
              <span
                className={`mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  githubInt?.status === 'CONNECTED'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-teal-50 text-teal-800 border border-teal-200'
                }`}
              >
                {githubInt?.status === 'CONNECTED' ? '✓ Connected' : 'Public API'}
              </span>
            </div>

            {/* 2. File Exports / Drive */}
            <div
              onClick={() => navigate('/handovers/hnd_review_01')}
              className="p-3 rounded-2xl bg-slate-50/80 hover:bg-teal-50/50 border border-slate-200/90 flex flex-col items-center text-center cursor-pointer transition-all hover:-translate-y-0.5"
            >
              <div className="w-11 h-11 rounded-full bg-white shadow-xs border border-slate-200 flex items-center justify-center mb-2">
                <FileText className="w-5 h-5 text-emerald-600" />
              </div>
              <span className="text-xs font-bold text-slate-800">
                Doc Imports
              </span>
              <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white">
                ✓ Active
              </span>
            </div>

            {/* 3. Firebase */}
            <div
              onClick={() => navigate('/admin/audit-logs')}
              className="p-3 rounded-2xl bg-slate-50/80 hover:bg-teal-50/50 border border-slate-200/90 flex flex-col items-center text-center cursor-pointer transition-all hover:-translate-y-0.5"
            >
              <div className="w-11 h-11 rounded-full bg-white shadow-xs border border-slate-200 flex items-center justify-center mb-2">
                <svg className="w-6 h-6" viewBox="0 0 32 32" fill="none">
                  <path
                    d="M5.8 24.6L9.5 4.2C9.6 3.5 10.5 3.3 10.9 3.9L14.8 11.2L5.8 24.6Z"
                    fill="#FFA000"
                  />
                  <path
                    d="M5.8 24.6L16.3 14.3L12.7 7.4L5.8 24.6Z"
                    fill="#F57F17"
                  />
                  <path
                    d="M5.8 24.6L21.9 8.9C22.4 8.4 23.2 8.7 23.4 9.4L26.2 24.6L16.8 30C16.2 30.3 15.4 30.3 14.8 30L5.8 24.6Z"
                    fill="#FFCA28"
                  />
                </svg>
              </div>
              <span className="text-xs font-bold text-slate-800">Firebase</span>
              <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white">
                ✓ Connected
              </span>
            </div>

            {/* 4. Gemini AI */}
            <div
              onClick={() => navigate('/admin/integrations')}
              className="p-3 rounded-2xl bg-slate-50/80 hover:bg-teal-50/50 border border-slate-200/90 flex flex-col items-center text-center cursor-pointer transition-all hover:-translate-y-0.5"
            >
              <div className="w-11 h-11 rounded-full bg-white shadow-xs border border-slate-200 flex items-center justify-center mb-2">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2C12 7.52285 16.4772 12 22 12C16.4772 12 12 16.4772 12 22C12 16.4772 7.52285 12 2 12C7.52285 12 12 7.52285 12 2Z"
                    fill="url(#geminiStarGrad)"
                  />
                  <defs>
                    <linearGradient
                      id="geminiStarGrad"
                      x1="2"
                      y1="2"
                      x2="22"
                      y2="22"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop stopColor="#3b82f6" />
                      <stop offset="1" stopColor="#14b8a6" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <span className="text-xs font-bold text-slate-800">Gemini</span>
              <span
                className={`mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  geminiInt?.status === 'CONNECTED'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}
              >
                {geminiInt?.status === 'CONNECTED'
                  ? '✓ Connected'
                  : 'Set Key'}
              </span>
            </div>
          </div>
        </div>

        {/* Widget 3 (4 Cols): "Ask HandoverIQ" Glowing 3D AI Robot Widget */}
        <div
          className="lg:col-span-4 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden flex flex-col justify-between"
          style={{
            background:
              'linear-gradient(145deg, #06222c 0%, #0a3742 52%, #051c24 100%)',
          }}
        >
          {/* Glowing Cyan Nebula Backdrop */}
          <div className="pointer-events-none absolute -top-10 -left-10 w-44 h-44 rounded-full bg-cyan-400/20 blur-2xl" />
          <div className="pointer-events-none absolute bottom-10 right-4 w-36 h-36 rounded-full bg-teal-400/20 blur-2xl" />

          <div className="relative z-10 flex items-center gap-4">
            {/* 3D Animated Robot Avatar (Random Non-Scripted Blinking, Gaze, Antenna & Thumbs-Up) */}
            <AnimatedRobotAvatar className="w-26 h-26" />

            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-lg font-extrabold text-white">
                  Ask HandoverIQ
                </h3>
                <Sparkles className="w-4 h-4 text-[#4ef2dc]" />
              </div>
              <p className="text-xs text-teal-100/80 mt-1 leading-relaxed">
                Get instant answers about your project handover...
              </p>
            </div>
          </div>

          {/* Inline Answer Preview Bubble inside the Ask HandoverIQ Card */}
          {inlineQaResult && (
            <div
              onClick={() => setQaDrawerOpen(true)}
              className="relative z-10 mt-3 p-2.5 rounded-2xl bg-white/12 hover:bg-white/18 border border-teal-300/30 backdrop-blur-xs text-xs text-teal-50 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-bold text-[#4ef2dc] truncate">
                  Q: {inlineQaResult.question}
                </span>
                <span className="text-[10px] font-semibold text-teal-200 shrink-0 underline">
                  View Full Chat →
                </span>
              </div>
              <p className="text-[11px] text-white/95 line-clamp-2 leading-relaxed">
                {stripMarkdownForPreview(inlineQaResult.answer)}
              </p>
            </div>
          )}

          {/* Live Grounded Q&A Input Bar */}
          <div className="relative z-10 mt-4">
            <div className="flex items-center bg-white rounded-full p-1.5 shadow-lg border border-teal-300/50">
              <input
                type="text"
                value={inlineQuestion}
                onChange={(e) => setInlineQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleInlineAsk(undefined, undefined, false);
                  }
                }}
                placeholder="Ask something..."
                className="flex-1 pl-3.5 pr-2 py-1.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="button"
                disabled={askingInline}
                onClick={() => handleInlineAsk(undefined, undefined, false)}
                className="w-9 h-9 rounded-full bg-gradient-to-r from-[#14b8a6] to-[#0d9488] hover:brightness-110 text-white flex items-center justify-center shrink-0 shadow-md cursor-pointer transition-transform active:scale-95"
                title="Ask Grounded AI Assistant"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          SLIDE-OVER DRAWER 1: INSTANT "ASK HANDOVERIQ" GROUNDED Q&A RESPONSE
      ===================================================================== */}
      {qaDrawerOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex justify-end bg-slate-900/45 backdrop-blur-xs"
            onClick={(e) => {
              if (e.target === e.currentTarget) setQaDrawerOpen(false);
            }}
          >
            <div className="bg-white w-full max-w-lg h-full p-6 shadow-2xl flex flex-col justify-between animate-slide-in-right">
            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-teal-700 text-white">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Ask HandoverIQ — Grounded AI Chatbot
                    </h3>
                    <p className="text-xs text-slate-500">
                      Verified against approved handover reports & source citations
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setQaDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Quick Sample Grounded Prompts */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Quick Grounded Questions:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Give me a complete project handover summary',
                    'Why did the team migrate to Redis 7.2 Redlock?',
                    'What pending tasks need to be completed?',
                    'What are the known problems and risks?',
                    'Who is the departing engineer and successor?',
                  ].map((sampleQ) => (
                    <button
                      key={sampleQ}
                      onClick={() => handleInlineAsk(undefined, sampleQ, true)}
                      className="text-left px-3 py-1.5 rounded-xl text-xs bg-slate-50 hover:bg-teal-50 text-slate-700 hover:text-teal-900 border border-slate-200 transition-colors cursor-pointer"
                    >
                      {sampleQ}
                    </button>
                  ))}
                </div>
              </div>

              {askingInline && (
                <div className="p-6 text-center space-y-2 bg-teal-50/50 rounded-2xl border border-teal-200">
                  <div className="w-7 h-7 rounded-full border-3 border-teal-700 border-t-transparent animate-spin mx-auto" />
                  <p className="text-xs font-semibold text-teal-900">
                    Retrieving grounded citations from approved sources...
                  </p>
                </div>
              )}

              {qaError && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-800 font-medium">
                  {qaError}
                </div>
              )}

              {/* Conversation History */}
              <div className="space-y-3">
                {qaHistory.map((qaItem, idx) => (
                  <div
                    key={`${qaItem.timestamp}_${idx}`}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs animate-slide-in-up"
                  >
                    <p className="font-bold text-slate-900 text-sm">
                      Q: {qaItem.question}
                    </p>
                    <div
                      className={`p-3.5 rounded-xl border leading-relaxed ${
                        qaItem.grounded
                          ? 'bg-white border-teal-200 text-slate-800'
                          : 'bg-amber-50 border-amber-200 text-amber-900 font-semibold text-xs'
                      }`}
                    >
                      {qaItem.grounded ? (
                        <FormattedQAAnswer text={qaItem.answer} />
                      ) : (
                        qaItem.answer
                      )}
                    </div>

                    {qaItem.citations.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-500 block">
                          Supporting Source Citations:
                        </span>
                        {qaItem.citations.map((cit) => (
                          <div
                            key={cit.sourceId}
                            className="p-2.5 rounded-xl bg-teal-50/70 border border-teal-200"
                          >
                            <span className="font-mono font-bold text-teal-900">
                              [{cit.sourceId}] {cit.title}
                            </span>
                            <p className="text-[11px] text-slate-600 mt-1 font-mono line-clamp-2">
                              "{cit.excerpt}"
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Live Chat Input Bar inside Drawer */}
            <div className="pt-3 border-t border-slate-200 space-y-2.5 mt-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={drawerQuestion}
                  onChange={(e) => setDrawerQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleInlineAsk(undefined, undefined, true);
                    }
                  }}
                  placeholder="Ask another question about your handovers..."
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={askingInline || !drawerQuestion.trim()}
                  onClick={() => handleInlineAsk(undefined, undefined, true)}
                  className="px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setQaDrawerOpen(false);
                    navigate('/successor');
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                >
                  Open Full Q&A Assistant Portal →
                </button>
                <button
                  type="button"
                  onClick={() => setQaDrawerOpen(false)}
                  className="py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>,
          document.body
        )}

      {/* =====================================================================
          SLIDE-OVER DRAWER 2: ARCHITECTURE & DOCUMENTATION VIEWER
      ===================================================================== */}
      {docsDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/45 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg h-full p-6 shadow-2xl flex flex-col justify-between animate-slide-in-right">
            <div className="space-y-4 overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-teal-50 text-teal-700 border border-teal-200">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      HandoverIQ Platform Documentation
                    </h3>
                    <p className="text-xs text-slate-500">
                      Core Governance Principles & Role Matrix
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDocsDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
                <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-200">
                  <h4 className="font-bold text-teal-950 mb-1">
                    1. Zero Hallucination & Mandatory Source Citations
                  </h4>
                  <p>
                    Every AI-generated statement in a handover report references its original source ID and verbatim evidence excerpt. Claims without verified source backing are moved to Open Questions.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <h4 className="font-bold text-slate-900 mb-1">
                    2. Pre-AI Sensitive Data Redaction
                  </h4>
                  <p>
                    All ingested commits, pull requests, issues, and uploaded CSV, JSON, PDF, DOCX, and TXT files pass through the server-side Redaction Engine before reaching Firestore or Google Gemini.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <h4 className="font-bold text-slate-900 mb-1">
                    3. Mandatory Team Leader Approval Gate
                  </h4>
                  <p>
                    A handover report cannot be published until the Team Leader reviews and approves/rejects every item across all 7 required sections. Successors can only access published reports.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setDocsDrawerOpen(false)}
                className="py-2.5 px-5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
