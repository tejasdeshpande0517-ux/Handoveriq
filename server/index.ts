import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import type {
  ConfidenceLevel,
  DashboardStats,
  DepartingReviewStatus,
  Handover,
  Project,
  RedactionCategory,
  RedactionRule,
  ReportItem,
  ReportSection,
  ReviewStatus,
  SourceDocument,
  UserProfile,
  UserRole,
} from '../src/types/index.ts';
import {
  ALL_REPORT_SECTIONS,
  answerGroundedQuestion,
  chunkRedactedText,
  enrichChunksWithEmbeddings,
  finalizeAndVerifyReportItems,
  generateGeminiStructuredItems,
  runDeterministicSourceExtraction,
  verifyGeminiCredential,
  verifySingleCitation,
} from './services/aiEngine.ts';
import {
  fetchGitHubRepositoryData,
  listAccessibleGitHubRepositories,
  verifyGitHubCredential,
} from './services/github.ts';
import { validateAndParseFile } from './services/parser.ts';
import { generateServerHandoverPDF } from './services/pdfExport.ts';
import { redactSensitiveContent } from './services/redaction.ts';
import {
  firestoreStore,
  hashPassword,
  maskSecret,
  STORAGE_DIR,
  verifyPassword,
} from './store.ts';
import {
  clearSessionCookie,
  createRateLimiter,
  CSRF_COOKIE_NAME,
  generateCsrfToken,
  httpsEnforcementMiddleware,
  isSafeId,
  isSafeRegexPattern,
  isValidIsoDate,
  parseCookies,
  sanitizeText,
  securityHeadersMiddleware,
  SESSION_COOKIE_NAME,
  setCsrfCookie,
  setSessionCookie,
} from './security.ts';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(httpsEnforcementMiddleware);
app.use(securityHeadersMiddleware);

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS policy: Origin not allowed.'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  })
);
app.use(express.json({ limit: '25mb' }));

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32
    ? process.env.SESSION_SECRET
    : (() => {
        if (process.env.NODE_ENV === 'production') {
          throw new Error(
            'FATAL: SESSION_SECRET environment variable (>= 32 chars) must be configured in production.'
          );
        }
        console.warn(
          '[SECURITY WARNING] SESSION_SECRET not set or < 32 chars; using ephemeral random secret for this process.'
        );
        return crypto.randomBytes(32).toString('hex');
      })();

const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many authentication attempts. Please wait 15 minutes and try again.',
});

// ============================================================================
// Stateless HMAC-SHA256 Session Token Signing & Verification
// ============================================================================
interface TokenPayload {
  uid: string;
  email: string;
  tv: number;
  exp: number;
}

function signSessionToken(uid: string, email: string, tokenVersion = 0): string {
  const payload: TokenPayload = {
    uid,
    email,
    tv: tokenVersion,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(base64Payload)
    .digest('base64url');
  return `${base64Payload}.${signature}`;
}

function verifySessionToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [base64Payload, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(base64Payload)
      .digest('base64url');
    const sigBuf = Buffer.from(signature, 'utf-8');
    const expectedBuf = Buffer.from(expectedSig, 'utf-8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const payload: TokenPayload = JSON.parse(
      Buffer.from(base64Payload, 'base64url').toString('utf-8')
    );
    if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) {
      return null;
    }
    if (!isSafeId(payload.uid)) return null;
    return payload;
  } catch {
    return null;
  }
}

interface AuthenticatedRequest extends Request {
  user?: UserProfile;
}

function extractSessionToken(req: Request): string | null {
  const cookies = parseCookies(req);
  if (cookies[SESSION_COOKIE_NAME]) {
    return cookies[SESSION_COOKIE_NAME];
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

const CSRF_EXEMPT_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/google',
  '/auth/forgot-password',
  '/auth/reset-password',
]);

app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  // Validate Origin header if present on state-changing requests
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    res.status(403).json({ error: 'Origin not allowed.' });
    return;
  }

  if (CSRF_EXEMPT_PATHS.has(req.path)) {
    next();
    return;
  }

  // Requests using HttpOnly cookie auth must pass Double-Submit CSRF verification
  const cookies = parseCookies(req);
  const usingCookieAuth = Boolean(cookies[SESSION_COOKIE_NAME]);
  const usingBearerHeader = Boolean(
    req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
  );

  if (usingCookieAuth || !usingBearerHeader) {
    const cookieCsrf = cookies[CSRF_COOKIE_NAME];
    const headerCsrf = String(req.headers['x-csrf-token'] || '');
    if (!cookieCsrf || !headerCsrf) {
      res.status(403).json({ error: 'Missing CSRF token.' });
      return;
    }
    const a = Buffer.from(cookieCsrf, 'utf-8');
    const b = Buffer.from(headerCsrf, 'utf-8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(403).json({ error: 'Invalid CSRF token.' });
      return;
    }
  }

  next();
});

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Missing session token.' });
    return;
  }
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired authentication session.' });
    return;
  }
  const user = firestoreStore.state.users[payload.uid];
  const authRec = firestoreStore.state.authRecords[payload.uid];
  if (!user || !authRec) {
    res.status(401).json({ error: 'User account no longer exists.' });
    return;
  }
  if ((payload.tv ?? 0) !== (authRec.tokenVersion ?? 0)) {
    res.status(401).json({ error: 'Session has been revoked. Please sign in again.' });
    return;
  }
  // Always load role from server-side Firestore store — never trust client role headers!
  req.user = user;
  next();
}

function requireRoles(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access Denied: Operation requires role [${allowedRoles.join(
          ' or '
        )}], but your role is [${req.user.role}].`,
      });
      return;
    }
    next();
  };
}

function canUserAccessHandover(user: UserProfile, handover: Handover): boolean {
  if (user.role === 'ADMIN') return true;
  if (user.role === 'TEAM_LEADER') {
    const proj = firestoreStore.state.projects[handover.projectId];
    return (
      handover.createdBy === user.uid ||
      proj?.teamLeadId === user.uid ||
      proj?.memberIds.includes(user.uid) ||
      false
    );
  }
  if (user.role === 'DEPARTING_MEMBER') {
    return handover.departingMemberId === user.uid;
  }
  if (user.role === 'SUCCESSOR') {
    // Rule 8: Do not allow successors to access unapproved/unpublished reports!
    return handover.successorId === user.uid && handover.status === 'PUBLISHED';
  }
  return false;
}

// ============================================================================
// Startup Live Credential Verification (if .env has GITHUB_TOKEN / GEMINI_API_KEY)
// ============================================================================
async function verifyStartupIntegrations(): Promise<void> {
  const { serverSecrets, integrations } = firestoreStore.state;
  const ghToken =
    serverSecrets.githubToken || process.env.GITHUB_PAT || process.env.GITHUB_TOKEN || '';
  if (ghToken) {
    serverSecrets.githubToken = ghToken;
    const ghCheck = await verifyGitHubCredential(ghToken);
    integrations.github.status = ghCheck.connected ? 'CONNECTED' : 'ERROR';
    integrations.github.configured = ghCheck.connected;
    integrations.github.maskedCredential = ghCheck.connected ? maskSecret(ghToken) : '';
    integrations.github.accountInfo = ghCheck.accountInfo;
    integrations.github.errorMessage = ghCheck.errorMessage;
    integrations.github.lastVerifiedAt = new Date().toISOString();
  }
  const gemKey = serverSecrets.geminiApiKey || process.env.GEMINI_API_KEY || '';
  if (gemKey) {
    serverSecrets.geminiApiKey = gemKey;
    const gemCheck = await verifyGeminiCredential(gemKey);
    integrations.gemini.status = gemCheck.connected ? 'CONNECTED' : 'ERROR';
    integrations.gemini.configured = gemCheck.connected;
    integrations.gemini.maskedCredential = gemCheck.connected ? maskSecret(gemKey) : '';
    integrations.gemini.accountInfo = gemCheck.accountInfo;
    integrations.gemini.errorMessage = gemCheck.errorMessage;
    integrations.gemini.lastVerifiedAt = new Date().toISOString();
  }
  firestoreStore.save();
}

// ============================================================================
// 1. AUTHENTICATION ENDPOINTS
// ============================================================================
app.get('/api/auth/csrf', (req: Request, res: Response) => {
  const existing = parseCookies(req)[CSRF_COOKIE_NAME];
  const token = existing || generateCsrfToken();
  setCsrfCookie(res, req, token);
  res.json({ csrfToken: token });
});

app.post('/api/auth/register', authRateLimiter, (req: Request, res: Response) => {
  const { name, email, password, role, department, title } = req.body || {};
  const cleanName = sanitizeText(name, 120);
  if (!cleanName || cleanName.length < 2) {
    res.status(400).json({ error: 'Full name (minimum 2 characters) is required.' });
    return;
  }
  if (!email || typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }
  if (!password || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    res.status(400).json({ error: 'Password must be between 8 and 128 characters long.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = Object.values(firestoreStore.state.users).find(
    (u) => u.email.toLowerCase() === normalizedEmail
  );
  if (existingUser) {
    res.status(409).json({ error: 'An account with this email address already exists.' });
    return;
  }

  // SECURITY RULE: New users must NOT automatically receive ADMIN privileges!
  if (role === 'ADMIN') {
    res.status(403).json({
      error:
        'Security Violation: Self-registration as ADMIN is strictly prohibited. New accounts must be assigned a non-Admin role and promoted by an Administrator.',
    });
    return;
  }

  const safeAllowedRoles: UserRole[] = ['SUCCESSOR', 'DEPARTING_MEMBER', 'TEAM_LEADER'];
  const assignedRole: UserRole = safeAllowedRoles.includes(role) ? role : 'SUCCESSOR';

  const uid = `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();
  const newUser: UserProfile = {
    uid,
    name: cleanName,
    email: normalizedEmail,
    role: assignedRole,
    department: sanitizeText(department, 100) || 'Engineering',
    title: sanitizeText(title, 100) || 'Team Member',
    createdAt: now,
    updatedAt: now,
  };

  const { hash, salt } = hashPassword(password);
  firestoreStore.state.users[uid] = newUser;
  firestoreStore.state.authRecords[uid] = {
    uid,
    email: normalizedEmail,
    passwordHash: hash,
    salt,
    tokenVersion: 0,
    resetToken: null,
    resetTokenExpiresAt: null,
  };
  firestoreStore.save();

  firestoreStore.appendAuditLog({
    userId: uid,
    userName: newUser.name,
    userRole: newUser.role,
    action: 'USER_REGISTER',
    target: `User Registration: ${newUser.email}`,
    targetId: uid,
    details: { assignedRole: newUser.role },
  });

  const token = signSessionToken(uid, normalizedEmail, 0);
  setSessionCookie(res, req, token, SESSION_TTL_MS);
  setCsrfCookie(res, req, generateCsrfToken());
  res.status(201).json({ user: newUser, token });
});

