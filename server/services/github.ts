import type { SourceDocType } from '../../src/types/index.ts';

export interface RawGitHubIngestedItem {
  type: SourceDocType;
  title: string;
  url: string;
  author: string;
  timestamp: string;
  rawText: string;
  metadata: Record<string, any>;
}

export interface GitHubRepositorySummary {
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
}

export interface GitHubVerificationResult {
  connected: boolean;
  accountInfo: {
    login: string;
    name: string;
    avatarUrl: string;
    htmlUrl: string;
    scopes: string;
    rateLimitRemaining?: number;
  } | null;
  errorMessage: string | null;
}

function buildGitHubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'HandoverIQ-Enterprise-Platform/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

function formatGitHubError(status: number, headers: Headers, errBody: any, context: string): string {
  const remaining = headers.get('x-ratelimit-remaining');
  const resetEpoch = headers.get('x-ratelimit-reset');
  if ((status === 403 || status === 429) && remaining === '0') {
    const resetTime = resetEpoch
      ? new Date(Number(resetEpoch) * 1000).toISOString()
      : 'soon';
    return `GitHub API rate limit exceeded during ${context}. Rate limit resets at ${resetTime}.`;
  }
  if (status === 401) {
    return `GitHub authentication failed (401): Token is invalid, expired, or revoked.`;
  }
  if (status === 403) {
    return `GitHub permission denied (403) during ${context}: Token lacks required repository read permissions (${errBody?.message || 'Forbidden'}).`;
  }
  if (status === 404) {
    return `GitHub resource not found (404) during ${context}: Verify the repository exists and the PAT has read access.`;
  }
  return `GitHub API returned ${status} during ${context}: ${errBody?.message || 'Request failed'}`;
}

export async function verifyGitHubCredential(token: string): Promise<GitHubVerificationResult> {
  if (!token || !token.trim()) {
    return {
      connected: false,
      accountInfo: null,
      errorMessage: 'No GitHub OAuth / Personal Access Token provided.',
    };
  }

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: buildGitHubHeaders(token),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      return {
        connected: false,
        accountInfo: null,
        errorMessage: formatGitHubError(response.status, response.headers, errBody, 'PAT verification'),
      };
    }

    const userData: any = await response.json();
    const scopes =
      response.headers.get('x-oauth-scopes') ||
      (token.trim().startsWith('github_pat_') ? 'fine-grained-pat (repo:read)' : 'pat');
    const remaining = Number(response.headers.get('x-ratelimit-remaining') || '5000');

    return {
      connected: true,
      accountInfo: {
        login: userData.login,
        name: userData.name || userData.login,
        avatarUrl: userData.avatar_url || '',
        htmlUrl: userData.html_url || `https://github.com/${userData.login}`,
        scopes,
        rateLimitRemaining: remaining,
      },
      errorMessage: null,
    };
  } catch (err: any) {
    return {
      connected: false,
      accountInfo: null,
      errorMessage: `Failed to reach GitHub API: ${err.message}`,
    };
  }
}

