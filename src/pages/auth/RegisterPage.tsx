import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Lock, Mail, ShieldAlert, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { UserRole } from '../../types';

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('SUCCESSOR');
  const [department, setDepartment] = useState('Core Engineering');
  const [title, setTitle] = useState('Senior Software Engineer');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const user = await register({
        name,
        email,
        password,
        role,
        department,
        title,
      });
      showToast(
        'success',
        'Account Registered Successfully',
        `Welcome ${user.name}! Assigned Role: ${user.role}`
      );
      if (user.role === 'SUCCESSOR') {
        navigate('/successor');
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      showToast('error', 'Registration Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Register HandoverIQ Account
            </h1>
            <p className="text-xs text-slate-500">
              Role-Based Enterprise Access Provisioning
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 mb-6 text-xs text-amber-900">
          <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Security Policy:</span> New user registrations cannot self-assign{' '}
            <code className="font-mono font-bold">ADMIN</code> privileges. Administrator elevation requires explicit approval from an existing Platform Administrator.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  placeholder="Jordan Lee"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Work Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  placeholder="jordan.lee@company.com"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Department
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Job Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-teal-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Initial Workspace Role (Non-Admin Only)
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-teal-600 focus:outline-none"
            >
              <option value="SUCCESSOR">
                SUCCESSOR — Incoming Member (Access published handovers & Grounded Q&A)
              </option>
              <option value="DEPARTING_MEMBER">
                DEPARTING_MEMBER — Transitioning Member (Upload sources & verify context)
              </option>
              <option value="TEAM_LEADER">
                TEAM_LEADER — Engineering Lead (Create handovers, review & approve reports)
              </option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Password (minimum 8 characters)
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-teal-600 focus:outline-none"
                placeholder="Minimum 8 characters"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold text-sm transition-colors disabled:opacity-50"
          >
            {loading ? 'Provisioning Account...' : 'Create Account'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-600">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-teal-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