app.post('/api/auth/login', authRateLimiter, (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = Object.values(firestoreStore.state.users).find(
    (u) => u.email.toLowerCase() === normalizedEmail
  );
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const authRec = firestoreStore.state.authRecords[user.uid];
  if (!authRec || !verifyPassword(password, authRec.passwordHash, authRec.salt)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  firestoreStore.appendAuditLog({
    userId: user.uid,
    userName: user.name,
    userRole: user.role,
    action: 'USER_LOGIN',
    target: `Session Login: ${user.email}`,
    targetId: user.uid,
    details: { method: 'email_password' },
  });

  const token = signSessionToken(user.uid, user.email, authRec.tokenVersion ?? 0);
  setSessionCookie(res, req, token, SESSION_TTL_MS);
  setCsrfCookie(res, req, generateCsrfToken());
  res.json({ user, token });
});

app.post('/api/auth/google', authRateLimiter, (req: Request, res: Response) => {
  const { email, name } = req.body || {};
  const normalizedEmail = sanitizeText(email || 'google.user@handoveriq.io', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }
  const displayName = sanitizeText(name || 'Google Workspace Engineer', 120) || 'Google Workspace Engineer';

  let user = Object.values(firestoreStore.state.users).find(
    (u) => u.email.toLowerCase() === normalizedEmail
  );

  // Prevent unverified SSO login from hijacking existing password/privileged accounts
  if (user && !user.uid.startsWith('usr_google_')) {
    res.status(403).json({
      error: 'This email is registered with password authentication. Please sign in with your password.',
    });
    return;
  }

  if (!user) {
    // New Google users never get ADMIN automatically
    const uid = `usr_google_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();
    user = {
      uid,
      name: displayName,
      email: normalizedEmail,
      role: 'SUCCESSOR',
      department: 'Engineering',
      title: 'Workspace Member (Google SSO)',
      createdAt: now,
      updatedAt: now,
    };
    const { hash, salt } = hashPassword(crypto.randomBytes(16).toString('hex'));
    firestoreStore.state.users[uid] = user;
    firestoreStore.state.authRecords[uid] = {
      uid,
      email: normalizedEmail,
      passwordHash: hash,
      salt,
      tokenVersion: 0,
    };
    firestoreStore.save();
  }

  const authRec = firestoreStore.state.authRecords[user.uid];

  firestoreStore.appendAuditLog({
    userId: user.uid,
    userName: user.name,
    userRole: user.role,
    action: 'USER_LOGIN',
    target: `Google OAuth Login: ${user.email}`,
    targetId: user.uid,
    details: { method: 'google_oauth' },
  });

  const token = signSessionToken(user.uid, user.email, authRec?.tokenVersion ?? 0);
  setSessionCookie(res, req, token, SESSION_TTL_MS);
  setCsrfCookie(res, req, generateCsrfToken());
  res.json({ user, token });
});

app.post('/api/auth/forgot-password', authRateLimiter, (req: Request, res: Response) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: 'Email address is required.' });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  const user = Object.values(firestoreStore.state.users).find(
    (u) => u.email.toLowerCase() === normalizedEmail
  );

  if (!user) {
    res.status(404).json({ error: 'No registered user found with that email address.' });
    return;
  }

  const resetToken = `rst_${crypto.randomBytes(24).toString('hex')}`;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString(); // 30 minutes
  const authRec = firestoreStore.state.authRecords[user.uid];
  authRec.resetToken = resetToken;
  authRec.resetTokenExpiresAt = expiresAt;
  firestoreStore.save();

  firestoreStore.appendAuditLog({
    userId: user.uid,
    userName: user.name,
    userRole: user.role,
    action: 'PASSWORD_RESET_REQUEST',
    target: `Password Reset Requested: ${user.email}`,
    targetId: user.uid,
    details: { expiresAt },
  });

  if (process.env.NODE_ENV === 'production') {
    res.json({
      message: 'If an account exists for that email, a password reset link has been sent.',
    });
    return;
  }

  res.json({
    message: 'Password reset token generated and verified.',
    resetToken,
    expiresAt,
  });
});

app.post('/api/auth/reset-password', authRateLimiter, (req: Request, res: Response) => {
  const { email, resetToken, newPassword } = req.body || {};
  if (
    !email ||
    !resetToken ||
    !newPassword ||
    typeof email !== 'string' ||
    typeof resetToken !== 'string' ||
    typeof newPassword !== 'string'
  ) {
    res
      .status(400)
      .json({ error: 'Email, reset token, and new password are required.' });
    return;
  }
  if (newPassword.length < 8 || newPassword.length > 128) {
    res.status(400).json({ error: 'New password must be between 8 and 128 characters long.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = Object.values(firestoreStore.state.users).find(
    (u) => u.email.toLowerCase() === normalizedEmail
  );
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const authRec = firestoreStore.state.authRecords[user.uid];
  if (
    !authRec ||
    !authRec.resetToken ||
    !authRec.resetTokenExpiresAt ||
    Date.now() > new Date(authRec.resetTokenExpiresAt).getTime()
  ) {
    res.status(400).json({ error: 'Invalid or expired password reset token.' });
    return;
  }

  const providedBuf = Buffer.from(resetToken, 'utf-8');
  const expectedBuf = Buffer.from(authRec.resetToken, 'utf-8');
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    res.status(400).json({ error: 'Invalid or expired password reset token.' });
    return;
  }

  const { hash, salt } = hashPassword(newPassword);
  authRec.passwordHash = hash;
  authRec.salt = salt;
  authRec.tokenVersion = (authRec.tokenVersion ?? 0) + 1;
  authRec.resetToken = null;
  authRec.resetTokenExpiresAt = null;
  firestoreStore.save();

  clearSessionCookie(res, req);

  firestoreStore.appendAuditLog({
    userId: user.uid,
    userName: user.name,
    userRole: user.role,
    action: 'PASSWORD_RESET_COMPLETE',
    target: `Password Reset Completed: ${user.email}`,
    targetId: user.uid,
  });

  res.json({ message: 'Password has been reset successfully. You may now sign in.' });
});

app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const authRec = firestoreStore.state.authRecords[user.uid];
  if (authRec) {
    authRec.tokenVersion = (authRec.tokenVersion ?? 0) + 1;
    firestoreStore.save();
  }
  clearSessionCookie(res, req);

  firestoreStore.appendAuditLog({
    userId: user.uid,
    userName: user.name,
    userRole: user.role,
    action: 'USER_LOGOUT',
    target: `Session Logout: ${user.email}`,
    targetId: user.uid,
  });
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

// ============================================================================
// 2. DASHBOARD STATISTICS (100% Live from Firestore Store)
// ============================================================================
app.get('/api/dashboard', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const allProjects = Object.values(firestoreStore.state.projects);
  const allHandovers = Object.values(firestoreStore.state.handovers);
  const allSources = Object.values(firestoreStore.state.sources);
  const allIntegrations = Object.values(firestoreStore.state.integrations);
  const allAuditLogs = Object.values(firestoreStore.state.auditLogs).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const visibleProjects =
    user.role === 'ADMIN'
      ? allProjects
      : allProjects.filter(
          (p) => p.teamLeadId === user.uid || p.memberIds.includes(user.uid)
        );

  const visibleHandovers = allHandovers.filter((h) => canUserAccessHandover(user, h));
  const visibleHandoverIds = new Set(visibleHandovers.map((h) => h.id));
  const visibleSources = allSources.filter((s) => visibleHandoverIds.has(s.handoverId));

  const activeHandovers = visibleHandovers.filter(
    (h) => h.status !== 'PUBLISHED'
  ).length;

  const pendingApprovals = visibleHandovers.filter((h) => {
    if (user.role === 'SUCCESSOR') return false;
    return h.status === 'LEADER_REVIEW' || h.status === 'DEPARTING_REVIEW';
  }).length;

  const completedHandovers = visibleHandovers.filter(
    (h) => h.status === 'PUBLISHED'
  ).length;

  const connectedIntegrations = allIntegrations.filter(
    (i) => i.status === 'CONNECTED'
  ).length;

  const totalRedactionsApplied = visibleSources.reduce(
    (sum, s) => sum + (s.redactionSummary?.totalRedactions || 0),
    0
  );

  const visibleAuditLogs =
    user.role === 'ADMIN' || user.role === 'TEAM_LEADER'
      ? allAuditLogs
      : allAuditLogs.filter((l) => l.userId === user.uid);

  const upcomingDeadlines = visibleHandovers
    .slice()
    .sort((a, b) => {
      const da = a.deadline || a.dateRange.endDate;
      const db = b.deadline || b.dateRange.endDate;
      return da.localeCompare(db);
    })
    .map((h) => {
      const proj = firestoreStore.state.projects[h.projectId];
      const dept = firestoreStore.state.users[h.departingMemberId];
      const succ = firestoreStore.state.users[h.successorId];
      return {
        handoverId: h.id,
        title: h.title,
        projectName: proj?.name || 'Unknown Project',
        departingName: dept?.name || 'Unassigned',
        successorName: succ?.name || 'Unassigned',
        status: h.status,
        deadline: h.deadline || h.dateRange.endDate,
      };
    });

  const stats: DashboardStats = {
    totalProjects: visibleProjects.length,
    activeHandovers,
    pendingApprovals,
    completedHandovers,
    connectedIntegrations,
    totalSourcesIngested: visibleSources.length,
    totalRedactionsApplied,
    recentActivities: visibleAuditLogs.slice(0, 12),
    upcomingDeadlines,
  };

  res.json({ stats });
});

// ============================================================================
// 3. USER & ROLE MANAGEMENT (ADMIN ENFORCED)
// ============================================================================
app.get('/api/users', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  const users = Object.values(firestoreStore.state.users).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  res.json({ users });
});

app.patch(
  '/api/users/:uid/role',
  requireAuth,
  requireRoles('ADMIN'),
  (req: AuthenticatedRequest, res: Response) => {
    const uid = String(req.params.uid);
    if (!isSafeId(uid)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }
    const { role, department, title } = req.body || {};
    const validRoles: UserRole[] = [
      'ADMIN',
      'TEAM_LEADER',
      'DEPARTING_MEMBER',
      'SUCCESSOR',
    ];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: 'Invalid role specified.' });
      return;
    }

    const targetUser = firestoreStore.state.users[uid];
    if (!targetUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const previousRole = targetUser.role;
    targetUser.role = role;
    if (department !== undefined) targetUser.department = sanitizeText(department, 100);
    if (title !== undefined) targetUser.title = sanitizeText(title, 100);
    targetUser.updatedAt = new Date().toISOString();
    firestoreStore.save();

    firestoreStore.appendAuditLog({
      userId: req.user!.uid,
      userName: req.user!.name,
      userRole: req.user!.role,
      action: 'USER_ROLE_UPDATE',
      target: `User: ${targetUser.name} (${targetUser.email})`,
      targetId: targetUser.uid,
      details: { previousRole, newRole: role },
    });

    res.json({ user: targetUser });
  }
);

// ============================================================================
// 4. PROJECT MANAGEMENT MODULE
// ============================================================================
app.get('/api/projects', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const allProjects = Object.values(firestoreStore.state.projects).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const projects =
    user.role === 'ADMIN' || user.role === 'TEAM_LEADER'
      ? allProjects
      : allProjects.filter(
          (p) => p.teamLeadId === user.uid || p.memberIds.includes(user.uid)
        );

  res.json({ projects });
});

app.get('/api/projects/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const projectId = String(req.params.id);
  if (!isSafeId(projectId)) {
    res.status(400).json({ error: 'Invalid project ID.' });
    return;
  }
  const project = firestoreStore.state.projects[projectId];
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }

  const user = req.user!;
  const isParticipant =
    user.role === 'ADMIN' ||
    project.teamLeadId === user.uid ||
    project.memberIds.includes(user.uid);
  if (!isParticipant) {
    res.status(403).json({ error: 'Access Denied: You are not a member of this project.' });
    return;
  }

  const handovers = Object.values(firestoreStore.state.handovers).filter(
    (h) => h.projectId === project.id && canUserAccessHandover(req.user!, h)
  );
  const logs = Object.values(firestoreStore.state.auditLogs)
    .filter(
      (l) =>
        (l.targetId === project.id || handovers.some((h) => h.id === l.targetId)) &&
        (user.role === 'ADMIN' || user.role === 'TEAM_LEADER' || l.userId === user.uid)
    )
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  res.json({ project, handovers, activityLogs: logs });
});

app.post(
  '/api/projects',
  requireAuth,
  requireRoles('ADMIN', 'TEAM_LEADER'),
  (req: AuthenticatedRequest, res: Response) => {
    const {
      name,
      description,
      teamLeadId,
      memberIds,
      connectedSources,
      redactionRules,
    } = req.body || {};

    const cleanName = sanitizeText(name, 160);
    const cleanDescription = sanitizeText(description, 2000);
    if (!cleanName || cleanName.length < 3) {
      res.status(400).json({ error: 'Project name (minimum 3 characters) is required.' });
      return;
    }
    if (!cleanDescription || cleanDescription.length < 5) {
      res.status(400).json({ error: 'Project description is required.' });
      return;
    }

    const assignedLeadId =
      isSafeId(teamLeadId) && firestoreStore.state.users[teamLeadId]
        ? teamLeadId
        : req.user!.uid;
    const membersSet = new Set<string>(
      Array.isArray(memberIds)
        ? memberIds.filter((m): m is string => isSafeId(m) && Boolean(firestoreStore.state.users[m]))
        : []
    );
    membersSet.add(assignedLeadId);

    const id = `proj_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();

    const project: Project = {
      id,
      name: cleanName,
      description: cleanDescription,
      teamLeadId: assignedLeadId,
      memberIds: Array.from(membersSet),
      connectedSources: Array.isArray(connectedSources)
        ? connectedSources
        : [{ type: 'FILE_UPLOAD', verifiedAt: now }],
      redactionRules: Array.isArray(redactionRules)
        ? redactionRules
            .filter((r): r is string => typeof r === 'string')
            .map((r) => sanitizeText(r, 120))
            .filter(Boolean)
        : [],
      status: 'ACTIVE',
      createdBy: req.user!.uid,
      createdAt: now,
      updatedAt: now,
    };

    firestoreStore.state.projects[id] = project;
    firestoreStore.save();

    firestoreStore.appendAuditLog({
      userId: req.user!.uid,
      userName: req.user!.name,
      userRole: req.user!.role,
      action: 'PROJECT_CREATE',
      target: `Project: ${project.name}`,
      targetId: project.id,
      details: { teamLeadId: project.teamLeadId, memberCount: project.memberIds.length },
    });

    res.status(201).json({ project });
  }
);

app.put(
  '/api/projects/:id',
  requireAuth,
  requireRoles('ADMIN', 'TEAM_LEADER'),
  (req: AuthenticatedRequest, res: Response) => {
    const project = firestoreStore.state.projects[String(req.params.id)];
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    if (req.user!.role !== 'ADMIN' && project.teamLeadId !== req.user!.uid) {
      res.status(403).json({
        error: 'Only the assigned Team Leader or an Administrator can edit this project.',
      });
      return;
    }

    const {
      name,
      description,
      teamLeadId,
      memberIds,
      connectedSources,
      redactionRules,
      status,
    } = req.body || {};

    if (name) project.name = sanitizeText(name, 160) || project.name;
    if (description) project.description = sanitizeText(description, 2000) || project.description;
    if (isSafeId(teamLeadId) && firestoreStore.state.users[teamLeadId]) {
      project.teamLeadId = teamLeadId;
    }
    if (Array.isArray(memberIds)) {
      const mSet = new Set<string>(
        memberIds.filter((m): m is string => isSafeId(m) && Boolean(firestoreStore.state.users[m]))
      );
      mSet.add(project.teamLeadId);
      project.memberIds = Array.from(mSet);
    }
    if (Array.isArray(connectedSources)) project.connectedSources = connectedSources;
    if (Array.isArray(redactionRules)) {
      project.redactionRules = redactionRules
        .filter((r): r is string => typeof r === 'string')
        .map((r) => sanitizeText(r, 120))
        .filter(Boolean);
    }
    if (status === 'ACTIVE' || status === 'ARCHIVED') project.status = status;
    project.updatedAt = new Date().toISOString();

    firestoreStore.save();

    firestoreStore.appendAuditLog({
      userId: req.user!.uid,
      userName: req.user!.name,
      userRole: req.user!.role,
      action: 'PROJECT_UPDATE',
      target: `Project: ${project.name}`,
      targetId: project.id,
      details: { memberCount: project.memberIds.length },
    });

    res.json({ project });
  }
);

app.delete(
  '/api/projects/:id',
  requireAuth,
  requireRoles('ADMIN', 'TEAM_LEADER'),
  (req: AuthenticatedRequest, res: Response) => {
    const project = firestoreStore.state.projects[String(req.params.id)];
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    if (req.user!.role !== 'ADMIN' && project.teamLeadId !== req.user!.uid) {
      res.status(403).json({
        error: 'Only the assigned Team Leader or an Administrator can delete this project.',
      });
      return;
    }

    delete firestoreStore.state.projects[project.id];
    firestoreStore.save();

    firestoreStore.appendAuditLog({
      userId: req.user!.uid,
      userName: req.user!.name,
      userRole: req.user!.role,
      action: 'PROJECT_DELETE',
      target: `Project Deleted: ${project.name}`,
      targetId: project.id,
    });

    res.json({ success: true });
  }
);

// ============================================================================
// 5. HANDOVER MANAGEMENT MODULE
// ============================================================================
app.get('/api/handovers', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const handovers = Object.values(firestoreStore.state.handovers)
    .filter((h) => canUserAccessHandover(user, h))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({ handovers });
});

app.get('/api/handovers/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const handover = firestoreStore.state.handovers[String(req.params.id)];
  if (!handover) {
    res.status(404).json({ error: 'Handover request not found.' });
    return;
  }

  // Strict Backend RBAC Check (Rule 8: Successors can ONLY access PUBLISHED reports they are assigned to)
  if (!canUserAccessHandover(user, handover)) {
    res.status(403).json({
      error:
        user.role === 'SUCCESSOR'
          ? 'Access Denied: Successors can only access handover reports after Team Leader verification and publication.'
          : 'Access Denied: You are not authorized to access this handover.',
    });
    return;
  }

  const project = firestoreStore.state.projects[handover.projectId] || null;
  const sources = Object.values(firestoreStore.state.sources)
    .filter((s) => s.handoverId === handover.id)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  let reportItems = Object.values(firestoreStore.state.reportItems).filter(
    (item) => item.handoverId === handover.id
  );

  // If Successor is viewing a published handover, only return APPROVED report items
  if (user.role === 'SUCCESSOR') {
    reportItems = reportItems.filter((item) => item.reviewStatus === 'APPROVED');
    firestoreStore.appendAuditLog({
      userId: user.uid,
      userName: user.name,
      userRole: user.role,
      action: 'SUCCESSOR_ACCESS',
      target: `Handover Report Accessed: ${handover.title}`,
      targetId: handover.id,
      details: { projectId: handover.projectId },
    });
  }

  res.json({
    handover,
    project,
    sources,
    reportItems,
  });
});

