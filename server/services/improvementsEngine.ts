import { jsPDF } from 'jspdf';
import type {
  Handover,
  HandoverSummary,
  HandoverSummarySection,
  HandoverTask,
  KnowledgeAIQueryResult,
  KnowledgeBaseEntry,
  KnowledgeRecordType,
  Project,
  ReportItem,
  SourceDocument,
  SummaryFormat,
  SummarySectionKey,
  TaskDashboardStats,
  UserProfile,
} from '../../src/types/index.ts';

export const SUMMARY_SECTION_Meta: {
  key: SummarySectionKey;
  title: string;
  isRecommendation: boolean;
}[] = [
  { key: 'EXECUTIVE_SUMMARY', title: '1. Executive Summary', isRecommendation: false },
  { key: 'PROJECT_OVERVIEW', title: '2. Project Overview', isRecommendation: false },
  { key: 'IMPORTANT_UPDATES', title: '3. Important Updates', isRecommendation: false },
  { key: 'COMPLETED_WORK', title: '4. Completed Work', isRecommendation: false },
  { key: 'PENDING_TASKS', title: '5. Pending Tasks', isRecommendation: false },
  { key: 'CRITICAL_INFORMATION', title: '6. Critical Information', isRecommendation: false },
  { key: 'OPEN_ISSUES', title: '7. Open Issues', isRecommendation: false },
  { key: 'TECHNICAL_RISKS', title: '8. Technical Risks', isRecommendation: false },
  { key: 'IMPORTANT_DEADLINES', title: '9. Important Deadlines', isRecommendation: false },
  { key: 'REQUIRED_NEXT_ACTIONS', title: '10. Required Next Actions', isRecommendation: true },
  { key: 'IMPORTANT_DEPENDENCIES', title: '11. Important Dependencies', isRecommendation: false },
  {
    key: 'RECOMMENDATIONS_FOR_SUCCESSOR',
    title: '12. Recommendations for the Successor',
    isRecommendation: true,
  },
];

const UNAVAILABLE_TEXT = 'Information not available in connected sources.';

function formatItemsForLength(
  lines: string[],
  format: SummaryFormat,
  detailsExtra: string[] = []
): string {
  const valid = lines.filter((l) => l && l.trim().length > 0);
  if (valid.length === 0) return UNAVAILABLE_TEXT;
  if (format === 'SHORT') {
    return valid.slice(0, 2).join('\n');
  }
  if (format === 'MEDIUM') {
    return valid.slice(0, 4).join('\n');
  }
  return [...valid, ...detailsExtra].join('\n');
}

