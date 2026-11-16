import type {
  ApprovalRecord,
  AppNotification,
  AuditLog,
  DashboardStats,
  DepartingReviewStatus,
  Handover,
  HandoverReport,
  HandoverVersionEntry,
  IntegrationConfig,
  Project,
  QAResponse,
  RedactionRule,
  ReportItem,
  ReportSection,
  ReviewStatus,
  SourceDocument,
  UserProfile,
  UserRole,
} from '../types';
import { handleApiFallback } from './cloudFallback';

const CSRF_COOKIE_NAME = 'handoveriq_csrf';

function getCookie(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

async function ensureCsrfToken(): Promise<string | null> {
  const existing = getCookie(CSRF_COOKIE_NAME);
  if (existing) return existing;
  try {
    const res = await fetch('/api/auth/csrf', { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    return data.csrfToken || getCookie(CSRF_COOKIE_NAME);
  } catch {
    return null;
  }
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = await ensureCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  try {
    const response = await fetch(endpoint, {
      ...options,
      credentials: 'include',
      headers,
    });

    if (
      response.status === 404 ||
      response.status === 502 ||
      response.status === 503
    ) {
      return await handleApiFallback<T>(endpoint, options);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Request failed with HTTP ${response.status}`);
    }
    return data as T;
  } catch (err) {
    if (err instanceof TypeError) {
      return await handleApiFallback<T>(endpoint, options);
    }
    throw err;
  }
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      apiRequest<{ user: UserProfile; token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    register: (payload: {
      name: string;
      email: string;
      password: string;
      role: UserRole;
      department?: string;
      title?: string;
    }) =>
      apiRequest<{ user: UserProfile; token: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    googleLogin: (payload: { email: string; name: string }) =>
      apiRequest<{ user: UserProfile; token: string }>('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    forgotPassword: (email: string) =>
      apiRequest<{ message: string; resetToken: string; expiresAt: string }>(
        '/api/auth/forgot-password',
        {
          method: 'POST',
          body: JSON.stringify({ email }),
        }
      ),
    resetPassword: (payload: {
      email: string;
      resetToken: string;
      newPassword: string;
    }) =>
      apiRequest<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    logout: () =>
      apiRequest<{ success: boolean }>('/api/auth/logout', {
        method: 'POST',
      }),
    me: () => apiRequest<{ user: UserProfile }>('/api/auth/me'),
  },

  dashboard: {
    getStats: () => apiRequest<{ stats: DashboardStats }>('/api/dashboard'),
  },

  users: {
    list: () => apiRequest<{ users: UserProfile[] }>('/api/users'),
    updateRole: (
      uid: string,
      payload: { role: UserRole; department?: string; title?: string }
    ) =>
      apiRequest<{ user: UserProfile }>(`/api/users/${uid}/role`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
  },

  projects: {
    list: () => apiRequest<{ projects: Project[] }>('/api/projects'),
    get: (id: string) =>
      apiRequest<{
        project: Project;
        handovers: Handover[];
        activityLogs: AuditLog[];
      }>(`/api/projects/${id}`),
    create: (payload: Partial<Project>) =>
      apiRequest<{ project: Project }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    update: (id: string, payload: Partial<Project>) =>
      apiRequest<{ project: Project }>(`/api/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    delete: (id: string) =>
      apiRequest<{ success: boolean }>(`/api/projects/${id}`, {
        method: 'DELETE',
      }),
  },

  handovers: {
    list: () => apiRequest<{ handovers: Handover[] }>('/api/handovers'),
    get: (id: string) =>
      apiRequest<{
        handover: Handover;
        project: Project | null;
        sources: SourceDocument[];
        reportItems: ReportItem[];
      }>(`/api/handovers/${id}`),
    create: (payload: Partial<Handover>) =>
      apiRequest<{ handover: Handover }>('/api/handovers', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    uploadFile: (
      handoverId: string,
      payload: {
        fileName: string;
        contentBase64?: string;
        rawText?: string;
        mimeType?: string;
      }
    ) =>
      apiRequest<{
        source: SourceDocument;
        redactionDetails: { ruleName: string; category: string; count: number }[];
      }>(`/api/handovers/${handoverId}/upload`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    importGitHub: (
      handoverId: string,
      payload: { repoFullName: string; startDate?: string; endDate?: string }
    ) =>
      apiRequest<{
        importedCount: number;
        totalRedactions: number;
        sources: SourceDocument[];
      }>(`/api/handovers/${handoverId}/github-import`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    analyze: (handoverId: string, mode: 'GEMINI' | 'EXTRACTIVE' = 'GEMINI') =>
      apiRequest<{
        handover: Handover;
        reportItems: ReportItem[];
        engineUsed: 'GEMINI_API' | 'EXTRACTIVE_GROUNDED';
      }>(`/api/handovers/${handoverId}/analyze`, {
        method: 'POST',
        body: JSON.stringify({ mode }),
      }),
    submitDepartingContext: (
      handoverId: string,
      payload: {
        notes?: string;
        questionItemId?: string;
        questionAnswer?: string;
        submitToLeader?: boolean;
      }
    ) =>
      apiRequest<{ handover: Handover }>(
        `/api/handovers/${handoverId}/departing-context`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      ),
    departingItemFeedback: (
      itemId: string,
      payload: {
        departingReviewStatus: DepartingReviewStatus;
        departingComment?: string;
      }
    ) =>
      apiRequest<{ item: ReportItem }>(
        `/api/report-items/${itemId}/departing-feedback`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      ),
    leaderReviewItem: (
      itemId: string,
      payload: {
        reviewStatus?: ReviewStatus;
        statement?: string;
        reviewerComment?: string;
        section?: ReportSection;
        confidence?: string;
      }
    ) =>
      apiRequest<{ item: ReportItem }>(
        `/api/report-items/${itemId}/leader-review`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      ),
    publish: (handoverId: string, leaderComments?: string) =>
      apiRequest<{ handover: Handover }>(`/api/handovers/${handoverId}/publish`, {
        method: 'POST',
        body: JSON.stringify({ leaderComments }),
      }),
    requestRevision: (handoverId: string, comments?: string) =>
      apiRequest<{ handover: Handover }>(
        `/api/handovers/${handoverId}/revision-request`,
        {
          method: 'POST',
          body: JSON.stringify({ comments }),
        }
      ),
    acknowledge: (
      handoverId: string,
      payload: { feedback?: string; completedItemIds?: string[] }
    ) =>
      apiRequest<{ handover: Handover }>(
        `/api/handovers/${handoverId}/acknowledge`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      ),
    deleteSource: (handoverId: string, sourceId: string) =>
      apiRequest<{ success: boolean; deletedSourceId: string }>(
        `/api/handovers/${handoverId}/sources/${sourceId}`,
        {
          method: 'DELETE',
        }
      ),
    askQA: (handoverId: string, question: string) =>
      apiRequest<{ qaResult: QAResponse }>(`/api/handovers/${handoverId}/qa`, {
        method: 'POST',
        body: JSON.stringify({ question }),
      }),
    getQAHistory: (handoverId: string) =>
      apiRequest<{ history: QAResponse[] }>(
        `/api/handovers/${handoverId}/qa-history`
      ),
    getVersions: (handoverId: string) =>
      apiRequest<{
        versions: HandoverReport[];
        approvals: ApprovalRecord[];
        versionHistory: HandoverVersionEntry[];
      }>(`/api/handovers/${handoverId}/versions`),
    downloadServerPdf: async (handoverId: string): Promise<Blob | null> => {
      try {
        const res = await fetch(`/api/handovers/${handoverId}/pdf`, {
          credentials: 'include',
        });
        if (res.status === 404 || res.status === 502 || res.status === 503) {
          return null;
        }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `PDF download failed (HTTP ${res.status})`);
        }
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/pdf')) {
          return null;
        }
        return await res.blob();
      } catch (err) {
        if (err instanceof TypeError) return null;
        throw err;
      }
    },
    logPdfDownload: (handoverId: string) =>
      apiRequest<{ logged: boolean }>(`/api/handovers/${handoverId}/pdf-log`, {
        method: 'POST',
      }),
  },

  integrations: {
    list: () =>
      apiRequest<{ integrations: IntegrationConfig[] }>('/api/integrations'),
    listRepos: () =>
      apiRequest<{
        account: Record<string, any> | null;
        repos: {
          id: number;
          name: string;
          fullName: string;
          owner: string;
          private: boolean;
          defaultBranch: string;
          description: string;
          language: string | null;
          updatedAt: string;
          htmlUrl: string;
        }[];
      }>('/api/github/repos'),
    configure: (id: 'github' | 'gemini', credential: string) =>
      apiRequest<{ integration: IntegrationConfig }>(
        `/api/integrations/${id}/configure`,
        {
          method: 'POST',
          body: JSON.stringify({ credential }),
        }
      ),
  },

  redactionRules: {
    list: () => apiRequest<{ rules: RedactionRule[] }>('/api/redaction-rules'),
    create: (payload: {
      name: string;
      category: string;
      pattern: string;
      description?: string;
    }) =>
      apiRequest<{ rule: RedactionRule }>('/api/redaction-rules', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    toggle: (id: string, enabled: boolean) =>
      apiRequest<{ rule: RedactionRule }>(`/api/redaction-rules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),
    delete: (id: string) =>
      apiRequest<{ success: boolean }>(`/api/redaction-rules/${id}`, {
        method: 'DELETE',
      }),
    testRedaction: (sampleText: string, projectKeywords?: string[]) =>
      apiRequest<{
        result: {
          redactedText: string;
          totalRedactions: number;
          categories: string[];
          rulesMatched: string[];
          matches: { ruleName: string; category: string; count: number }[];
        };
      }>('/api/redaction/test', {
        method: 'POST',
        body: JSON.stringify({ sampleText, projectKeywords }),
      }),
  },

  auditLogs: {
    list: () => apiRequest<{ logs: AuditLog[] }>('/api/audit-logs'),
  },

  notifications: {
    list: () =>
      apiRequest<{ notifications: AppNotification[] }>('/api/notifications'),
    markRead: (id: string) =>
      apiRequest<{ success: boolean }>(`/api/notifications/${id}/read`, {
        method: 'PATCH',
      }),
  },
};