app.post(
  '/api/handovers',
  requireAuth,
  requireRoles('ADMIN', 'TEAM_LEADER'),
  (req: AuthenticatedRequest, res: Response) => {
    const {
      title,
      projectId,
      departingMemberId,
      successorId,
      dateRange,
      deadline,
      selectedDataSources,
      githubRepo,
      githubBranch,
    } = req.body || {};

    const cleanTitle = sanitizeText(title, 200);
    if (!cleanTitle || cleanTitle.length < 4) {
      res.status(400).json({ error: 'Handover title (minimum 4 characters) is required.' });
      return;
    }
    if (!isSafeId(projectId) || !firestoreStore.state.projects[projectId]) {
      res.status(400).json({ error: 'A valid project must be selected.' });
      return;
    }
    const targetProject = firestoreStore.state.projects[projectId];
    if (
      req.user!.role !== 'ADMIN' &&
      targetProject.teamLeadId !== req.user!.uid &&
      !targetProject.memberIds.includes(req.user!.uid)
    ) {
      res.status(403).json({ error: 'Access Denied: You are not a member of the selected project.' });
      return;
    }
    if (!isSafeId(departingMemberId) || !firestoreStore.state.users[departingMemberId]) {
      res.status(400).json({ error: 'A valid Departing Member must be selected.' });
      return;
    }
    if (!isSafeId(successorId) || !firestoreStore.state.users[successorId]) {
      res.status(400).json({ error: 'A valid Successor Member must be selected.' });
      return;
    }
    if (departingMemberId === successorId) {
      res.status(400).json({
        error: 'Departing Member and Successor Member cannot be the same user.',
      });
      return;
    }
    if (!isValidIsoDate(dateRange?.startDate) || !isValidIsoDate(dateRange?.endDate)) {
      res.status(400).json({ error: 'Valid start and end dates (YYYY-MM-DD) are required.' });
      return;
    }
    if (dateRange.startDate > dateRange.endDate) {
      res.status(400).json({ error: 'Start date cannot be later than end date.' });
      return;
    }

    const id = `hnd_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();

    const handover: Handover = {
      id,
      title: cleanTitle,
      projectId,
      departingMemberId,
      successorId,
      dateRange: {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      },
      deadline: isValidIsoDate(deadline) ? deadline : dateRange.endDate,
      selectedDataSources:
        Array.isArray(selectedDataSources) && selectedDataSources.length > 0
          ? selectedDataSources
          : ['TXT', 'CSV', 'JSON'],
      githubRepo: sanitizeText(githubRepo, 160),
      githubBranch: sanitizeText(githubBranch, 100) || 'main',
      status: 'DRAFT',
      processingProgress: {
        stage: 'DRAFT',
        percent: 10,
        message: 'Handover created. Ready for source ingestion.',
        updatedAt: now,
      },
      departingMemberNotes: '',
      openQuestionAnswers: {},
      approvalSummary: {
        version: 1,
      },
      versionHistory: [
        {
          version: 1,
          timestamp: now,
          actorId: req.user!.uid,
          actorName: req.user!.name,
          actorRole: req.user!.role,
          summary: 'Handover request initialized.',
          itemCount: 0,
          approvedCount: 0,
        },
      ],
      analysisEngineUsed: null,
      createdBy: req.user!.uid,
      approvedBy: null,
      createdAt: now,
      updatedAt: now,
    };

    firestoreStore.state.handovers[id] = handover;

    // Ensure departing and successor members are added to the project memberIds
    const proj = firestoreStore.state.projects[projectId];
    if (proj) {
      const mSet = new Set(proj.memberIds);
      mSet.add(departingMemberId);
      mSet.add(successorId);
      proj.memberIds = Array.from(mSet);
    }

    firestoreStore.save();

    firestoreStore.appendAuditLog({
      userId: req.user!.uid,
      userName: req.user!.name,
      userRole: req.user!.role,
      action: 'HANDOVER_CREATE',
      target: `Handover Created: ${handover.title}`,
      targetId: handover.id,
      details: {
        projectId,
        departingMemberId,
        successorId,
        dateRange: handover.dateRange,
      },
    });

    firestoreStore.createNotification({
      userId: departingMemberId,
      title: 'Assigned to New Handover Request',
      message: `You have been assigned as the Departing Member for "${handover.title}".`,
      link: `/handovers/${handover.id}`,
    });

    res.status(201).json({ handover });
  }
);

// ============================================================================
// 6. DATA INGESTION & SENSITIVE DATA REDACTION (FILES + GITHUB)
// ============================================================================
app.post(
  '/api/handovers/:id/upload',
  requireAuth,
  requireRoles('ADMIN', 'TEAM_LEADER', 'DEPARTING_MEMBER'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const handoverId = String(req.params.id);
      if (!isSafeId(handoverId)) {
        res.status(400).json({ error: 'Invalid handover ID.' });
        return;
      }
      const handover = firestoreStore.state.handovers[handoverId];
      if (!handover) {
        res.status(404).json({ error: 'Handover not found.' });
        return;
      }

      if (!canUserAccessHandover(req.user!, handover)) {
        res.status(403).json({
          error: 'Access Denied: You are not authorized to upload files to this handover.',
        });
        return;
      }

      if (handover.versionLocked) {
        res.status(403).json({
          error:
            'This handover report is approved and version-locked. A Team Leader must request a revision before new files can be uploaded.',
        });
        return;
      }

      const { fileName, contentBase64, rawText, mimeType, author } = req.body || {};
      const displayFileName = sanitizeText(path.basename(String(fileName || '')), 180);
      if (!displayFileName) {
        res.status(400).json({ error: 'fileName is required.' });
        return;
      }

      let buffer: Buffer;
      if (contentBase64) {
        buffer = Buffer.from(String(contentBase64), 'base64');
      } else if (typeof rawText === 'string') {
        buffer = Buffer.from(rawText, 'utf-8');
      } else {
        res.status(400).json({ error: 'File content (contentBase64 or rawText) is required.' });
        return;
      }

      // 1. Validate and parse file (CSV, JSON, PDF, DOCX, TXT)
      const parsed = validateAndParseFile(displayFileName, buffer, mimeType);

      // 2. Run Sensitive Data Redaction Engine BEFORE saving or sending to AI
      const project = firestoreStore.state.projects[handover.projectId];
      const globalRules = Object.values(firestoreStore.state.redactionRules);
      const redaction = redactSensitiveContent(
        parsed.extractedText,
        globalRules,
        project?.redactionRules || []
      );

      // 3. Persist redacted file to Storage bucket folder using a randomized server-generated filename
      const sourceId = `src_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const ext = displayFileName.split('.').pop()?.toLowerCase() || 'txt';
      const renamedFileName = `${sourceId}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
      const handoverStorageDir = path.resolve(STORAGE_DIR, handover.id);
      if (!handoverStorageDir.startsWith(path.resolve(STORAGE_DIR) + path.sep)) {
        res.status(400).json({ error: 'Invalid storage path.' });
        return;
      }
      if (!fs.existsSync(handoverStorageDir)) {
        fs.mkdirSync(handoverStorageDir, { recursive: true });
      }
      const storedFilePath = path.resolve(handoverStorageDir, renamedFileName);
      fs.writeFileSync(storedFilePath, redaction.redactedText, 'utf-8');

      // 4. Chunk redacted text & enrich with embeddings if Gemini API key is active
      const rawChunks = chunkRedactedText(sourceId, redaction.redactedText);
      const geminiKey =
        firestoreStore.state.serverSecrets.geminiApiKey || process.env.GEMINI_API_KEY || '';
      const chunks = await enrichChunksWithEmbeddings(rawChunks, geminiKey);

      const now = new Date().toISOString();
      const sourceDoc: SourceDocument = {
        id: sourceId,
        handoverId: handover.id,
        projectId: handover.projectId,
        type: parsed.sourceType,
        title: displayFileName,
        fileName: renamedFileName,
        storagePath: `handovers/${handover.id}/uploads/${renamedFileName}`,
        fileSize: buffer.length,
        uploadStatus: 'COMPLETED',
        uploadedBy: req.user!.uid,
        url: `storage://handovers/${handover.id}/uploads/${renamedFileName}`,
        author: sanitizeText(author, 120) || req.user!.name,
        timestamp: now,
        redactedText: redaction.redactedText,
        redactionSummary: {
          totalRedactions: redaction.totalRedactions,
          categories: redaction.categories,
          rulesMatched: redaction.rulesMatched,
        },
        chunks,
        metadata: parsed.metadata,
        createdAt: now,
      };

      firestoreStore.state.sources[sourceId] = sourceDoc;
      if (handover.status === 'DRAFT' || handover.status === 'REVISION_REQUESTED') {
        handover.status = 'INGESTING';
      }
      handover.processingProgress = {
        stage: 'INGESTING',
        percent: 45,
        message: `Ingested and redacted "${fileName}" (${redaction.totalRedactions} sensitive item(s) redacted).`,
        updatedAt: now,
      };
      handover.updatedAt = now;
      firestoreStore.save();

      firestoreStore.appendAuditLog({
        userId: req.user!.uid,
        userName: req.user!.name,
        userRole: req.user!.role,
        action: 'FILE_UPLOAD',
        target: `Source Uploaded: ${fileName}`,
        targetId: sourceId,
        details: {
          handoverId: handover.id,
          sourceType: parsed.sourceType,
          sizeBytes: buffer.length,
          redactionsApplied: redaction.totalRedactions,
          redactionCategories: redaction.categories,
        },
      });

      res.status(201).json({
        source: sourceDoc,
        redactionDetails: redaction.matches,
      });
    } catch (err: any) {
      console.error('[Upload Error]', err);
      const msg =
        err?.message &&
        (err.message.includes('Unsupported') ||
          err.message.includes('exceeds') ||
          err.message.includes('empty') ||
          err.message.includes('Invalid') ||
          err.message.includes('MIME'))
          ? err.message
          : 'File upload validation failed.';
      res.status(400).json({ error: msg });
    }
  }
);