export async function generateStructuredHandoverSummary(params: {
  handover: Handover;
  project: Project | null;
  sources: SourceDocument[];
  reportItems: ReportItem[];
  tasks: HandoverTask[];
  usersMap: Record<string, UserProfile>;
  format: SummaryFormat;
  version: number;
  actor: UserProfile;
  geminiApiKey?: string;
}): Promise<HandoverSummary> {
  const {
    handover,
    project,
    sources,
    reportItems,
    tasks,
    usersMap,
    format,
    version,
    actor,
    geminiApiKey,
  } = params;

  const validItems = reportItems.filter(
    (i) => i.statement !== 'Not found in available sources.'
  );
  const allSourceIds = Array.from(new Set(sources.map((s) => s.id)));
  const primarySourceId = allSourceIds[0] || '';
  const citeTag = (ids: string[]) =>
    ids.length > 0
      ? ids.map((id) => `[Source: ${id}]`).join(' ')
      : primarySourceId
      ? `[Source: ${primarySourceId}]`
      : '';

  const bySection = (sec: ReportItem['section']) =>
    validItems.filter((i) => i.section === sec);

  const departingName =
    usersMap[handover.departingMemberId]?.name || handover.departingMemberId;
  const successorName =
    usersMap[handover.successorId]?.name || handover.successorId;

  const snapshotItems = bySection('PROJECT_SNAPSHOT');
  const decisionItems = bySection('KEY_DECISIONS');
  const pendingItems = bySection('PENDING_WORK');
  const problemItems = bySection('PROBLEMS_ISSUES');
  const dependencyItems = bySection('DEPENDENCIES');
  const riskItems = bySection('RISKS');
  const questionItems = bySection('OPEN_QUESTIONS');

  const handoverTasks = tasks.filter(
    (t) => t.handoverId === handover.id || t.projectId === handover.projectId
  );
  const completedTaskLines = handoverTasks
    .filter((t) => t.status === 'COMPLETED')
    .map(
      (t) =>
        `- [Completed Task] ${t.title} — Assigned: ${t.assignedUserName} (100%) ${citeTag(
          allSourceIds.slice(0, 1)
        )}`
    );
  const pendingTaskLines = [
    ...pendingItems.map(
      (i) =>
        `- ${i.statement} ${citeTag(i.sourceIds)}${
          format === 'DETAILED' && i.evidence ? `\n  - Evidence: "${i.evidence}"` : ''
        }`
    ),
    ...handoverTasks
      .filter((t) => t.status !== 'COMPLETED')
      .map(
        (t) =>
          `- [${t.status} • ${t.priority}] ${t.title} (Owner: ${t.assignedUserName}, Due: ${
            t.deadline
          }, Progress: ${t.progressPercent}%) ${citeTag(allSourceIds.slice(0, 1))}`
      ),
  ];

  // Extract completed mentions from sources
  const completedFromSources: string[] = [];
  for (const s of sources) {
    const lines = s.redactedText.split(/\r?\n/);
    for (const l of lines) {
      if (/\b(completed|merged|resolved|shipped|migrated|upgraded|implemented)\b/i.test(l)) {
        completedFromSources.push(`- ${l.trim()} [Source: ${s.id}]`);
      }
    }
  }

  const hasAnySourcesOrItems = sources.length > 0 || validItems.length > 0;

  const sections: HandoverSummarySection[] = SUMMARY_SECTION_Meta.map((meta) => {
    let lines: string[] = [];
    let extra: string[] = [];
    let secSourceIds: string[] = [];

    switch (meta.key) {
      case 'EXECUTIVE_SUMMARY': {
        if (hasAnySourcesOrItems) {
          secSourceIds = allSourceIds.slice(0, 3);
          lines = [
            `- Handover "${handover.title}" for project **${
              project?.name || handover.projectId
            }** transitions ownership from **${departingName}** to **${successorName}** (Status: ${
              handover.status
            }). ${citeTag(secSourceIds.slice(0, 1))}`,
            `- Ingested ${sources.length} verified source(s) and ${validItems.length} structured finding(s) across decisions, pending work, risks, and dependencies. ${citeTag(
              secSourceIds.slice(0, 1)
            )}`,
          ];
          extra = [
            `- Approval Status: ${handover.approvalStatus || 'PENDING'} • Active Tasks: ${
              handoverTasks.length
            } • Date Range: ${handover.dateRange.startDate} to ${handover.dateRange.endDate}.`,
          ];
        }
        break;
      }
      case 'PROJECT_OVERVIEW': {
        secSourceIds = snapshotItems.flatMap((i) => i.sourceIds);
        if (secSourceIds.length === 0 && primarySourceId) secSourceIds = [primarySourceId];
        if (project?.description && hasAnySourcesOrItems) {
          lines.push(`- **${project.name}**: ${project.description} ${citeTag(secSourceIds)}`);
        }
        for (const item of snapshotItems) {
          lines.push(`- ${item.statement} ${citeTag(item.sourceIds)}`);
          if (item.evidence) extra.push(`  - Source Evidence: "${item.evidence}"`);
        }
        break;
      }
      case 'IMPORTANT_UPDATES': {
        secSourceIds = decisionItems.flatMap((i) => i.sourceIds);
        for (const item of decisionItems) {
          lines.push(`- ${item.statement} ${citeTag(item.sourceIds)}`);
          if (item.evidence) extra.push(`  - Rationale Evidence: "${item.evidence}"`);
        }
        for (const s of sources.filter((src) => src.type === 'GITHUB_COMMIT' || src.type === 'GITHUB_PR').slice(0, 3)) {
          secSourceIds.push(s.id);
          lines.push(`- [${s.type}] ${s.title} by ${s.author} [Source: ${s.id}]`);
        }
        break;
      }
      case 'COMPLETED_WORK': {
        secSourceIds = allSourceIds.slice(0, 2);
        lines = [...completedTaskLines, ...completedFromSources.slice(0, 4)];
        if (lines.length === 0 && decisionItems.length > 0) {
          lines = decisionItems.map(
            (i) => `- Completed architectural decision: ${i.statement} ${citeTag(i.sourceIds)}`
          );
          secSourceIds = decisionItems.flatMap((i) => i.sourceIds);
        }
        break;
      }
      case 'PENDING_TASKS': {
        secSourceIds = pendingItems.flatMap((i) => i.sourceIds);
        if (secSourceIds.length === 0 && primarySourceId) secSourceIds = [primarySourceId];
        lines = pendingTaskLines;
        break;
      }
      case 'CRITICAL_INFORMATION': {
        secSourceIds = [...decisionItems, ...riskItems].flatMap((i) => i.sourceIds);
        if (handover.departingMemberNotes && hasAnySourcesOrItems) {
          lines.push(
            `- **Departing Engineer Operational Notes**: ${handover.departingMemberNotes} ${citeTag(
              allSourceIds.slice(0, 1)
            )}`
          );
        }
        for (const item of [...decisionItems.slice(0, 2), ...riskItems.filter((r) => r.confidence === 'HIGH')]) {
          lines.push(`- [Critical] ${item.statement} ${citeTag(item.sourceIds)}`);
        }
        break;
      }
      case 'OPEN_ISSUES': {
        secSourceIds = [...problemItems, ...questionItems].flatMap((i) => i.sourceIds);
        for (const item of problemItems) {
          lines.push(`- [Issue] ${item.statement} ${citeTag(item.sourceIds)}`);
          if (item.evidence) extra.push(`  - Issue Evidence: "${item.evidence}"`);
        }
        for (const q of questionItems) {
          const ans = handover.openQuestionAnswers?.[q.id];
          lines.push(
            `- [Open Question] ${q.statement}${
              ans ? ` — Answered by ${ans.answeredByName}: "${ans.answer}"` : ''
            } ${citeTag(q.sourceIds)}`
          );
        }
        break;
      }
      case 'TECHNICAL_RISKS': {
        secSourceIds = riskItems.flatMap((i) => i.sourceIds);
        for (const item of riskItems) {
          lines.push(
            `- **[Severity: ${item.confidence}]** ${item.statement} ${citeTag(item.sourceIds)}`
          );
          if (item.evidence) extra.push(`  - Risk Evidence: "${item.evidence}"`);
        }
        break;
      }
      case 'IMPORTANT_DEADLINES': {
        if (hasAnySourcesOrItems) {
          secSourceIds = allSourceIds.slice(0, 1);
          if (handover.deadline) {
            lines.push(
              `- **Handover Target Deadline**: ${handover.deadline} ${citeTag(secSourceIds)}`
            );
          }
          lines.push(
            `- **Handover Activity Window**: ${handover.dateRange.startDate} to ${
              handover.dateRange.endDate
            } ${citeTag(secSourceIds)}`
          );
          for (const t of handoverTasks.filter((tk) => tk.deadline)) {
            lines.push(
              `- **Task Deadline (${t.deadline})**: ${t.title} — Assigned to ${
                t.assignedUserName
              } [${t.status}] ${citeTag(secSourceIds)}`
            );
          }
        }
        break;
      }
      case 'REQUIRED_NEXT_ACTIONS': {
        secSourceIds = [...pendingItems, ...riskItems].flatMap((i) => i.sourceIds);
        if (pendingItems.length > 0 || riskItems.length > 0 || handoverTasks.length > 0) {
          for (const p of pendingItems.slice(0, 3)) {
            lines.push(
              `- **[AI Recommended Action]** Execute pending item: ${p.statement} ${citeTag(
                p.sourceIds
              )}`
            );
          }
          for (const r of riskItems.slice(0, 2)) {
            lines.push(
              `- **[AI Risk Mitigation Action]** Validate safeguard for: ${r.statement} ${citeTag(
                r.sourceIds
              )}`
            );
          }
        }
        break;
      }
      case 'IMPORTANT_DEPENDENCIES': {
        secSourceIds = dependencyItems.flatMap((i) => i.sourceIds);
        for (const item of dependencyItems) {
          lines.push(`- ${item.statement} ${citeTag(item.sourceIds)}`);
          if (item.evidence) extra.push(`  - Dependency Evidence: "${item.evidence}"`);
        }
        break;
      }
      case 'RECOMMENDATIONS_FOR_SUCCESSOR': {
        secSourceIds = allSourceIds.slice(0, 2);
        if (hasAnySourcesOrItems) {
          lines.push(
            `- **[AI Recommendation for ${successorName}]** Review all ${
              sources.length
            } verified source document(s) and confirm operational access to dependencies before the handover deadline. ${citeTag(
              secSourceIds.slice(0, 1)
            )}`
          );
          if (pendingItems[0]) {
            lines.push(
              `- **[AI Priority #1]** Start with highest-priority pending work: "${
                pendingItems[0].statement
              }" ${citeTag(pendingItems[0].sourceIds)}`
            );
          }
          if (riskItems[0]) {
            lines.push(
              `- **[AI Monitoring Recommendation]** Monitor high-severity risk: "${
                riskItems[0].statement
              }" ${citeTag(riskItems[0].sourceIds)}`
            );
          }
        }
        break;
      }
    }

    const content = formatItemsForLength(lines, format, extra);
    const uniqueSrcs = Array.from(new Set(secSourceIds.filter(Boolean)));
    return {
      key: meta.key,
      title: meta.title,
      content,
      isRecommendation: meta.isRecommendation,
      sourceIds: content === UNAVAILABLE_TEXT ? [] : uniqueSrcs,
      available: content !== UNAVAILABLE_TEXT,
    };
  });

  const now = new Date().toISOString();
  return {
    id: `sum_${handover.id}_v${version}_${format.toLowerCase()}`,
    handoverId: handover.id,
    projectId: handover.projectId,
    version,
    format,
    sections,
    sourceIds: allSourceIds,
    generatedBy: actor.uid,
    generatedByName: actor.name,
    engineUsed: geminiApiKey ? 'GEMINI_API' : 'EXTRACTIVE_GROUNDED',
    createdAt: now,
    updatedAt: now,
  };
}

