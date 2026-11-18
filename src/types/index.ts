export type UserRole = 'ADMIN' | 'TEAM_LEADER' | 'DEPARTING_MEMBER' | 'SUCCESSOR';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  title?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: UserRole;
  assignedBy?: string;
  assignedAt?: string;
  joinedAt?: string;
}

export interface ConnectedSourceConfig {
  type: 'GITHUB' | 'FILE_UPLOAD';
  repoFullName?: string;
  branch?: string;
  verifiedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  teamLeadId: string;
  memberIds: string[];
  connectedSources: ConnectedSourceConfig[];
  redactionRules: string[];
  status: 'ACTIVE' | 'ARCHIVED';
  progressPercent?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type HandoverStatus =
  | 'DRAFT'
  | 'INGESTING'
  | 'ANALYZED'
  | 'DEPARTING_REVIEW'
  | 'LEADER_REVIEW'
  | 'REVISION_REQUESTED'
  | 'APPROVED'
  | 'PUBLISHED';

export type ApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'REVISION_REQUESTED';

export type DataSourceType = 'GITHUB' | 'CSV' | 'JSON' | 'PDF' | 'DOCX' | 'TXT';

export interface HandoverVersionEntry {
  version: number;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  summary: string;
  itemCount: number;
  approvedCount: number;
  versionLocked?: boolean;
}

export interface Handover {
  id: string;
  title: string;
  projectId: string;
  departingMemberId: string;
  successorId: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  deadline?: string;
  selectedDataSources: DataSourceType[];
  githubRepo?: string;
  githubBranch?: string;
  status: HandoverStatus;
  approvalStatus?: ApprovalStatus;
  versionLocked?: boolean;
  processingProgress?: {
    stage: string;
    percent: number;
    message: string;
    updatedAt: string;
  };
  departingMemberNotes?: string;
  openQuestionAnswers?: Record<
    string,
    {
      answer: string;
      answeredBy: string;
      answeredByName: string;
      answeredAt: string;
    }
  >;
  approvalSummary?: {
    approvedBy?: string;
    approvedByName?: string;
    approvedAt?: string;
    publishedAt?: string;
    leaderComments?: string;
    version: number;
    approvalStatus?: ApprovalStatus;
    versionLocked?: boolean;
  };
  versionHistory?: HandoverVersionEntry[];
  successorAcknowledgment?: {
    acknowledged: boolean;
    acknowledgedBy: string;
    acknowledgedByName: string;
    acknowledgedAt: string;
    feedback?: string;
    completedItemIds?: string[];
    completionPercent?: number;
  };
  analysisEngineUsed?: 'GEMINI_API' | 'EXTRACTIVE_GROUNDED' | null;
  createdBy: string;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SourceDocType =
  | 'GITHUB_COMMIT'
  | 'GITHUB_PR'
  | 'GITHUB_ISSUE'
  | 'GITHUB_BRANCH'
  | 'GITHUB_REVIEW'
  | 'FILE_CSV'
  | 'FILE_JSON'
  | 'FILE_PDF'
  | 'FILE_DOCX'
  | 'FILE_TXT'
  | 'DEPARTING_CONTEXT';

export interface TextChunk {
  chunkId: string;
  text: string;
  embedding?: number[];
}

export interface SourceDocument {
  id: string;
  handoverId: string;
  projectId: string;
  type: SourceDocType;
  title: string;
  fileName?: string;
  storagePath?: string;
  fileSize?: number;
  uploadStatus?: 'UPLOADED' | 'PROCESSING' | 'PROCESSED' | 'COMPLETED' | 'ERROR';
  url: string;
  author: string;
  uploadedBy?: string;
  timestamp: string;
  redactedText: string;
  redactionSummary: {
    totalRedactions: number;
    categories: string[];
    rulesMatched: string[];
  };
  chunks: TextChunk[];
  metadata: Record<string, any>;
  createdAt: string;
}

export type ReportSection =
  | 'PROJECT_SNAPSHOT'
  | 'KEY_DECISIONS'
  | 'PENDING_WORK'
  | 'PROBLEMS_ISSUES'
  | 'DEPENDENCIES'
  | 'RISKS'
  | 'OPEN_QUESTIONS';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type ReviewStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'REVISION_REQUESTED';
export type DepartingReviewStatus = 'UNREVIEWED' | 'CONFIRMED' | 'DISPUTED';

export interface EditHistoryEntry {
  previousStatement: string;
  newStatement: string;
  editedBy: string;
  editedByName: string;
  editedAt: string;
  reason: string;
}

export interface ReportItem {
  id: string;
  handoverId: string;
  projectId?: string;
  // Structured insight fields (matching both schemas seamlessly)
  category: ReportSection;
  section: ReportSection;
  title: string;
  description: string;
  statement: string;
  sourceFileId: string;
  sourceFileName: string;
  sourceLocation: string;
  sourceIds: string[];
  confidence: ConfidenceLevel;
  confidenceScore: number;
  evidence: string;
  citationVerified: boolean;
  citationValidationNote: string;
  departingReviewStatus: DepartingReviewStatus;
  departingComment: string;
  verificationStatus: ReviewStatus;
  reviewStatus: ReviewStatus;
  reviewerComment: string;
  reviewedBy: string | null;
  reviewedByName?: string | null;
  reviewedAt: string | null;
  editHistory: EditHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface HandoverReport {
  id: string;
  handoverId: string;
  handoverSessionId?: string;
  projectId: string;
  version: number;
  versionLocked: boolean;
  approvalStatus: ApprovalStatus;
  status?: ApprovalStatus;
  generatedBy?: string;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  leaderComments: string;
  summary?: string;
  itemsSnapshot: ReportItem[];
  insightIds?: string[];
  sourceIds?: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface ApprovalRecord {
  id: string;
  handoverId: string;
  handoverSessionId?: string;
  projectId: string;
  reportId: string;
  reportVersion?: number;
  status: ApprovalStatus;
  reviewerId: string;
  reviewerName: string;
  reviewerRole: UserRole;
  comments: string;
  versionLocked: boolean;
  version: number;
  timestamp: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole | string;
  projectId?: string;
  action: string;
  target: string;
  targetId: string;
  details: Record<string, any>;
  timestamp: string;
}

export interface IntegrationConfig {
  id: 'github' | 'gemini';
  name: string;
  provider: 'GITHUB' | 'GEMINI';
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  configured: boolean;
  maskedCredential: string;
  accountInfo: Record<string, any> | null;
  lastVerifiedAt: string | null;
  errorMessage: string | null;
  requiredEnvVar: string;
  updatedBy: string;
  updatedAt: string;
}

export type RedactionCategory =
  | 'API_KEY'
  | 'PASSWORD'
  | 'AUTH_TOKEN'
  | 'EMAIL'
  | 'PHONE'
  | 'BANK_ACCOUNT'
  | 'ID_NUMBER'
  | 'CUSTOM_KEYWORD'
  | 'CUSTOM_REGEX';

export interface RedactionRule {
  id: string;
  name: string;
  category: RedactionCategory;
  pattern: string;
  replacement: string;
  description: string;
  isBuiltIn: boolean;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  link: string;
  read: boolean;
  createdAt: string;
}

export interface DashboardStats {
  totalProjects: number;
  activeHandovers: number;
  pendingApprovals: number;
  completedHandovers: number;
  connectedIntegrations: number;
  totalSourcesIngested: number;
  totalRedactionsApplied: number;
  recentActivities: AuditLog[];
  upcomingDeadlines: {
    handoverId: string;
    title: string;
    projectName: string;
    departingName: string;
    successorName: string;
    status: HandoverStatus;
    deadline: string;
  }[];
}

export interface QACitation {
  sourceId: string;
  title: string;
  type: SourceDocType;
  url: string;
  author: string;
  timestamp: string;
  excerpt: string;
}

export interface QAResponse {
  question: string;
  answer: string;
  grounded: boolean;
  engineUsed: 'GEMINI_RAG' | 'DETERMINISTIC_RAG';
  citations: QACitation[];
  referencedReportItemIds: string[];
  timestamp: string;
}

// ============================================================================
// IMPROVEMENT 1: AI-POWERED HANDOVER SUMMARY GENERATION
// ============================================================================
export type SummaryFormat = 'SHORT' | 'MEDIUM' | 'DETAILED';

export type SummarySectionKey =
  | 'EXECUTIVE_SUMMARY'
  | 'PROJECT_OVERVIEW'
  | 'IMPORTANT_UPDATES'
  | 'COMPLETED_WORK'
  | 'PENDING_TASKS'
  | 'CRITICAL_INFORMATION'
  | 'OPEN_ISSUES'
  | 'TECHNICAL_RISKS'
  | 'IMPORTANT_DEADLINES'
  | 'REQUIRED_NEXT_ACTIONS'
  | 'IMPORTANT_DEPENDENCIES'
  | 'RECOMMENDATIONS_FOR_SUCCESSOR';

export interface HandoverSummarySection {
  key: SummarySectionKey;
  title: string;
  content: string;
  isRecommendation: boolean;
  sourceIds: string[];
  available: boolean;
}

export interface HandoverSummary {
  id: string;
  handoverId: string;
  projectId: string;
  version: number;
  format: SummaryFormat;
  sections: HandoverSummarySection[];
  sourceIds: string[];
  generatedBy: string;
  generatedByName: string;
  editedBy?: string;
  editedByName?: string;
  engineUsed: 'GEMINI_API' | 'EXTRACTIVE_GROUNDED';
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// IMPROVEMENT 2: SMART TASK TRACKING AND ASSIGNMENT
// ============================================================================
export type TaskStatus =
  | 'TODO'
  | 'IN_PROGRESS'
  | 'UNDER_REVIEW'
  | 'COMPLETED'
  | 'BLOCKED';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface TaskComment {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface TaskHistoryEntry {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  details: string;
  timestamp: string;
}

export interface HandoverTask {
  id: string;
  title: string;
  description: string;
  projectId: string;
  handoverId?: string;
  assignedUserId: string;
  assignedUserName: string;
  createdBy: string;
  createdByName: string;
  priority: TaskPriority;
  startDate: string;
  deadline: string;
  status: TaskStatus;
  progressPercent: number;
  attachments: { name: string; url: string }[];
  comments: TaskComment[];
  history: TaskHistoryEntry[];
  isOverdue?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDashboardStats {
  totalTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  completedTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  tasksAssignedToMe: number;
  projectProgress: Record<string, number>;
  handoverProgress: Record<string, number>;
}

// ============================================================================
// IMPROVEMENT 3: CENTRALIZED SEARCHABLE HANDOVER KNOWLEDGE BASE
// ============================================================================
export type KnowledgeRecordType =
  | 'HANDOVER_REPORT'
  | 'PROJECT_DOCUMENT'
  | 'GITHUB_README'
  | 'GITHUB_ACTIVITY'
  | 'KEY_DECISION'
  | 'ISSUE_RECORD'
  | 'AI_SUMMARY';

export interface KnowledgeBaseEntry {
  id: string;
  recordType: KnowledgeRecordType;
  title: string;
  excerpt: string;
  content: string;
  projectId: string;
  projectName: string;
  handoverId?: string;
  handoverTitle?: string;
  handoverStatus?: HandoverStatus;
  sourceId?: string;
  url?: string;
  author: string;
  isImportant: boolean;
  timestamp: string;
  updatedAt: string;
  tags: string[];
}

export interface KnowledgeAIQueryResult {
  query: string;
  answer: string;
  grounded: boolean;
  citations: {
    entryId: string;
    title: string;
    recordType: KnowledgeRecordType;
    projectName: string;
    handoverId?: string;
    sourceId?: string;
    excerpt: string;
    url?: string;
  }[];
  matchedEntries: KnowledgeBaseEntry[];
  timestamp: string;
}