app.delete(
  '/api/handovers/:id/sources/:sourceId',
  requireAuth,
  requireRoles('ADMIN', 'TEAM_LEADER', 'DEPARTING_MEMBER'),
  (req: AuthenticatedRequest, res: Response) => {
    const handoverId = String(req.params.id);
    const sourceId = String(req.params.sourceId);
    const handover = firestoreStore.state.handovers[handoverId];
    if (!handover) {
      res.status(404).json({ error: 'Handover not found.' });
      return;
    }

    if (handover.versionLocked) {
      res.status(403).json({
        error:
          'Cannot delete source files from a version-locked approved report. Request a revision first.',
      });
      return;
    }

    if (
      req.user!.role === 'DEPARTING_MEMBER' &&
      handover.departingMemberId !== req.user!.uid
    ) {
      res.status(403).json({
        error: 'Access Denied: Only the assigned Departing Member, Team Leader, or Admin can delete sources from this handover.',
      });
      return;
    }

    const source = firestoreStore.state.sources[sourceId];
    if (!source || source.handoverId !== handover.id) {
      res.status(404).json({ error: 'Source document not found in this handover.' });
      return;
    }

    // Remove physical file from storage folder if it exists
    const safeFileName = path.basename(source.fileName || source.title).replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedFilePath = path.join(STORAGE_DIR, handover.id, safeFileName);
    if (fs.existsSync(storedFilePath)) {
      try {
        fs.unlinkSync(storedFilePath);
      } catch {
        // Ignore unlink errors
      }
    }

    delete firestoreStore.state.sources[sourceId];
    if (firestoreStore.state.uploadedSources) {
      delete firestoreStore.state.uploadedSources[sourceId];
    }
    handover.updatedAt = new Date().toISOString();
    firestoreStore.save();

    firestoreStore.appendAuditLog({
      userId: req.user!.uid,
      userName: req.user!.name,
      userRole: req.user!.role,
      action: 'FILE_DELETE',
      target: `Source Deleted: ${source.title}`,
      targetId: sourceId,
      details: {
        handoverId: handover.id,
        projectId: handover.projectId,
        type: source.type,
      },
    });

    res.json({ success: true, deletedSourceId: sourceId });
  }
);