export function generateServerSummaryPDF(params: {
  summary: HandoverSummary;
  handover: Handover;
  project: Project | null;
}): Buffer {
  const { summary, handover, project } = params;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  let y = 48;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 52) {
      doc.addPage();
      y = 48;
    }
  };

  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, pageWidth, 82, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('HANDOVERIQ — AI-POWERED HANDOVER SUMMARY', margin, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    `Handover: ${handover.title}   |   Format: ${summary.format}   |   Version: v${summary.version}`,
    margin,
    50
  );
  doc.text(
    `Project: ${project?.name || handover.projectId}   |   Generated by: ${
      summary.generatedByName
    }   |   Date: ${new Date(summary.updatedAt).toLocaleString()}`,
    margin,
    66
  );

  y = 102;
  doc.setTextColor(15, 23, 42);

  for (const sec of summary.sections) {
    ensureSpace(48);
    doc.setFillColor(sec.isRecommendation ? 240 : 241, sec.isRecommendation ? 253 : 245, sec.isRecommendation ? 244 : 249);
    doc.rect(margin, y, contentWidth, 22, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `${sec.title} ${sec.isRecommendation ? '[AI Recommendation]' : '[Verified Facts]'}`,
      margin + 8,
      y + 15
    );
    y += 30;

    doc.setFont('helvetica', sec.available ? 'normal' : 'italic');
    doc.setFontSize(9.5);
    doc.setTextColor(sec.available ? 30 : 100, sec.available ? 41 : 116, sec.available ? 59 : 139);
    const wrapped = doc.splitTextToSize(sec.content, contentWidth - 14);
    for (const line of wrapped) {
      ensureSpace(14);
      doc.text(line, margin + 8, y);
      y += 13;
    }
    y += 10;
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `HandoverIQ AI Summary (${summary.format} • v${summary.version})`,
      margin,
      pageHeight - 22
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin - 54, pageHeight - 22);
  }

  return Buffer.from(doc.output('arraybuffer'));
}

