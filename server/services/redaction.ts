import type { RedactionRule } from '../../src/types/index.ts';

export interface RedactionResult {
  redactedText: string;
  totalRedactions: number;
  categories: string[];
  rulesMatched: string[];
  matches: {
    ruleName: string;
    category: string;
    count: number;
  }[];
}

export const DEFAULT_REDACTION_RULES: Omit<RedactionRule, 'id' | 'createdAt'>[] = [
  {
    name: 'Cloud & AI API Keys (Google, OpenAI, AWS, Stripe)',
    category: 'API_KEY',
    pattern: '(?:AIza[0-9A-Za-z\\-_]{20,}|sk-[A-Za-z0-9\\-_]{16,}|AKIA[0-9A-Z]{16}|rk_live_[0-9a-zA-Z]{16,}|sk_live_[0-9a-zA-Z]{16,}|(?:api[_-]?key|apikey)\\s*[:=]\\s*["\']?[A-Za-z0-9_\\-]{12,}["\']?)',
    replacement: '[REDACTED]',
    description: 'Detects Google Gemini/Cloud keys, OpenAI keys, AWS Access Key IDs, Stripe keys, and generic api_key assignments.',
    isBuiltIn: true,
    enabled: true,
    createdBy: 'system',
  },
  {
    name: 'GitHub & Slack Access Tokens',
    category: 'AUTH_TOKEN',
    pattern: '(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[0-9A-Za-z\\-]{10,}|Bearer\\s+[A-Za-z0-9\\-_]+\\.[A-Za-z0-9\\-_]+\\.[A-Za-z0-9\\-_]+|eyJ[A-Za-z0-9_\\-]{10,}\\.eyJ[A-Za-z0-9_\\-]{10,}\\.[A-Za-z0-9_\\-]{10,}|(?:auth[_-]?token|access[_-]?token|secret[_-]?key|client[_-]?secret)\\s*[:=]\\s*["\']?[A-Za-z0-9_\\-.$]{8,}["\']?)',
    replacement: '[REDACTED]',
    description: 'Detects GitHub PATs, Slack tokens, Bearer JWTs, and token/secret key-value pairs.',
    isBuiltIn: true,
    enabled: true,
    createdBy: 'system',
  },
  {
    name: 'Passwords & Connection String Credentials',
    category: 'PASSWORD',
    pattern: '(?:(?:(?:db_|admin_|redis_)?(?:password|passwd|pwd)\\s*[:=]\\s*)+(?:"[^"\\r\\n]+"|\'[^\'\\r\\n]+\'|[^\\s"\',;\\r\\n]{4,})|://[^:\\s]+:[^@\\s]+@)',
    replacement: '[REDACTED]',
    description: 'Detects plaintext password assignments and credentials embedded inside database URI connection strings.',
    isBuiltIn: true,
    enabled: true,
    createdBy: 'system',
  },
  {
    name: 'Email Addresses',
    category: 'EMAIL',
    pattern: '\\b[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}\\b',
    replacement: '[REDACTED]',
    description: 'Detects standard RFC 5322 email addresses to protect personal and client PII.',
    isBuiltIn: true,
    enabled: true,
    createdBy: 'system',
  },
  {
    name: 'Phone Numbers (International & Local)',
    category: 'PHONE',
    pattern: '(?:\\+\\d{1,3}[\\s.\\-]?)?(?:\\(\\d{3}\\)|\\d{3})[\\s.\\-]\\d{3}[\\s.\\-]\\d{4}\\b|\\+\\d{1,3}[\\s.\\-]?\\d{9,11}\\b',
    replacement: '[REDACTED]',
    description: 'Detects formatted North American and international phone numbers.',
    isBuiltIn: true,
    enabled: true,
    createdBy: 'system',
  },
  {
    name: 'Bank Account, IBAN & Payment Card Numbers',
    category: 'BANK_ACCOUNT',
    pattern: '\\b(?:[A-Z]{2}\\d{2}[A-Z0-9]{11,30}|(?:\\d{4}[\\s\\-]?){3}\\d{4}|(?:account[_\\s-]?number|acct[_\\s-]?no|routing[_\\s-]?number)\\s*[:=#]?\\s*\\d{8,17})\\b',
    replacement: '[REDACTED]',
    description: 'Detects IBAN numbers, 16-digit payment card numbers, and explicit bank account/routing numbers.',
    isBuiltIn: true,
    enabled: true,
    createdBy: 'system',
  },
  {
    name: 'Government & National Identification Numbers (SSN / Tax / National ID)',
    category: 'ID_NUMBER',
    pattern: '\\b(?:\\d{3}-\\d{2}-\\d{4}|[A-Z]{5}\\d{4}[A-Z]|(?:ssn|tax[_\\s-]?id|national[_\\s-]?id|passport[_\\s-]?no)\\s*[:=#]?\\s*[A-Z0-9\\-]{6,15})\\b',
    replacement: '[REDACTED]',
    description: 'Detects SSNs (XXX-XX-XXXX), PAN/Tax IDs, and labeled identification numbers.',
    isBuiltIn: true,
    enabled: true,
    createdBy: 'system',
  },
];

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redactSensitiveContent(
  rawText: string,
  globalRules: RedactionRule[],
  projectKeywords: string[] = []
): RedactionResult {
  if (!rawText) {
    return {
      redactedText: '',
      totalRedactions: 0,
      categories: [],
      rulesMatched: [],
      matches: [],
    };
  }

  let output = rawText;
  let totalRedactions = 0;
  const categoriesSet = new Set<string>();
  const rulesMatchedSet = new Set<string>();
  const matchesList: { ruleName: string; category: string; count: number }[] = [];

  const activeRules = globalRules.filter((r) => r.enabled);

  for (const rule of activeRules) {
    try {
      const regex =
        rule.category === 'CUSTOM_KEYWORD'
          ? new RegExp(`\\b${escapeRegExp(rule.pattern)}\\b`, 'gi')
          : new RegExp(rule.pattern, 'gi');

      let matchCount = 0;
      output = output.replace(regex, () => {
        matchCount += 1;
        return '[REDACTED]';
      });

      if (matchCount > 0) {
        totalRedactions += matchCount;
        categoriesSet.add(rule.category);
        rulesMatchedSet.add(rule.name);
        matchesList.push({
          ruleName: rule.name,
          category: rule.category,
          count: matchCount,
        });
      }
    } catch {
      // Fallback literal match if custom regex is malformed
      const escaped = escapeRegExp(rule.pattern);
      const fallbackRegex = new RegExp(escaped, 'gi');
      let matchCount = 0;
      output = output.replace(fallbackRegex, () => {
        matchCount += 1;
        return '[REDACTED]';
      });
      if (matchCount > 0) {
        totalRedactions += matchCount;
        categoriesSet.add(rule.category);
        rulesMatchedSet.add(rule.name);
        matchesList.push({
          ruleName: rule.name,
          category: rule.category,
          count: matchCount,
        });
      }
    }
  }

  // Apply project-specific custom confidential keywords
  for (const kw of projectKeywords) {
    const trimmed = kw.trim();
    if (!trimmed) continue;
    const regex = new RegExp(escapeRegExp(trimmed), 'gi');
    let matchCount = 0;
    output = output.replace(regex, () => {
      matchCount += 1;
      return '[REDACTED]';
    });
    if (matchCount > 0) {
      totalRedactions += matchCount;
      categoriesSet.add('CUSTOM_KEYWORD');
      const label = `Project Keyword: ${trimmed}`;
      rulesMatchedSet.add(label);
      matchesList.push({
        ruleName: label,
        category: 'CUSTOM_KEYWORD',
        count: matchCount,
      });
    }
  }

  return {
    redactedText: output,
    totalRedactions,
    categories: Array.from(categoriesSet),
    rulesMatched: Array.from(rulesMatchedSet),
    matches: matchesList,
  };
}