app.post(
  '/api/handovers/:id/github-import',
  requireAuth,
  requireRoles('ADMIN', 'TEAM_LEADER', 'DEPARTING_MEMBER'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const handoverId = String(req.params.id);
      if (!isSafeId(handoverId)) {
        res.status(400).json({ error: 'Invalid handover ID.' });
        return;
      }
      const handover = firestoreStore.state.handovers[handoverId];
      if (!handover) {
        res.status(404).json({ error: 'Handover not found.' });
        return;
      }

      if (!canUserAccessHandover(req.user!, handover)) {
        res.status(403).json({
          error: 'Access Denied: You are not authorized to import sources into this handover.',
        });
        return;
      }

      if (handover.versionLocked) {
        res.status(403).json({
          error:
            'This handover report is approved and version-locked. Request a revision before importing new sources.',
        });
        return;
      }

      const repoFullName = sanitizeText(req.body?.repoFullName || handover.githubRepo || '', 160);
      if (!repoFullName) {
        res.status(400).json({
          error:
            'GitHub repository identifier (e.g. "owner/repo") is required to import repository activity.',
        });
        return;
      }

      const token =
        firestoreStore.state.serverSecrets.githubToken ||
        process.env.GITHUB_PAT ||
        process.env.GITHUB_TOKEN ||
        '';

      const rawItems = await fetchGitHubRepositoryData({
        repoFullName,
        token,
        startDate: req.body?.startDate || handover.dateRange.startDate,
        endDate: req.body?.endDate || handover.dateRange.endDate,
      });

      if (rawItems.length === 0) {
        res.status(404).json({
          error: `No GitHub commits, pull requests, issues, or branches found for "${repoFullName}" in the selected range.`,
        });
        return;
      }

      const project = firestoreStore.state.projects[handover.projectId];
      const globalRules = Object.values(firestoreStore.state.redactionRules);
      const geminiKey =
        firestoreStore.state.serverSecrets.geminiApiKey || process.env.GEMINI_API_KEY || '';

      const createdSources: SourceDocument[] = [];
      let totalRedactionsAcrossImport = 0;

      for (const item of rawItems) {
        const redaction = redactSensitiveContent(
          item.rawText,
          globalRules,
          project?.redactionRules || []
        );
        totalRedactionsAcrossImport += redaction.totalRedactions;

        const sourceId = `src_gh_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        const rawChunks = chunkRedactedText(sourceId, redaction.redactedText);
        const chunks = await enrichChunksWithEmbeddings(rawChunks, geminiKey);

        const srcDoc: SourceDocument = {
          id: sourceId,
          handoverId: handover.id,
          projectId: handover.projectId,
          type: item.type,
          title: item.title,
          url: item.url,
          author: item.author,
          timestamp: item.timestamp,
          redactedText: redaction.redactedText,
          redactionSummary: {
            totalRedactions: redaction.totalRedactions,
            categories: redaction.categories,
            rulesMatched: redaction.rulesMatched,
          },
          chunks,
          metadata: item.metadata,
          createdAt: new Date().toISOString(),
        };

        firestoreStore.state.sources[sourceId] = srcDoc;
        createdSources.push(srcDoc);
      }

      handover.githubRepo = repoFullName;
      if (project) {
        project.connectedSources = project.connectedSources || [];
        if (
          !project.connectedSources.some(
            (cs) => cs.type === 'GITHUB' && cs.repoFullName === repoFullName
          )
        ) {
          project.connectedSources.push({
            type: 'GITHUB',
            repoFullName,
            branch: handover.githubBranch || 'main',
            verifiedAt: new Date().toISOString(),
          });
        }
      }
      if (handover.status === 'DRAFT') {
        handover.status = 'INGESTING';
      }
      handover.processingProgress = {
        stage: 'INGESTING',
        percent: 55,
        message: `Imported ${createdSources.length} GitHub artifacts from ${repoFullName} (${totalRedactionsAcrossImport} sensitive value(s) redacted).`,
        updatedAt: new Date().toISOString(),
      };
      handover.updatedAt = new Date().toISOString();
      firestoreStore.save();

      firestoreStore.appendAuditLog({
        userId: req.user!.uid,
        userName: req.user!.name,
        userRole: req.user!.role,
        action: 'GITHUB_IMPORT',
        target: `GitHub Import: ${repoFullName} (${createdSources.length} sources)`,
        targetId: handover.id,
        details: {
          repoFullName,
          importedCount: createdSources.length,
          totalRedactions: totalRedactionsAcrossImport,
        },
      });

      res.status(201).json({
        importedCount: createdSources.length,
        totalRedactions: totalRedactionsAcrossImport,
        sources: createdSources,
      });
    } catch (err: any) {
      console.error('[GitHub Import Error]', err);
      res.status(400).json({ error: 'GitHub repository import failed. Verify the repository identifier and credentials.' });
    }
  }
);

// ============================================================================
// 7. AI ANALYSIS & CITATION VERIFICATION ENGINE
// ============================================================================
app.post(
  '/api/handovers/:id/analyze',
  requireAuth,
  requireRoles('ADMIN', 'TEAM_LEADER'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const handoverId = String(req.params.id);
      if (!isSafeId(handoverId)) {
        res.status(400).json({ error: 'Invalid handover ID.' });
        return;
      }
      const handover = firestoreStore.state.handovers[handoverId];
      if (!handover) {
        res.status(404).json({ error: 'Handover not found.' });
        return;
      }

      if (!canUserAccessHandover(req.user!, handover)) {
        res.status(403).json({
          error: 'Access Denied: You are not authorized to run analysis on this handover.',
        });
        return;
      }

      if (handover.versionLocked) {
        res.status(403).json({
          error: 'This handover report is approved and version-locked. Request a revision first.',
        });
        return;
      }

      const sources = Object.values(firestoreStore.state.sources).filter(
        (s) => s.handoverId === handover.id
      );

      if (sources.length === 0) {
        res.status(400).json({
          error:
            'Cannot generate handover analysis: No sources have been uploaded or imported for this handover yet.',
        });
        return;
      }

      const requestedMode: 'GEMINI' | 'EXTRACTIVE' =
        req.body?.mode === 'EXTRACTIVE' ? 'EXTRACTIVE' : 'GEMINI';
      const geminiKey =
        firestoreStore.state.serverSecrets.geminiApiKey || process.env.GEMINI_API_KEY || '';
      const project = firestoreStore.state.projects[handover.projectId];

      let rawGeneratedItems;
      let engineUsed: 'GEMINI_API' | 'EXTRACTIVE_GROUNDED';

      if (requestedMode === 'GEMINI') {
        if (!geminiKey || !geminiKey.trim()) {
          res.status(400).json({
            error:
              'GEMINI_API_KEY is not configured. Configure a valid Google Gemini API key in Admin > Integrations (or .env) to run Gemini LLM generation, or select "Run Source-Grounded Extractive Analysis" to extract report items deterministically from your redacted sources.',
            code: 'GEMINI_KEY_MISSING',
          });
          return;
        }
        rawGeneratedItems = await generateGeminiStructuredItems(
          sources,
          geminiKey,
          project?.name || handover.title
        );
        engineUsed = 'GEMINI_API';
      } else {
        rawGeneratedItems = runDeterministicSourceExtraction(sources);
        engineUsed = 'EXTRACTIVE_GROUNDED';
      }

      // Run Citation Verification Service on all generated items
      const verifiedItemsData = finalizeAndVerifyReportItems(
        handover.id,
        rawGeneratedItems,
        sources
      );

      // Remove previous report items for this handover before writing the newly generated analysis
      for (const existing of Object.values(firestoreStore.state.reportItems)) {
        if (existing.handoverId === handover.id) {
          delete firestoreStore.state.reportItems[existing.id];
        }
      }

      const savedItems: ReportItem[] = [];
      verifiedItemsData.forEach((itemData, idx) => {
        const itemId = `rpt_${Date.now()}_${idx + 1}_${crypto.randomBytes(2).toString('hex')}`;
        const fullItem: ReportItem = {
          id: itemId,
          ...itemData,
        };
        firestoreStore.state.reportItems[itemId] = fullItem;
        savedItems.push(fullItem);
      });

      const now = new Date().toISOString();
      handover.status = 'DEPARTING_REVIEW';
      handover.analysisEngineUsed = engineUsed;
      handover.processingProgress = {
        stage: 'DEPARTING_REVIEW',
        percent: 75,
        message: `Generated ${savedItems.length} source-backed items across all 7 sections. Ready for Departing Member & Team Leader review.`,
        updatedAt: now,
      };
      const nextVersion = (handover.versionHistory?.length || 0) + 1;
      handover.versionHistory = [
        ...(handover.versionHistory || []),
        {
          version: nextVersion,
          timestamp: now,
          actorId: req.user!.uid,
          actorName: req.user!.name,
          actorRole: req.user!.role,
          summary: `Generated ${savedItems.length} grounded report items via ${engineUsed} across ${sources.length} source(s).`,
          itemCount: savedItems.length,
          approvedCount: 0,
        },
      ];
      handover.updatedAt = now;
      firestoreStore.save();

      firestoreStore.appendAuditLog({
        userId: req.user!.uid,
        userName: req.user!.name,
        userRole: req.user!.role,
        action: 'REPORT_GENERATE',
        target: `Report Generated: ${handover.title}`,
        targetId: handover.id,
        details: {
          engineUsed,
          sourceCount: sources.length,
          itemCount: savedItems.length,
          verifiedCitationsCount: savedItems.filter((i) => i.citationVerified).length,
        },
      });

      firestoreStore.createNotification({
        userId: handover.departingMemberId,
        title: 'Handover Analysis Ready for Your Review',
        message: `Please review the generated findings and open questions for "${handover.title}".`,
        link: `/handovers/${handover.id}`,
      });

      res.json({
        handover,
        reportItems: savedItems,
        engineUsed,
      });
    } catch (err: any) {
      console.error('[Analysis Error]', err);
      res.status(500).json({ error: 'Analysis generation failed due to an internal error.' });
    }
  }
);

// ============================================================================
// 8. DEPARTING MEMBER REVIEW (CONFIRM/DISPUTE, ADD CONTEXT, ANSWER QUESTIONS)
// ============================================================================
app.patch(
  '/api/report-items/:itemId/departing-feedback',
  requireAuth,
  requireRoles('DEPARTING_MEMBER', 'TEAM_LEADER', 'ADMIN'),
  (req: AuthenticatedRequest, res: Response) => {
    const item = firestoreStore.state.reportItems[String(req.params.itemId)];
    if (!item) {
      res.status(404).json({ error: 'Report item not found.' });
      return;
    }

    const handover = firestoreStore.state.handovers[item.handoverId];
    if (!handover) {
      res.status(404).json({ error: 'Parent handover not found.' });
      return;
    }

    if (handover.versionLocked) {
      res.status(403).json({
        error:
          'This handover report is version-locked after final approval. A Team Leader must request a revision before modifications can be made.',
      });
      return;
    }

    if (
      req.user!.role === 'DEPARTING_MEMBER' &&
      handover.departingMemberId !== req.user!.uid
    ) {
      res.status(403).json({
        error: 'Only the assigned Departing Member can submit feedback on this handover.',
      });
      return;
    }

    const { departingReviewStatus, departingComment } = req.body || {};
    const validStatuses: DepartingReviewStatus[] = [
      'UNREVIEWED',
      'CONFIRMED',
      'DISPUTED',
    ];
    if (departingReviewStatus && validStatuses.includes(departingReviewStatus)) {
      item.departingReviewStatus = departingReviewStatus;
    }
    if (departingComment !== undefined) {
      item.departingComment = sanitizeText(departingComment, 2000);
    }
    item.updatedAt = new Date().toISOString();
    firestoreStore.save();

    firestoreStore.appendAuditLog({
      userId: req.user!.uid,
      userName: req.user!.name,
      userRole: req.user!.role,
      action:
        item.departingReviewStatus === 'DISPUTED'
          ? 'DEPARTING_DISPUTE'
          : 'DEPARTING_CONFIRM',
      target: `Report Item [${item.section}]: ${item.statement.slice(0, 60)}...`,
      targetId: item.id,
      details: {
        handoverId: handover.id,
        departingReviewStatus: item.departingReviewStatus,
        departingComment: item.departingComment,
      },
    });

    res.json({ item });
  }
);

app.post(
  '/api/handovers/:id/departing-context',
  requireAuth,
  requireRoles('DEPARTING_MEMBER', 'TEAM_LEADER', 'ADMIN'),
  (req: AuthenticatedRequest, res: Response) => {
    const handover = firestoreStore.state.handovers[String(req.params.id)];
    if (!handover) {
      res.status(404).json({ error: 'Handover not found.' });
      return;
    }

    if (!canUserAccessHandover(req.user!, handover)) {
      res.status(403).json({
        error: 'Access Denied: You are not authorized to publish this handover.',
      });
      return;
    }

    if (handover.versionLocked) {
      res.status(403).json({
        error:
          'This handover report is version-locked after final approval. A Team Leader must request a revision before context can be modified.',
      });
      return;
    }

    if (
      req.user!.role === 'DEPARTING_MEMBER' &&
      handover.departingMemberId !== req.user!.uid
    ) {
      res.status(403).json({
        error: 'Only the assigned Departing Member can submit handover context.',
      });
      return;
    }

    const { notes, questionItemId, questionAnswer, submitToLeader } = req.body || {};
    const project = firestoreStore.state.projects[handover.projectId];
    const globalRules = Object.values(firestoreStore.state.redactionRules);
    const now = new Date().toISOString();

    const cleanNotes = sanitizeText(notes, 10000);
    if (cleanNotes) {
      const redactedNotes = redactSensitiveContent(
        cleanNotes,
        globalRules,
        project?.redactionRules || []
      );
      handover.departingMemberNotes = redactedNotes.redactedText;

      // Also save as a verifiable source document so new or updated claims can cite it
      const srcId = `src_dept_${Date.now()}`;
      firestoreStore.state.sources[srcId] = {
        id: srcId,
        handoverId: handover.id,
        projectId: handover.projectId,
        type: 'DEPARTING_CONTEXT',
        title: `Departing Member Context Notes (${req.user!.name})`,
        url: `handover://${handover.id}/departing-context/${srcId}`,
        author: req.user!.name,
        timestamp: now,
        redactedText: redactedNotes.redactedText,
        redactionSummary: {
          totalRedactions: redactedNotes.totalRedactions,
          categories: redactedNotes.categories,
          rulesMatched: redactedNotes.rulesMatched,
        },
        chunks: [{ chunkId: `${srcId}_chunk_1`, text: redactedNotes.redactedText }],
        metadata: { sourceOrigin: 'departing_member_submission' },
        createdAt: now,
      };
    }

    const cleanAnswer = sanitizeText(questionAnswer, 5000);
    if (isSafeId(questionItemId) && cleanAnswer) {
      const qItem = firestoreStore.state.reportItems[questionItemId];
      if (!qItem || qItem.handoverId !== handover.id) {
        res.status(404).json({ error: 'Question item not found in this handover.' });
        return;
      }
      const redactedAns = redactSensitiveContent(
        cleanAnswer,
        globalRules,
        project?.redactionRules || []
      );
      if (!handover.openQuestionAnswers) handover.openQuestionAnswers = {};
      handover.openQuestionAnswers[questionItemId] = {
        answer: redactedAns.redactedText,
        answeredBy: req.user!.uid,
        answeredByName: req.user!.name,
        answeredAt: now,
      };

      qItem.departingReviewStatus = 'CONFIRMED';
      qItem.departingComment = `Answered: ${redactedAns.redactedText}`;
      qItem.updatedAt = now;
    }

    if (submitToLeader) {
      handover.status = 'LEADER_REVIEW';
      handover.processingProgress = {
        stage: 'LEADER_REVIEW',
        percent: 85,
        message: 'Departing Member completed context review. Awaiting Team Leader verification.',
        updatedAt: now,
      };
      firestoreStore.createNotification({
        userId: handover.createdBy,
        title: 'Departing Member Completed Handover Review',
        message: `${req.user!.name} submitted context and confirmed items for "${handover.title}". Ready for your approval.`,
        link: `/handovers/${handover.id}`,
      });
    }

    handover.updatedAt = now;
    firestoreStore.save();

    firestoreStore.appendAuditLog({
      userId: req.user!.uid,
      userName: req.user!.name,
      userRole: req.user!.role,
      action: 'DEPARTING_CONTEXT_SUBMIT',
      target: `Handover Context Updated: ${handover.title}`,
      targetId: handover.id,
      details: { submitToLeader: Boolean(submitToLeader), questionItemId },
    });

    res.json({ handover });
  }
);

