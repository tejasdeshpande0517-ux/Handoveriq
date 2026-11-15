import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, Lock, Mail, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

const ROLE_DEMO_PROFILES = [
  {
    role: 'ADMIN',
    name: 'Elena Rostova',
    email: 'admin@handoveriq.io',
    desc: 'Manage users, projects, integrations, redaction rules & audit logs',
  },
  {
    role: 'TEAM_LEADER',
    name: 'Marcus Vance',
    email: 'leader@handoveriq.io',
    desc: 'Create handovers, run AI analysis, review & publish verified reports',
  },
  {
    role: 'DEPARTING_MEMBER',
    name: 'Dr. Aris Thorne',
    email: 'departing@handoveriq.io',
    desc: 'Upload sources, add context, answer open questions & confirm/dispute findings',
  },
  {
    role: 'SUCCESSOR',
    name: 'Priya Nair',
    email: 'successor@handoveriq.io',
    desc: 'Access published reports, inspect source citations, use Grounded AI Q&A & export PDF',
  },
];

export const LoginPage: React.FC = () => {
  const { login, googleLogin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const user = await login(email, password);
      showToast('success', `Welcome back, ${user.name}`, `Signed in as ${user.role}`);
      if (user.role === 'SUCCESSOR') {
        navigate('/successor');
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      showToast('error', 'Authentication Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      const signedInUser = await googleLogin();
      showToast(
        'success',
        `Welcome, ${signedInUser.name}`,
        `Signed in with Google (${signedInUser.role})`
      );
      if (signedInUser.role === 'SUCCESSOR') {
        navigate('/successor');
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      showToast('error', 'Google Sign-In Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickRoleSelect = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('');
    showToast('info', 'Email Pre-filled', `Enter password for ${demoEmail} to sign in.`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Governance & Architecture Overview Panel */}
      <div className="lg:w-1/2 bg-slate-900 text-white p-8 lg:p-14 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight">
                Handover<span className="text-teal-400">IQ</span>
              </span>
              <p className="text-xs text-slate-400">
                Enterprise AI Handover Governance Platform
              </p>
            </div>
          </div>

          <div className="mt-12 max-w-lg">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-teal-950 text-teal-300 border border-teal-800">
              Source-Backed • Pre-AI Redacted • Leader-Verified
            </span>
            <h1 className="text-3xl sm:text-4xl font-bold mt-4 leading-tight tracking-tight">
              Zero-Hallucination Engineering Knowledge Continuity.
            </h1>
            <p className="text-sm text-slate-300 mt-4 leading-relaxed">
              HandoverIQ ingests scattered repository commits, pull requests, issues, and engineering files, strips sensitive secrets before AI processing, verifies every factual claim against its original source, and enforces Team Leader approval prior to successor publication.
            </p>
          </div>

          {/* 4 Role Quick-Access Cards */}
          <div className="mt-10">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-teal-400" />
              Instant Role-Based Evaluation Accounts (Click to Sign In)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ROLE_DEMO_PROFILES.map((cred) => (
                <button
                  key={cred.role}
                  type="button"
                  onClick={() => handleQuickRoleSelect(cred.email)}
                  className="text-left p-3.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-teal-500/60 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-teal-400">
                      {cred.role}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-teal-400 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="text-sm font-semibold text-white mt-1">
                    {cred.name}
                  </p>
                  <p className="text-[11px] font-mono text-slate-400">
                    {cred.email}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2">
                    {cred.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Firebase Auth • Cloud Firestore • Cloud Functions • Gemini RAG</span>
          <span className="font-mono">v1.0.0-prod</span>
        </div>
      </div>

      {/* Right Authentication Form Panel */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              Sign in to HandoverIQ
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Enter your enterprise credentials or select a role evaluation profile.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Work Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent"
                  placeholder="name@company.com"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-teal-700 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold text-sm shadow-xs transition-colors disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Sign In to Workspace'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px bg-slate-200 flex-1" />
            <span className="text-xs text-slate-400 font-medium">OR</span>
            <div className="h-px bg-slate-200 flex-1" />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-white hover:bg-slate-50 text-slate-800 font-medium text-sm border border-slate-300 flex items-center justify-center gap-2.5 transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            Continue with Google
          </button>

          <p className="mt-6 text-center text-xs text-slate-600">
            Don't have an account yet?{' '}
            <Link
              to="/register"
              className="font-semibold text-teal-700 hover:underline"
            >
              Create a verified member account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