export async function listAccessibleGitHubRepositories(
  token?: string
): Promise<GitHubRepositorySummary[]> {
  if (!token || !token.trim()) {
    throw new Error('GitHub PAT is not configured on the server.');
  }

  const response = await fetch(
    'https://api.github.com/user/repos?per_page=50&sort=updated&direction=desc&affiliation=owner,collaborator,organization_member',
    {
      headers: buildGitHubHeaders(token),
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(formatGitHubError(response.status, response.headers, errBody, 'repository listing'));
  }

  const repos: any[] = await response.json();
  return repos.map((r) => ({
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    owner: r.owner?.login || '',
    private: Boolean(r.private),
    defaultBranch: r.default_branch || 'main',
    description: r.description || '',
    language: r.language || null,
    updatedAt: r.updated_at || new Date().toISOString(),
    htmlUrl: r.html_url || `https://github.com/${r.full_name}`,
  }));
}

export async function fetchGitHubRepositoryData(params: {
  repoFullName: string;
  token?: string;
  startDate?: string;
  endDate?: string;
}): Promise<RawGitHubIngestedItem[]> {
  const { repoFullName, token, startDate, endDate } = params;
  const cleanedRepo = repoFullName
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cleanedRepo)) {
    throw new Error(
      `Invalid GitHub repository identifier "${repoFullName}". Expected format: "owner/repo".`
    );
  }

  const headers = buildGitHubHeaders(token);

  // 0. Verify repository exists & fetch repository details + contributors
  const repoResp = await fetch(`https://api.github.com/repos/${cleanedRepo}`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (!repoResp.ok) {
    const errJson: any = await repoResp.json().catch(() => ({}));
    throw new Error(
      formatGitHubError(repoResp.status, repoResp.headers, errJson, `repository ${cleanedRepo}`)
    );
  }
  const repoData: any = await repoResp.json();
  const items: RawGitHubIngestedItem[] = [];

  // Contributors
  let contributorsLine = 'None listed';
  try {
    const contribResp = await fetch(
      `https://api.github.com/repos/${cleanedRepo}/contributors?per_page=15`,
      { headers, signal: AbortSignal.timeout(8000) }
    );
    if (contribResp.ok) {
      const contribs: any[] = await contribResp.json();
      if (Array.isArray(contribs) && contribs.length > 0) {
        contributorsLine = contribs
          .slice(0, 10)
          .map((c) => `${c.login} (${c.contributions} commits)`)
          .join(', ');
      }
    }
  } catch {
    // non-fatal
  }

  items.push({
    type: 'FILE_TXT',
    title: `Repository Overview & Contributors: ${cleanedRepo}`,
    url: repoData.html_url || `https://github.com/${cleanedRepo}`,
    author: repoData.owner?.login || cleanedRepo.split('/')[0],
    timestamp: repoData.updated_at || new Date().toISOString(),
    rawText: [
      `GitHub Repository Overview: ${cleanedRepo}`,
      `Description: ${repoData.description || 'No description provided.'}`,
      `Primary Language: ${repoData.language || 'Multi-language'}`,
      `Default Branch: ${repoData.default_branch || 'main'}`,
      `Visibility: ${repoData.private ? 'Private' : 'Public'}`,
      `Open Issues Count: ${repoData.open_issues_count ?? 0}`,
      `Contributors: ${contributorsLine}`,
      `Topics: ${Array.isArray(repoData.topics) && repoData.topics.length > 0 ? repoData.topics.join(', ') : 'None'}`,
    ].join('\n'),
    metadata: {
      repo: cleanedRepo,
      defaultBranch: repoData.default_branch || 'main',
      language: repoData.language || null,
      contributors: contributorsLine,
    },
  });

  // 1. Fetch README Documentation
  try {
    const readmeResp = await fetch(`https://api.github.com/repos/${cleanedRepo}/readme`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (readmeResp.ok) {
      const readmeJson: any = await readmeResp.json();
      const decodedReadme = readmeJson.content
        ? Buffer.from(String(readmeJson.content).replace(/\s/g, ''), 'base64')
            .toString('utf-8')
            .slice(0, 6000)
        : '';
      if (decodedReadme.trim()) {
        items.push({
          type: 'FILE_TXT',
          title: `README Documentation (${readmeJson.name || 'README.md'})`,
          url: readmeJson.html_url || `https://github.com/${cleanedRepo}#readme`,
          author: repoData.owner?.login || cleanedRepo.split('/')[0],
          timestamp: repoData.updated_at || new Date().toISOString(),
          rawText: `GitHub Repository README (${cleanedRepo}/${readmeJson.name || 'README.md'}):\n${decodedReadme}`,
          metadata: {
            repo: cleanedRepo,
            path: readmeJson.path || 'README.md',
            sha: readmeJson.sha,
          },
        });
      }
    }
  } catch {
    // README optional
  }

  // 2. Fetch Authorized Markdown Documentation (top-level .md files or docs/ folder)
  try {
    const contentsResp = await fetch(`https://api.github.com/repos/${cleanedRepo}/contents`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (contentsResp.ok) {
      const entries: any[] = await contentsResp.json();
      if (Array.isArray(entries)) {
        const docFiles = entries
          .filter(
            (e) =>
              e.type === 'file' &&
              /\.(md|txt)$/i.test(e.name) &&
              !/^readme/i.test(e.name) &&
              (e.size || 0) <= 120000
          )
          .slice(0, 3);
        for (const df of docFiles) {
          const fileResp = await fetch(df.url, { headers, signal: AbortSignal.timeout(6000) });
          if (fileResp.ok) {
            const fileJson: any = await fileResp.json();
            const text = fileJson.content
              ? Buffer.from(String(fileJson.content).replace(/\s/g, ''), 'base64')
                  .toString('utf-8')
                  .slice(0, 4000)
              : '';
            if (text.trim()) {
              items.push({
                type: 'FILE_TXT',
                title: `Repo Documentation: ${df.path}`,
                url: df.html_url || `https://github.com/${cleanedRepo}/blob/${repoData.default_branch || 'main'}/${df.path}`,
                author: repoData.owner?.login || cleanedRepo.split('/')[0],
                timestamp: repoData.updated_at || new Date().toISOString(),
                rawText: `Documentation File ${df.path} in ${cleanedRepo}:\n${text}`,
                metadata: { repo: cleanedRepo, path: df.path },
              });
            }
          }
        }
      }
    }
  } catch {
    // Non-fatal
  }

  // 3. Fetch Commits (with fallback to latest commits if date range is empty)
  const commitUrl = new URL(`https://api.github.com/repos/${cleanedRepo}/commits`);
  commitUrl.searchParams.set('per_page', '15');
  if (startDate) commitUrl.searchParams.set('since', new Date(startDate).toISOString());
  if (endDate) {
    const endIso = new Date(`${endDate}T23:59:59Z`).toISOString();
    commitUrl.searchParams.set('until', endIso);
  }

  let commits: any[] = [];
  const commitsResp = await fetch(commitUrl.toString(), { headers, signal: AbortSignal.timeout(8000) });
  if (commitsResp.ok) {
    commits = await commitsResp.json();
  }
  if (!Array.isArray(commits) || commits.length === 0) {
    const fallbackCommitsResp = await fetch(
      `https://api.github.com/repos/${cleanedRepo}/commits?per_page=15`,
      { headers, signal: AbortSignal.timeout(8000) }
    );
    if (fallbackCommitsResp.ok) {
      commits = await fallbackCommitsResp.json();
    }
  }

  if (Array.isArray(commits)) {
    for (const c of commits.slice(0, 12)) {
      const shaShort = String(c.sha || '').slice(0, 7);
      const authorName = c.commit?.author?.name || c.author?.login || 'Unknown Author';
      const authorEmail = c.commit?.author?.email || '';
      const commitDate = c.commit?.author?.date || new Date().toISOString();
      const message = c.commit?.message || 'No commit message';

      items.push({
        type: 'GITHUB_COMMIT',
        title: `Commit ${shaShort}: ${message.split('\n')[0].slice(0, 90)}`,
        url: c.html_url || `https://github.com/${cleanedRepo}/commit/${c.sha}`,
        author: authorName,
        timestamp: commitDate,
        rawText: `GitHub Commit ${c.sha} in ${cleanedRepo}\nAuthor: ${authorName} ${
          authorEmail ? `<${authorEmail}>` : ''
        }\nTimestamp: ${commitDate}\nMessage:\n${message}`,
        metadata: {
          repo: cleanedRepo,
          sha: c.sha,
          shortSha: shaShort,
          authorLogin: c.author?.login || null,
        },
      });
    }
  }

  // 4. Fetch Pull Requests
  const pullsResp = await fetch(
    `https://api.github.com/repos/${cleanedRepo}/pulls?state=all&per_page=10&sort=updated&direction=desc`,
    { headers, signal: AbortSignal.timeout(8000) }
  );
  if (pullsResp.ok) {
    const pulls: any[] = await pullsResp.json();
    for (const pr of pulls.slice(0, 8)) {
      const author = pr.user?.login || 'Unknown Author';
      const ts = pr.updated_at || pr.created_at || new Date().toISOString();
      const stateLabel = pr.merged_at ? 'MERGED' : String(pr.state || 'open').toUpperCase();
      const bodyText = pr.body ? pr.body.slice(0, 2000) : 'No description provided.';

      items.push({
        type: 'GITHUB_PR',
        title: `PR #${pr.number} [${stateLabel}]: ${pr.title}`,
        url: pr.html_url || `https://github.com/${cleanedRepo}/pull/${pr.number}`,
        author,
        timestamp: ts,
        rawText: `GitHub Pull Request #${pr.number} in ${cleanedRepo}\nTitle: ${pr.title}\nState: ${stateLabel}\nAuthor: ${author}\nBase Branch: ${pr.base?.ref || 'main'} <- Head Branch: ${pr.head?.ref || 'feature'}\nCreated: ${pr.created_at}\nUpdated: ${ts}\nDescription:\n${bodyText}`,
        metadata: {
          repo: cleanedRepo,
          prNumber: pr.number,
          state: stateLabel,
          baseBranch: pr.base?.ref,
          headBranch: pr.head?.ref,
        },
      });
    }
  }

  // 5. Fetch Issues (excluding Pull Requests)
  const issuesResp = await fetch(
    `https://api.github.com/repos/${cleanedRepo}/issues?state=all&per_page=15&sort=updated&direction=desc`,
    { headers, signal: AbortSignal.timeout(8000) }
  );
  if (issuesResp.ok) {
    const issues: any[] = await issuesResp.json();
    for (const issue of issues.filter((i) => !i.pull_request).slice(0, 8)) {
      const author = issue.user?.login || 'Unknown Author';
      const ts = issue.updated_at || issue.created_at || new Date().toISOString();
      const stateLabel = String(issue.state || 'open').toUpperCase();
      const labels = Array.isArray(issue.labels)
        ? issue.labels.map((l: any) => l.name).join(', ')
        : '';
      const bodyText = issue.body ? issue.body.slice(0, 2000) : 'No issue body provided.';

      items.push({
        type: 'GITHUB_ISSUE',
        title: `Issue #${issue.number} [${stateLabel}]: ${issue.title}`,
        url: issue.html_url || `https://github.com/${cleanedRepo}/issues/${issue.number}`,
        author,
        timestamp: ts,
        rawText: `GitHub Issue #${issue.number} in ${cleanedRepo}\nTitle: ${issue.title}\nState: ${stateLabel}\nLabels: ${labels || 'None'}\nAuthor: ${author}\nUpdated: ${ts}\nDetails:\n${bodyText}`,
        metadata: {
          repo: cleanedRepo,
          issueNumber: issue.number,
          state: stateLabel,
          labels,
        },
      });
    }
  }

  // 6. Fetch Branches
  const branchesResp = await fetch(
    `https://api.github.com/repos/${cleanedRepo}/branches?per_page=15`,
    { headers, signal: AbortSignal.timeout(8000) }
  );
  if (branchesResp.ok) {
    const branches: any[] = await branchesResp.json();
    if (branches.length > 0) {
      const branchSummaryLines = branches.map(
        (b: any) =>
          `- Branch "${b.name}" (HEAD Commit SHA: ${String(b.commit?.sha || '').slice(0, 7)}, Protected: ${Boolean(b.protected)})`
      );
      items.push({
        type: 'GITHUB_BRANCH',
        title: `Repository Branches Overview (${branches.length} branches in ${cleanedRepo})`,
        url: `https://github.com/${cleanedRepo}/branches`,
        author: cleanedRepo.split('/')[0],
        timestamp: new Date().toISOString(),
        rawText: `GitHub Repository Branch Structure for ${cleanedRepo}:\n${branchSummaryLines.join('\n')}`,
        metadata: {
          repo: cleanedRepo,
          branchCount: branches.length,
          branches: branches.map((b: any) => ({
            name: b.name,
            sha: b.commit?.sha,
            protected: b.protected,
          })),
        },
      });
    }
  }

  // 7. Fetch Pull Request Review Comments
  const commentsResp = await fetch(
    `https://api.github.com/repos/${cleanedRepo}/pulls/comments?per_page=10&sort=created&direction=desc`,
    { headers, signal: AbortSignal.timeout(8000) }
  );
  if (commentsResp.ok) {
    const comments: any[] = await commentsResp.json();
    for (const rc of comments.slice(0, 6)) {
      const author = rc.user?.login || 'Reviewer';
      const ts = rc.created_at || new Date().toISOString();
      items.push({
        type: 'GITHUB_REVIEW',
        title: `PR Review Comment by ${author} on ${rc.path || 'file'}`,
        url: rc.html_url || `https://github.com/${cleanedRepo}/pulls`,
        author,
        timestamp: ts,
        rawText: `GitHub Pull Request Code Review Comment in ${cleanedRepo}\nReviewer: ${author}\nFile Path: ${rc.path || 'N/A'}\nTimestamp: ${ts}\nComment:\n${rc.body || ''}`,
        metadata: {
          repo: cleanedRepo,
          commentId: rc.id,
          path: rc.path,
          pullRequestUrl: rc.pull_request_url,
        },
      });
    }
  }

  return items;
}
