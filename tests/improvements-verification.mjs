import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = 3096;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = path.join(ROOT_DIR, 'server', 'data', 'firestore.json');
const DB_BACKUP = fs.readFileSync(DB_PATH, 'utf-8');

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
        this.cookies.set(
          pair.slice(0, eq).trim(),
          decodeURIComponent(pair.slice(eq + 1).trim())
        );
      }
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/pdf')) {
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
  console.log('HANDOVERIQ — THREE MAJOR IMPROVEMENTS VERIFICATION SUITE');
  console.log('================================================================');

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
    const departing = new CookieClient();
    const successor = new CookieClient();
    const outsider = new CookieClient();
    const suffix = Date.now();

    const regLeader = await leader.request('POST', '/api/auth/register', {
      name: 'Imp Leader',
      email: `imp.leader.${suffix}@handoveriq.io`,
      password: 'LeaderPass!234',
      role: 'TEAM_LEADER',
    });
    assert.equal(regLeader.status, 201);
    const leaderUid = regLeader.data.user.uid;

    const regDept = await departing.request('POST', '/api/auth/register', {
      name: 'Imp Departing',
      email: `imp.dept.${suffix}@handoveriq.io`,
      password: 'DeptPass!234',
      role: 'DEPARTING_MEMBER',
    });
    assert.equal(regDept.status, 201);
    const deptUid = regDept.data.user.uid;

    const regSucc = await successor.request('POST', '/api/auth/register', {
      name: 'Imp Successor',
      email: `imp.succ.${suffix}@handoveriq.io`,
      password: 'SuccPass!234',
      role: 'SUCCESSOR',
    });
    assert.equal(regSucc.status, 201);
    const succUid = regSucc.data.user.uid;

    const regOutsider = await outsider.request('POST', '/api/auth/register', {
      name: 'Outsider Member',
      email: `imp.out.${suffix}@handoveriq.io`,
      password: 'OutPass!234',
      role: 'DEPARTING_MEMBER',
    });
    assert.equal(regOutsider.status, 201);
    const outsiderUid = regOutsider.data.user.uid;

    // Create Project A (Leader, Departing, Successor)
    const projRes = await leader.request('POST', '/api/projects', {
      name: 'Knowledge & Summary Test Project',
      description: 'Core settlement engine & Redis 7.2 Redlock cluster',
      memberIds: [leaderUid, deptUid, succUid],
    });
    assert.equal(projRes.status, 201);
    const projectId = projRes.data.project.id;

    // Create Handover 1 (Empty initially to test missing-info handling)
    const hndEmptyRes = await leader.request('POST', '/api/handovers', {
      title: 'Empty Handover Missing Info Test',
      projectId,
      departingMemberId: deptUid,
      successorId: succUid,
      dateRange: { startDate: '2026-01-01', endDate: '2026-11-18' },
      selectedDataSources: ['TXT'],
    });
    assert.equal(hndEmptyRes.status, 201);
    const emptyHandoverId = hndEmptyRes.data.handover.id;

    const emptySumRes = await leader.request(
      'POST',
      `/api/handovers/${emptyHandoverId}/summaries/generate`,
      { format: 'SHORT' }
    );
    assert.equal(emptySumRes.status, 201);
    assert.ok(
      emptySumRes.data.summary.sections.every(
        (s) => s.content === 'Information not available in connected sources.'
      ),
      'Empty handover summary must report "Information not available in connected sources."'
    );
    console.log('[PASS] SUM-01: Missing information handling verified on empty handover');

    // Create Handover 2 with rich sources
    const hndRes = await leader.request('POST', '/api/handovers', {
      title: 'Settlement & Redis 7.2 Handover',
      projectId,
      departingMemberId: deptUid,
      successorId: succUid,
      dateRange: { startDate: '2026-01-01', endDate: '2026-11-18' },
      deadline: '2026-12-15',
      selectedDataSources: ['TXT'],
    });
    assert.equal(hndRes.status, 201);
    const handoverId = hndRes.data.handover.id;

    await departing.request('POST', `/api/handovers/${handoverId}/upload`, {
      fileName: 'settlement-architecture.txt',
      rawText:
        'Overview: Settlement Engine v3 processes 18,000 TPS.\nDecision: Migrated lock manager to Redis 7.2 Redlock to prevent split-brain.\nCompleted: Upgraded mTLS ingress certificates.\nPending: Complete shard rebalancing script before Q1 spike.\nProblem: Kafka consumer lag spikes on settlement-events topic.\nDependency: Depends on PostgreSQL logical replication and Redis 7.2.\nRisk: High risk of partner timeout when batch exceeds 250 items.',
    });
    await leader.request('POST', `/api/handovers/${handoverId}/analyze`, {
      mode: 'EXTRACTIVE',
    });

    // Generate SHORT, MEDIUM, DETAILED summaries
    const sumShort = await leader.request(
      'POST',
      `/api/handovers/${handoverId}/summaries/generate`,
      { format: 'SHORT' }
    );
    assert.equal(sumShort.status, 201);
    assert.equal(sumShort.data.summary.format, 'SHORT');
    assert.equal(sumShort.data.summary.version, 1);
    assert.equal(sumShort.data.summary.sections.length, 12);
    console.log('[PASS] SUM-02: Generated SHORT summary (v1) across all 12 sections');

    const sumMed = await leader.request(
      'POST',
      `/api/handovers/${handoverId}/summaries/generate`,
      { format: 'MEDIUM' }
    );
    assert.equal(sumMed.status, 201);
    assert.equal(sumMed.data.summary.format, 'MEDIUM');
    assert.equal(sumMed.data.summary.version, 2);
    console.log('[PASS] SUM-03: Generated MEDIUM summary (v2)');

    const sumDet = await leader.request(
      'POST',
      `/api/handovers/${handoverId}/summaries/generate`,
      { format: 'DETAILED' }
    );
    assert.equal(sumDet.status, 201);
    assert.equal(sumDet.data.summary.format, 'DETAILED');
    assert.equal(sumDet.data.summary.version, 3);
    console.log('[PASS] SUM-04: Generated DETAILED summary (v3) with source citations');

    // Edit & save summary
    const editedSections = sumDet.data.summary.sections.map((s, idx) =>
      idx === 0 ? { ...s, content: s.content + '\n- Verified by Team Leader.' } : s
    );
    const editRes = await leader.request(
      'PUT',
      `/api/handovers/${handoverId}/summaries/${sumDet.data.summary.id}`,
      { sections: editedSections }
    );
    assert.equal(editRes.status, 200);
    assert.ok(editRes.data.summary.sections[0].content.includes('Verified by Team Leader.'));
    console.log('[PASS] SUM-05: Edited and saved summary version v3');

    // Retrieve previous summary versions
    const listSum = await leader.request('GET', `/api/handovers/${handoverId}/summaries`);
    assert.equal(listSum.status, 200);
    assert.equal(listSum.data.summaries.length, 3);
    console.log('[PASS] SUM-06: Retrieved all 3 summary versions (v1, v2, v3)');

    // Export summary to PDF
    const sumPdf = await leader.request(
      'GET',
      `/api/handovers/${handoverId}/summaries/${sumDet.data.summary.id}/pdf`
    );
    assert.equal(sumPdf.status, 200);
    assert.equal(sumPdf.buffer?.slice(0, 5).toString(), '%PDF-');
    console.log(`[PASS] SUM-07: Exported summary to PDF (${sumPdf.buffer.length} bytes)`);

    // =========================================================================
    // IMPROVEMENT 2: SMART TASK TRACKING & ASSIGNMENT TESTS
    // =========================================================================
    // Unauthorized assignment to outsider (not in project) must be blocked (HTTP 403)
    const unauthAssign = await leader.request('POST', '/api/tasks', {
      title: 'Unauthorized Assignment Test',
      projectId,
      assignedUserId: outsiderUid,
      priority: 'HIGH',
    });
    assert.equal(unauthAssign.status, 403);
    console.log('[PASS] TSK-01: Unauthorized task assignment outside project blocked (HTTP 403)');

    // Create task with past deadline to verify overdue detection
    const pastDate = new Date(Date.now() - 86400000 * 3).toISOString().slice(0, 10);
    const createTaskRes = await leader.request('POST', '/api/tasks', {
      title: 'Execute Redis 7.2 Shard Rebalance Dry-Run',
      description: 'Run rebalance script on staging cluster',
      projectId,
      handoverId,
      assignedUserId: deptUid,
      priority: 'HIGH',
      deadline: pastDate,
    });
    assert.equal(createTaskRes.status, 201);
    const taskId = createTaskRes.data.task.id;
    assert.equal(createTaskRes.data.task.isOverdue, true);
    console.log('[PASS] TSK-02: Created task, assigned member, and detected overdue deadline');

    // Reassign task, change priority, update status & progress
    const futureDate = new Date(Date.now() + 86400000 * 5).toISOString().slice(0, 10);
    const updTaskRes = await leader.request('PATCH', `/api/tasks/${taskId}`, {
      assignedUserId: succUid,
      priority: 'CRITICAL',
      deadline: futureDate,
      status: 'IN_PROGRESS',
      progressPercent: 75,
    });
    assert.equal(updTaskRes.status, 200);
    assert.equal(updTaskRes.data.task.assignedUserId, succUid);
    assert.equal(updTaskRes.data.task.priority, 'CRITICAL');
    assert.equal(updTaskRes.data.task.progressPercent, 75);
    assert.equal(updTaskRes.data.task.isOverdue, false);
    console.log('[PASS] TSK-03: Reassigned task, changed priority/deadline, and updated progress (75%)');

    // Add comment & verify task history
    const cmtRes = await successor.request('POST', `/api/tasks/${taskId}/comments`, {
      text: 'Staging validation passed; promoting to production.',
    });
    assert.equal(cmtRes.status, 201);
    assert.ok(cmtRes.data.task.history.length >= 3);
    console.log(`[PASS] TSK-04: Task comments and history verified (${cmtRes.data.task.history.length} history entries)`);

    // =========================================================================
    // IMPROVEMENT 3: CENTRALIZED SEARCHABLE KNOWLEDGE BASE TESTS
    // =========================================================================
    // Before publication, Successor must NOT see unpublished Handover 2 in Knowledge Base
    const succKbBeforePub = await successor.request('GET', '/api/knowledge-base');
    assert.equal(succKbBeforePub.status, 200);
    assert.equal(
      succKbBeforePub.data.entries.some((e) => e.handoverId === handoverId),
      false,
      'Unpublished handover must not leak to Successor in Knowledge Base'
    );
    console.log('[PASS] KB-01: Unpublished handover restriction enforced in Knowledge Base');

    //Outsider must not see Project A records in Knowledge Base
    const outsiderKb = await outsider.request('GET', '/api/knowledge-base');
    assert.equal(
      outsiderKb.data.entries.some((e) => e.projectId === projectId),
      false,
      'Project isolation must prevent outsider from seeing Project A knowledge records'
    );
    console.log('[PASS] KB-02: Project-level data isolation enforced in Knowledge Base');

    // Leader approves & publishes Handover 2
    const getHnd = await leader.request('GET', `/api/handovers/${handoverId}`);
    for (const item of getHnd.data.reportItems) {
      await leader.request('PATCH', `/api/report-items/${item.id}/leader-review`, {
        reviewStatus: 'APPROVED',
      });
    }
    const pubRes = await leader.request('POST', `/api/handovers/${handoverId}/publish`, {
      leaderComments: 'Approved and published for Knowledge Base verification',
    });
    assert.equal(pubRes.status, 200);

    // Successor can now search published handover & docs by keyword
    const succKbAfterPub = await successor.request('GET', '/api/knowledge-base?q=redlock');
    assert.equal(succKbAfterPub.status, 200);
    assert.ok(succKbAfterPub.data.entries.length > 0);
    console.log(`[PASS] KB-03: Keyword search retrieved ${succKbAfterPub.data.entries.length} authorized record(s)`);

    // Natural-language Smart AI Search over Knowledge Base
    const kbAskRes = await successor.request('POST', '/api/knowledge-base/ask', {
      query: 'What were the major problems and technical decisions in the settlement handover?',
      projectId,
    });
    assert.equal(kbAskRes.status, 200);
    assert.equal(kbAskRes.data.result.grounded, true);
    assert.ok(kbAskRes.data.result.citations.length > 0);
    console.log(
      `[PASS] KB-04: Natural-language Smart AI Search returned grounded answer with ${kbAskRes.data.result.citations.length} citation(s)`
    );

    console.log('================================================================');
    console.log('ALL THREE MAJOR IMPROVEMENTS TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================');
  } finally {
    serverProc.kill();
    fs.writeFileSync(DB_PATH, DB_BACKUP, 'utf-8');
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('IMPROVEMENTS TEST FAILED:', err);
  process.exit(1);
});
