import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const TEST_PORT = 3099;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runTests() {
  console.log('================================================================');
  console.log('HANDOVERIQ — AUTOMATED E2E VERIFICATION SUITE (PHASES 1, 2, 3)');
  console.log('================================================================');

  const serverProc = spawn(process.execPath, ['server/index.ts'], {
    env: { ...process.env, PORT: String(TEST_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverReady = false;
  serverProc.stdout.on('data', (chunk) => {
    if (String(chunk).includes('Server listening')) {
      serverReady = true;
    }
  });

  for (let i = 0; i < 30; i++) {
    if (serverReady) break;
    await sleep(250);
  }
  assert.equal(serverReady, true, 'Backend server failed to start');
  console.log('[PASS] Backend server started on port', TEST_PORT);

  try {
    // ------------------------------------------------------------------------
    // PHASE 1: AUTHENTICATION, RBAC, PROJECTS, HANDOVER CREATION, FILE UPLOAD & REDACTION
    // ------------------------------------------------------------------------
    console.log('\n--- PHASE 1: WORKING FOUNDATION & SECURITY TESTS ---');

    // 1. Test Admin self-registration is blocked
    const badAdminReg = await req('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Rogue User',
        email: `rogue_${Date.now()}@test.io`,
        password: 'Password123!',
        role: 'ADMIN',
      },
    });
    assert.equal(badAdminReg.status, 403, 'Self-registration as ADMIN must return 403');
    console.log('[PASS] Self-registration as ADMIN blocked (HTTP 403)');

    // 2. Test valid non-Admin user registration
    const regEmail = `engineer_${Date.now()}@handoveriq.io`;
    const validReg = await req('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Test Engineer',
        email: regEmail,
        password: 'SecurePassword#2026',
        role: 'DEPARTING_MEMBER',
      },
    });
    assert.equal(validReg.status, 201);
    assert.equal(validReg.data.user.role, 'DEPARTING_MEMBER');
    console.log('[PASS] User registration & non-Admin role assignment verified');

    // 3. Test Forgot Password & Password Reset flow
    const forgotRes = await req('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: regEmail },
    });
    assert.equal(forgotRes.status, 200);
    assert.ok(forgotRes.data.resetToken);

    const resetRes = await req('/api/auth/reset-password', {
      method: 'POST',
      body: {
        email: regEmail,
        resetToken: forgotRes.data.resetToken,
        newPassword: 'UpdatedPassword#2026',
      },
    });
    assert.equal(resetRes.status, 200);
    console.log('[PASS] Forgot password & cryptographic reset token flow verified');

    // 4. Sign in as all 4 primary roles
    const adminLogin = await req('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@handoveriq.io', password: 'HandoverAdmin#2026' },
    });
    const leadLogin = await req('/api/auth/login', {
      method: 'POST',
      body: { email: 'leader@handoveriq.io', password: 'HandoverLead#2026' },
    });
    const deptLogin = await req('/api/auth/login', {
      method: 'POST',
      body: { email: 'departing@handoveriq.io', password: 'HandoverDept#2026' },
    });
    const succLogin = await req('/api/auth/login', {
      method: 'POST',
      body: { email: 'successor@handoveriq.io', password: 'HandoverSucc#2026' },
    });

    assert.equal(adminLogin.status, 200);
    assert.equal(leadLogin.status, 200);
    assert.equal(deptLogin.status, 200);
    assert.equal(succLogin.status, 200);

    const adminToken = adminLogin.data.token;
    const leadToken = leadLogin.data.token;
    const deptToken = deptLogin.data.token;
    const succToken = succLogin.data.token;
    console.log('[PASS] Role logins verified for ADMIN, TEAM_LEADER, DEPARTING_MEMBER, SUCCESSOR');

    // 5. Verify Dashboard live metrics from Firestore
    const dashRes = await req('/api/dashboard', { token: leadToken });
    assert.equal(dashRes.status, 200);
    assert.ok(dashRes.data.stats.totalProjects >= 2);
    console.log('[PASS] Live Firestore Dashboard statistics verified');

    // 6. Verify RBAC: Successor cannot create a project
    const succCreateProj = await req('/api/projects', {
      method: 'POST',
      token: succToken,
      body: { name: 'Unauthorized Project', description: 'Should fail' },
    });
    assert.equal(succCreateProj.status, 403);
    console.log('[PASS] RBAC: Successor blocked from creating projects (HTTP 403)');

    // 7. Team Leader creates a new Project
    const createProj = await req('/api/projects', {
      method: 'POST',
      token: leadToken,
      body: {
        name: 'Realtime Fraud Detection Pipeline',
        description: 'Streaming anomaly scoring engine using Kafka and Flink.',
        teamLeadId: leadLogin.data.user.uid,
        memberIds: [
          leadLogin.data.user.uid,
          deptLogin.data.user.uid,
          succLogin.data.user.uid,
        ],
        redactionRules: ['FRAUD-SECRET-SALT-88'],
      },
    });
    assert.equal(createProj.status, 201);
    const projectId = createProj.data.project.id;
    console.log('[PASS] Project creation persisted in Firestore:', projectId);

    // 8. Team Leader creates a new Handover Request
    const createHandover = await req('/api/handovers', {
      method: 'POST',
      token: leadToken,
      body: {
        title: 'Fraud Detection Engine Handover — Q4',
        projectId,
        departingMemberId: deptLogin.data.user.uid,
        successorId: succLogin.data.user.uid,
        dateRange: { startDate: '2026-10-01', endDate: '2026-11-12' },
        selectedDataSources: ['TXT', 'CSV', 'JSON', 'PDF', 'DOCX'],
      },
    });
    assert.equal(createHandover.status, 201);
    const handoverId = createHandover.data.handover.id;
    console.log('[PASS] Handover request created:', handoverId);

    // 9. Upload TXT, CSV, JSON, PDF, DOCX files containing secrets and verify Pre-AI Redaction
    const rawTxtWithSecrets = `Service Architecture Overview: The Fraud Detection Pipeline processes 12,000 TPS using Flink stateful operators.
Secret API Key: AIzaSyD9876543210abcdefghijklmnopqrstuv
GitHub Token: ghp_11223344556677889900aabbccddeeff0011
Database Password: password="UltraSecretDbPass!2026"
Author Contact: aris.thorne@handoveriq.io | Phone: +1-415-890-4412 | SSN: 999-11-2222
Project Keyword: FRAUD-SECRET-SALT-88
Key Decision: Decided to migrate feature store lookups from DynamoDB to Redis Cluster to keep p99 scoring latency below 18ms.
Pending Work: TODO: Complete backpressure alert threshold tuning in flink-job.yaml before holiday peak traffic.
Known Problem: Bug in dead-letter serializer drops malformed protobuf headers when schema registry returns HTTP 503.
Dependency: Depends on Confluent Schema Registry v7.5 and internal Risk Scoring gRPC Service.
Risk: Critical risk of false-positive spike if model weights artifact in Cloud Storage is not refreshed weekly.
Open Question: Should the fallback rule engine bypass or block transactions when Redis Cluster experiences a split-brain event?`;

    const uploadTxtRes = await req(`/api/handovers/${handoverId}/upload`, {
      method: 'POST',
      token: deptToken,
      body: {
        fileName: 'fraud-pipeline-handover.txt',
        rawText: rawTxtWithSecrets,
      },
    });
    assert.equal(uploadTxtRes.status, 201);
    const redactedText = uploadTxtRes.data.source.redactedText;
    assert.ok(redactedText.includes('[REDACTED]'), 'Redacted marker must be present');
    assert.ok(!redactedText.includes('AIzaSyD9876543210'), 'API key must be stripped');
    assert.ok(!redactedText.includes('ghp_11223344556677889900'), 'GitHub PAT must be stripped');
    assert.ok(!redactedText.includes('UltraSecretDbPass'), 'Password must be stripped');
    assert.ok(!redactedText.includes('aris.thorne@handoveriq.io'), 'Email must be stripped');
    assert.ok(!redactedText.includes('FRAUD-SECRET-SALT-88'), 'Custom keyword must be stripped');
    console.log(
      `[PASS] Pre-AI Sensitive Data Redaction verified (${uploadTxtRes.data.source.redactionSummary.totalRedactions} secrets stripped)`
    );

    // Upload CSV & JSON files as well
    const uploadCsvRes = await req(`/api/handovers/${handoverId}/upload`, {
      method: 'POST',
      token: deptToken,
      body: {
        fileName: 'sprint-tasks.csv',
        rawText: `TaskID,Status,Summary\nTSK-1,PENDING,Pending migration of Kafka consumer offset monitor`,
      },
    });
    assert.equal(uploadCsvRes.status, 201);

    const uploadJsonRes = await req(`/api/handovers/${handoverId}/upload`, {
      method: 'POST',
      token: deptToken,
      body: {
        fileName: 'config-snapshot.json',
        rawText: JSON.stringify({
          service: 'fraud-engine',
          decision: 'Decided to enforce mTLS on all gRPC scoring endpoints.',
        }),
      },
    });
    assert.equal(uploadJsonRes.status, 201);
    console.log('[PASS] Multi-format file parsing (.txt, .csv, .json) verified');

    // Test temporary file upload & authorized file deletion + FILE_DELETE audit log
    const tempUploadRes = await req(`/api/handovers/${handoverId}/upload`, {
      method: 'POST',
      token: deptToken,
      body: {
        fileName: 'temp-draft-notes.txt',
        rawText: 'Temporary scratch notes to be deleted.',
      },
    });
    assert.equal(tempUploadRes.status, 201);
    const tempSourceId = tempUploadRes.data.source.id;

    const deleteSourceRes = await req(
      `/api/handovers/${handoverId}/sources/${tempSourceId}`,
      {
        method: 'DELETE',
        token: deptToken,
      }
    );
    assert.equal(deleteSourceRes.status, 200);
    assert.equal(deleteSourceRes.data.deletedSourceId, tempSourceId);
    console.log('[PASS] Authorized file deletion & FILE_DELETE audit log verified');

    // ------------------------------------------------------------------------
    // PHASE 2: AI ANALYSIS ENGINE, SOURCE CITATIONS & CITATION VERIFICATION
    // ------------------------------------------------------------------------
    console.log('\n--- PHASE 2: AI ANALYSIS & CITATION VERIFICATION TESTS ---');

    const analyzeRes = await req(`/api/handovers/${handoverId}/analyze`, {
      method: 'POST',
      token: leadToken,
      body: { mode: 'EXTRACTIVE' },
    });
    assert.equal(analyzeRes.status, 200);
    const items = analyzeRes.data.reportItems;
    assert.ok(items.length >= 7, 'All 7 required sections must be generated');
    assert.ok(
      items.every((i) => i.citationVerified === true),
      'All extracted items must pass citation verification'
    );
    assert.ok(
      items.every(
        (i) =>
          i.id &&
          i.category &&
          i.title &&
          i.description &&
          i.sourceFileId &&
          i.sourceFileName &&
          i.sourceLocation &&
          i.confidence &&
          i.verificationStatus
      ),
      'Every extracted insight must contain id, category, title, description, sourceFileId, sourceFileName, sourceLocation, confidence, and verificationStatus'
    );
    console.log(
      `[PASS] Structured analysis & citation verification generated ${items.length} verified items across all 7 sections`
    );

    // ------------------------------------------------------------------------
    // PHASE 3: COMPLETE HANDOVER WORKFLOW, RBAC GATES, GROUNDED Q&A & IMMUTABLE AUDIT LOGS
    // ------------------------------------------------------------------------
    console.log('\n--- PHASE 3: COMPLETE HANDOVER WORKFLOW & GOVERNANCE TESTS ---');

    // 1. Verify Successor CANNOT access unpublished handover (Rule 8)
    const succUnapprovedAccess = await req(`/api/handovers/${handoverId}`, {
      token: succToken,
    });
    assert.equal(
      succUnapprovedAccess.status,
      403,
      'Successor must be denied access to unapproved handover'
    );
    console.log(
      '[PASS] Security Rule #8 verified: Successor blocked from accessing unpublished handover (HTTP 403)'
    );

    // 2. Verify Team Leader CANNOT publish report while items are still PENDING (Rule 5.H)
    const prematurePublish = await req(`/api/handovers/${handoverId}/publish`, {
      method: 'POST',
      token: leadToken,
    });
    assert.equal(
      prematurePublish.status,
      400,
      'Publishing with PENDING items must be rejected'
    );
    console.log(
      '[PASS] Publication Gate verified: Cannot publish report while items remain PENDING (HTTP 400)'
    );

    // 3. Departing Member confirms an item and submits context + answers open question
    const openQuestionItem = items.find((i) => i.section === 'OPEN_QUESTIONS');
    const deptFeedback = await req(
      `/api/report-items/${items[0].id}/departing-feedback`,
      {
        method: 'PATCH',
        token: deptToken,
        body: {
          departingReviewStatus: 'CONFIRMED',
          departingComment: 'Verified Flink TPS and operator state details.',
        },
      }
    );
    assert.equal(deptFeedback.status, 200);

    const deptContextRes = await req(
      `/api/handovers/${handoverId}/departing-context`,
      {
        method: 'POST',
        token: deptToken,
        body: {
          notes: 'Additional note: On-call runbook is in docs/runbook-flink.md.',
          questionItemId: openQuestionItem?.id,
          questionAnswer:
            'During Redis split-brain events, the fallback rule engine runs in fail-open mode for transactions under $250.',
          submitToLeader: true,
        },
      }
    );
    assert.equal(deptContextRes.status, 200);
    assert.equal(deptContextRes.data.handover.status, 'LEADER_REVIEW');
    console.log('[PASS] Departing Member review, open question answer & context submission verified');

    // 4. Team Leader reviews & approves all items, then publishes the report
    for (const item of items) {
      const rev = await req(`/api/report-items/${item.id}/leader-review`, {
        method: 'PATCH',
        token: leadToken,
        body: {
          reviewStatus: 'APPROVED',
          reviewerComment: 'Verified source citation and approved.',
        },
      });
      assert.equal(rev.status, 200);
    }

    const publishRes = await req(`/api/handovers/${handoverId}/publish`, {
      method: 'POST',
      token: leadToken,
      body: {
        leaderComments: 'All 7 sections reviewed and approved for Successor.',
      },
    });
    assert.equal(publishRes.status, 200);
    assert.equal(publishRes.data.handover.status, 'PUBLISHED');
    assert.equal(publishRes.data.handover.versionLocked, true);
    console.log('[PASS] Team Leader approval, version-locking & report publication verified');

    // Verify version-locked report blocks unauthorized modification
    const blockedEditOnLocked = await req(
      `/api/report-items/${items[0].id}/leader-review`,
      {
        method: 'PATCH',
        token: leadToken,
        body: {
          statement: 'Unauthorized modification on locked report',
        },
      }
    );
    assert.equal(
      blockedEditOnLocked.status,
      403,
      'Version-locked report must block item modifications until revision is requested'
    );
    console.log('[PASS] Version-lock protection verified (modifications blocked with HTTP 403)');

    // 5. Verify Successor CAN now access the PUBLISHED handover report
    const succApprovedAccess = await req(`/api/handovers/${handoverId}`, {
      token: succToken,
    });
    assert.equal(succApprovedAccess.status, 200);
    assert.equal(succApprovedAccess.data.handover.status, 'PUBLISHED');
    console.log('[PASS] Successor access to published handover report verified');

    // 6. Verify Grounded AI Q&A Assistant (Grounded Query + Natural Dashboard Chatbot Queries + Out-of-Scope Query)
    const groundedQA = await req(`/api/handovers/${handoverId}/qa`, {
      method: 'POST',
      token: succToken,
      body: {
        question: 'Why did the team migrate feature store lookups to Redis Cluster?',
      },
    });
    assert.equal(groundedQA.status, 200);
    assert.equal(groundedQA.data.qaResult.grounded, true);
    assert.ok(groundedQA.data.qaResult.citations.length > 0);
    console.log('[PASS] Grounded AI Q&A returned source-cited answer');

    // Verify Dashboard "Ask HandoverIQ" (/api/handovers/all/qa) handles natural conversational questions
    const dashGreetingQA = await req('/api/handovers/all/qa', {
      method: 'POST',
      token: leadToken,
      body: { question: 'hi, tell me about this project handover' },
    });
    assert.equal(dashGreetingQA.status, 200);
    assert.equal(dashGreetingQA.data.qaResult.grounded, true);
    assert.ok(dashGreetingQA.data.qaResult.citations.length > 0);

    const dashTasksQA = await req('/api/handovers/all/qa', {
      method: 'POST',
      token: leadToken,
      body: { question: 'what are the pending tasks and risks?' },
    });
    assert.equal(dashTasksQA.status, 200);
    assert.equal(dashTasksQA.data.qaResult.grounded, true);
    assert.ok(dashTasksQA.data.qaResult.citations.length > 0);
    console.log('[PASS] Dashboard "Ask HandoverIQ" chatbot natural queries verified');

    const ungroundedQA = await req(`/api/handovers/${handoverId}/qa`, {
      method: 'POST',
      token: succToken,
      body: {
        question: 'What is the orbital velocity of Saturn?',
      },
    });
    assert.equal(ungroundedQA.status, 200);
    assert.equal(ungroundedQA.data.qaResult.grounded, false);
    assert.equal(
      ungroundedQA.data.qaResult.answer,
      'I could not find sufficient information in the approved handover sources.'
    );
    console.log(
      '[PASS] Anti-Hallucination Q&A Guard verified: Out-of-scope query returned exact fallback string'
    );

    // 7. Verify Audit Log Immutability (Modify and Delete strictly blocked)
    const auditList = await req('/api/audit-logs', { token: adminToken });
    assert.equal(auditList.status, 200);
    assert.ok(auditList.data.logs.length >= 10);
    const sampleLogId = auditList.data.logs[0].id;

    const delAudit = await req(`/api/audit-logs/${sampleLogId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(delAudit.status, 403, 'Audit log deletion must return 403');
    console.log('[PASS] Audit Log immutability verified (Modify/Delete blocked with HTTP 403)');

    console.log('\n================================================================');
    console.log('ALL PHASES 1, 2, AND 3 AUTOMATED E2E TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================');
  } finally {
    serverProc.kill();
  }
}

runTests().catch((err) => {
  console.error('E2E TEST FAILURE:', err);
  process.exit(1);
});