// ============================================================================
// 9. TEAM LEADER REVIEW, EDITING, APPROVAL & PUBLICATION
// ============================================================================
app.patch(
  '/api/report-items/:itemId/leader-review',
  requireAuth,
  requireRoles('ADMIN', 'TEAM_LEADER'),
  (req: AuthenticatedRequest, res: Response) => {
    const item = firestoreStore.state.reportItems[String(req.params.itemId)];
    if (!item) {
      res.status(404).json({ error: 'Report item not found.' });
      return;
    }

    const handover = firestoreStore.state.handovers[item.handoverId];
    if (!handover) {
      res.status(404).json({ error: 'Parent handover not found.' });
      return;
    }

    if (handover.versionLocked) {
      res.status(403).json({
        error:
          'This handover report is version-locked after final approval. A Team Leader must request a revision before items can be modified.',
      });
      return;
    }

    if (!canUserAccessHandover(req.user!, handover)) {
      res.status(403).json({
        error: 'Access Denied: You are not authorized to review items in this handover.',
      });
      return;
    }

    const { reviewStatus, statement, reviewerComment, section, confidence } =
      req.body || {};
    const now = new Date().toISOString();

    // If statement was edited by Team Leader, record editHistory and re-verify citation
    const cleanStatement = sanitizeText(statement, 4000);
    const cleanReviewerComment =
      reviewerComment !== undefined ? sanitizeText(reviewerComment, 2000) : undefined;
    if (cleanStatement && cleanStatement !== item.statement) {
      const newStmt = cleanStatement;
      item.editHistory.push({
        previousStatement: item.statement,
        newStatement: newStmt,
        editedBy: req.user!.uid,
        editedByName: req.user!.name,
        editedAt: now,
        reason: cleanReviewerComment || 'Edited during Team Leader verification',
      });
      item.statement = newStmt;
      item.description = newStmt;

      const sourcesMap = new Map(
        Object.values(firestoreStore.state.sources)
          .filter((s) => s.handoverId === handover.id)
          .map((s) => [s.id, s])
      );
      const recheck = verifySingleCitation(
        item.statement,
        item.evidence,
        item.sourceIds,
        sourcesMap
      );
      item.citationVerified = recheck.citationVerified;
      item.citationValidationNote = recheck.citationValidationNote;

      firestoreStore.appendAuditLog({
        userId: req.user!.uid,
        userName: req.user!.name,
        userRole: req.user!.role,
        action: 'REPORT_EDIT',
        target: `Report Item Edited [${item.section}]`,
        targetId: item.id,
        details: { handoverId: handover.id, newStatement: newStmt },
      });
    }

    if (section && ALL_REPORT_SECTIONS.includes(section)) {
      item.section = section;
      item.category = section;
    }
    if (confidence && ['HIGH', 'MEDIUM', 'LOW'].includes(confidence)) {
      item.confidence = confidence as ConfidenceLevel;
    }
    if (cleanReviewerComment !== undefined) {
      item.reviewerComment = cleanReviewerComment;
    }

    const validReviewStatuses: ReviewStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];
    if (reviewStatus && validReviewStatuses.includes(reviewStatus)) {
      item.reviewStatus = reviewStatus;
      item.verificationStatus = reviewStatus;
      item.reviewedBy = req.user!.uid;
      item.reviewedByName = req.user!.name;
      item.reviewedAt = now;

      firestoreStore.appendAuditLog({
        userId: req.user!.uid,
        userName: req.user!.name,
        userRole: req.user!.role,
        action:
          reviewStatus === 'APPROVED'
            ? 'ITEM_APPROVE'
            : reviewStatus === 'REJECTED'
            ? 'ITEM_REJECT'
            : 'ITEM_RESET',
        target: `Report Item [${item.section}]: ${item.statement.slice(0, 60)}`,
        targetId: item.id,
        details: {
          handoverId: handover.id,
          reviewStatus,
          reviewerComment: item.reviewerComment,
        },
      });
    }

    item.updatedAt = now;
    firestoreStore.save();

    res.json({ item });
  }
);

app.post(
  '/api/handovers/:id/publish',
  requireAuth,
  requireRoles('ADMIN', 'TEAM_LEADER'),
  (req: AuthenticatedRequest, res: Response) => {
    const handover = firestoreStore.state.handovers[String(req.params.id)];
    if (!handover) {
      res.status(404).json({ error: 'Handover not found.' });
      return;
    }

    if (!canUserAccessHandover(req.user!, handover)) {
      res.status(403).json({
        error: 'Access Denied: You are not authorized to publish this handover.',
      });
      return;
    }

    const items = Object.values(firestoreStore.state.reportItems).filter(
      (i) => i.handoverId === handover.id
    );

    if (items.length === 0) {
      res.status(400).json({
        error: 'Cannot publish an empty handover report. Generate analysis first.',
      });
      return;
    }

    // Rule 5.H: A report cannot be published until all required sections and report items have been reviewed!
    const pendingItems = items.filter((i) => i.reviewStatus === 'PENDING');
    if (pendingItems.length > 0) {
      res.status(400).json({
        error: `Cannot publish handover report: ${pendingItems.length} report item(s) still have PENDING review status. Every item must be Approved or Rejected by the Team Leader before publication.`,
        pendingCount: pendingItems.length,
      });
      return;
    }

    const missingSections = ALL_REPORT_SECTIONS.filter(
      (sec) => !items.some((i) => i.section === sec)
    );
    if (missingSections.length > 0) {
      res.status(400).json({
        error: `Cannot publish handover report: Missing required section(s): ${missingSections.join(
          ', '
        )}.`,
      });
      return;
    }

    const approvedItems = items.filter((i) => i.reviewStatus === 'APPROVED');
    if (approvedItems.length === 0) {
      res.status(400).json({
        error: 'Cannot publish a report with zero approved items.',
      });
      return;
    }

    const now = new Date().toISOString();
    const nextVersion = (handover.versionHistory?.length || 0) + 1;
    const leaderComments =
      req.body?.leaderComments ||
      'All report sections and source citations verified and approved for Successor access.';

    handover.status = 'PUBLISHED';
    handover.approvalStatus = 'APPROVED';
    handover.versionLocked = true;
    handover.approvedBy = req.user!.uid;
    handover.approvalSummary = {
      approvedBy: req.user!.uid,
      approvedByName: req.user!.name,
      approvedAt: now,
      publishedAt: now,
      leaderComments,
      version: nextVersion,
    };
    handover.processingProgress = {
      stage: 'PUBLISHED',
      percent: 100,
      message: `Approved, version-locked (v${nextVersion}), and published by ${req.user!.name}. Accessible to Successor.`,
      updatedAt: now,
    };
    handover.versionHistory = [
      ...(handover.versionHistory || []),
      {
        version: nextVersion,
        timestamp: now,
        actorId: req.user!.uid,
        actorName: req.user!.name,
        actorRole: req.user!.role,
        summary: `Team Leader approved ${approvedItems.length} of ${items.length} items and published version-locked report (v${nextVersion}).`,
        itemCount: items.length,
        approvedCount: approvedItems.length,
      },
    ];
    handover.updatedAt = now;

    // Create immutable version-locked HandoverReport snapshot in handoverReports collection
    const reportId = `rep_${handover.id}_v${nextVersion}`;
    firestoreStore.state.handoverReports[reportId] = {
      id: reportId,
      handoverId: handover.id,
      projectId: handover.projectId,
      version: nextVersion,
      versionLocked: true,
      approvalStatus: 'APPROVED',
      approvedBy: req.user!.uid,
      approvedByName: req.user!.name,
      approvedAt: now,
      leaderComments,
      itemsSnapshot: items.map((i) => ({ ...i })),
      createdAt: now,
    };

    // Create ApprovalRecord in approvals collection
    const approvalId = `appr_${handover.id}_v${nextVersion}`;
    firestoreStore.state.approvals[approvalId] = {
      id: approvalId,
      handoverId: handover.id,
      projectId: handover.projectId,
      reportId,
      status: 'APPROVED',
      reviewerId: req.user!.uid,
      reviewerName: req.user!.name,
      reviewerRole: req.user!.role,
      comments: leaderComments,
      versionLocked: true,
      version: nextVersion,
      timestamp: now,
    };

    firestoreStore.save();

    firestoreStore.appendAuditLog({
      userId: req.user!.uid,
      userName: req.user!.name,
      userRole: req.user!.role,
      action: 'REPORT_PUBLISH',
      target: `Handover Published: ${handover.title}`,
      targetId: handover.id,
      details: {
        reportId,
        approvedCount: approvedItems.length,
        rejectedCount: items.length - approvedItems.length,
        successorId: handover.successorId,
        version: nextVersion,
        versionLocked: true,
      },
    });

    firestoreStore.createNotification({
      userId: handover.successorId,
      title: 'Handover Report Approved & Published',
      message: `Team Leader ${req.user!.name} approved and published "${handover.title}". You now have full successor access.`,
      link: `/successor?handoverId=${handover.id}`,
    });

    res.json({ handover, report: firestoreStore.state.handoverReports[reportId] });
  }
);

