import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Play,
  Plus,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import type { RedactionCategory, RedactionRule } from '../../types';
import { LoadingSkeleton } from '../../components/common/LoadingSkeleton';

export const RedactionRulesPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [rules, setRules] = useState<RedactionRule[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Custom Rule State
  const [ruleName, setRuleName] = useState('');
  const [category, setCategory] = useState<RedactionCategory>('CUSTOM_KEYWORD');
  const [pattern, setPattern] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // Live Redaction Tester State (No API keys or GitHub tokens displayed in frontend)
  const [sampleInput, setSampleInput] = useState(
    `Engineering Handover Verification Snippet:
1. Contact Email: engineer.team@company.org | On-Call Phone: +1-415-890-4412
2. National ID / Reference: 123-45-6789 | Settlement IBAN: DE89370400440532013000
3. Internal Database Host: db-primary.internal.net (Port 5432)`
  );
  const [testOutput, setTestOutput] = useState<{
    redactedText: string;
    totalRedactions: number;
    categories: string[];
    matches: { ruleName: string; category: string; count: number }[];
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const loadRules = async () => {
    try {
      setLoading(true);
      const res = await api.redactionRules.list();
      setRules(res.rules);
    } catch (err: any) {
      showToast('error', 'Failed to load redaction rules', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleToggleRule = async (rule: RedactionRule) => {
    try {
      const res = await api.redactionRules.toggle(rule.id, !rule.enabled);
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? res.rule : r))
      );
      showToast(
        'info',
        `Rule ${res.rule.enabled ? 'Enabled' : 'Disabled'}`,
        res.rule.name
      );
    } catch (err: any) {
      showToast('error', 'Failed to update rule', err.message);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      const res = await api.redactionRules.create({
        name: ruleName,
        category,
        pattern,
        description,
      });
      setRules((prev) => [...prev, res.rule]);
      setRuleName('');
      setPattern('');
      setDescription('');
      showToast(
        'success',
        'Custom Redaction Rule Added',
        `Pattern "${res.rule.pattern}" will now be replaced with [REDACTED].`
      );
    } catch (err: any) {
      showToast('error', 'Could not create rule', err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await api.redactionRules.delete(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      showToast('success', 'Custom Rule Deleted');
    } catch (err: any) {
      showToast('error', 'Cannot delete rule', err.message);
    }
  };

  const handleRunTest = async () => {
    try {
      setTesting(true);
      const res = await api.redactionRules.testRedaction(sampleInput);
      setTestOutput(res.result);
    } catch (err: any) {
      showToast('error', 'Redaction test failed', err.message);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <LoadingSkeleton rows={4} />;
  }

  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-teal-700" />
          <h1 className="text-2xl font-bold text-slate-900">
            Sensitive Data Redaction Service & Rule Configuration
          </h1>
        </div>
        <p className="text-sm text-slate-600 mt-1">
          Detects API keys, passwords, authentication tokens, email addresses, phone numbers, bank accounts, identification numbers, and custom confidential keywords, replacing them with <code className="font-mono font-bold">[REDACTED]</code> before storage or Gemini AI processing.
        </p>
      </div>

      {/* Interactive Live Pre-AI Redaction Verification Sandbox */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Interactive Pre-AI Redaction Verification Sandbox
            </h2>
            <p className="text-xs text-slate-500">
              Test how raw text is sanitized by the backend Redaction Service before reaching Firestore or Gemini.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunTest}
            disabled={testing}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 shadow-2xs"
          >
            <Play className="w-3.5 h-3.5" />
            {testing ? 'Redacting...' : 'Run Backend Redaction Test'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Raw Input Text (Containing Test Secrets & PII)
            </label>
            <textarea
              rows={7}
              value={sampleInput}
              onChange={(e) => setSampleInput(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 text-xs font-mono bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Sanitized Output (Safe for Firestore & Gemini AI)
            </label>
            <div className="h-[166px] p-3 rounded-xl border border-slate-800 bg-slate-900 text-slate-100 text-xs font-mono whitespace-pre-wrap overflow-y-auto">
              {testOutput
                ? testOutput.redactedText
                : 'Click "Run Backend Redaction Test" to inspect sanitized output...'}
            </div>
          </div>
        </div>

        {testOutput && (
          <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 flex flex-wrap items-center justify-between gap-2 text-xs text-teal-900">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-teal-700" />
              Total Secrets Redacted: {testOutput.totalRedactions} across categories:{' '}
              {testOutput.categories.join(', ') || 'None'}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {testOutput.matches.map((m, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded bg-white border border-teal-200 font-mono text-[11px]"
                >
                  {m.category}: {m.count}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Custom Admin Rule + Rules Registry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {isAdmin && (
          <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Plus className="w-4 h-4 text-teal-700" />
              Add Custom Redaction Rule
            </h2>
            <form onSubmit={handleCreateRule} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rule Name *
                </label>
                <input
                  type="text"
                  required
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g., Internal Project Codename"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rule Category *
                </label>
                <select
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as RedactionCategory)
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                >
                  <option value="CUSTOM_KEYWORD">
                    CUSTOM_KEYWORD (Exact Keyword Match)
                  </option>
                  <option value="CUSTOM_REGEX">
                    CUSTOM_REGEX (Regular Expression)
                  </option>
                  <option value="API_KEY">API_KEY</option>
                  <option value="AUTH_TOKEN">AUTH_TOKEN</option>
                  <option value="PASSWORD">PASSWORD</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Keyword or Regex Pattern *
                </label>
                <input
                  type="text"
                  required
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  placeholder="e.g., PROJECT-TITAN-SECRET"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Why this pattern is confidential..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full py-2.5 px-4 rounded-lg text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800"
              >
                {creating ? 'Saving Rule...' : 'Save Redaction Rule'}
              </button>
            </form>
          </div>
        )}

        <div
          className={`${
            isAdmin ? 'lg:col-span-8' : 'lg:col-span-12'
          } bg-white rounded-xl border border-slate-200 overflow-hidden`}
        >
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              Active Redaction Rules ({rules.filter((r) => r.enabled).length} /{' '}
              {rules.length} Enabled)
            </h2>
          </div>

          <div className="divide-y divide-slate-200">
            {rules.map((r) => (
              <div
                key={r.id}
                className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                      {r.category}
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      {r.name}
                    </span>
                    {r.isBuiltIn && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        Built-in Core Rule
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600">{r.description}</p>
                  <p className="text-[11px] font-mono text-slate-400 truncate">
                    {r.isBuiltIn
                      ? `Action: Automatically replaces matched ${r.category} values with ${r.replacement}`
                      : `Pattern: ${r.pattern} → ${r.replacement}`}
                  </p>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggleRule(r)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                        r.enabled
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-300'
                      }`}
                    >
                      {r.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    {!r.isBuiltIn && (
                      <button
                        onClick={() => handleDeleteRule(r.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                        title="Delete custom rule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

