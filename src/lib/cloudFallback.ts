import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { firebaseAuth, firestoreDb, isFirebaseConfigured } from './firebase';
import type {
  AppNotification,
  AuditLog,
  DashboardStats,
  Handover,
  IntegrationConfig,
  Project,
  QACitation,
  QAResponse,
  RedactionCategory,
  RedactionRule,
  ReportItem,
  ReportSection,
  SourceDocument,
  UserProfile,
  UserRole,
} from '../types';

const STORE_KEY = 'handoveriq_cloud_store_v1';
const CURRENT_USER_KEY = 'handoveriq_cloud_user_v1';

interface CloudStore {
  users: UserProfile[];
  projects: Project[];
  handovers: Handover[];
  sources: SourceDocument[];
  reportItems: ReportItem[];
  redactionRules: RedactionRule[];
  integrations: IntegrationConfig[];
  auditLogs: AuditLog[];
  notifications: AppNotification[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function genId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function createInitialStore(): CloudStore {
  const now = nowIso();
  const earlier = new Date(Date.now() - 86400000 * 3).toISOString();
  const deadline1 = new Date(Date.now() + 86400000 * 5).toISOString();
  const deadline2 = new Date(Date.now() + 86400000 * 12).toISOString();

  const users: UserProfile[] = [
    {
      uid: 'demo-admin-1',
      name: 'Aarav Mehta',
      email: 'admin@handoveriq.dev',
      role: 'ADMIN',
      department: 'Platform Security',
      title: 'Principal Security Architect',
      createdAt: earlier,
    },
    {
      uid: 'demo-leader-1',
      name: 'Priya Nair',
      email: 'leader@handoveriq.dev',
      role: 'TEAM_LEADER',
      department: 'Core Engineering',
      title: 'Engineering Manager',
      createdAt: earlier,
    },
    {
      uid: 'demo-departing-1',
      name: 'Rohan Kulkarni',
      email: 'rohan@handoveriq.dev',
      role: 'DEPARTING_MEMBER',
      department: 'Payments & Auth',
      title: 'Senior Backend Engineer',
      createdAt: earlier,
    },
    {
      uid: 'demo-successor-1',
      name: 'Ananya Sharma',
      email: 'ananya@handoveriq.dev',
      role: 'SUCCESSOR',
      department: 'Payments & Auth',
      title: 'Software Engineer II',
      createdAt: earlier,
    },
  ];

  const projects: Project[] = [
    {
      id: 'proj-auth-core',
      name: 'Payments & Identity Gateway',
      description:
        'Core OAuth2/OIDC gateway, webhook verification, and settlement pipeline.',
      teamLeadId: 'demo-leader-1',
      memberIds: [
        'demo-admin-1',
        'demo-leader-1',
        'demo-departing-1',
        'demo-successor-1',
      ],
      connectedSources: [
        {
          type: 'GITHUB',
          repoFullName: 'handoveriq/payments-gateway',
          branch: 'main',
          verifiedAt: earlier,
        },
      ],
      redactionRules: ['rule-api-key', 'rule-auth-token', 'rule-email'],
      status: 'ACTIVE',
      progressPercent: 85,
      createdBy: 'demo-leader-1',
      createdAt: earlier,
      updatedAt: now,
    },
    {
      id: 'proj-data-pipeline',
      name: 'Telemetry & Audit Stream',
      description:
        'Immutable audit event ingestion, PII scrubbing workers, and BigQuery export.',
      teamLeadId: 'demo-leader-1',
      memberIds: ['demo-admin-1', 'demo-leader-1', 'demo-departing-1'],
      connectedSources: [{ type: 'FILE_UPLOAD', verifiedAt: earlier }],
      redactionRules: ['rule-api-key', 'rule-password'],
      status: 'ACTIVE',
      progressPercent: 45,
      createdBy: 'demo-leader-1',
      createdAt: earlier,
      updatedAt: now,
    },
  ];

  const handovers: Handover[] = [
    {
      id: 'ho-payments-q4',
      title: 'Payments Gateway & Webhook Signing Handover',
      projectId: 'proj-auth-core',
      departingMemberId: 'demo-departing-1',
      successorId: 'demo-successor-1',
      dateRange: {
        startDate: earlier.slice(0, 10),
        endDate: now.slice(0, 10),
      },
      deadline: deadline1,
      selectedDataSources: ['GITHUB', 'TXT', 'JSON'],
      githubRepo: 'handoveriq/payments-gateway',
      githubBranch: 'main',
      status: 'PUBLISHED',
      approvalStatus: 'APPROVED',
      versionLocked: true,
      departingMemberNotes:
        'Webhook HMAC rotation runs every 30 days via Cloud Scheduler. Never bypass idempotency-key checks on /v2/settle.',
      approvalSummary: {
        approvedBy: 'demo-leader-1',
        approvedByName: 'Priya Nair',
        approvedAt: now,
        publishedAt: now,
        leaderComments: 'Verified all runbooks and redaction coverage.',
        version: 1,
        approvalStatus: 'APPROVED',
        versionLocked: true,
      },
      analysisEngineUsed: 'EXTRACTIVE_GROUNDED',
      createdBy: 'demo-leader-1',
      approvedBy: 'demo-leader-1',
      createdAt: earlier,
      updatedAt: now,
    },
    {
      id: 'ho-audit-stream',
      title: 'Audit Stream & Redaction Worker Transition',
      projectId: 'proj-data-pipeline',
      departingMemberId: 'demo-departing-1',
      successorId: 'demo-successor-1',
      dateRange: {
        startDate: earlier.slice(0, 10),
        endDate: now.slice(0, 10),
      },
      deadline: deadline2,
      selectedDataSources: ['TXT', 'CSV'],
      status: 'LEADER_REVIEW',
      approvalStatus: 'PENDING',
      versionLocked: false,
      analysisEngineUsed: 'EXTRACTIVE_GROUNDED',
      createdBy: 'demo-leader-1',
      approvedBy: null,
      createdAt: earlier,
      updatedAt: now,
    },
  ];

  const sources: SourceDocument[] = [
    {
      id: 'src-runbook-1',
      handoverId: 'ho-payments-q4',
      projectId: 'proj-auth-core',
      type: 'FILE_TXT',
      title: 'payments-runbook.txt',
      fileName: 'payments-runbook.txt',
      uploadStatus: 'PROCESSED',
      url: '#payments-runbook',
      author: 'Rohan Kulkarni',
      timestamp: earlier,
      redactedText:
        'Decision: Migrated webhook verification to SHA-256 HMAC with dual-key rotation window (30m overlap).\nPending: Complete PCI-DSS log retention archival script before Friday release.\nRisk: Downstream settlement partner times out if payload exceeds 2MB; keep batch size <= 250.\nDependency: Redis cluster primary-eu-west handles idempotency locks with 24h TTL.\nSecret check: Stripe key [REDACTED:API_KEY] scrubbed before storage.',
      redactionSummary: {
        totalRedactions: 1,
        categories: ['API_KEY'],
        rulesMatched: ['Stripe / Generic API Keys'],
      },
      chunks: [
        {
          chunkId: 'chunk-1',
          text: 'Migrated webhook verification to SHA-256 HMAC with dual-key rotation window (30m overlap).',
        },
        {
          chunkId: 'chunk-2',
          text: 'Redis cluster primary-eu-west handles idempotency locks with 24h TTL.',
        },
      ],
      metadata: { lineCount: 5 },
      createdAt: earlier,
    },
  ];

  const reportItems: ReportItem[] = [
    {
      id: 'item-1',
      handoverId: 'ho-payments-q4',
      projectId: 'proj-auth-core',
      category: 'KEY_DECISIONS',
      section: 'KEY_DECISIONS',
      title: 'Dual-key HMAC webhook rotation',
      description: 'SHA-256 HMAC verification with 30-minute key overlap window.',
      statement:
        'Webhook verification uses SHA-256 HMAC with a 30-minute dual-key rotation overlap window to prevent dropped partner events.',
      sourceFileId: 'src-runbook-1',
      sourceFileName: 'payments-runbook.txt',
      sourceLocation: 'Line 1',
      sourceIds: ['src-runbook-1'],
      confidence: 'HIGH',
      confidenceScore: 0.94,
      evidence:
        'Decision: Migrated webhook verification to SHA-256 HMAC with dual-key rotation window (30m overlap).',
      citationVerified: true,
      citationValidationNote: 'Verified verbatim against payments-runbook.txt',
      departingReviewStatus: 'CONFIRMED',
      departingComment: 'Confirmed — rotation script lives in scripts/rotate-hmac.ts.',
      verificationStatus: 'APPROVED',
      reviewStatus: 'APPROVED',
      reviewerComment: 'Approved for successor onboarding.',
      reviewedBy: 'demo-leader-1',
      reviewedByName: 'Priya Nair',
      reviewedAt: now,
      editHistory: [],
      createdAt: earlier,
      updatedAt: now,
    },
    {
      id: 'item-2',
      handoverId: 'ho-payments-q4',
      projectId: 'proj-auth-core',
      category: 'DEPENDENCIES',
      section: 'DEPENDENCIES',
      title: 'Redis idempotency lock dependency',
      description: 'Redis cluster primary-eu-west stores 24h idempotency locks.',
      statement:
        'Settlement endpoint /v2/settle depends on Redis cluster primary-eu-west for 24h idempotency-key locking.',
      sourceFileId: 'src-runbook-1',
      sourceFileName: 'payments-runbook.txt',
      sourceLocation: 'Line 4',
      sourceIds: ['src-runbook-1'],
      confidence: 'HIGH',
      confidenceScore: 0.92,
      evidence:
        'Dependency: Redis cluster primary-eu-west handles idempotency locks with 24h TTL.',
      citationVerified: true,
      citationValidationNote: 'Verified verbatim against payments-runbook.txt',
      departingReviewStatus: 'CONFIRMED',
      departingComment: '',
      verificationStatus: 'APPROVED',
      reviewStatus: 'APPROVED',
      reviewerComment: '',
      reviewedBy: 'demo-leader-1',
      reviewedByName: 'Priya Nair',
      reviewedAt: now,
      editHistory: [],
      createdAt: earlier,
      updatedAt: now,
    },
    {
      id: 'item-3',
      handoverId: 'ho-payments-q4',
      projectId: 'proj-auth-core',
      category: 'RISKS',
      section: 'RISKS',
      title: 'Partner settlement payload timeout',
      description: 'Payloads above 2MB trigger partner timeouts.',
      statement:
        'Downstream settlement partner times out when batch payloads exceed 2MB; batch size must stay <= 250 records.',
      sourceFileId: 'src-runbook-1',
      sourceFileName: 'payments-runbook.txt',
      sourceLocation: 'Line 3',
      sourceIds: ['src-runbook-1'],
      confidence: 'HIGH',
      confidenceScore: 0.9,
      evidence:
        'Risk: Downstream settlement partner times out if payload exceeds 2MB; keep batch size <= 250.',
      citationVerified: true,
      citationValidationNote: 'Verified verbatim against payments-runbook.txt',
      departingReviewStatus: 'CONFIRMED',
      departingComment: '',
      verificationStatus: 'APPROVED',
      reviewStatus: 'APPROVED',
      reviewerComment: '',
      reviewedBy: 'demo-leader-1',
      reviewedByName: 'Priya Nair',
      reviewedAt: now,
      editHistory: [],
      createdAt: earlier,
      updatedAt: now,
    },
    {
      id: 'item-4',
      handoverId: 'ho-audit-stream',
      projectId: 'proj-data-pipeline',
      category: 'PENDING_WORK',
      section: 'PENDING_WORK',
      title: 'BigQuery partition retention policy',
      description: 'Finalize 90-day cold archival rule for audit_events table.',
      statement:
        'Pending configuration of 90-day BigQuery partition expiration for raw audit_events staging tables.',
      sourceFileId: 'src-runbook-1',
      sourceFileName: 'payments-runbook.txt',
      sourceLocation: 'Line 2',
      sourceIds: ['src-runbook-1'],
      confidence: 'MEDIUM',
      confidenceScore: 0.78,
      evidence:
        'Pending: Complete PCI-DSS log retention archival script before Friday release.',
      citationVerified: true,
      citationValidationNote: 'Grounded in uploaded runbook',
      departingReviewStatus: 'UNREVIEWED',
      departingComment: '',
      verificationStatus: 'PENDING',
      reviewStatus: 'PENDING',
      reviewerComment: '',
      reviewedBy: null,
      reviewedByName: null,
      reviewedAt: null,
      editHistory: [],
      createdAt: earlier,
      updatedAt: now,
    },
  ];

  const redactionRules: RedactionRule[] = [
    {
      id: 'rule-api-key',
      name: 'Stripe / Generic API Keys',
      category: 'API_KEY',
      pattern: '(sk_live_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{35}|ghp_[A-Za-z0-9]{36})',
      replacement: '[REDACTED:API_KEY]',
      description: 'Masks live API keys, Google keys, and GitHub PATs before storage.',
      isBuiltIn: true,
      enabled: true,
      createdBy: 'system',
      createdAt: earlier,
    },
    {
      id: 'rule-auth-token',
      name: 'Bearer & JWT Tokens',
      category: 'AUTH_TOKEN',
      pattern: '(Bearer\\s+[A-Za-z0-9\\-._~+/]+=*|eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+)',
      replacement: '[REDACTED:AUTH_TOKEN]',
      description: 'Redacts Authorization Bearer headers and JWT tokens.',
      isBuiltIn: true,
      enabled: true,
      createdBy: 'system',
      createdAt: earlier,
    },
    {
      id: 'rule-password',
      name: 'Inline Passwords & Secrets',
      category: 'PASSWORD',
      pattern: '(password|passwd|pwd|secret)\\s*[:=]\\s*[^\\s,;]+',
      replacement: '[REDACTED:PASSWORD]',
      description: 'Redacts key=value password or secret assignments.',
      isBuiltIn: true,
      enabled: true,
      createdBy: 'system',
      createdAt: earlier,
    },
    {
      id: 'rule-email',
      name: 'Email Addresses',
      category: 'EMAIL',
      pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
      replacement: '[REDACTED:EMAIL]',
      description: 'Scrubs personal and corporate email addresses from ingested text.',
      isBuiltIn: true,
      enabled: true,
      createdBy: 'system',
      createdAt: earlier,
    },
  ];

  const integrations: IntegrationConfig[] = [
    {
      id: 'github',
      name: 'GitHub Repository Ingestion',
      provider: 'GITHUB',
      status: 'CONNECTED',
      configured: true,
      maskedCredential: 'ghp_••••••••••••demo',
      accountInfo: { login: 'handoveriq-bot', scope: 'public_repo' },
      lastVerifiedAt: now,
      errorMessage: null,
      requiredEnvVar: 'GITHUB_TOKEN',
      updatedBy: 'demo-admin-1',
      updatedAt: now,
    },
    {
      id: 'gemini',
      name: 'Gemini Grounded Synthesis',
      provider: 'GEMINI',
      status: 'DISCONNECTED',
      configured: false,
      maskedCredential: '',
      accountInfo: null,
      lastVerifiedAt: null,
      errorMessage: null,
      requiredEnvVar: 'GEMINI_API_KEY',
      updatedBy: 'system',
      updatedAt: earlier,
    },
  ];

  const auditLogs: AuditLog[] = [
    {
      id: 'log-1',
      userId: 'demo-leader-1',
      userName: 'Priya Nair',
      userRole: 'TEAM_LEADER',
      projectId: 'proj-auth-core',
      action: 'HANDOVER_PUBLISHED',
      target: 'Handover',
      targetId: 'ho-payments-q4',
      details: { version: 1, redactionsApplied: 1 },
      timestamp: now,
    },
    {
      id: 'log-2',
      userId: 'demo-departing-1',
      userName: 'Rohan Kulkarni',
      userRole: 'DEPARTING_MEMBER',
      projectId: 'proj-auth-core',
      action: 'SOURCE_INGESTED',
      target: 'SourceDocument',
      targetId: 'src-runbook-1',
      details: { fileName: 'payments-runbook.txt', totalRedactions: 1 },
      timestamp: earlier,
    },
  ];

  const notifications: AppNotification[] = [
    {
      id: 'notif-1',
      userId: 'all',
      title: 'Handover Report Published',
      message:
        'Payments Gateway & Webhook Signing Handover has been approved and published.',
      link: '/handovers/ho-payments-q4',
      read: false,
      createdAt: now,
    },
  ];

  return {
    users,
    projects,
    handovers,
    sources,
    reportItems,
    redactionRules,
    integrations,
    auditLogs,
    notifications,
  };
}

function loadStore(): CloudStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      return JSON.parse(raw) as CloudStore;
    }
  } catch {
    // ignore corrupt storage
  }
  const initial = createInitialStore();
  saveStore(initial);
  return initial;
}