app.post(
  '/api/handovers/:id/revision-request',
  requireAuth,
  requireRoles('ADMIN', 'TEAM_LEADER'),
  (req: AuthenticatedRequest, res: Response) => {
    const handover = firestoreStore.state.handovers[String(req.params.id)];
    if (!handover) {
      res.status(404).json({ error: 'Handover not found.' });
      return;
    }

    if (!canUserAccessHandover(req.user!, handover)) {
      res.status(403).json({
        error: 'Access Denied: You are not authorized to publish this handover.',
      });
      return;
    }

    const comments =
      String(req.body?.comments || '').trim() ||
      'Team Leader requested revisions and additional source context.';
    const now = new Date().toISOString();
    const nextVersion = (handover.versionHistory?.length || 0) + 1;

    handover.status = 'REVISION_REQUESTED';
    handover.approvalStatus = 'REVISION_REQUESTED';
    handover.versionLocked = false;
    handover.processingProgress = {
      stage: 'REVISION_REQUESTED',
      percent: 65,
      message: `Revision requested by ${req.user!.name}: ${comments}`,
      updatedAt: now,
    };
    handover.versionHistory = [
      ...(handover.versionHistory || []),
      {
        version: nextVersion,
        timestamp: now,
        actorId: req.user!.uid,
        actorName: req.user!.name,
        actorRole: req.user!.role,
        summary: `Revision requested by ${req.user!.name}: ${comments}`,
        itemCount: Object.values(firestoreStore.state.reportItems).filter(
          (i) => i.handoverId === handover.id
        ).length,
        approvedCount: Object.values(firestoreStore.state.reportItems).filter(
          (i) => i.handoverId === handover.id && i.reviewStatus === 'APPROVED'
        ).length,
      },
    ];
    handover.updatedAt = now;

    const approvalId = `appr_rev_${handover.id}_${Date.now()}`;
    firestoreStore.state.approvals[approvalId] = {
      id: approvalId,
      handoverId: handover.id,
      projectId: handover.projectId,
      reportId: `rep_${handover.id}_v${nextVersion}`,
      status: 'REVISION_REQUESTED',
      reviewerId: req.user!.uid,
      reviewerName: req.user!.name,
      reviewerRole: req.user!.role,
      comments,
      versionLocked: false,
      version: nextVersion,
      timestamp: now,
    };

    firestoreStore.save();

    firestoreStore.appendAuditLog({
      userId: req.user!.uid,
      userName: req.user!.name,
      userRole: req.user!.role,
      action: 'APPROVAL_REVISION_REQUESTED',
      target: `Revision Requested: ${handover.title}`,
      targetId: handover.id,
      details: {
        comments,
        version: nextVersion,
        versionLocked: false,
      },
    });

    firestoreStore.createNotification({
      userId: handover.departingMemberId,
      title: 'Handover Revision Requested',
      message: `Team Leader ${req.user!.name} requested revisions on "${handover.title}": ${comments}`,
      link: `/handovers/${handover.id}`,
    });

    res.json({ handover });
  }
);

// ============================================================================
// 10. GROUNDED AI Q&A ASSISTANT (STRICTLY APPROVED CONTENT & SOURCES ONLY)
// ============================================================================
app.post('/api/handovers/:id/qa', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const targetParam = String(req.params.id);
    const cleanQuestion = sanitizeText(req.body?.question, 2000);
    if (!cleanQuestion) {
      res.status(400).json({ error: 'A question is required.' });
      return;
    }

    const geminiKey =
      firestoreStore.state.serverSecrets.geminiApiKey || process.env.GEMINI_API_KEY || '';

    // Support workspace-wide grounded Q&A from the Dashboard "Ask HandoverIQ" widget
    if (targetParam === 'all' || targetParam === 'workspace') {
      let accessibleHandovers = Object.values(firestoreStore.state.handovers).filter(
        (h) => canUserAccessHandover(user, h)
      );
      if (accessibleHandovers.length === 0) {
        accessibleHandovers = Object.values(firestoreStore.state.handovers).filter(
          (h) => h.status === 'PUBLISHED'
        );
      }
      const accessibleIds = new Set(accessibleHandovers.map((h) => h.id));

      const approvedItems = Object.values(firestoreStore.state.reportItems).filter(
        (i) => accessibleIds.has(i.handoverId) && i.reviewStatus === 'APPROVED'
      );
      const approvedSources = Object.values(firestoreStore.state.sources).filter(
        (s) => accessibleIds.has(s.handoverId)
      );

      const primaryHandover =
        accessibleHandovers.find((h) => h.status === 'PUBLISHED') ||
        accessibleHandovers[0];
      const primaryProject = primaryHandover
        ? firestoreStore.state.projects[primaryHandover.projectId]
        : undefined;

      const combinedOpenAnswers: Record<string, any> = {};
      for (const h of accessibleHandovers) {
        if (h.openQuestionAnswers) {
          Object.assign(combinedOpenAnswers, h.openQuestionAnswers);
        }
      }

      const qaResult = await answerGroundedQuestion({
        question: cleanQuestion,
        approvedItems,
        approvedSources,
        geminiApiKey: geminiKey,
        contextMeta: primaryHandover
          ? {
              handoverTitle: primaryHandover.title,
              projectName: primaryProject?.name || primaryHandover.title,
              departingName:
                firestoreStore.state.users[primaryHandover.departingMemberId]?.name ||
                'Dr. Aris Thorne',
              successorName:
                firestoreStore.state.users[primaryHandover.successorId]?.name ||
                'Priya Nair',
              leaderName:
                firestoreStore.state.users[primaryHandover.createdBy]?.name ||
                'Marcus Vance',
              deadline:
                primaryHandover.deadline || primaryHandover.dateRange.endDate,
              openQuestionAnswers: combinedOpenAnswers,
            }
          : undefined,
      });

      firestoreStore.appendAuditLog({
        userId: user.uid,
        userName: user.name,
        userRole: user.role,
        action: 'QA_QUERY',
        target: 'Grounded Q&A via Dashboard Ask HandoverIQ',
        targetId: primaryHandover?.id || 'workspace',
        details: {
          question: cleanQuestion,
          grounded: qaResult.grounded,
          citationCount: qaResult.citations.length,
        },
      });

      res.json({ qaResult });
      return;
    }

    const handover = firestoreStore.state.handovers[targetParam];
    if (!handover) {
      res.status(404).json({ error: 'Handover not found.' });
      return;
    }

    if (!canUserAccessHandover(user, handover)) {
      res.status(403).json({
        error:
          'Access Denied: You do not have permission to query this handover report.',
      });
      return;
    }

    if (handover.status !== 'PUBLISHED' && user.role === 'SUCCESSOR') {
      res.status(403).json({
        error: 'Access Denied: Grounded Q&A is only available on published handover reports.',
      });
      return;
    }

    // Retrieve ONLY Approved Report Items and Cited Sources
    const approvedItems = Object.values(firestoreStore.state.reportItems).filter(
      (i) => i.handoverId === handover.id && i.reviewStatus === 'APPROVED'
    );
    const approvedSources = Object.values(firestoreStore.state.sources).filter(
      (s) => s.handoverId === handover.id
    );
    const project = firestoreStore.state.projects[handover.projectId];

    const qaResult = await answerGroundedQuestion({
      question: cleanQuestion,
      approvedItems,
      approvedSources,
      geminiApiKey: geminiKey,
      contextMeta: {
        handoverTitle: handover.title,
        projectName: project?.name || handover.title,
        departingName:
          firestoreStore.state.users[handover.departingMemberId]?.name ||
          handover.departingMemberId,
        successorName:
          firestoreStore.state.users[handover.successorId]?.name ||
          handover.successorId,
        leaderName:
          firestoreStore.state.users[handover.createdBy]?.name ||
          handover.createdBy,
        deadline: handover.deadline || handover.dateRange.endDate,
        openQuestionAnswers: handover.openQuestionAnswers,
      },
    });

    firestoreStore.appendAuditLog({
      userId: user.uid,
      userName: user.name,
      userRole: user.role,
      action: 'QA_QUERY',
      target: `Grounded Q&A on ${handover.title}`,
      targetId: handover.id,
      details: {
        question: cleanQuestion,
        grounded: qaResult.grounded,
        citationCount: qaResult.citations.length,
      },
    });

    const historyKey = `${user.uid}::${handover.id}`;
    firestoreStore.state.qaHistory = firestoreStore.state.qaHistory || {};
    const existingHistory = firestoreStore.state.qaHistory[historyKey] || [];
    firestoreStore.state.qaHistory[historyKey] = [qaResult, ...existingHistory].slice(0, 50);
    firestoreStore.save();

    res.json({ qaResult });
  } catch (err: any) {
    console.error('[QA Error]', err);
    res.status(500).json({ error: 'Grounded Q&A query failed due to an internal error.' });
  }
});

// ============================================================================
// 11. REPORT VERSION HISTORY, SERVER-SIDE PDF EXPORT & AUDIT LOGGING
// ============================================================================
app.get('/api/handovers/:id/qa-history', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const handover = firestoreStore.state.handovers[String(req.params.id)];
  if (!handover) {
    res.status(404).json({ error: 'Handover not found.' });
    return;
  }
  if (!canUserAccessHandover(user, handover)) {
    res.status(403).json({ error: 'Access Denied.' });
    return;
  }
  const historyKey = `${user.uid}::${handover.id}`;
  const history = firestoreStore.state.qaHistory?.[historyKey] || [];
  res.json({ history });
});

app.get('/api/handovers/:id/versions', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const handover = firestoreStore.state.handovers[String(req.params.id)];
  if (!handover) {
    res.status(404).json({ error: 'Handover not found.' });
    return;
  }
  if (!canUserAccessHandover(user, handover)) {
    res.status(403).json({ error: 'Access Denied.' });
    return;
  }

  let snapshots = Object.values(firestoreStore.state.handoverReports)
    .filter((r) => r.handoverId === handover.id)
    .sort((a, b) => b.version - a.version);

  let approvals = Object.values(firestoreStore.state.approvals)
    .filter((a) => a.handoverId === handover.id)
    .sort((a, b) => b.version - a.version);

  if (user.role === 'SUCCESSOR') {
    snapshots = snapshots.filter((s) => s.approvalStatus === 'APPROVED').slice(0, 1);
    approvals = approvals.filter((a) => a.status === 'APPROVED').slice(0, 1);
  }

  res.json({
    versions: snapshots,
    approvals,
    versionHistory: handover.versionHistory || [],
  });
});

