import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const SESSION_COOKIE_NAME = 'handoveriq_session';
export const CSRF_COOKIE_NAME = 'handoveriq_csrf';

const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Validates that an identifier is safe against prototype pollution and path traversal.
 */
export function isSafeId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    SAFE_ID_REGEX.test(value) &&
    !FORBIDDEN_KEYS.has(value)
  );
}

/**
 * Validates YYYY-MM-DD date strings.
 */
export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_REGEX.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed);
}

/**
 * Sanitizes user-supplied text to prevent HTML/script injection and control-character abuse
 * while preserving legitimate prose and engineering punctuation.
 */
export function sanitizeText(value: unknown, maxLength = 10000): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\0/g, '')
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?>/g, '')
    .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Basic ReDoS and syntax validation for user-supplied redaction regex patterns.
 */
export function isSafeRegexPattern(pattern: string): boolean {
  if (!pattern || pattern.length > 200) return false;
  // Reject nested quantifiers such as (a+)+, (a*)+, (a+)*, ([a-z]+)+
  if (/(\([^)]*[+*][^)]*\))[+*?]/.test(pattern)) {
    return false;
  }
  try {
    new RegExp(pattern, 'gi');
    return true;
  } catch {
    return false;
  }
}

export function isHttpsRequest(req: Request): boolean {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return req.secure || forwardedProto === 'https';
}

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const rawVal = part.slice(idx + 1).trim();
    if (!key || FORBIDDEN_KEYS.has(key)) continue;
    try {
      result[key] = decodeURIComponent(rawVal);
    } catch {
      result[key] = rawVal;
    }
  }
  return result;
}

export function setSessionCookie(
  res: Response,
  req: Request,
  token: string,
  maxAgeMs: number
): void {
  const secure = process.env.NODE_ENV === 'production' || isHttpsRequest(req);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
  });
}

export function clearSessionCookie(res: Response, req: Request): void {
  const secure = process.env.NODE_ENV === 'production' || isHttpsRequest(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
  });
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function setCsrfCookie(res: Response, req: Request, token: string): void {
  const secure = process.env.NODE_ENV === 'production' || isHttpsRequest(req);
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Readable by same-origin JS for Double-Submit Cookie header
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 1000 * 60 * 60 * 12,
  });
}

/**
 * Enforces HTTPS in production (when behind a reverse proxy or direct TLS).
 */
export function httpsEnforcementMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (process.env.NODE_ENV === 'production' && !isHttpsRequest(req)) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const host = req.headers.host;
      if (host) {
        res.redirect(301, `https://${host}${req.originalUrl}`);
        return;
      }
    }
    res.status(403).json({ error: 'HTTPS is required in production.' });
    return;
  }
  next();
}

/**
 * Applies defensive HTTP security headers to every response.
 */
export function securityHeadersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );
  if (process.env.NODE_ENV === 'production' || isHttpsRequest(req)) {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }
  next();
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

/**
 * In-memory fixed-window rate limiter middleware.
 */
export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message: string;
  keyGenerator?: (req: Request) => string;
}) {
  const buckets = new Map<string, RateLimitBucket>();

  // Periodic cleanup to prevent unbounded memory growth
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      if (now >= bucket.resetAt) {
        buckets.delete(key);
      }
    }
  }, Math.max(options.windowMs, 60_000));
  if (typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = options.keyGenerator
      ? options.keyGenerator(req)
      : req.ip || req.socket.remoteAddress || 'unknown';
    const existing = buckets.get(key);

    if (!existing || now >= existing.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (existing.count >= options.max) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000)
      );
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({ error: options.message });
      return;
    }

    existing.count += 1;
    next();
  };
}

