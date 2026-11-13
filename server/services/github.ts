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

export interface GitHubVerificationResult {
  connected: boolean;
  accountInfo: {
    login: string;
    name: string;
    avatarUrl: string;
    htmlUrl: string;
    scopes: string;
  } | null;
  errorMessage: string | null;
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
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token.trim()}`,
        'User-Agent': 'HandoverIQ-Enterprise-Platform/1.0',
      },
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      return {
        connected: false,
        accountInfo: null,
        errorMessage: `GitHub API returned ${response.status}: ${errBody.message || response.statusText}`,
      };
    }

    const userData: any = await response.json();
    const scopes = response.headers.get('x-oauth-scopes') || 'fine-grained-pat';

    return {
      connected: true,
      accountInfo: {
        login: userData.login,
        name: userData.name || userData.login,
        avatarUrl: userData.avatar_url || '',
        htmlUrl: userData.html_url || `https://github.com/${userData.login}`,
        scopes,
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

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'HandoverIQ-Enterprise-Platform/1.0',
  };
  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  // Verify repository exists and is accessible
  const repoResp = await fetch(`https://api.github.com/repos/${cleanedRepo}`, { headers });
  if (!repoResp.ok) {
    const errJson: any = await repoResp.json().catch(() => ({}));
    throw new Error(
      `GitHub API Error (${repoResp.status}) for ${cleanedRepo}: ${
        errJson.message || repoResp.statusText
      }`
    );
  }

  const items: RawGitHubIngestedItem[] = [];

  // 1. Fetch Commits (with commit timestamps & author info)
  const commitUrl = new URL(`https://api.github.com/repos/${cleanedRepo}/commits`);
  commitUrl.searchParams.set('per_page', '15');
  if (startDate) commitUrl.searchParams.set('since', new Date(startDate).toISOString());
  if (endDate) {
    const endIso = new Date(`${endDate}T23:59:59Z`).toISOString();
    commitUrl.searchParams.set('until', endIso);
  }

  const commitsResp = await fetch(commitUrl.toString(), { headers });
  if (commitsResp.ok) {
    const commits: any[] = await commitsResp.json();
    for (const c of commits.slice(0, 12)) {
      const shaShort = String(c.sha || '').slice(0, 7);
      const authorName =
        c.commit?.author?.name || c.author?.login || 'Unknown Author';
      const authorEmail = c.commit?.author?.email || '';
      const commitDate =
        c.commit?.author?.date || new Date().toISOString();
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

  // 2. Fetch Pull Requests
  const pullsResp = await fetch(
    `https://api.github.com/repos/${cleanedRepo}/pulls?state=all&per_page=10&sort=updated&direction=desc`,
    { headers }
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

  // 3. Fetch Issues (excluding Pull Requests)
  const issuesResp = await fetch(
    `https://api.github.com/repos/${cleanedRepo}/issues?state=all&per_page=15&sort=updated&direction=desc`,
    { headers }
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

  // 4. Fetch Branches
  const branchesResp = await fetch(
    `https://api.github.com/repos/${cleanedRepo}/branches?per_page=15`,
    { headers }
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

  // 5. Fetch Pull Request Review Comments
  const commentsResp = await fetch(
    `https://api.github.com/repos/${cleanedRepo}/pulls/comments?per_page=10&sort=created&direction=desc`,
    { headers }
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