app.get('/api/handovers/:id/pdf', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const handover = firestoreStore.state.handovers[String(req.params.id)];
    if (!handover) {
      res.status(404).json({ error: 'Handover not found.' });
      return;
    }
    if (!canUserAccessHandover(user, handover)) {
      res.status(403).json({
        error: 'Access Denied: You are not authorized to export this handover PDF.',
      });
      return;
    }
    if (user.role === 'SUCCESSOR' && handover.status !== 'PUBLISHED') {
      res.status(403).json({
        error: 'Access Denied: Successors can only export approved and published handover reports.',
      });
      return;
    }

    const project = firestoreStore.state.projects[handover.projectId] || null;
    const sources = Object.values(firestoreStore.state.sources).filter(
      (s) => s.handoverId === handover.id
    );

    // Use latest approved snapshot for published reports, or current items for leaders
    const approvedSnapshots = Object.values(firestoreStore.state.handoverReports)
      .filter((r) => r.handoverId === handover.id && r.approvalStatus === 'APPROVED')
      .sort((a, b) => b.version - a.version);
    const latestSnapshot = approvedSnapshots[0];

    let reportItems = latestSnapshot
      ? latestSnapshot.itemsSnapshot
      : Object.values(firestoreStore.state.reportItems).filter(
          (i) => i.handoverId === handover.id
        );

    if (user.role === 'SUCCESSOR') {
      reportItems = reportItems.filter((i) => i.reviewStatus === 'APPROVED');
    }

    const version = latestSnapshot?.version || handover.approvalSummary?.version || 1;
    const pdfBuffer = generateServerHandoverPDF({
      handover,
      project,
      reportItems,
      sources,
      usersMap: firestoreStore.state.users,
      reportVersion: version,
    });

    firestoreStore.appendAuditLog({
      userId: user.uid,
      userName: user.name,
      userRole: user.role,
      action: 'REPORT_DOWNLOAD',
      target: `Server PDF Exported: ${handover.title} (v${version})`,
      targetId: handover.id,
      details: { status: handover.status, version, serverGenerated: true },
    });

    const safeFileName = `HandoverIQ_Report_${handover.id.replace(/[^a-zA-Z0-9_-]/g, '_')}_v${version}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error('[Server PDF Export Error]', err);
    res.status(500).json({ error: 'Failed to generate server PDF report.' });
  }
});

app.post('/api/handovers/:id/pdf-log', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const handover = firestoreStore.state.handovers[String(req.params.id)];
  if (!handover) {
    res.status(404).json({ error: 'Handover not found.' });
    return;
  }
  if (!canUserAccessHandover(user, handover)) {
    res.status(403).json({ error: 'Access Denied.' });
    return;
  }

  firestoreStore.appendAuditLog({
    userId: user.uid,
    userName: user.name,
    userRole: user.role,
    action: 'REPORT_DOWNLOAD',
    target: `PDF Exported: ${handover.title}`,
    targetId: handover.id,
    details: { status: handover.status },
  });

  res.json({ logged: true });
});

// ============================================================================
// 12. INTEGRATIONS CONFIGURATION & LIVE API VERIFICATION (ADMIN)
// ============================================================================
app.get('/api/integrations', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const integrations = Object.values(firestoreStore.state.integrations);
  if (req.user!.role === 'ADMIN') {
    res.json({ integrations });
    return;
  }
  // Non-admins only need connection status, not masked credentials or internal error details
  const safeIntegrations = integrations.map((i) => ({
    id: i.id,
    name: i.name,
    provider: i.provider,
    status: i.status,
    configured: i.configured,
    accountInfo: i.accountInfo,
    lastVerifiedAt: i.lastVerifiedAt,
  }));
  res.json({ integrations: safeIntegrations });
});

app.get('/api/github/repos', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const token =
      firestoreStore.state.serverSecrets.githubToken ||
      process.env.GITHUB_PAT ||
      process.env.GITHUB_TOKEN ||
      '';
    if (!token) {
      res.status(400).json({
        error: 'GitHub PAT is not configured on the server.',
        repos: [],
      });
      return;
    }

    const repos = await listAccessibleGitHubRepositories(token);
    const account = firestoreStore.state.integrations.github?.accountInfo || null;

    firestoreStore.appendAuditLog({
      userId: req.user!.uid,
      userName: req.user!.name,
      userRole: req.user!.role,
      action: 'GITHUB_REPO_LIST',
      target: `Listed ${repos.length} accessible GitHub repositories`,
      targetId: 'github',
      details: { count: repos.length },
    });

    res.json({ account, repos });
  } catch (err: any) {
    res.status(400).json({
      error: err.message || 'Failed to list GitHub repositories.',
      repos: [],
    });
  }
});

app.post(
  '/api/integrations/:id/configure',
  requireAuth,
  requireRoles('ADMIN'),
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { credential } = req.body || {};

    if (id !== 'github' && id !== 'gemini') {
      res.status(404).json({ error: 'Integration provider not supported.' });
      return;
    }

    const trimmedCred = String(credential || '').trim();
    const integration = firestoreStore.state.integrations[id];
    const now = new Date().toISOString();

    if (!trimmedCred) {
      // Clear credential
      if (id === 'github') firestoreStore.state.serverSecrets.githubToken = '';
      if (id === 'gemini') firestoreStore.state.serverSecrets.geminiApiKey = '';
      integration.status = 'DISCONNECTED';
      integration.configured = false;
      integration.maskedCredential = '';
      integration.accountInfo = null;
      integration.errorMessage = 'Credential cleared by Administrator.';
      integration.updatedBy = req.user!.uid;
      integration.updatedAt = now;
      firestoreStore.save();
      res.json({ integration });
      return;
    }

    // Rule 10: Never mark integrations as connected without successful authentication and API verification!
    if (id === 'github') {
      const check = await verifyGitHubCredential(trimmedCred);
      firestoreStore.state.serverSecrets.githubToken = check.connected ? trimmedCred : '';
      integration.status = check.connected ? 'CONNECTED' : 'ERROR';
      integration.configured = check.connected;
      integration.maskedCredential = check.connected ? maskSecret(trimmedCred) : '';
      integration.accountInfo = check.accountInfo;
      integration.lastVerifiedAt = now;
      integration.errorMessage = check.errorMessage;
      integration.updatedBy = req.user!.uid;
      integration.updatedAt = now;
    } else if (id === 'gemini') {
      const check = await verifyGeminiCredential(trimmedCred);
      firestoreStore.state.serverSecrets.geminiApiKey = check.connected ? trimmedCred : '';
      integration.status = check.connected ? 'CONNECTED' : 'ERROR';
      integration.configured = check.connected;
      integration.maskedCredential = check.connected ? maskSecret(trimmedCred) : '';
      integration.accountInfo = check.accountInfo;
      integration.lastVerifiedAt = now;
      integration.errorMessage = check.errorMessage;
      integration.updatedBy = req.user!.uid;
      integration.updatedAt = now;
    }

    firestoreStore.save();

    firestoreStore.appendAuditLog({
      userId: req.user!.uid,
      userName: req.user!.name,
      userRole: req.user!.role,
      action: 'INTEGRATION_VERIFY',
      target: `Integration: ${integration.name}`,
      targetId: integration.id,
      details: {
        status: integration.status,
        verified: integration.configured,
      },
    });

    res.json({ integration });
  }
);

// ============================================================================
// 13. REDACTION RULES CONFIGURATION & LIVE SANDBOX TESTER
// ============================================================================
app.get('/api/redaction-rules', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  const rules = Object.values(firestoreStore.state.redactionRules);
  res.json({ rules });
});

app.post(
  '/api/redaction-rules',
  requireAuth,
  requireRoles('ADMIN'),
  (req: AuthenticatedRequest, res: Response) => {
    const { name, category, pattern, description } = req.body || {};
    const cleanName = sanitizeText(name, 120);
    const cleanPattern = typeof pattern === 'string' ? pattern.trim() : '';
    if (!cleanName || !cleanPattern) {
      res.status(400).json({ error: 'Rule name and pattern are required.' });
      return;
    }

    const id = `rule_custom_${Date.now()}`;
    const validCategories: RedactionCategory[] = [
      'API_KEY',
      'PASSWORD',
      'AUTH_TOKEN',
      'EMAIL',
      'PHONE',
      'BANK_ACCOUNT',
      'ID_NUMBER',
      'CUSTOM_KEYWORD',
      'CUSTOM_REGEX',
    ];
    const cat: RedactionCategory = validCategories.includes(category)
      ? category
      : 'CUSTOM_KEYWORD';

    if (cat !== 'CUSTOM_KEYWORD' && !isSafeRegexPattern(cleanPattern)) {
      res.status(400).json({ error: 'Invalid or unsafe regular expression pattern.' });
      return;
    }

    const newRule: RedactionRule = {
      id,
      name: cleanName,
      category: cat,
      pattern: cleanPattern.slice(0, 200),
      replacement: '[REDACTED]',
      description: sanitizeText(description, 500) || 'Custom administrator redaction rule',
      isBuiltIn: false,
      enabled: true,
      createdBy: req.user!.uid,
      createdAt: new Date().toISOString(),
    };

    firestoreStore.state.redactionRules[id] = newRule;
    firestoreStore.save();

    firestoreStore.appendAuditLog({
      userId: req.user!.uid,
      userName: req.user!.name,
      userRole: req.user!.role,
      action: 'REDACTION_RULE_CREATE',
      target: `Redaction Rule: ${newRule.name}`,
      targetId: newRule.id,
      details: { category: newRule.category },
    });

    res.status(201).json({ rule: newRule });
  }
);

app.patch(
  '/api/redaction-rules/:id',
  requireAuth,
  requireRoles('ADMIN'),
  (req: AuthenticatedRequest, res: Response) => {
    const rule = firestoreStore.state.redactionRules[String(req.params.id)];
    if (!rule) {
      res.status(404).json({ error: 'Redaction rule not found.' });
      return;
    }
    if (typeof req.body?.enabled === 'boolean') {
      rule.enabled = req.body.enabled;
    }
    if (req.body?.pattern) {
      const nextPattern = String(req.body.pattern).trim().slice(0, 200);
      if (rule.category !== 'CUSTOM_KEYWORD' && !isSafeRegexPattern(nextPattern)) {
        res.status(400).json({ error: 'Invalid or unsafe regular expression pattern.' });
        return;
      }
      rule.pattern = nextPattern;
    }
    firestoreStore.save();
    res.json({ rule });
  }
);

app.delete(
  '/api/redaction-rules/:id',
  requireAuth,
  requireRoles('ADMIN'),
  (req: AuthenticatedRequest, res: Response) => {
    const rule = firestoreStore.state.redactionRules[String(req.params.id)];
    if (!rule) {
      res.status(404).json({ error: 'Redaction rule not found.' });
      return;
    }
    if (rule.isBuiltIn) {
      res.status(400).json({
        error: 'Built-in security redaction rules cannot be deleted (they may only be toggled).',
      });
      return;
    }
    delete firestoreStore.state.redactionRules[rule.id];
    firestoreStore.save();
    res.json({ success: true });
  }
);

app.post('/api/redaction/test', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { sampleText, projectKeywords } = req.body || {};
  const rules = Object.values(firestoreStore.state.redactionRules);
  const result = redactSensitiveContent(
    String(sampleText || ''),
    rules,
    Array.isArray(projectKeywords) ? projectKeywords : []
  );
  res.json({ result });
});

// ============================================================================
// 14. AUDIT LOGS (STRICTLY APPEND-ONLY / IMMUTABLE)
// ============================================================================
app.get(
  '/api/audit-logs',
  requireAuth,
  requireRoles('ADMIN', 'TEAM_LEADER'),
  (_req: AuthenticatedRequest, res: Response) => {
    const allLogs = Object.values(firestoreStore.state.auditLogs).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    res.json({ logs: allLogs });
  }
);

// Enforce Rule 5.L: Users must not be able to modify or delete audit records!
app.put('/api/audit-logs/:id', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  res.status(403).json({
    error:
      'Security Policy Violation: Audit logs are strictly immutable and cannot be modified.',
  });
});

app.delete('/api/audit-logs/:id', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  res.status(403).json({
    error:
      'Security Policy Violation: Audit logs are strictly immutable and cannot be deleted.',
  });
});

// ============================================================================
// 15. NOTIFICATIONS
// ============================================================================
app.get('/api/notifications', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const notifications = Object.values(firestoreStore.state.notifications)
    .filter((n) => n.userId === req.user!.uid)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ notifications });
});

app.patch(
  '/api/notifications/:id/read',
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const notif = firestoreStore.state.notifications[String(req.params.id)];
    if (notif && notif.userId === req.user!.uid) {
      notif.read = true;
      firestoreStore.save();
    }
    res.json({ success: true });
  }
);

// ============================================================================
// GLOBAL ERROR HANDLER (No stack traces or internal details exposed)
// ============================================================================
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled Server Error]', err);
  if (err?.message === 'CORS policy: Origin not allowed.') {
    res.status(403).json({ error: 'Origin not allowed.' });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request payload exceeds the maximum allowed size.' });
    return;
  }
  res.status(500).json({ error: 'An unexpected internal error occurred.' });
});

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`[HandoverIQ Backend] Server listening on http://127.0.0.1:${PORT}`);
  verifyStartupIntegrations().catch(() => {});
});
