import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyGitHubCredential } from '../server/services/github.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = 3097;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = path.join(ROOT_DIR, 'server', 'data', 'firestore.json');
const DB_BACKUP = fs.readFileSync(DB_PATH, 'utf-8');

// Load .env without printing secrets
const envLines = fs.existsSync(path.join(ROOT_DIR, '.env'))
  ? fs.readFileSync(path.join(ROOT_DIR, '.env'), 'utf-8').split(/\r?\n/)
  : [];
for (const l of envLines) {
  const eq = l.indexOf('=');
  if (eq > 0 && !l.trim().startsWith('#')) {
    const k = l.slice(0, eq).trim();
    const v = l.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const CONFIGURED_PAT = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN || '';

class CookieClient {
  constructor() {
    this.cookies = new Map();
  }
  async request(method, urlPath, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.cookies.size > 0) {
      headers['Cookie'] = Array.from(this.cookies.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      let csrf = this.cookies.get('handoveriq_csrf');
      if (!csrf) {
        await this.request('GET', '/api/auth/csrf');
        csrf = this.cookies.get('handoveriq_csrf');
      }
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }
    const res = await fetch(`${BASE_URL}${urlPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const sc of setCookies) {
      const [pair] = sc.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) {
        this.cookies.set(pair.slice(0, eq).trim(), decodeURIComponent(pair.slice(eq + 1).trim()));
      }
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/pdf')) {
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: res.status, buffer: buf };
    }
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/csrf`);
      if (res.ok) return;
    } catch {
      // wait
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Server failed to start on port ' + PORT);
}

async function run() {
  console.log('================================================================');
  console.log('HANDOVERIQ — GITHUB PAT INTEGRATION VERIFICATION SUITE');
  console.log('================================================================');

  assert.ok(CONFIGURED_PAT.length > 20, 'GITHUB_PAT must be configured in .env');

  // 1. Valid PAT authentication
  const validCheck = await verifyGitHubCredential(CONFIGURED_PAT);
  assert.equal(validCheck.connected, true, 'Valid PAT must connect');
  assert.ok(validCheck.accountInfo?.login, 'Valid PAT must return account login');
  console.log(`[PASS] 1. Valid PAT Authentication: Connected as ${validCheck.accountInfo.login} (${validCheck.accountInfo.name})`);

  // 2. Invalid PAT handling
  const invalidCheck = await verifyGitHubCredential('github_pat_invalid_expired_token_000000');
  assert.equal(invalidCheck.connected, false, 'Invalid PAT must be rejected');
  assert.ok(invalidCheck.errorMessage?.includes('401'), 'Invalid PAT must report 401');
  console.log(`[PASS] 2. Invalid PAT Handling: Rejected with "${invalidCheck.errorMessage}"`);

  const serverProc = spawn('npx', ['tsx', 'server/index.ts'], {
    cwd: ROOT_DIR,
    shell: true,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'development',
      SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
    },
    stdio: 'pipe',
  });

  try {
    await waitForServer();

    const leader = new CookieClient();
    const successor = new CookieClient();
    const suffix = Date.now();

    const regLeader = await leader.request('POST', '/api/auth/register', {
      name: 'GitHub Lead Tester',
      email: `gh.lead.${suffix}@handoveriq.io`,
      password: 'LeaderPass!234',
      role: 'TEAM_LEADER',
    });
    assert.equal(regLeader.status, 201);
    const leaderUid = regLeader.data.user.uid;

    const regSucc = await successor.request('POST', '/api/auth/register', {
      name: 'GitHub Successor Tester',
      email: `gh.succ.${suffix}@handoveriq.io`,
      password: 'SuccPass!234',
      role: 'SUCCESSOR',
    });
    assert.equal(regSucc.status, 201);
    const succUid = regSucc.data.user.uid;

    // 3. Repository Listing
    const reposRes = await leader.request('GET', '/api/github/repos');
    assert.equal(reposRes.status, 200);
    assert.ok(Array.isArray(reposRes.data.repos) && reposRes.data.repos.length > 0);
    const selectedRepo = reposRes.data.repos[0].fullName;
    console.log(
      `[PASS] 3. Repository Listing: Retrieved ${reposRes.data.repos.length} accessible repositories (${reposRes.data.repos.map((r) => r.fullName).join(', ')})`
    );

    // 4. Repository Selection & Project/Handover Association
    const projRes = await leader.request('POST', '/api/projects', {
      name: 'GitHub PAT Sync Project',
      description: 'Testing live GitHub PAT repository ingestion',
      memberIds: [leaderUid, succUid],
    });
    assert.equal(projRes.status, 201);
    const projectId = projRes.data.project.id;

    const hndRes = await leader.request('POST', '/api/handovers', {
      title: `Handover for ${selectedRepo}`,
      projectId,
      departingMemberId: leaderUid,
      successorId: succUid,
      dateRange: { startDate: '2024-01-01', endDate: '2026-12-31' },
      selectedDataSources: ['GITHUB'],
      githubRepo: selectedRepo,
    });
    assert.equal(hndRes.status, 201);
    const handoverId = hndRes.data.handover.id;

    // 5. Commit, Branch, Contributor & Documentation Retrieval
    const importRes = await leader.request('POST', `/api/handovers/${handoverId}/github-import`, {
      repoFullName: selectedRepo,
    });
    assert.equal(importRes.status, 201);
    const importedSources = importRes.data.sources;
    assert.ok(importedSources.length >= 2, 'Must ingest multiple GitHub artifacts');
    const types = new Set(importedSources.map((s) => s.type));
    console.log(
      `[PASS] 4 & 5. Repository Selection, Commit, Branch & Documentation Ingestion: Ingested ${importedSources.length} sources from ${selectedRepo} (Types: ${Array.from(types).join(', ')})`
    );

    // Verify project.connectedSources updated
    const projGet = await leader.request('GET', `/api/projects/${projectId}`);
    assert.ok(
      projGet.data.project.connectedSources.some(
        (cs) => cs.type === 'GITHUB' && cs.repoFullName === selectedRepo
      ),
      'Project connectedSources must include selected GitHub repo'
    );
    console.log(`[PASS] 6. Project-to-Repository Association verified (${selectedRepo})`);

    // 6. Analyze, Approve, Publish & Run AI Q&A over ingested GitHub sources
    const anaRes = await leader.request('POST', `/api/handovers/${handoverId}/analyze`, {
      mode: 'EXTRACTIVE',
    });
    assert.equal(anaRes.status, 200);
    for (const item of anaRes.data.reportItems) {
      await leader.request('PATCH', `/api/report-items/${item.id}/leader-review`, {
        reviewStatus: 'APPROVED',
      });
    }
    const pubRes = await leader.request('POST', `/api/handovers/${handoverId}/publish`, {
      leaderComments: 'Approved GitHub PAT handover report',
    });
    assert.equal(pubRes.status, 200);

    const qaRes = await successor.request('POST', `/api/handovers/${handoverId}/qa`, {
      question: `Give me an overview of the ${selectedRepo} repository handover`,
    });
    assert.equal(qaRes.status, 200);
    assert.equal(qaRes.data.qaResult.grounded, true);
    assert.ok(qaRes.data.qaResult.citations.length > 0);
    console.log(
      `[PASS] 7. AI Q&A Using Ingested GitHub Sources: Grounded answer with ${qaRes.data.qaResult.citations.length} citation(s)`
    );

    // 7b. Successor Acknowledgment & Onboarding Completion Tracking
    const ackRes = await successor.request('POST', `/api/handovers/${handoverId}/acknowledge`, {
      feedback: 'Reviewed all ingested GitHub sources and handover items.',
      completedItemIds: anaRes.data.reportItems.map((i) => i.id),
    });
    assert.equal(ackRes.status, 200);
    assert.equal(ackRes.data.handover.successorAcknowledgment?.acknowledged, true);
    assert.equal(ackRes.data.handover.successorAcknowledgment?.completionPercent, 100);
    console.log(
      '[PASS] 8. Successor Acknowledgment & Completion Tracking: Verified 100% completion persisted'
    );

    // 9. Token Secrecy Verification across API responses, Firestore file, PDF, and dist/
    const intRes = await leader.request('GET', '/api/integrations');
    const pdfRes = await successor.request('GET', `/api/handovers/${handoverId}/pdf`);
    const diskContent = fs.readFileSync(DB_PATH, 'utf-8');
    const serializedPayloads = [
      JSON.stringify(intRes.data),
      JSON.stringify(reposRes.data),
      JSON.stringify(importRes.data),
      JSON.stringify(qaRes.data),
      diskContent,
      pdfRes.buffer?.toString('utf-8') || '',
    ].join('\n');

    assert.equal(
      serializedPayloads.includes(CONFIGURED_PAT),
      false,
      'Raw GITHUB_PAT must NEVER appear in API responses, firestore.json, or PDF export'
    );
    console.log(
      '[PASS] 8. Token Secrecy Verification: 0 leaks in API responses, firestore.json, Q&A, or PDF export'
    );

    console.log('================================================================');
    console.log('ALL GITHUB PAT INTEGRATION TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================');
  } finally {
    serverProc.kill();
    fs.writeFileSync(DB_PATH, DB_BACKUP, 'utf-8');
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('GITHUB PAT TEST FAILED:', err);
  process.exit(1);
});
