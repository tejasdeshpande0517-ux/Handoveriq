import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AppNotification,
  ApprovalRecord,
  AuditLog,
  Handover,
  HandoverReport,
  HandoverSummary,
  HandoverTask,
  IntegrationConfig,
  Project,
  ProjectMember,
  QAResponse,
  RedactionRule,
  ReportItem,
  SourceDocument,
  UserProfile,
  UserRole,
} from '../src/types/index.ts';
import { DEFAULT_REDACTION_RULES, redactSensitiveContent } from './services/redaction.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_ENV_FILE = path.resolve(__dirname, '..', '.env');

// Load .env into process.env on startup if present
if (fs.existsSync(ROOT_ENV_FILE)) {
  try {
    const envLines = fs.readFileSync(ROOT_ENV_FILE, 'utf-8').split(/\r?\n/);
    for (const line of envLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch {
    // Ignore env parse error
  }
}

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'firestore.json');
export const STORAGE_DIR = path.join(DATA_DIR, 'storage');

export interface AuthRecord {
  uid: string;
  email: string;
  passwordHash: string;
  salt: string;
  tokenVersion?: number;
  resetToken?: string | null;
  resetTokenExpiresAt?: string | null;
}

export interface ServerSecrets {
  githubToken: string;
  geminiApiKey: string;
}

export interface FirestoreDatabaseSchema {
  users: Record<string, UserProfile>;
  authRecords: Record<string, AuthRecord>;
  projects: Record<string, Project>;
  projectMembers: Record<string, ProjectMember>;
  handovers: Record<string, Handover>;
  handoverSessions: Record<string, Handover>;
  sources: Record<string, SourceDocument>;
  uploadedSources: Record<string, SourceDocument>;
  reportItems: Record<string, ReportItem>;
  extractedInsights: Record<string, ReportItem>;
  handoverReports: Record<string, HandoverReport>;
  approvals: Record<string, ApprovalRecord>;
  auditLogs: Record<string, AuditLog>;
  integrations: Record<string, IntegrationConfig>;
  redactionRules: Record<string, RedactionRule>;
  notifications: Record<string, AppNotification>;
  qaHistory?: Record<string, QAResponse[]>;
  handoverSummaries?: Record<string, HandoverSummary>;
  tasks?: Record<string, HandoverTask>;
  serverSecrets: ServerSecrets;
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { hash, salt: actualSalt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    if (!password || !hash || !salt) return false;
    const computedBuf = crypto.scryptSync(password, salt, 64);
    const hashBuf = Buffer.from(hash, 'hex');
    if (computedBuf.length !== hashBuf.length) return false;
    return crypto.timingSafeEqual(computedBuf, hashBuf);
  } catch {
    return false;
  }
}

export function maskSecret(secret: string): string {
  if (!secret || !secret.trim()) return '';
  return '••••••••••••••••';
}

function createInitialSeedDatabase(): FirestoreDatabaseSchema {
  const now = new Date().toISOString();
  const earlier1 = new Date(Date.now() - 86400000 * 5).toISOString();
  const earlier2 = new Date(Date.now() - 86400000 * 3).toISOString();
  const earlier3 = new Date(Date.now() - 86400000 * 1).toISOString();

  // 1. Seed Users for all 4 roles
  const users: Record<string, UserProfile> = {
    'usr_admin_01': {
      uid: 'usr_admin_01',
      name: 'Elena Rostova',
      email: 'admin@handoveriq.io',
      role: 'ADMIN',
      department: 'Platform Security & Governance',
      title: 'Principal Systems Administrator',
      createdAt: earlier1,
      updatedAt: earlier1,
    },
    'usr_lead_01': {
      uid: 'usr_lead_01',
      name: 'Marcus Vance',
      email: 'leader@handoveriq.io',
      role: 'TEAM_LEADER',
      department: 'Core Cloud Infrastructure',
      title: 'Engineering Team Leader',
      createdAt: earlier1,
      updatedAt: earlier1,
    },
    'usr_dept_01': {
      uid: 'usr_dept_01',
      name: 'Dr. Aris Thorne',
      email: 'departing@handoveriq.io',
      role: 'DEPARTING_MEMBER',
      department: 'Core Cloud Infrastructure',
      title: 'Staff Backend Architect',
      createdAt: earlier1,
      updatedAt: earlier1,
    },
    'usr_succ_01': {
      uid: 'usr_succ_01',
      name: 'Priya Nair',
      email: 'successor@handoveriq.io',
      role: 'SUCCESSOR',
      department: 'Core Cloud Infrastructure',
      title: 'Senior Distributed Systems Engineer',
      createdAt: earlier1,
      updatedAt: earlier1,
    },
    'usr_dept_02': {
      uid: 'usr_dept_02',
      name: 'Vikram Mehta',
      email: 'vikram.mehta@handoveriq.io',
      role: 'DEPARTING_MEMBER',
      department: 'ML Risk & Telemetry',
      title: 'Staff ML Infrastructure Engineer',
      createdAt: earlier1,
      updatedAt: earlier1,
    },
    'usr_succ_02': {
      uid: 'usr_succ_02',
      name: 'Ananya Iyer',
      email: 'ananya.iyer@handoveriq.io',
      role: 'SUCCESSOR',
      department: 'Platform Security & IAM',
      title: 'Senior Platform Security Engineer',
      createdAt: earlier1,
      updatedAt: earlier1,
    },
    'usr_dept_03': {
      uid: 'usr_dept_03',
      name: 'Rohan Kapoor',
      email: 'rohan.kapoor@handoveriq.io',
      role: 'DEPARTING_MEMBER',
      department: 'Platform Security & IAM',
      title: 'Principal IAM Architect',
      createdAt: earlier1,
      updatedAt: earlier1,
    },
    'usr_succ_03': {
      uid: 'usr_succ_03',
      name: 'Neha Sharma',
      email: 'neha.sharma@handoveriq.io',
      role: 'SUCCESSOR',
      department: 'ML Risk & Telemetry',
      title: 'Lead Site Reliability Engineer',
      createdAt: earlier1,
      updatedAt: earlier1,
    },
  };

  const authRecords: Record<string, AuthRecord> = {};
  const fallbackRandomPassword = () => crypto.randomBytes(16).toString('hex');
  const defaultPasswords: Record<string, string> = {
    'usr_admin_01': process.env.SEED_ADMIN_PASSWORD || fallbackRandomPassword(),
    'usr_lead_01': process.env.SEED_LEAD_PASSWORD || fallbackRandomPassword(),
    'usr_dept_01': process.env.SEED_DEPT_PASSWORD || fallbackRandomPassword(),
    'usr_succ_01': process.env.SEED_SUCC_PASSWORD || fallbackRandomPassword(),
    'usr_dept_02': process.env.SEED_DEPT_PASSWORD || fallbackRandomPassword(),
    'usr_succ_02': process.env.SEED_SUCC_PASSWORD || fallbackRandomPassword(),
    'usr_dept_03': process.env.SEED_DEPT_PASSWORD || fallbackRandomPassword(),
    'usr_succ_03': process.env.SEED_SUCC_PASSWORD || fallbackRandomPassword(),
  };

  for (const [uid, user] of Object.entries(users)) {
    const { hash, salt } = hashPassword(defaultPasswords[uid]);
    authRecords[uid] = {
      uid,
      email: user.email.toLowerCase(),
      passwordHash: hash,
      salt,
      tokenVersion: 0,
      resetToken: null,
      resetTokenExpiresAt: null,
    };
  }

  // 2. Seed Built-in Redaction Rules
  const redactionRules: Record<string, RedactionRule> = {};
  DEFAULT_REDACTION_RULES.forEach((rule, idx) => {
    const id = `rule_builtin_${idx + 1}`;
    redactionRules[id] = {
      ...rule,
      id,
      createdAt: earlier1,
    };
  });

  // Add one custom Admin keyword rule
  redactionRules['rule_custom_1'] = {
    id: 'rule_custom_1',
    name: 'Internal Codename Project Obsidian Vault',
    category: 'CUSTOM_KEYWORD',
    pattern: 'OBSIDIAN-MASTER-KEY-99',
    replacement: '[REDACTED]',
    description: 'Redacts internal vault master passphrase across all ingested engineering logs.',
    isBuiltIn: false,
    enabled: true,
    createdBy: 'usr_admin_01',
    createdAt: earlier1,
  };

  const activeRulesList = Object.values(redactionRules);

  // 3. Seed Projects
  const projects: Record<string, Project> = {
    'proj_payment_gateway': {
      id: 'proj_payment_gateway',
      name: 'Nexus Settlement & Ledger Engine v3',
      description:
        'High-throughput multi-region clearing service handling ISO-20022 real-time ledger settlements, idempotency orchestration, and automated webhook reconciliation.',
      teamLeadId: 'usr_lead_01',
      memberIds: ['usr_lead_01', 'usr_dept_01', 'usr_succ_01'],
      connectedSources: [
        {
          type: 'FILE_UPLOAD',
          verifiedAt: earlier2,
        },
      ],
      redactionRules: ['NEXUS-INTERNAL-TOKEN', 'CORP-VAULT-7741'],
      status: 'ACTIVE',
      createdBy: 'usr_lead_01',
      createdAt: earlier1,
      updatedAt: earlier2,
    },
    'proj_identity_mesh': {
      id: 'proj_identity_mesh',
      name: 'Zero-Trust Auth & Token Mesh',
      description:
        'Distributed OIDC federation gateway, mTLS certificate rotation controller, and fine-grained policy enforcement service.',
      teamLeadId: 'usr_lead_01',
      memberIds: ['usr_lead_01', 'usr_dept_03', 'usr_succ_02', 'usr_dept_01', 'usr_succ_01'],
      connectedSources: [
        {
          type: 'FILE_UPLOAD',
          verifiedAt: earlier3,
        },
      ],
      redactionRules: ['MESH-ROOT-CA-PASS'],
      status: 'ACTIVE',
      createdBy: 'usr_admin_01',
      createdAt: earlier2,
      updatedAt: earlier3,
    },
    'proj_ml_inference': {
      id: 'proj_ml_inference',
      name: 'Realtime Risk & Anomaly Scoring Cluster',
      description:
        'Low-latency Flink and ONNX feature-scoring pipeline evaluating 14,000+ payment events/sec with Redis Cluster feature hydration.',
      teamLeadId: 'usr_lead_01',
      memberIds: ['usr_lead_01', 'usr_dept_02', 'usr_succ_03'],
      connectedSources: [
        {
          type: 'GITHUB',
          repoFullName: 'nexus-org/risk-scoring-flink',
          verifiedAt: earlier3,
        },
      ],
      redactionRules: ['RISK-MODEL-SIGNING-KEY'],
      status: 'ACTIVE',
      createdBy: 'usr_lead_01',
      createdAt: earlier2,
      updatedAt: now,
    },
    'proj_billing_ledger': {
      id: 'proj_billing_ledger',
      name: 'Multi-Currency Usage & Invoice Pipeline',
      description:
        'Automated metered billing aggregator, tax jurisdiction resolver, and Stripe/ERP reconciliation daemon.',
      teamLeadId: 'usr_lead_01',
      memberIds: ['usr_lead_01', 'usr_succ_02', 'usr_succ_01'],
      connectedSources: [
        {
          type: 'FILE_UPLOAD',
          verifiedAt: now,
        },
      ],
      redactionRules: ['ERP-SAP-CLIENT-SECRET'],
      status: 'ACTIVE',
      createdBy: 'usr_lead_01',
      createdAt: earlier3,
      updatedAt: now,
    },
  };

  // 4. Seed Handovers:
  //    - hnd_published_01: Complete, Leader-Verified & PUBLISHED handover (accessible to Successor)
  //    - hnd_review_01: Active handover in LEADER_REVIEW / DEPARTING_REVIEW state (NOT accessible to Successor!)
  const handovers: Record<string, Handover> = {
    'hnd_published_01': {
      id: 'hnd_published_01',
      title: 'Q4 Staff Backend Architect Handover — Nexus Settlement Engine',
      projectId: 'proj_payment_gateway',
      departingMemberId: 'usr_dept_01',
      successorId: 'usr_succ_01',
      dateRange: {
        startDate: '2026-09-01',
        endDate: '2026-11-10',
      },
      deadline: '2026-11-20',
      selectedDataSources: ['GITHUB', 'JSON', 'CSV', 'TXT'],
      githubRepo: 'nexus-org/settlement-engine',
      status: 'PUBLISHED',
      processingProgress: {
        stage: 'PUBLISHED',
        percent: 100,
        message: 'All 7 sections verified and published by Team Leader Marcus Vance.',
        updatedAt: earlier3,
      },
      departingMemberNotes:
        'Confirmed all settlement idempotency decisions and added context regarding the pending Redis cluster shard migration scheduled for sprint 44.',
      openQuestionAnswers: {
        'rpt_item_07': {
          answer:
            'The secondary PostgreSQL logical replication slot failover threshold is configured in helm/values-prod.yaml under replicationLagMaxSeconds: 15.',
          answeredBy: 'usr_dept_01',
          answeredByName: 'Dr. Aris Thorne',
          answeredAt: earlier2,
        },
      },
      approvalSummary: {
        approvedBy: 'usr_lead_01',
        approvedByName: 'Marcus Vance',
        approvedAt: earlier3,
        publishedAt: earlier3,
        leaderComments:
          'Verified all source citations against commit logs and incident postmortems. Cleared for successor Priya Nair.',
        version: 2,
      },
      versionHistory: [
        {
          version: 1,
          timestamp: earlier2,
          actorId: 'usr_lead_01',
          actorName: 'Marcus Vance',
          actorRole: 'TEAM_LEADER',
          summary: 'Initial grounded extraction generated from 3 redacted engineering sources.',
          itemCount: 7,
          approvedCount: 0,
        },
        {
          version: 2,
          timestamp: earlier3,
          actorId: 'usr_lead_01',
          actorName: 'Marcus Vance',
          actorRole: 'TEAM_LEADER',
          summary: 'Departing Member confirmed findings; Team Leader approved all 7 sections and published report.',
          itemCount: 7,
          approvedCount: 7,
        },
      ],
      analysisEngineUsed: 'EXTRACTIVE_GROUNDED',
      createdBy: 'usr_lead_01',
      approvedBy: 'usr_lead_01',
      createdAt: earlier2,
      updatedAt: earlier3,
    },
    'hnd_review_01': {
      id: 'hnd_review_01',
      title: 'Zero-Trust Token Mesh Rotation Controller Transition',
      projectId: 'proj_identity_mesh',
      departingMemberId: 'usr_dept_03',
      successorId: 'usr_succ_02',
      dateRange: {
        startDate: '2026-10-01',
        endDate: '2026-11-12',
      },
      deadline: '2026-11-25',
      selectedDataSources: ['TXT', 'JSON', 'CSV'],
      status: 'LEADER_REVIEW',
      processingProgress: {
        stage: 'LEADER_REVIEW',
        percent: 80,
        message: 'Awaiting Team Leader item-by-item review and approval.',
        updatedAt: now,
      },
      departingMemberNotes:
        'Reviewed initial extraction. Please ensure the mTLS certificate renewal cron job dependency is highlighted.',
      openQuestionAnswers: {},
      approvalSummary: {
        version: 1,
      },
      versionHistory: [
        {
          version: 1,
          timestamp: earlier3,
          actorId: 'usr_lead_01',
          actorName: 'Marcus Vance',
          actorRole: 'TEAM_LEADER',
          summary: 'Initial source ingestion and grounded report generation.',
          itemCount: 7,
          approvedCount: 3,
        },
      ],
      analysisEngineUsed: 'EXTRACTIVE_GROUNDED',
      createdBy: 'usr_lead_01',
      approvedBy: null,
      createdAt: earlier3,
      updatedAt: now,
    },
    'hnd_risk_02': {
      id: 'hnd_risk_02',
      title: 'Flink Feature Hydration & Anomaly Scoring Handover',
      projectId: 'proj_ml_inference',
      departingMemberId: 'usr_dept_02',
      successorId: 'usr_succ_03',
      dateRange: {
        startDate: '2026-10-10',
        endDate: '2026-11-13',
      },
      deadline: '2026-11-29',
      selectedDataSources: ['GITHUB', 'TXT'],
      githubRepo: 'nexus-org/risk-scoring-flink',
      status: 'DEPARTING_REVIEW',
      processingProgress: {
        stage: 'DEPARTING_REVIEW',
        percent: 62,
        message: 'Vikram Mehta is verifying model rollback runbook & Redis TTL thresholds.',
        updatedAt: now,
      },
      departingMemberNotes:
        'Validating checkpoint retention settings in flink-conf.yaml before submitting to Team Leader.',
      openQuestionAnswers: {},
      approvalSummary: {
        version: 1,
      },
      versionHistory: [],
      analysisEngineUsed: 'EXTRACTIVE_GROUNDED',
      createdBy: 'usr_lead_01',
      approvedBy: null,
      createdAt: earlier3,
      updatedAt: now,
    },
    'hnd_billing_03': {
      id: 'hnd_billing_03',
      title: 'Multi-Currency Usage Aggregator & ERP Sync Transition',
      projectId: 'proj_billing_ledger',
      departingMemberId: 'usr_succ_02',
      successorId: 'usr_succ_01',
      dateRange: {
        startDate: '2026-10-15',
        endDate: '2026-11-13',
      },
      deadline: '2026-12-04',
      selectedDataSources: ['JSON', 'CSV'],
      status: 'LEADER_REVIEW',
      processingProgress: {
        stage: 'LEADER_REVIEW',
        percent: 88,
        message: '4 of 5 tax-resolver checks verified; final sign-off pending.',
        updatedAt: now,
      },
      departingMemberNotes:
        'Added end-of-month VAT rounding reconciliation notes for EU/UK invoices.',
      openQuestionAnswers: {},
      approvalSummary: {
        version: 1,
      },
      versionHistory: [],
      analysisEngineUsed: 'EXTRACTIVE_GROUNDED',
      createdBy: 'usr_lead_01',
      approvedBy: null,
      createdAt: earlier3,
      updatedAt: now,
    },
  };

  // 5. Seed Redacted Sources for hnd_published_01 & hnd_review_01
  const rawSource1 = `Architecture & Release Log — Nexus Settlement Engine v3.2
Author: Dr. Aris Thorne (aris.thorne@handoveriq.io)
Contact Emergency Pager: +1-415-890-4412 | Production API Key: sk-live99887766554433221100aabbccdd
Architecture Overview: The Nexus Settlement Engine v3.2 processes ISO-20022 ledger batches across two active-passive PostgreSQL 16 clusters with Redis 7.2 distributed locks.
Key Decision: Decided to migrate idempotency key storage from PostgreSQL advisory locks to Redis 7.2 Redlock with 24-hour TTL, reducing p99 settlement latency from 410ms to 68ms.
Dependency: Depends on upstream Treasury FX Rate Feed API v2 and internal Kafka cluster topic "ledger.settlement.events.v3".`;

  const rawSource2 = `Sprint 43 Engineering Handover & Backlog Export
Owner: Dr. Aris Thorne | DB Connection: postgres://ledger_admin:Sup3rS3cretP@ss!@db.internal:5432/nexus
Pending Work: TODO: Complete automated shard rebalancing script in scripts/rebalance-shards.ts before Q1 traffic spike (PR #418 currently open).
Known Problem: Bug in webhook retry worker causes duplicate dead-letter queue alerts when partner TLS handshake times out after 5000ms.
Risk: Critical risk of ledger reconciliation delay if Kafka consumer group "settlement-archiver" lags beyond 50,000 messages during end-of-month closing.
Open Question: What is the exact failover threshold for the secondary PostgreSQL logical replication slot during planned maintenance windows?`;

  const rawSource3 = `Zero-Trust Token Mesh Handover Notes
Author: Dr. Aris Thorne (aris.thorne@handoveriq.io) | Token: ghp_99887766554433221100AabbCcDdEeFfGgHh
Architecture Overview: Zero-Trust Token Mesh issues short-lived 15-minute SPIFFE/SPIRE mTLS workload certificates across 18 Kubernetes microservices.
Key Decision: Decided to standardize all service-to-service authentication on Ed25519 JWT signatures rather than RSA-2048 to cut CPU overhead by 38%.
Pending Work: Unfinished migration of legacy billing-adapter service from static API keys to SPIFFE mTLS identities (tracked in Issue #109).
Known Problem: Intermittent latency spike in OIDC discovery endpoint when upstream HSM key vault takes >800ms to sign rotation bundles.
Dependency: Depends on HashiCorp Vault PKI engine v1.17 and Cloudflare DNS-01 ACME challenge webhook.
Risk: Security risk if root intermediate CA certificate expires on 2026-12-15 without automated alerting hook enabled in PagerDuty.
Open Question: Should the legacy v1 token introspection endpoint be deprecated in release 2.4 or maintained until Q2?`;

  const red1 = redactSensitiveContent(
    rawSource1,
    activeRulesList,
    projects['proj_payment_gateway'].redactionRules
  );
  const red2 = redactSensitiveContent(
    rawSource2,
    activeRulesList,
    projects['proj_payment_gateway'].redactionRules
  );
  const red3 = redactSensitiveContent(
    rawSource3,
    activeRulesList,
    projects['proj_identity_mesh'].redactionRules
  );

  const sources: Record<string, SourceDocument> = {
    'src_nexus_arch_01': {
      id: 'src_nexus_arch_01',
      handoverId: 'hnd_published_01',
      projectId: 'proj_payment_gateway',
      type: 'FILE_TXT',
      title: 'nexus-architecture-release-v3.2.txt',
      url: 'storage://handovers/hnd_published_01/uploads/nexus-architecture-release-v3.2.txt',
      author: 'Dr. Aris Thorne',
      timestamp: earlier2,
      redactedText: red1.redactedText,
      redactionSummary: {
        totalRedactions: red1.totalRedactions,
        categories: red1.categories,
        rulesMatched: red1.rulesMatched,
      },
      chunks: [
        {
          chunkId: 'src_nexus_arch_01_chunk_1',
          text: red1.redactedText,
        },
      ],
      metadata: {
        fileName: 'nexus-architecture-release-v3.2.txt',
        format: 'TXT',
        sizeBytes: rawSource1.length,
      },
      createdAt: earlier2,
    },
    'src_nexus_backlog_02': {
      id: 'src_nexus_backlog_02',
      handoverId: 'hnd_published_01',
      projectId: 'proj_payment_gateway',
      type: 'GITHUB_PR',
      title: 'PR #418 & Sprint 43 Engineering Backlog Summary',
      url: 'https://github.com/nexus-org/settlement-engine/pull/418',
      author: 'Dr. Aris Thorne',
      timestamp: earlier2,
      redactedText: red2.redactedText,
      redactionSummary: {
        totalRedactions: red2.totalRedactions,
        categories: red2.categories,
        rulesMatched: red2.rulesMatched,
      },
      chunks: [
        {
          chunkId: 'src_nexus_backlog_02_chunk_1',
          text: red2.redactedText,
        },
      ],
      metadata: {
        repo: 'nexus-org/settlement-engine',
        prNumber: 418,
        state: 'OPEN',
      },
      createdAt: earlier2,
    },
    'src_mesh_notes_03': {
      id: 'src_mesh_notes_03',
      handoverId: 'hnd_review_01',
      projectId: 'proj_identity_mesh',
      type: 'FILE_TXT',
      title: 'zero-trust-mesh-handover-notes.txt',
      url: 'storage://handovers/hnd_review_01/uploads/zero-trust-mesh-handover-notes.txt',
      author: 'Dr. Aris Thorne',
      timestamp: earlier3,
      redactedText: red3.redactedText,
      redactionSummary: {
        totalRedactions: red3.totalRedactions,
        categories: red3.categories,
        rulesMatched: red3.rulesMatched,
      },
      chunks: [
        {
          chunkId: 'src_mesh_notes_03_chunk_1',
          text: red3.redactedText,
        },
      ],
      metadata: {
        fileName: 'zero-trust-mesh-handover-notes.txt',
        format: 'TXT',
        sizeBytes: rawSource3.length,
      },
      createdAt: earlier3,
    },
  };

  // 6. Seed Report Items for hnd_published_01 (All APPROVED) and hnd_review_01 (Mixed PENDING / APPROVED)
  const rawReportItems: Record<
    string,
    Omit<
      ReportItem,
      | 'category'
      | 'title'
      | 'description'
      | 'sourceFileId'
      | 'sourceFileName'
      | 'sourceLocation'
      | 'verificationStatus'
    >
  > = {
    'rpt_item_01': {
      id: 'rpt_item_01',
      handoverId: 'hnd_published_01',
      section: 'PROJECT_SNAPSHOT',
      statement:
        'The Nexus Settlement Engine v3.2 processes ISO-20022 ledger batches across two active-passive PostgreSQL 16 clusters with Redis 7.2 distributed locks.',
      sourceIds: ['src_nexus_arch_01'],
      confidence: 'HIGH',
      confidenceScore: 0.96,
      evidence:
        'Architecture Overview: The Nexus Settlement Engine v3.2 processes ISO-20022 ledger batches across two active-passive PostgreSQL 16 clusters with Redis 7.2 distributed locks.',
      citationVerified: true,
      citationValidationNote: 'Verified verbatim evidence match in src_nexus_arch_01.',
      departingReviewStatus: 'CONFIRMED',
      departingComment: 'Accurate representation of the v3.2 production topology.',
      reviewStatus: 'APPROVED',
      reviewerComment: 'Verified against production architecture diagram.',
      reviewedBy: 'usr_lead_01',
      reviewedByName: 'Marcus Vance',
      reviewedAt: earlier3,
      editHistory: [],
      createdAt: earlier2,
      updatedAt: earlier3,
    },
    'rpt_item_02': {
      id: 'rpt_item_02',
      handoverId: 'hnd_published_01',
      section: 'KEY_DECISIONS',
      statement:
        'Decided to migrate idempotency key storage from PostgreSQL advisory locks to Redis 7.2 Redlock with 24-hour TTL, reducing p99 settlement latency from 410ms to 68ms.',
      sourceIds: ['src_nexus_arch_01'],
      confidence: 'HIGH',
      confidenceScore: 0.95,
      evidence:
        'Key Decision: Decided to migrate idempotency key storage from PostgreSQL advisory locks to Redis 7.2 Redlock with 24-hour TTL, reducing p99 settlement latency from 410ms to 68ms.',
      citationVerified: true,
      citationValidationNote: 'Verified verbatim evidence match in src_nexus_arch_01.',
      departingReviewStatus: 'CONFIRMED',
      departingComment: 'Benchmark metrics confirmed in ADR-019.',
      reviewStatus: 'APPROVED',
      reviewerComment: 'Approved.',
      reviewedBy: 'usr_lead_01',
      reviewedByName: 'Marcus Vance',
      reviewedAt: earlier3,
      editHistory: [],
      createdAt: earlier2,
      updatedAt: earlier3,
    },
    'rpt_item_03': {
      id: 'rpt_item_03',
      handoverId: 'hnd_published_01',
      section: 'PENDING_WORK',
      statement:
        'Complete automated shard rebalancing script in scripts/rebalance-shards.ts before Q1 traffic spike (PR #418 currently open).',
      sourceIds: ['src_nexus_backlog_02'],
      confidence: 'HIGH',
      confidenceScore: 0.93,
      evidence:
        'Pending Work: TODO: Complete automated shard rebalancing script in scripts/rebalance-shards.ts before Q1 traffic spike (PR #418 currently open).',
      citationVerified: true,
      citationValidationNote: 'Verified verbatim evidence match in src_nexus_backlog_02.',
      departingReviewStatus: 'CONFIRMED',
      departingComment: 'Unit tests are 80% done on branch feat/shard-rebalance.',
      reviewStatus: 'APPROVED',
      reviewerComment: 'Assigned to Priya Nair as P1 onboarding task.',
      reviewedBy: 'usr_lead_01',
      reviewedByName: 'Marcus Vance',
      reviewedAt: earlier3,
      editHistory: [],
      createdAt: earlier2,
      updatedAt: earlier3,
    },
    'rpt_item_04': {
      id: 'rpt_item_04',
      handoverId: 'hnd_published_01',
      section: 'PROBLEMS_ISSUES',
      statement:
        'Bug in webhook retry worker causes duplicate dead-letter queue alerts when partner TLS handshake times out after 5000ms.',
      sourceIds: ['src_nexus_backlog_02'],
      confidence: 'HIGH',
      confidenceScore: 0.91,
      evidence:
        'Known Problem: Bug in webhook retry worker causes duplicate dead-letter queue alerts when partner TLS handshake times out after 5000ms.',
      citationVerified: true,
      citationValidationNote: 'Verified verbatim evidence match in src_nexus_backlog_02.',
      departingReviewStatus: 'CONFIRMED',
      departingComment: 'Needs idempotency guard around DLQ alert emitter.',
      reviewStatus: 'APPROVED',
      reviewerComment: 'Confirmed known issue.',
      reviewedBy: 'usr_lead_01',
      reviewedByName: 'Marcus Vance',
      reviewedAt: earlier3,
      editHistory: [],
      createdAt: earlier2,
      updatedAt: earlier3,
    },
    'rpt_item_05': {
      id: 'rpt_item_05',
      handoverId: 'hnd_published_01',
      section: 'DEPENDENCIES',
      statement:
        'Depends on upstream Treasury FX Rate Feed API v2 and internal Kafka cluster topic "ledger.settlement.events.v3".',
      sourceIds: ['src_nexus_arch_01'],
      confidence: 'HIGH',
      confidenceScore: 0.94,
      evidence:
        'Dependency: Depends on upstream Treasury FX Rate Feed API v2 and internal Kafka cluster topic "ledger.settlement.events.v3".',
      citationVerified: true,
      citationValidationNote: 'Verified verbatim evidence match in src_nexus_arch_01.',
      departingReviewStatus: 'CONFIRMED',
      departingComment: 'SLA with Treasury FX team is 99.95%.',
      reviewStatus: 'APPROVED',
      reviewerComment: 'Approved.',
      reviewedBy: 'usr_lead_01',
      reviewedByName: 'Marcus Vance',
      reviewedAt: earlier3,
      editHistory: [],
      createdAt: earlier2,
      updatedAt: earlier3,
    },
    'rpt_item_06': {
      id: 'rpt_item_06',
      handoverId: 'hnd_published_01',
      section: 'RISKS',
      statement:
        'Critical risk of ledger reconciliation delay if Kafka consumer group "settlement-archiver" lags beyond 50,000 messages during end-of-month closing.',
      sourceIds: ['src_nexus_backlog_02'],
      confidence: 'HIGH',
      confidenceScore: 0.92,
      evidence:
        'Risk: Critical risk of ledger reconciliation delay if Kafka consumer group "settlement-archiver" lags beyond 50,000 messages during end-of-month closing.',
      citationVerified: true,
      citationValidationNote: 'Verified verbatim evidence match in src_nexus_backlog_02.',
      departingReviewStatus: 'CONFIRMED',
      departingComment: 'Grafana alert threshold is currently set at 35,000 messages.',
      reviewStatus: 'APPROVED',
      reviewerComment: 'Critical operational risk verified.',
      reviewedBy: 'usr_lead_01',
      reviewedByName: 'Marcus Vance',
      reviewedAt: earlier3,
      editHistory: [],
      createdAt: earlier2,
      updatedAt: earlier3,
    },
    'rpt_item_07': {
      id: 'rpt_item_07',
      handoverId: 'hnd_published_01',
      section: 'OPEN_QUESTIONS',
      statement:
        'What is the exact failover threshold for the secondary PostgreSQL logical replication slot during planned maintenance windows?',
      sourceIds: ['src_nexus_backlog_02'],
      confidence: 'MEDIUM',
      confidenceScore: 0.85,
      evidence:
        'Open Question: What is the exact failover threshold for the secondary PostgreSQL logical replication slot during planned maintenance windows?',
      citationVerified: true,
      citationValidationNote: 'Verified verbatim evidence match in src_nexus_backlog_02.',
      departingReviewStatus: 'CONFIRMED',
      departingComment:
        'Answered: Configured in helm/values-prod.yaml under replicationLagMaxSeconds: 15.',
      reviewStatus: 'APPROVED',
      reviewerComment: 'Answer recorded by Departing Member and verified.',
      reviewedBy: 'usr_lead_01',
      reviewedByName: 'Marcus Vance',
      reviewedAt: earlier3,
      editHistory: [],
      createdAt: earlier2,
      updatedAt: earlier3,
    },

    // Report items for hnd_review_01 (In Review — some PENDING so Team Leader can review/approve/publish)
    'rpt_mesh_01': {
      id: 'rpt_mesh_01',
      handoverId: 'hnd_review_01',
      section: 'PROJECT_SNAPSHOT',
      statement:
        'Zero-Trust Token Mesh issues short-lived 15-minute SPIFFE/SPIRE mTLS workload certificates across 18 Kubernetes microservices.',
      sourceIds: ['src_mesh_notes_03'],
      confidence: 'HIGH',
      confidenceScore: 0.95,
      evidence:
        'Architecture Overview: Zero-Trust Token Mesh issues short-lived 15-minute SPIFFE/SPIRE mTLS workload certificates across 18 Kubernetes microservices.',
      citationVerified: true,
      citationValidationNote: 'Verified verbatim evidence match in src_mesh_notes_03.',
      departingReviewStatus: 'CONFIRMED',
      departingComment: 'Confirmed.',
      reviewStatus: 'APPROVED',
      reviewerComment: 'Verified.',
      reviewedBy: 'usr_lead_01',
      reviewedByName: 'Marcus Vance',
      reviewedAt: earlier3,
      editHistory: [],
      createdAt: earlier3,
      updatedAt: earlier3,
    },
    'rpt_mesh_02': {
      id: 'rpt_mesh_02',
      handoverId: 'hnd_review_01',
      section: 'KEY_DECISIONS',
      statement:
        'Decided to standardize all service-to-service authentication on Ed25519 JWT signatures rather than RSA-2048 to cut CPU overhead by 38%.',
      sourceIds: ['src_mesh_notes_03'],
      confidence: 'HIGH',
      confidenceScore: 0.94,
      evidence:
        'Key Decision: Decided to standardize all service-to-service authentication on Ed25519 JWT signatures rather than RSA-2048 to cut CPU overhead by 38%.',
      citationVerified: true,
      citationValidationNote: 'Verified verbatim evidence match in src_mesh_notes_03.',
      departingReviewStatus: 'CONFIRMED',
      departingComment: 'Benchmark validated in staging.',
      reviewStatus: 'APPROVED',
      reviewerComment: 'Approved.',
      reviewedBy: 'usr_lead_01',
      reviewedByName: 'Marcus Vance',
      reviewedAt: earlier3,
      editHistory: [],
      createdAt: earlier3,
      updatedAt: earlier3,
    },
    'rpt_mesh_03': {
      id: 'rpt_mesh_03',
      handoverId: 'hnd_review_01',
      section: 'PENDING_WORK',
      statement:
        'Unfinished migration of legacy billing-adapter service from static API keys to SPIFFE mTLS identities (tracked in Issue #109).',
      sourceIds: ['src_mesh_notes_03'],
      confidence: 'HIGH',
      confidenceScore: 0.92,
      evidence:
        'Pending Work: Unfinished migration of legacy billing-adapter service from static API keys to SPIFFE mTLS identities (tracked in Issue #109).',
      citationVerified: true,
      citationValidationNote: 'Verified verbatim evidence match in src_mesh_notes_03.',
      departingReviewStatus: 'CONFIRMED',
      departingComment: 'Requires coordination with Finance Engineering.',
      reviewStatus: 'APPROVED',
      reviewerComment: 'Confirmed backlog item.',
      reviewedBy: 'usr_lead_01',
      reviewedByName: 'Marcus Vance',
      reviewedAt: earlier3,
      editHistory: [],
      createdAt: earlier3,
      updatedAt: earlier3,
    },
    'rpt_mesh_04': {
      id: 'rpt_mesh_04',
      handoverId: 'hnd_review_01',
      section: 'PROBLEMS_ISSUES',
      statement:
        'Intermittent latency spike in OIDC discovery endpoint when upstream HSM key vault takes >800ms to sign rotation bundles.',
      sourceIds: ['src_mesh_notes_03'],
      confidence: 'HIGH',
      confidenceScore: 0.9,
      evidence:
        'Known Problem: Intermittent latency spike in OIDC discovery endpoint when upstream HSM key vault takes >800ms to sign rotation bundles.',
      citationVerified: true,
      citationValidationNote: 'Verified verbatim evidence match in src_mesh_notes_03.',
      departingReviewStatus: 'CONFIRMED',
      departingComment: 'Caching layer recommended.',
      reviewStatus: 'PENDING',
      reviewerComment: '',
      reviewedBy: null,
      reviewedByName: null,
      reviewedAt: null,
      editHistory: [],
      createdAt: earlier3,
      updatedAt: earlier3,
    },
    'rpt_mesh_05': {
      id: 'rpt_mesh_05',
      handoverId: 'hnd_review_01',
      section: 'DEPENDENCIES',
      statement:
        'Depends on HashiCorp Vault PKI engine v1.17 and Cloudflare DNS-01 ACME challenge webhook.',
      sourceIds: ['src_mesh_notes_03'],
      confidence: 'HIGH',
      confidenceScore: 0.91,
      evidence:
        'Dependency: Depends on HashiCorp Vault PKI engine v1.17 and Cloudflare DNS-01 ACME challenge webhook.',
      citationVerified: true,
      citationValidationNote: 'Verified verbatim evidence match in src_mesh_notes_03.',
      departingReviewStatus: 'UNREVIEWED',
      departingComment: '',
      reviewStatus: 'PENDING',
      reviewerComment: '',
      reviewedBy: null,
      reviewedByName: null,
      reviewedAt: null,
      editHistory: [],
      createdAt: earlier3,
      updatedAt: earlier3,
    },
    'rpt_mesh_06': {
      id: 'rpt_mesh_06',
      handoverId: 'hnd_review_01',
      section: 'RISKS',
      statement:
        'Security risk if root intermediate CA certificate expires on 2026-12-15 without automated alerting hook enabled in PagerDuty.',
      sourceIds: ['src_mesh_notes_03'],
      confidence: 'HIGH',
      confidenceScore: 0.93,
      evidence:
        'Risk: Security risk if root intermediate CA certificate expires on 2026-12-15 without automated alerting hook enabled in PagerDuty.',
      citationVerified: true,
      citationValidationNote: 'Verified verbatim evidence match in src_mesh_notes_03.',
      departingReviewStatus: 'CONFIRMED',
      departingComment: 'High priority before December freeze.',
      reviewStatus: 'PENDING',
      reviewerComment: '',
      reviewedBy: null,
      reviewedByName: null,
      reviewedAt: null,
      editHistory: [],
      createdAt: earlier3,
      updatedAt: earlier3,
    },
    'rpt_mesh_07': {
      id: 'rpt_mesh_07',
      handoverId: 'hnd_review_01',
      section: 'OPEN_QUESTIONS',
      statement:
        'Should the legacy v1 token introspection endpoint be deprecated in release 2.4 or maintained until Q2?',
      sourceIds: ['src_mesh_notes_03'],
      confidence: 'MEDIUM',
      confidenceScore: 0.84,
      evidence:
        'Open Question: Should the legacy v1 token introspection endpoint be deprecated in release 2.4 or maintained until Q2?',
      citationVerified: true,
      citationValidationNote: 'Verified verbatim evidence match in src_mesh_notes_03.',
      departingReviewStatus: 'UNREVIEWED',
      departingComment: '',
      reviewStatus: 'PENDING',
      reviewerComment: '',
      reviewedBy: null,
      reviewedByName: null,
      reviewedAt: null,
      editHistory: [],
      createdAt: earlier3,
      updatedAt: earlier3,
    },
  };

  // 7. Seed Integrations (Strictly Disconnected unless real env credentials exist and pass live verification!)
  const envGithub = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN || '';
  const envGemini = process.env.GEMINI_API_KEY || '';

  const integrations: Record<string, IntegrationConfig> = {
    github: {
      id: 'github',
      name: 'GitHub Repository & Activity Ingestion',
      provider: 'GITHUB',
      status: 'DISCONNECTED',
      configured: Boolean(envGithub),
      maskedCredential: maskSecret(envGithub),
      accountInfo: null,
      lastVerifiedAt: null,
      errorMessage: envGithub
        ? 'Pending live API verification'
        : 'GITHUB_TOKEN not configured. Configure a Personal Access Token or OAuth token to verify authenticated GitHub API access (public repositories can also be queried directly within GitHub unauthenticated rate limits).',
      requiredEnvVar: 'GITHUB_TOKEN',
      updatedBy: 'system',
      updatedAt: earlier1,
    },
    gemini: {
      id: 'gemini',
      name: 'Google Gemini AI & Genkit Analysis Engine',
      provider: 'GEMINI',
      status: 'DISCONNECTED',
      configured: Boolean(envGemini),
      maskedCredential: maskSecret(envGemini),
      accountInfo: null,
      lastVerifiedAt: null,
      errorMessage: envGemini
        ? 'Pending live API verification'
        : 'GEMINI_API_KEY is not configured. Provide a valid Google AI Studio API key in .env or via the Admin Integrations Configuration panel to enable live Gemini LLM calls.',
      requiredEnvVar: 'GEMINI_API_KEY',
      updatedBy: 'system',
      updatedAt: earlier1,
    },
  };

  // 8. Seed Audit Logs
  const auditLogs: Record<string, AuditLog> = {
    'aud_01': {
      id: 'aud_01',
      userId: 'usr_admin_01',
      userName: 'Elena Rostova',
      userRole: 'ADMIN',
      action: 'PROJECT_CREATE',
      target: 'Project: Nexus Settlement & Ledger Engine v3',
      targetId: 'proj_payment_gateway',
      details: { teamLeadId: 'usr_lead_01', memberCount: 3 },
      timestamp: earlier1,
    },
    'aud_02': {
      id: 'aud_02',
      userId: 'usr_lead_01',
      userName: 'Marcus Vance',
      userRole: 'TEAM_LEADER',
      action: 'HANDOVER_CREATE',
      target: 'Handover: Q4 Staff Backend Architect Handover — Nexus Settlement Engine',
      targetId: 'hnd_published_01',
      details: { departingMemberId: 'usr_dept_01', successorId: 'usr_succ_01' },
      timestamp: earlier2,
    },
    'aud_03': {
      id: 'aud_03',
      userId: 'usr_dept_01',
      userName: 'Dr. Aris Thorne',
      userRole: 'DEPARTING_MEMBER',
      action: 'FILE_UPLOAD',
      target: 'Redacted Source: nexus-architecture-release-v3.2.txt',
      targetId: 'src_nexus_arch_01',
      details: {
        handoverId: 'hnd_published_01',
        redactionsApplied: red1.totalRedactions,
        categories: red1.categories,
      },
      timestamp: earlier2,
    },
    'aud_04': {
      id: 'aud_04',
      userId: 'usr_lead_01',
      userName: 'Marcus Vance',
      userRole: 'TEAM_LEADER',
      action: 'REPORT_PUBLISH',
      target: 'Published Report: Nexus Settlement Engine (v2)',
      targetId: 'hnd_published_01',
      details: { approvedItems: 7, successorId: 'usr_succ_01', version: 2 },
      timestamp: earlier3,
    },
    'aud_05': {
      id: 'aud_05',
      userId: 'usr_dept_03',
      userName: 'Rohan Kapoor',
      userRole: 'DEPARTING_MEMBER',
      action: 'DEPARTING_CONTEXT_SUBMIT',
      target: 'Submitted mTLS rotation notes: Zero-Trust Token Mesh',
      targetId: 'hnd_review_01',
      details: { handoverId: 'hnd_review_01' },
      timestamp: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    },
    'aud_06': {
      id: 'aud_06',
      userId: 'usr_dept_02',
      userName: 'Vikram Mehta',
      userRole: 'DEPARTING_MEMBER',
      action: 'FILE_UPLOAD',
      target: 'Synced GitHub PR #418 & Flink runbook (3 secrets redacted)',
      targetId: 'hnd_risk_02',
      details: { handoverId: 'hnd_risk_02' },
      timestamp: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    },
    'aud_07': {
      id: 'aud_07',
      userId: 'usr_lead_01',
      userName: 'Marcus Vance',
      userRole: 'TEAM_LEADER',
      action: 'ITEM_APPROVE',
      target: 'Approved Key Decisions & Risks: Multi-Currency Invoice Pipeline',
      targetId: 'hnd_billing_03',
      details: { handoverId: 'hnd_billing_03' },
      timestamp: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
    },
  };

  // 9. Seed Notifications
  const notifications: Record<string, AppNotification> = {
    'notif_01': {
      id: 'notif_01',
      userId: 'usr_succ_01',
      title: 'Handover Report Approved & Published',
      message:
        'Team Leader Marcus Vance approved and published "Q4 Staff Backend Architect Handover — Nexus Settlement Engine". You now have full successor access.',
      link: '/successor?handoverId=hnd_published_01',
      read: false,
      createdAt: earlier3,
    },
    'notif_02': {
      id: 'notif_02',
      userId: 'usr_lead_01',
      title: 'Handover Awaiting Leader Review',
      message:
        '4 report items in "Zero-Trust Token Mesh Rotation Controller Transition" require your review before publication.',
      link: '/handovers/hnd_review_01',
      read: false,
      createdAt: earlier3,
    },
    'notif_03': {
      id: 'notif_03',
      userId: 'usr_dept_01',
      title: 'Departing Member Context Requested',
      message:
        'Please review the remaining open question in "Zero-Trust Token Mesh Rotation Controller Transition".',
      link: '/handovers/hnd_review_01',
      read: false,
      createdAt: earlier3,
    },
  };

  // Normalize reportItems with full ExtractedInsight schema fields
  const reportItems: Record<string, ReportItem> = {};
  for (const [id, rawItem] of Object.entries(rawReportItems)) {
    const firstSourceId = rawItem.sourceIds[0] || 'NONE';
    const src = sources[firstSourceId];
    const sectionLabel = rawItem.section
      .split('_')
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ');
    reportItems[id] = {
      ...rawItem,
      category: rawItem.section,
      title: `${sectionLabel}: ${rawItem.statement.slice(0, 56)}${
        rawItem.statement.length > 56 ? '...' : ''
      }`,
      description: rawItem.statement,
      sourceFileId: firstSourceId,
      sourceFileName: src?.title || 'Not found in available sources',
      sourceLocation: src?.url || 'Chunk 1',
      verificationStatus: rawItem.reviewStatus,
    };
  }

  // Mark published handover as versionLocked
  handovers['hnd_published_01'].versionLocked = true;
  handovers['hnd_published_01'].approvalStatus = 'APPROVED';
  handovers['hnd_review_01'].versionLocked = false;
  handovers['hnd_review_01'].approvalStatus = 'PENDING';

  // Seed ProjectMembers collection
  const projectMembers: Record<string, ProjectMember> = {};
  for (const proj of Object.values(projects)) {
    for (const memberId of proj.memberIds) {
      const u = users[memberId];
      if (u) {
        const pmId = `pm_${proj.id}_${memberId}`;
        projectMembers[pmId] = {
          id: pmId,
          projectId: proj.id,
          userId: u.uid,
          userName: u.name,
          userEmail: u.email,
          role: u.role,
          assignedBy: proj.createdBy,
          assignedAt: proj.createdAt,
        };
      }
    }
  }

  // Seed HandoverReports collection for published handover
  const handoverReports: Record<string, HandoverReport> = {
    'rep_hnd_published_01_v2': {
      id: 'rep_hnd_published_01_v2',
      handoverId: 'hnd_published_01',
      projectId: 'proj_payment_gateway',
      version: 2,
      versionLocked: true,
      approvalStatus: 'APPROVED',
      approvedBy: 'usr_lead_01',
      approvedByName: 'Marcus Vance',
      approvedAt: earlier3,
      leaderComments:
        'Verified all source citations against commit logs and incident postmortems. Cleared for successor Priya Nair.',
      itemsSnapshot: Object.values(reportItems).filter(
        (i) => i.handoverId === 'hnd_published_01'
      ),
      createdAt: earlier3,
    },
  };

  // Seed Approvals collection
  const approvals: Record<string, ApprovalRecord> = {
    'appr_hnd_published_01': {
      id: 'appr_hnd_published_01',
      handoverId: 'hnd_published_01',
      projectId: 'proj_payment_gateway',
      reportId: 'rep_hnd_published_01_v2',
      status: 'APPROVED',
      reviewerId: 'usr_lead_01',
      reviewerName: 'Marcus Vance',
      reviewerRole: 'TEAM_LEADER',
      comments:
        'Verified all source citations against commit logs and incident postmortems. Cleared for successor Priya Nair.',
      versionLocked: true,
      version: 2,
      timestamp: earlier3,
    },
  };

  return {
    users,
    authRecords,
    projects,
    projectMembers,
    handovers,
    handoverSessions: { ...handovers },
    sources,
    uploadedSources: { ...sources },
    reportItems,
    extractedInsights: { ...reportItems },
    handoverReports,
    approvals,
    auditLogs,
    integrations,
    redactionRules,
    notifications,
    serverSecrets: {
      githubToken: envGithub,
      geminiApiKey: envGemini,
    },
  };
}

function normalizeDatabaseSchema(db: FirestoreDatabaseSchema): FirestoreDatabaseSchema {
  if (!db.projectMembers) db.projectMembers = {};
  if (!db.handoverSessions) db.handoverSessions = {};
  if (!db.uploadedSources) db.uploadedSources = {};
  if (!db.extractedInsights) db.extractedInsights = {};
  if (!db.handoverReports) db.handoverReports = {};
  if (!db.approvals) db.approvals = {};
  if (!db.serverSecrets) {
    db.serverSecrets = { githubToken: '', geminiApiKey: '' };
  }
  if (!db.serverSecrets.geminiApiKey && process.env.GEMINI_API_KEY) {
    db.serverSecrets.geminiApiKey = process.env.GEMINI_API_KEY;
  }
  if (!db.serverSecrets.githubToken && (process.env.GITHUB_PAT || process.env.GITHUB_TOKEN)) {
    db.serverSecrets.githubToken = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN || '';
  }

  // Ensure every reportItem has the full ExtractedInsight schema fields
  for (const [id, item] of Object.entries(db.reportItems || {})) {
    const firstSourceId = item.sourceIds?.[0] || 'NONE';
    const src = db.sources?.[firstSourceId];
    const sectionLabel = (item.section || 'PROJECT_SNAPSHOT')
      .split('_')
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ');
    if (!item.category) item.category = item.section;
    if (!item.title) {
      item.title = `${sectionLabel}: ${item.statement.slice(0, 56)}${
        item.statement.length > 56 ? '...' : ''
      }`;
    }
    if (!item.description) item.description = item.statement;
    if (!item.sourceFileId) item.sourceFileId = firstSourceId;
    if (!item.sourceFileName) {
      item.sourceFileName = src?.title || 'Not found in available sources';
    }
    if (!item.sourceLocation) item.sourceLocation = src?.url || 'Chunk 1';
    if (!item.verificationStatus) item.verificationStatus = item.reviewStatus;
    db.extractedInsights[id] = item;
  }

  // Ensure every handover has versionLocked & approvalStatus synced
  for (const [id, h] of Object.entries(db.handovers || {})) {
    if (h.versionLocked === undefined) {
      h.versionLocked = h.status === 'PUBLISHED';
    }
    if (!h.approvalStatus) {
      h.approvalStatus = h.status === 'PUBLISHED' ? 'APPROVED' : 'PENDING';
    }
    db.handoverSessions[id] = h;
  }

  for (const [id, s] of Object.entries(db.sources || {})) {
    db.uploadedSources[id] = s;
  }

  db.qaHistory = db.qaHistory || {};
  db.handoverSummaries = db.handoverSummaries || {};
  if (!db.tasks || Object.keys(db.tasks).length === 0) {
    const nowIso = new Date().toISOString();
    const pastDeadline = new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10);
    const futureDeadline1 = new Date(Date.now() + 86400000 * 4).toISOString().slice(0, 10);
    const futureDeadline2 = new Date(Date.now() + 86400000 * 9).toISOString().slice(0, 10);
    db.tasks = {
      tsk_seed_01: {
        id: 'tsk_seed_01',
        title: 'Merge PR #418 — Redis Cluster Shard Rebalancing Script',
        description:
          'Finalize dry-run validation and merge PR #418 before the Q1 settlement traffic spike.',
        projectId: 'proj_payment_gateway',
        handoverId: 'hnd_published_01',
        assignedUserId: 'usr_succ_01',
        assignedUserName: 'Priya Nair',
        createdBy: 'usr_lead_01',
        createdByName: 'Marcus Vance',
        priority: 'CRITICAL',
        startDate: nowIso.slice(0, 10),
        deadline: futureDeadline1,
        status: 'IN_PROGRESS',
        progressPercent: 60,
        attachments: [{ name: 'payments-runbook.txt', url: '#src_pay_notes_03' }],
        comments: [
          {
            id: 'cmt_01',
            authorId: 'usr_dept_01',
            authorName: 'Dr. Aris Thorne',
            text: 'Run scripts/rebalance-dryrun.sh on staging-eu-west first.',
            createdAt: nowIso,
          },
        ],
        history: [
          {
            id: 'th_01',
            actorId: 'usr_lead_01',
            actorName: 'Marcus Vance',
            action: 'TASK_CREATED',
            details: 'Assigned to Priya Nair (CRITICAL)',
            timestamp: nowIso,
          },
        ],
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      tsk_seed_02: {
        id: 'tsk_seed_02',
        title: 'Configure PagerDuty Alert Hook for Root Intermediate CA Expiry',
        description:
          'Prevent mTLS token mesh outage before 2026-12-15 certificate expiration.',
        projectId: 'proj_auth_mesh',
        handoverId: 'hnd_review_01',
        assignedUserId: 'usr_dept_01',
        assignedUserName: 'Dr. Aris Thorne',
        createdBy: 'usr_lead_01',
        createdByName: 'Marcus Vance',
        priority: 'HIGH',
        startDate: pastDeadline,
        deadline: pastDeadline,
        status: 'TODO',
        progressPercent: 0,
        attachments: [],
        comments: [],
        history: [
          {
            id: 'th_02',
            actorId: 'usr_lead_01',
            actorName: 'Marcus Vance',
            action: 'TASK_CREATED',
            details: 'Assigned to Dr. Aris Thorne (HIGH)',
            timestamp: nowIso,
          },
        ],
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      tsk_seed_03: {
        id: 'tsk_seed_03',
        title: 'Verify PostgreSQL Logical Replication Slot Lag Threshold (15s / 64MB)',
        description:
          'Confirm automated failover script triggers on secondary PostgreSQL logical replication slot.',
        projectId: 'proj_payment_gateway',
        handoverId: 'hnd_published_01',
        assignedUserId: 'usr_succ_01',
        assignedUserName: 'Priya Nair',
        createdBy: 'usr_lead_01',
        createdByName: 'Marcus Vance',
        priority: 'MEDIUM',
        startDate: nowIso.slice(0, 10),
        deadline: futureDeadline2,
        status: 'COMPLETED',
        progressPercent: 100,
        attachments: [],
        comments: [],
        history: [
          {
            id: 'th_03',
            actorId: 'usr_succ_01',
            actorName: 'Priya Nair',
            action: 'STATUS_UPDATED',
            details: 'Marked COMPLETED (100%)',
            timestamp: nowIso,
          },
        ],
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    };
  }

  return db;
}

class FirestorePersistenceStore {
  private db: FirestoreDatabaseSchema;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.db = normalizeDatabaseSchema(JSON.parse(raw));
        // Keep built-in redaction rule patterns synchronized with DEFAULT_REDACTION_RULES
        DEFAULT_REDACTION_RULES.forEach((rule, idx) => {
          const id = `rule_builtin_${idx + 1}`;
          if (this.db.redactionRules[id]) {
            this.db.redactionRules[id].pattern = rule.pattern;
          }
        });
        this.save();
      } catch {
        this.db = normalizeDatabaseSchema(createInitialSeedDatabase());
        this.save();
      }
    } else {
      this.db = normalizeDatabaseSchema(createInitialSeedDatabase());
      this.save();
    }
  }

  public get state(): FirestoreDatabaseSchema {
    return this.db;
  }

  public save(): void {
    // Keep synced collections updated on every save
    this.db.handoverSessions = { ...this.db.handovers };
    this.db.uploadedSources = { ...this.db.sources };
    this.db.extractedInsights = { ...this.db.reportItems };
    const diskCopy = {
      ...this.db,
      serverSecrets: {
        githubToken: '',
        geminiApiKey: '',
      },
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(diskCopy, null, 2), 'utf-8');
  }

  public appendAuditLog(params: {
    userId: string;
    userName: string;
    userRole: UserRole | string;
    action: string;
    target: string;
    targetId: string;
    details?: Record<string, any>;
  }): AuditLog {
    const id = `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const entry: AuditLog = {
      id,
      userId: params.userId,
      userName: params.userName,
      userRole: params.userRole,
      action: params.action,
      target: params.target,
      targetId: params.targetId,
      details: params.details || {},
      timestamp: new Date().toISOString(),
    };
    this.db.auditLogs[id] = entry;
    this.save();
    return entry;
  }

  public createNotification(params: {
    userId: string;
    title: string;
    message: string;
    link: string;
  }): AppNotification {
    const id = `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const notif: AppNotification = {
      id,
      userId: params.userId,
      title: params.title,
      message: params.message,
      link: params.link,
      read: false,
      createdAt: new Date().toISOString(),
    };
    this.db.notifications[id] = notif;
    this.save();
    return notif;
  }
}

export const firestoreStore = new FirestorePersistenceStore();
