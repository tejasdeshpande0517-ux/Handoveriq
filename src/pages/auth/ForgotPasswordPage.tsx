import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, KeyRound, Lock, Mail } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';

export const ForgotPasswordPage: React.FC = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('departing@handoveriq.io');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<'REQUEST' | 'RESET'>('REQUEST');
  const [loading, setLoading] = useState(false);

  const handleRequestToken = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await api.auth.forgotPassword(email);
      setResetToken(res.resetToken);
      setStep('RESET');
      showToast(
        'success',
        'Reset Token Generated',
        'Use the generated cryptographic token below to complete your password reset.'
      );
    } catch (err: any) {
      showToast('error', 'Reset Request Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await api.auth.resetPassword({
        email,
        resetToken,
        newPassword,
      });
      showToast(
        'success',
        'Password Reset Complete',
        'Your password has been updated. Please sign in.'
      );
      navigate('/login');
    } catch (err: any) {
      showToast('error', 'Password Reset Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-8">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sign In
        </Link>

        <h1 className="text-xl font-bold text-slate-900">
          {step === 'REQUEST' ? 'Forgot Password' : 'Complete Password Reset'}
        </h1>
        <p className="text-xs text-slate-600 mt-1">
          {step === 'REQUEST'
            ? 'Enter your registered email address to generate a time-limited password reset token.'
            : 'Verify your cryptographic reset token and set a new password.'}
        </p>

        {step === 'REQUEST' ? (
          <form onSubmit={handleRequestToken} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Registered Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {loading ? 'Generating Reset Token...' : 'Request Reset Token'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="mt-6 space-y-4">
            <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <div>
                Reset token issued for <span className="font-semibold">{email}</span>.
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Verification Reset Token
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                New Password (minimum 8 characters)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  placeholder="Enter new password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {loading ? 'Updating Password...' : 'Confirm New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