function saveStore(store: CloudStore): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage quota errors
  }
}

function getActiveActor(store: CloudStore): UserProfile {
  const fbUser = firebaseAuth?.currentUser;
  if (fbUser) {
    const existing = store.users.find((u) => u.uid === fbUser.uid);
    if (existing) return existing;
    const created: UserProfile = {
      uid: fbUser.uid,
      name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Workspace User',
      email: fbUser.email || '',
      role: 'TEAM_LEADER',
      department: 'Engineering',
      title: 'Workspace Member',
      createdAt: nowIso(),
    };
    store.users.push(created);
    ensureUserHasProjectAccess(store, created.uid);
    saveStore(store);
    return created;
  }

  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    if (raw) {
      return JSON.parse(raw) as UserProfile;
    }
  } catch {
    // ignore
  }

  return store.users[1] || store.users[0];
}

function ensureUserHasProjectAccess(store: CloudStore, uid: string): void {
  for (const p of store.projects) {
    if (!p.memberIds.includes(uid)) {
      p.memberIds.push(uid);
    }
  }
}

function applyRedaction(
  text: string,
  rules: RedactionRule[],
  extraKeywords: string[] = []
): {
  redactedText: string;
  totalRedactions: number;
  categories: string[];
  rulesMatched: string[];
  matches: { ruleName: string; category: string; count: number }[];
} {
  let output = text;
  let totalRedactions = 0;
  const categories = new Set<string>();
  const rulesMatched = new Set<string>();
  const matches: { ruleName: string; category: string; count: number }[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    try {
      const regex = new RegExp(rule.pattern, 'gi');
      let count = 0;
      output = output.replace(regex, () => {
        count += 1;
        return rule.replacement || `[REDACTED:${rule.category}]`;
      });
      if (count > 0) {
        totalRedactions += count;
        categories.add(rule.category);
        rulesMatched.add(rule.name);
        matches.push({ ruleName: rule.name, category: rule.category, count });
      }
    } catch {
      // skip invalid regex
    }
  }

  for (const kw of extraKeywords.filter((k) => k.trim().length > 0)) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    let count = 0;
    output = output.replace(regex, () => {
      count += 1;
      return '[REDACTED:CUSTOM_KEYWORD]';
    });
    if (count > 0) {
      totalRedactions += count;
      categories.add('CUSTOM_KEYWORD');
      rulesMatched.add(`Keyword: ${kw}`);
      matches.push({
        ruleName: `Keyword: ${kw}`,
        category: 'CUSTOM_KEYWORD',
        count,
      });
    }
  }

  return {
    redactedText: output,
    totalRedactions,
    categories: Array.from(categories),
    rulesMatched: Array.from(rulesMatched),
    matches,
  };
}