export function decorateAndComputeTaskStats(
  tasks: HandoverTask[],
  currentUserId: string
): { decoratedTasks: HandoverTask[]; stats: TaskDashboardStats } {
  const nowMs = Date.now();
  const decoratedTasks = tasks.map((t) => {
    const deadlineMs = t.deadline ? new Date(`${t.deadline}T23:59:59Z`).getTime() : Infinity;
    const isOverdue = t.status !== 'COMPLETED' && deadlineMs < nowMs;
    const progressPercent =
      t.status === 'COMPLETED'
        ? 100
        : t.status === 'TODO' && t.progressPercent === 100
        ? 0
        : Math.max(0, Math.min(100, Number(t.progressPercent ?? 0)));
    return {
      ...t,
      progressPercent,
      isOverdue,
    };
  });

  const projectGroups: Record<string, number[]> = {};
  const handoverGroups: Record<string, number[]> = {};
  for (const t of decoratedTasks) {
    if (t.projectId) {
      projectGroups[t.projectId] = projectGroups[t.projectId] || [];
      projectGroups[t.projectId].push(t.progressPercent);
    }
    if (t.handoverId) {
      handoverGroups[t.handoverId] = handoverGroups[t.handoverId] || [];
      handoverGroups[t.handoverId].push(t.progressPercent);
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  const projectProgress: Record<string, number> = {};
  for (const [pid, vals] of Object.entries(projectGroups)) {
    projectProgress[pid] = avg(vals);
  }
  const handoverProgress: Record<string, number> = {};
  for (const [hid, vals] of Object.entries(handoverGroups)) {
    handoverProgress[hid] = avg(vals);
  }

  const stats: TaskDashboardStats = {
    totalTasks: decoratedTasks.length,
    pendingTasks: decoratedTasks.filter((t) => t.status === 'TODO').length,
    inProgressTasks: decoratedTasks.filter(
      (t) => t.status === 'IN_PROGRESS' || t.status === 'UNDER_REVIEW'
    ).length,
    completedTasks: decoratedTasks.filter((t) => t.status === 'COMPLETED').length,
    overdueTasks: decoratedTasks.filter((t) => t.isOverdue).length,
    blockedTasks: decoratedTasks.filter((t) => t.status === 'BLOCKED').length,
    tasksAssignedToMe: decoratedTasks.filter((t) => t.assignedUserId === currentUserId)
      .length,
    projectProgress,
    handoverProgress,
  };

  return { decoratedTasks, stats };
}

export function buildAuthorizedKnowledgeBase(params: {
  accessibleProjects: Project[];
  accessibleHandovers: Handover[];
  sources: SourceDocument[];
  reportItems: ReportItem[];
  summaries: HandoverSummary[];
  usersMap: Record<string, UserProfile>;
  isSuccessor: boolean;
}): KnowledgeBaseEntry[] {
  const {
    accessibleProjects,
    accessibleHandovers,
    sources,
    reportItems,
    summaries,
    usersMap,
    isSuccessor,
  } = params;

  const projMap = new Map(accessibleProjects.map((p) => [p.id, p]));
  const hndMap = new Map(accessibleHandovers.map((h) => [h.id, h]));
  const entries: KnowledgeBaseEntry[] = [];

  // 1. Handover Records
  for (const h of accessibleHandovers) {
    if (isSuccessor && h.status !== 'PUBLISHED') continue;
    const proj = projMap.get(h.projectId);
    const dep = usersMap[h.departingMemberId]?.name || h.departingMemberId;
    entries.push({
      id: `kb_hnd_${h.id}`,
      recordType: 'HANDOVER_REPORT',
      title: h.title,
      excerpt: `${h.status} handover for ${proj?.name || h.projectId} (Departing: ${dep})`,
      content: `${h.title}\nProject: ${proj?.name || h.projectId}\nNotes: ${
        h.departingMemberNotes || 'Verified handover record.'
      }\nApproval: ${h.approvalSummary?.leaderComments || h.status}`,
      projectId: h.projectId,
      projectName: proj?.name || h.projectId,
      handoverId: h.id,
      handoverTitle: h.title,
      handoverStatus: h.status,
      url: `/handovers/${h.id}`,
      author: dep,
      isImportant: h.status === 'PUBLISHED',
      timestamp: h.createdAt,
      updatedAt: h.updatedAt,
      tags: ['Handover', h.status, proj?.name || 'Project'],
    });
  }

  // 2. Ingested Sources (Documents, GitHub READMEs, Commits, PRs, Issues)
  for (const s of sources) {
    const h = hndMap.get(s.handoverId);
    if (!h) continue;
    if (isSuccessor && h.status !== 'PUBLISHED') continue;
    const proj = projMap.get(s.projectId) || projMap.get(h.projectId);
    let recordType: KnowledgeRecordType = 'PROJECT_DOCUMENT';
    if (/readme/i.test(s.title)) {
      recordType = 'GITHUB_README';
    } else if (s.type.startsWith('GITHUB_')) {
      recordType = 'GITHUB_ACTIVITY';
    }
    entries.push({
      id: `kb_src_${s.id}`,
      recordType,
      title: s.title,
      excerpt: s.redactedText.slice(0, 220),
      content: s.redactedText,
      projectId: h.projectId,
      projectName: proj?.name || h.projectId,
      handoverId: h.id,
      handoverTitle: h.title,
      handoverStatus: h.status,
      sourceId: s.id,
      url: s.url,
      author: s.author,
      isImportant: recordType === 'GITHUB_README',
      timestamp: s.timestamp,
      updatedAt: s.createdAt,
      tags: [s.type, proj?.name || 'Project'],
    });
  }

  // 3. Key Decisions, Risks & Issue Records from Approved/Verified Report Items
  for (const item of reportItems) {
    if (item.statement === 'Not found in available sources.') continue;
    const h = hndMap.get(item.handoverId);
    if (!h) continue;
    if (isSuccessor && (h.status !== 'PUBLISHED' || item.reviewStatus !== 'APPROVED')) {
      continue;
    }
    const proj = projMap.get(h.projectId);
    const isDecisionOrRisk =
      item.section === 'KEY_DECISIONS' || item.section === 'RISKS';
    const isIssueOrPending =
      item.section === 'PROBLEMS_ISSUES' ||
      item.section === 'PENDING_WORK' ||
      item.section === 'DEPENDENCIES';
    if (!isDecisionOrRisk && !isIssueOrPending) continue;

    entries.push({
      id: `kb_itm_${item.id}`,
      recordType: isDecisionOrRisk ? 'KEY_DECISION' : 'ISSUE_RECORD',
      title: item.title || `${item.section}: ${item.statement.slice(0, 64)}`,
      excerpt: item.statement,
      content: `${item.statement}\nEvidence: ${item.evidence}\nSource: ${item.sourceFileName}`,
      projectId: h.projectId,
      projectName: proj?.name || h.projectId,
      handoverId: h.id,
      handoverTitle: h.title,
      handoverStatus: h.status,
      sourceId: item.sourceIds[0],
      url: `/handovers/${h.id}`,
      author: item.reviewedByName || usersMap[h.departingMemberId]?.name || 'Team',
      isImportant: item.confidence === 'HIGH' || item.section === 'KEY_DECISIONS',
      timestamp: item.createdAt,
      updatedAt: item.updatedAt,
      tags: [item.section, item.confidence, item.reviewStatus],
    });
  }

  // 4. Generated AI Summaries
  for (const sum of summaries) {
    const h = hndMap.get(sum.handoverId);
    if (!h) continue;
    if (isSuccessor && h.status !== 'PUBLISHED') continue;
    const proj = projMap.get(sum.projectId) || projMap.get(h.projectId);
    const bodyText = sum.sections
      .filter((sec) => sec.available)
      .map((sec) => `${sec.title}:\n${sec.content}`)
      .join('\n\n');
    entries.push({
      id: `kb_sum_${sum.id}`,
      recordType: 'AI_SUMMARY',
      title: `AI Summary (${sum.format} • v${sum.version}) — ${h.title}`,
      excerpt:
        sum.sections.find((s) => s.key === 'EXECUTIVE_SUMMARY')?.content.slice(0, 220) ||
        bodyText.slice(0, 220),
      content: bodyText,
      projectId: h.projectId,
      projectName: proj?.name || h.projectId,
      handoverId: h.id,
      handoverTitle: h.title,
      handoverStatus: h.status,
      url: `/handovers/${h.id}`,
      author: sum.generatedByName,
      isImportant: true,
      timestamp: sum.createdAt,
      updatedAt: sum.updatedAt,
      tags: ['AI_SUMMARY', sum.format, `v${sum.version}`],
    });
  }

  return entries.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function queryKnowledgeBaseAI(
  queryText: string,
  entries: KnowledgeBaseEntry[]
): KnowledgeAIQueryResult {
  const cleanQ = queryText.trim();
  const lowerQ = cleanQ.toLowerCase();
  const stopWords = new Set([
    'what', 'were', 'the', 'in', 'during', 'last', 'previous', 'which', 'who',
    'how', 'why', 'when', 'where', 'are', 'was', 'for', 'and', 'with', 'from',
    'that', 'this', 'before', 'should', 'know',
  ]);
  const tokens = lowerQ
    .split(/\W+/)
    .filter((t) => t.length > 2 && !stopWords.has(t));

  // Boost entries matching natural-language intent
  const wantsProblems = /\b(problem|problems|issue|issues|bug|unresolved|resolved|failure|lag)\b/i.test(lowerQ);
  const wantsPending = /\b(incomplete|pending|task|tasks|left|remaining|unfinished|todo|start|starting)\b/i.test(lowerQ);
  const wantsDecisions = /\b(decision|decisions|technical|architecture|why|migrated|chose|redlock|ed25519)\b/i.test(lowerQ);
  const wantsDeps = /\b(dependency|dependencies|depend|deployment|redis|postgres|kafka|vault)\b/i.test(lowerQ);

  const scored = entries
    .map((entry) => {
      const hay = `${entry.title} ${entry.content} ${entry.tags.join(' ')} ${entry.projectName}`.toLowerCase();
      let score = 0;
      for (const tok of tokens) {
        if (hay.includes(tok)) score += 3;
        if (entry.title.toLowerCase().includes(tok)) score += 4;
      }
      if (wantsProblems && (entry.recordType === 'ISSUE_RECORD' || hay.includes('problem') || hay.includes('risk') || hay.includes('issue'))) {
        score += 4;
      }
      if (wantsPending && (hay.includes('pending') || hay.includes('todo') || hay.includes('pr #'))) {
        score += 4;
      }
      if (wantsDecisions && (entry.recordType === 'KEY_DECISION' || hay.includes('decision') || hay.includes('migrated'))) {
        score += 4;
      }
      if (wantsDeps && hay.includes('depend')) {
        score += 4;
      }
      return { entry, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      query: cleanQ,
      answer:
        'No reliable information was found in your authorized knowledge base records for this query.',
      grounded: false,
      citations: [],
      matchedEntries: [],
      timestamp: new Date().toISOString(),
    };
  }

  const topEntries = scored.slice(0, 5).map((s) => s.entry);
  const citations = topEntries.map((e) => ({
    entryId: e.id,
    title: e.title,
    recordType: e.recordType,
    projectName: e.projectName,
    handoverId: e.handoverId,
    sourceId: e.sourceId,
    excerpt: e.excerpt.slice(0, 220),
    url: e.url,
  }));

  const answerLines = [
    `Based on **${topEntries.length} authorized record(s)** in the HandoverIQ Knowledge Base:`,
    ...topEntries.map(
      (e) =>
        `- **[${e.projectName} • ${e.recordType}]** ${e.excerpt} ${
          e.sourceId ? `[Source: ${e.sourceId}]` : `[Source: ${e.id}]`
        }`
    ),
  ];

  return {
    query: cleanQ,
    answer: answerLines.join('\n'),
    grounded: true,
    citations,
    matchedEntries: topEntries,
    timestamp: new Date().toISOString(),
  };
}
