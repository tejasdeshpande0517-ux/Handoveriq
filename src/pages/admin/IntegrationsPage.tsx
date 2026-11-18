import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Lock,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import type { IntegrationConfig } from '../../types';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';

export const IntegrationsPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [credInputs, setCredInputs] = useState<Record<string, string>>({
    github: '',
    gemini: '',
  });
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const loadIntegrations = async () => {
    try {
      setLoading(true);
      const res = await api.integrations.list();
      setIntegrations(res.integrations);
    } catch (err: any) {
      showToast('error', 'Failed to load integrations', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIntegrations();
  }, []);

  const handleVerifyAndSave = async (id: 'github' | 'gemini') => {
    try {
      setVerifyingId(id);
      const res = await api.integrations.configure(id, credInputs[id] || '');
      setIntegrations((prev) =>
        prev.map((i) => (i.id === id ? res.integration : i))
      );
      setCredInputs((prev) => ({ ...prev, [id]: '' }));

      if (res.integration.status === 'CONNECTED') {
        showToast(
          'success',
          `${res.integration.name} Connected`,
          'Credential verified against live provider API and stored server-side.'
        );
      } else {
        showToast(
          'warning',
          `${res.integration.name} Status: ${res.integration.status}`,
          res.integration.errorMessage || 'API verification did not succeed.'
        );
      }
    } catch (err: any) {
      showToast('error', 'Configuration failed', err.message);
    } finally {
      setVerifyingId(null);
    }
  };

  if (loading) {
    return <LoadingSkeleton rows={3} />;
  }

  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <PlugZap className="w-5 h-5 text-teal-700" />
            <h1 className="text-2xl font-bold text-slate-900">
              External API Integrations & Credential Verification
            </h1>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            All API keys and OAuth tokens are stored exclusively server-side and verified against live provider endpoints before marking any integration as connected.
          </p>
        </div>

        <button
          onClick={loadIntegrations}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Status
        </button>
      </div>

      {/* Primary Implemented Connectors: GitHub & Google Gemini */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {integrations.map((intg) => {
          const isConnected = intg.status === 'CONNECTED';
          const isError = intg.status === 'ERROR';

          return (
            <div
              key={intg.id}
              className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-between space-y-5"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-mono text-xs font-bold text-teal-700 uppercase">
                      {intg.provider} CONNECTOR
                    </span>
                    <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                      {intg.name}
                    </h2>
                  </div>

                  {isConnected ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      CONNECTED (Verified)
                    </span>
                  ) : isError ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-800 border border-red-200">
                      <XCircle className="w-4 h-4 text-red-600" />
                      VERIFICATION ERROR
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      DISCONNECTED (Credential Required)
                    </span>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Environment Variable:</span>
                    <code className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {intg.requiredEnvVar}
                    </code>
                  </div>
                  {intg.configured && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Server-Side Secret:</span>
                      <code className="font-mono text-teal-800">
                        •••••••••••••••• (Hidden Server-Side)
                      </code>
                    </div>
                  )}
                  {intg.lastVerifiedAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Last Live Check:</span>
                      <span className="font-mono text-slate-700">
                        {new Date(intg.lastVerifiedAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                {intg.accountInfo && (
                  <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                    <p className="font-bold">Verified Account / API Metadata:</p>
                    <pre className="font-mono text-[11px] overflow-x-auto">
                      {JSON.stringify(intg.accountInfo, null, 2)}
                    </pre>
                  </div>
                )}

                {intg.errorMessage && (
                  <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                    <strong>Status Note:</strong> {intg.errorMessage}
                  </div>
                )}
              </div>

              {/* Admin Live Credential Input & Verification */}
              {isAdmin ? (
                <div className="pt-4 border-t border-slate-200 space-y-2.5">
                  <label className="block text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-teal-700" />
                    Configure & Verify {intg.requiredEnvVar} (Stored Server-Side Only)
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="password"
                        value={credInputs[intg.id] || ''}
                        onChange={(e) =>
                          setCredInputs((prev) => ({
                            ...prev,
                            [intg.id]: e.target.value,
                          }))
                        }
                        placeholder="Enter credential (stored server-side only)"
                        className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-teal-600 focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={verifyingId === intg.id}
                      onClick={() =>
                        handleVerifyAndSave(intg.id as 'github' | 'gemini')
                      }
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white shrink-0 disabled:opacity-50"
                    >
                      {verifyingId === intg.id
                        ? 'Verifying Live API...'
                        : 'Verify & Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 pt-3 border-t border-slate-100">
                  Only Platform Administrators can update server-side integration credentials.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Transparency Table for Future / Unconnected Third-Party Connectors (Rule 5.D & Rule 10) */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-5 h-5 text-teal-700" />
          <h2 className="text-base font-bold text-slate-900">
            Roadmap Connectors (Explicitly Unconnected in MVP per Governance Policy)
          </h2>
        </div>
        <p className="text-xs text-slate-600 mb-4">
          In strict compliance with HandoverIQ Engineering Rule #4 and #10, third-party connectors that have not been authenticated and verified are explicitly marked as <strong>Not Connected</strong> rather than simulated. Use CSV, JSON, PDF, DOCX, or TXT exports from these tools for ingestion.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {['Slack Workspace', 'Atlassian Jira', 'Trello Boards', 'Google Drive'].map(
            (name) => (
              <div
                key={name}
                className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between"
              >
                <span className="font-semibold text-slate-700">{name}</span>
                <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[10px] font-semibold">
                  NOT CONNECTED
                </span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