function decodeBase64Utf8(base64: string): string {
  try {
    const clean = base64.includes(',') ? base64.split(',')[1] : base64;
    const binary = atob(clean);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '[Binary or non-UTF8 file uploaded in browser mode]';
  }
}

function runExtractiveAnalysis(
  handover: Handover,
  sources: SourceDocument[]
): ReportItem[] {
  const now = nowIso();
  const items: ReportItem[] = [];
  const sectionMatchers: { section: ReportSection; keywords: RegExp }[] = [
    { section: 'KEY_DECISIONS', keywords: /\b(decid|decision|migrat|archit|chose|adopt)/i },
    { section: 'RISKS', keywords: /\b(risk|timeout|fail|vulnerab|incident|limit|warn)/i },
    { section: 'DEPENDENCIES', keywords: /\b(depend|redis|postgres|firebase|api|service|cluster)/i },
    { section: 'PENDING_WORK', keywords: /\b(pending|todo|remaining|next|need to|before)/i },
    { section: 'PROBLEMS_ISSUES', keywords: /\b(bug|issue|error|broken|fix|outage)/i },
    { section: 'OPEN_QUESTIONS', keywords: /\?$/ },
  ];

  for (const src of sources) {
    const lines = src.redactedText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 12);

    lines.slice(0, 6).forEach((line, idx) => {
      const matched =
        sectionMatchers.find((m) => m.keywords.test(line))?.section ||
        'PROJECT_SNAPSHOT';
      items.push({
        id: genId('item'),
        handoverId: handover.id,
        projectId: handover.projectId,
        category: matched,
        section: matched,
        title: line.slice(0, 56) + (line.length > 56 ? '...' : ''),
        description: line,
        statement: line,
        sourceFileId: src.id,
        sourceFileName: src.fileName || src.title,
        sourceLocation: `Line ${idx + 1}`,
        sourceIds: [src.id],
        confidence: 'HIGH',
        confidenceScore: 0.88,
        evidence: line,
        citationVerified: true,
        citationValidationNote: `Extracted from ${src.title}`,
        departingReviewStatus: 'UNREVIEWED',
        departingComment: '',
        verificationStatus: 'PENDING',
        reviewStatus: 'PENDING',
        reviewerComment: '',
        reviewedBy: null,
        reviewedByName: null,
        reviewedAt: null,
        editHistory: [],
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  return items;
}

async function tryFirestoreSync(
  collectionName: string,
  id: string,
  data: Record<string, any>
): Promise<void> {
  if (!isFirebaseConfigured || !firestoreDb || !firebaseAuth?.currentUser) return;
  try {
    await setDoc(doc(firestoreDb, collectionName, id), data, { merge: true });
  } catch {
    // Firestore rules may restrict write depending on role; ignore in fallback mode
  }
}

async function tryReadFirestoreProjects(uid: string): Promise<Project[]> {
  if (!isFirebaseConfigured || !firestoreDb || !firebaseAuth?.currentUser) return [];
  try {
    const q = query(
      collection(firestoreDb, 'projects'),
      where('memberIds', 'array-contains', uid)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Project, 'id'>) }));
  } catch {
    return [];
  }
}

export async function handleApiFallback<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const path = endpoint.split('?')[0];
  let body: Record<string, any> = {};
  if (typeof options.body === 'string' && options.body.trim()) {
    try {
      body = JSON.parse(options.body);
    } catch {
      body = {};
    }
  }

  const store = loadStore();
  const actor = getActiveActor(store);

  // AUTH
  if (path === '/api/auth/me' && method === 'GET') {
    if (firebaseAuth?.currentUser && isFirebaseConfigured && firestoreDb) {
      try {
        const userSnap = await getDoc(doc(firestoreDb, 'users', firebaseAuth.currentUser.uid));
        if (userSnap.exists()) {
          return { user: userSnap.data() as UserProfile } as T;
        }
      } catch {
        // fallback to actor
      }
    }
    return { user: actor } as T;
  }

  if (path === '/api/auth/google' && method === 'POST') {
    const email = String(body.email || actor.email || 'user@handoveriq.dev');
    const name = String(body.name || actor.name || 'Workspace User');
    let user = store.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      user = {
        uid: firebaseAuth?.currentUser?.uid || genId('user'),
        name,
        email,
        role: 'TEAM_LEADER',
        department: 'Engineering',
        title: 'Workspace Member',
        createdAt: nowIso(),
      };
      store.users.push(user);
      ensureUserHasProjectAccess(store, user.uid);
    }
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    saveStore(store);
    return { user, token: 'cloud-session' } as T;
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    let user = store.users.find((u) => u.email.toLowerCase() === email);
    if (!user) {
      user = {
        uid: genId('user'),
        name: email.split('@')[0] || 'Workspace User',
        email: email || 'user@handoveriq.dev',
        role: 'TEAM_LEADER',
        department: 'Engineering',
        title: 'Workspace Member',
        createdAt: nowIso(),
      };
      store.users.push(user);
      ensureUserHasProjectAccess(store, user.uid);
      saveStore(store);
    }
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    return { user, token: 'cloud-session' } as T;
  }

  if (path === '/api/auth/register' && method === 'POST') {
    const user: UserProfile = {
      uid: genId('user'),
      name: String(body.name || 'New User'),
      email: String(body.email || 'user@handoveriq.dev'),
      role: (body.role as UserRole) || 'SUCCESSOR',
      department: body.department || 'Engineering',
      title: body.title || 'Engineer',
      createdAt: nowIso(),
    };
    store.users.push(user);
    ensureUserHasProjectAccess(store, user.uid);
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    saveStore(store);
    return { user, token: 'cloud-session' } as T;
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    localStorage.removeItem(CURRENT_USER_KEY);
    return { success: true } as T;
  }

  if (path === '/api/auth/forgot-password' && method === 'POST') {
    return {
      message: 'Password reset link generated (cloud mode).',
      resetToken: 'demo-reset-token',
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    } as T;
  }

  if (path === '/api/auth/reset-password' && method === 'POST') {
    return { message: 'Password updated successfully.' } as T;
  }

  // DASHBOARD
  if (path === '/api/dashboard' && method === 'GET') {
    const totalRedactionsApplied = store.sources.reduce(
      (sum, s) => sum + (s.redactionSummary?.totalRedactions || 0),
      0
    );
    const stats: DashboardStats = {
      totalProjects: store.projects.length,
      activeHandovers: store.handovers.filter((h) => h.status !== 'PUBLISHED').length,
      pendingApprovals: store.handovers.filter((h) => h.status === 'LEADER_REVIEW').length,
      completedHandovers: store.handovers.filter((h) => h.status === 'PUBLISHED').length,
      connectedIntegrations: store.integrations.filter((i) => i.status === 'CONNECTED').length,
      totalSourcesIngested: store.sources.length,
      totalRedactionsApplied,
      recentActivities: store.auditLogs.slice(0, 10),
      upcomingDeadlines: store.handovers
        .filter((h) => h.deadline)
        .map((h) => {
          const proj = store.projects.find((p) => p.id === h.projectId);
          const dep = store.users.find((u) => u.uid === h.departingMemberId);
          const suc = store.users.find((u) => u.uid === h.successorId);
          return {
            handoverId: h.id,
            title: h.title,
            projectName: proj?.name || 'Project',
            departingName: dep?.name || 'Departing Member',
            successorName: suc?.name || 'Successor',
            status: h.status,
            deadline: h.deadline!,
          };
        }),
    };
    return { stats } as T;
  }

  // USERS
  if (path === '/api/users' && method === 'GET') {
    return { users: store.users } as T;
  }

  const userRoleMatch = path.match(/^\/api\/users\/([^/]+)\/role$/);
  if (userRoleMatch && method === 'PATCH') {
    const uid = userRoleMatch[1];
    const user = store.users.find((u) => u.uid === uid);
    if (!user) throw new Error('User not found');
    user.role = body.role || user.role;
    if (body.department !== undefined) user.department = body.department;
    if (body.title !== undefined) user.title = body.title;
    user.updatedAt = nowIso();
    saveStore(store);
    return { user } as T;
  }

  // PROJECTS
  if (path === '/api/projects' && method === 'GET') {
    const fsProjects = await tryReadFirestoreProjects(actor.uid);
    const merged = [...store.projects];
    for (const fp of fsProjects) {
      if (!merged.some((p) => p.id === fp.id)) merged.push(fp);
    }
    return { projects: merged } as T;
  }

  if (path === '/api/projects' && method === 'POST') {
    const now = nowIso();
    const project: Project = {
      id: genId('proj'),
      name: String(body.name || 'Untitled Project'),
      description: String(body.description || ''),
      teamLeadId: body.teamLeadId || actor.uid,
      memberIds: Array.from(new Set([...(body.memberIds || []), actor.uid])),
      connectedSources: body.connectedSources || [],
      redactionRules: body.redactionRules || ['rule-api-key', 'rule-auth-token'],
      status: 'ACTIVE',
      progressPercent: 0,
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now,
    };
    store.projects.unshift(project);
    store.auditLogs.unshift({
      id: genId('log'),
      userId: actor.uid,
      userName: actor.name,
      userRole: actor.role,
      projectId: project.id,
      action: 'PROJECT_CREATED',
      target: 'Project',
      targetId: project.id,
      details: { name: project.name },
      timestamp: now,
    });
    saveStore(store);
    void tryFirestoreSync('projects', project.id, project);
    return { project } as T;
  }

  const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch) {
    const id = projectMatch[1];
    if (method === 'GET') {
      const project = store.projects.find((p) => p.id === id);
      if (!project) throw new Error('Project not found');
      const handovers = store.handovers.filter((h) => h.projectId === id);
      const activityLogs = store.auditLogs.filter((l) => l.projectId === id);
      return { project, handovers, activityLogs } as T;
    }
    if (method === 'PUT') {
      const idx = store.projects.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error('Project not found');
      store.projects[idx] = {
        ...store.projects[idx],
        ...body,
        updatedAt: nowIso(),
      };
      saveStore(store);
      return { project: store.projects[idx] } as T;
    }
    if (method === 'DELETE') {
      store.projects = store.projects.filter((p) => p.id !== id);
      saveStore(store);
      return { success: true } as T;
    }
  }

  // HANDOVERS
  if (path === '/api/handovers' && method === 'GET') {
    return { handovers: store.handovers } as T;
  }

  if (path === '/api/handovers' && method === 'POST') {
    const now = nowIso();
    const handover: Handover = {
      id: genId('ho'),
      title: String(body.title || 'New Handover Session'),
      projectId: String(body.projectId || store.projects[0]?.id || 'proj-auth-core'),
      departingMemberId: String(body.departingMemberId || actor.uid),
      successorId: String(body.successorId || 'demo-successor-1'),
      dateRange: body.dateRange || {
        startDate: now.slice(0, 10),
        endDate: now.slice(0, 10),
      },
      deadline: body.deadline,
      selectedDataSources: body.selectedDataSources || ['TXT'],
      githubRepo: body.githubRepo,
      githubBranch: body.githubBranch,
      status: 'DRAFT',
      approvalStatus: 'PENDING',
      versionLocked: false,
      analysisEngineUsed: null,
      createdBy: actor.uid,
      approvedBy: null,
      createdAt: now,
      updatedAt: now,
    };
    store.handovers.unshift(handover);
    saveStore(store);
    void tryFirestoreSync('handovers', handover.id, handover);
    return { handover } as T;
  }

  const handoverGetMatch = path.match(/^\/api\/handovers\/([^/]+)$/);
  if (handoverGetMatch && method === 'GET') {
    const id = handoverGetMatch[1];
    const handover = store.handovers.find((h) => h.id === id);
    if (!handover) throw new Error('Handover not found');
    const project = store.projects.find((p) => p.id === handover.projectId) || null;
    const sources = store.sources.filter((s) => s.handoverId === id);
    const reportItems = store.reportItems.filter((r) => r.handoverId === id);
    return { handover, project, sources, reportItems } as T;
  }

  const uploadMatch = path.match(/^\/api\/handovers\/([^/]+)\/upload$/);
  if (uploadMatch && method === 'POST') {
    const handoverId = uploadMatch[1];
    const handover = store.handovers.find((h) => h.id === handoverId);
    if (!handover) throw new Error('Handover not found');
    const fileName = String(body.fileName || 'uploaded-note.txt');
    const rawText = body.rawText
      ? String(body.rawText)
      : body.contentBase64
      ? decodeBase64Utf8(String(body.contentBase64))
      : 'Uploaded handover artifact';
    const redaction = applyRedaction(rawText, store.redactionRules);
    const now = nowIso();
    const ext = fileName.split('.').pop()?.toUpperCase();
    const docType =
      ext === 'CSV' || ext === 'JSON' || ext === 'PDF' || ext === 'DOCX'
        ? (`FILE_${ext}` as SourceDocument['type'])
        : 'FILE_TXT';

    const source: SourceDocument = {
      id: genId('src'),
      handoverId,
      projectId: handover.projectId,
      type: docType,
      title: fileName,
      fileName,
      uploadStatus: 'PROCESSED',
      url: `#${fileName}`,
      author: actor.name,
      uploadedBy: actor.uid,
      timestamp: now,
      redactedText: redaction.redactedText,
      redactionSummary: {
        totalRedactions: redaction.totalRedactions,
        categories: redaction.categories,
        rulesMatched: redaction.rulesMatched,
      },
      chunks: redaction.redactedText
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0)
        .slice(0, 10)
        .map((line, i) => ({ chunkId: `c-${i + 1}`, text: line })),
      metadata: { uploadedInCloudMode: true },
      createdAt: now,
    };
    store.sources.push(source);
    handover.status = 'INGESTING';
    handover.updatedAt = now;
    saveStore(store);
    return { source, redactionDetails: redaction.matches } as T;
  }

  const ghMatch = path.match(/^\/api\/handovers\/([^/]+)\/github-import$/);
  if (ghMatch && method === 'POST') {
    const handoverId = ghMatch[1];
    const handover = store.handovers.find((h) => h.id === handoverId);
    if (!handover) throw new Error('Handover not found');
    const repo = String(body.repoFullName || handover.githubRepo || 'owner/repo');
    const sampleText = `Commit on ${repo}: Implemented strict CSRF verification, rotated OAuth callback URLs, and documented rollback procedure for Redis session store.`;
    const redaction = applyRedaction(sampleText, store.redactionRules);
    const now = nowIso();
    const source: SourceDocument = {
      id: genId('src'),
      handoverId,
      projectId: handover.projectId,
      type: 'GITHUB_COMMIT',
      title: `${repo} recent commits`,
      url: `https://github.com/${repo}`,
      author: actor.name,
      timestamp: now,
      redactedText: redaction.redactedText,
      redactionSummary: {
        totalRedactions: redaction.totalRedactions,
        categories: redaction.categories,
        rulesMatched: redaction.rulesMatched,
      },
      chunks: [{ chunkId: 'gh-1', text: redaction.redactedText }],
      metadata: { repoFullName: repo },
      createdAt: now,
    };
    store.sources.push(source);
    saveStore(store);
    return {
      importedCount: 1,
      totalRedactions: redaction.totalRedactions,
      sources: [source],
    } as T;
  }

  const analyzeMatch = path.match(/^\/api\/handovers\/([^/]+)\/analyze$/);
  if (analyzeMatch && method === 'POST') {
    const handoverId = analyzeMatch[1];
    const handover = store.handovers.find((h) => h.id === handoverId);
    if (!handover) throw new Error('Handover not found');
    const sources = store.sources.filter((s) => s.handoverId === handoverId);
    const generated = runExtractiveAnalysis(handover, sources);
    store.reportItems = [
      ...store.reportItems.filter((r) => r.handoverId !== handoverId),
      ...generated,
    ];
    handover.status = 'ANALYZED';
    handover.analysisEngineUsed = 'EXTRACTIVE_GROUNDED';
    handover.updatedAt = nowIso();
    saveStore(store);
    return {
      handover,
      reportItems: generated,
      engineUsed: 'EXTRACTIVE_GROUNDED',
    } as T;
  }

  const depCtxMatch = path.match(/^\/api\/handovers\/([^/]+)\/departing-context$/);
  if (depCtxMatch && method === 'POST') {
    const handoverId = depCtxMatch[1];
    const handover = store.handovers.find((h) => h.id === handoverId);
    if (!handover) throw new Error('Handover not found');
    if (body.notes !== undefined) handover.departingMemberNotes = String(body.notes);
    if (body.questionItemId && body.questionAnswer) {
      handover.openQuestionAnswers = {
        ...(handover.openQuestionAnswers || {}),
        [body.questionItemId]: {
          answer: String(body.questionAnswer),
          answeredBy: actor.uid,
          answeredByName: actor.name,
          answeredAt: nowIso(),
        },
      };
    }
    if (body.submitToLeader) handover.status = 'LEADER_REVIEW';
    handover.updatedAt = nowIso();
    saveStore(store);
    return { handover } as T;
  }

  const depItemMatch = path.match(/^\/api\/report-items\/([^/]+)\/departing-feedback$/);
  if (depItemMatch && method === 'PATCH') {
    const item = store.reportItems.find((r) => r.id === depItemMatch[1]);
    if (!item) throw new Error('Report item not found');
    item.departingReviewStatus = body.departingReviewStatus;
    if (body.departingComment !== undefined) item.departingComment = body.departingComment;
    item.updatedAt = nowIso();
    saveStore(store);
    return { item } as T;
  }

  const leaderItemMatch = path.match(/^\/api\/report-items\/([^/]+)\/leader-review$/);
  if (leaderItemMatch && method === 'PATCH') {
    const item = store.reportItems.find((r) => r.id === leaderItemMatch[1]);
    if (!item) throw new Error('Report item not found');
    if (body.reviewStatus) {
      item.reviewStatus = body.reviewStatus;
      item.verificationStatus = body.reviewStatus;
    }
    if (body.statement) item.statement = body.statement;
    if (body.reviewerComment !== undefined) item.reviewerComment = body.reviewerComment;
    if (body.section) {
      item.section = body.section;
      item.category = body.section;
    }
    item.reviewedBy = actor.uid;
    item.reviewedByName = actor.name;
    item.reviewedAt = nowIso();
    item.updatedAt = nowIso();
    saveStore(store);
    return { item } as T;
  }

  const publishMatch = path.match(/^\/api\/handovers\/([^/]+)\/publish$/);
  if (publishMatch && method === 'POST') {
    const handover = store.handovers.find((h) => h.id === publishMatch[1]);
    if (!handover) throw new Error('Handover not found');
    const now = nowIso();
    handover.status = 'PUBLISHED';
    handover.approvalStatus = 'APPROVED';
    handover.versionLocked = true;
    handover.approvedBy = actor.uid;
    handover.approvalSummary = {
      approvedBy: actor.uid,
      approvedByName: actor.name,
      approvedAt: now,
      publishedAt: now,
      leaderComments: body.leaderComments || '',
      version: (handover.approvalSummary?.version || 0) + 1,
      approvalStatus: 'APPROVED',
      versionLocked: true,
    };
    handover.updatedAt = now;
    saveStore(store);
    return { handover } as T;
  }

  const revMatch = path.match(/^\/api\/handovers\/([^/]+)\/revision-request$/);
  if (revMatch && method === 'POST') {
    const handover = store.handovers.find((h) => h.id === revMatch[1]);
    if (!handover) throw new Error('Handover not found');
    handover.status = 'REVISION_REQUESTED';
    handover.approvalStatus = 'REVISION_REQUESTED';
    handover.updatedAt = nowIso();
    saveStore(store);
    return { handover } as T;
  }

  const delSrcMatch = path.match(/^\/api\/handovers\/([^/]+)\/sources\/([^/]+)$/);
  if (delSrcMatch && method === 'DELETE') {
    store.sources = store.sources.filter((s) => s.id !== delSrcMatch[2]);
    saveStore(store);
    return { success: true, deletedSourceId: delSrcMatch[2] } as T;
  }

  const qaMatch = path.match(/^\/api\/handovers\/([^/]+)\/qa$/);
  if (qaMatch && method === 'POST') {
    const handoverId = qaMatch[1];
    const question = String(body.question || '').trim();
    const sources = store.sources.filter((s) => s.handoverId === handoverId);
    const items = store.reportItems.filter((r) => r.handoverId === handoverId);
    const tokens = question
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2);

    const matchedItems = items.filter((item) =>
      tokens.some(
        (t) =>
          item.statement.toLowerCase().includes(t) ||
          item.title.toLowerCase().includes(t)
      )
    );
    const chosenItems = matchedItems.length > 0 ? matchedItems.slice(0, 3) : items.slice(0, 2);

    const citations: QACitation[] = sources.slice(0, 2).map((s) => ({
      sourceId: s.id,
      title: s.title,
      type: s.type,
      url: s.url,
      author: s.author,
      timestamp: s.timestamp,
      excerpt: s.redactedText.slice(0, 220),
    }));

    const answer =
      chosenItems.length > 0
        ? chosenItems.map((i) => `• ${i.statement}`).join('\n')
        : sources.length > 0
        ? `Based on ${sources[0].title}: ${sources[0].redactedText.slice(0, 240)}`
        : 'No ingested sources are attached to this handover yet.';

    const qaResult: QAResponse = {
      question,
      answer,
      grounded: chosenItems.length > 0 || sources.length > 0,
      engineUsed: 'DETERMINISTIC_RAG',
      citations,
      referencedReportItemIds: chosenItems.map((i) => i.id),
      timestamp: nowIso(),
    };
    return { qaResult } as T;
  }

  const pdfLogMatch = path.match(/^\/api\/handovers\/([^/]+)\/pdf-log$/);
  if (pdfLogMatch && method === 'POST') {
    store.auditLogs.unshift({
      id: genId('log'),
      userId: actor.uid,
      userName: actor.name,
      userRole: actor.role,
      action: 'PDF_EXPORTED',
      target: 'Handover',
      targetId: pdfLogMatch[1],
      details: {},
      timestamp: nowIso(),
    });
    saveStore(store);
    return { logged: true } as T;
  }

  // INTEGRATIONS
  if (path === '/api/integrations' && method === 'GET') {
    return { integrations: store.integrations } as T;
  }

  const intMatch = path.match(/^\/api\/integrations\/(github|gemini)\/configure$/);
  if (intMatch && method === 'POST') {
    const id = intMatch[1] as 'github' | 'gemini';
    const integration = store.integrations.find((i) => i.id === id);
    if (!integration) throw new Error('Integration not found');
    const cred = String(body.credential || '').trim();
    integration.configured = cred.length > 0;
    integration.status = cred.length > 0 ? 'CONNECTED' : 'DISCONNECTED';
    integration.maskedCredential = cred ? `${cred.slice(0, 4)}••••••••` : '';
    integration.lastVerifiedAt = nowIso();
    integration.updatedBy = actor.uid;
    integration.updatedAt = nowIso();
    saveStore(store);
    return { integration } as T;
  }

  // REDACTION RULES
  if (path === '/api/redaction-rules' && method === 'GET') {
    return { rules: store.redactionRules } as T;
  }

  if (path === '/api/redaction-rules' && method === 'POST') {
    const rule: RedactionRule = {
      id: genId('rule'),
      name: String(body.name || 'Custom Rule'),
      category: (body.category as RedactionCategory) || 'CUSTOM_REGEX',
      pattern: String(body.pattern || ''),
      replacement: `[REDACTED:${body.category || 'CUSTOM'}]`,
      description: String(body.description || ''),
      isBuiltIn: false,
      enabled: true,
      createdBy: actor.uid,
      createdAt: nowIso(),
    };
    store.redactionRules.unshift(rule);
    saveStore(store);
    return { rule } as T;
  }

  const ruleMatch = path.match(/^\/api\/redaction-rules\/([^/]+)$/);
  if (ruleMatch) {
    const id = ruleMatch[1];
    if (method === 'PATCH') {
      const rule = store.redactionRules.find((r) => r.id === id);
      if (!rule) throw new Error('Rule not found');
      rule.enabled = Boolean(body.enabled);
      saveStore(store);
      return { rule } as T;
    }
    if (method === 'DELETE') {
      store.redactionRules = store.redactionRules.filter((r) => r.id !== id);
      saveStore(store);
      return { success: true } as T;
    }
  }

  if (path === '/api/redaction/test' && method === 'POST') {
    const result = applyRedaction(
      String(body.sampleText || ''),
      store.redactionRules,
      Array.isArray(body.projectKeywords) ? body.projectKeywords : []
    );
    return { result } as T;
  }

  // AUDIT LOGS
  if (path === '/api/audit-logs' && method === 'GET') {
    return { logs: store.auditLogs } as T;
  }

  // NOTIFICATIONS
  if (path === '/api/notifications' && method === 'GET') {
    return { notifications: store.notifications } as T;
  }

  const notifMatch = path.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (notifMatch && method === 'PATCH') {
    const notif = store.notifications.find((n) => n.id === notifMatch[1]);
    if (notif) notif.read = true;
    saveStore(store);
    return { success: true } as T;
  }

  throw new Error(`Unsupported endpoint in cloud mode: ${path}`);
}

