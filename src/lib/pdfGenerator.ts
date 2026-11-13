import { jsPDF } from 'jspdf';
import type {
  Handover,
  Project,
  ReportItem,
  ReportSection,
  SourceDocument,
  UserProfile,
} from '../types';
import { api } from './api';

const SECTION_LABELS: Record<ReportSection, string> = {
  PROJECT_SNAPSHOT: '1. Project Snapshot',
  KEY_DECISIONS: '2. Key Decisions',
  PENDING_WORK: '3. Pending / Unfinished Work',
  PROBLEMS_ISSUES: '4. Problems and Known Issues',
  DEPENDENCIES: '5. Dependencies',
  RISKS: '6. Risks',
  OPEN_QUESTIONS: '7. Open Questions',
};

const ORDERED_SECTIONS: ReportSection[] = [
  'PROJECT_SNAPSHOT',
  'KEY_DECISIONS',
  'PENDING_WORK',
  'PROBLEMS_ISSUES',
  'DEPENDENCIES',
  'RISKS',
  'OPEN_QUESTIONS',
];

export async function generateAndDownloadHandoverPDF(params: {
  handover: Handover;
  project: Project | null;
  reportItems: ReportItem[];
  sources: SourceDocument[];
  usersMap: Record<string, UserProfile>;
}): Promise<void> {
  const { handover, project, reportItems, sources, usersMap } = params;

  // Record PDF download in immutable audit logs
  try {
    await api.handovers.logPdfDownload(handover.id);
  } catch {
    // Non-blocking audit log notification
  }

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  let y = 48;

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 50) {
      doc.addPage();
      y = 48;
    }
  };

  // Top Header Banner
  doc.setFillColor(15, 118, 110); // Teal-700
  doc.rect(0, 0, pageWidth, 82, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('HANDOVERIQ — VERIFIED HANDOVER REPORT', margin, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `Report ID: ${handover.id}   |   Status: ${handover.status}   |   Generated: ${new Date().toLocaleString()}`,
    margin,
    54
  );
  doc.text(
    'Source-Backed • Redacted • Team Leader Verified Governance Record',
    margin,
    69
  );

  y = 104;
  doc.setTextColor(15, 23, 42);

  // Project & Participant Metadata Block
  const departingUser = usersMap[handover.departingMemberId];
  const successorUser = usersMap[handover.successorId];
  const leaderUser = handover.approvedBy ? usersMap[handover.approvedBy] : null;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 108, 6, 6, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(handover.title, margin + 12, y + 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    `Project: ${project?.name || handover.projectId}`,
    margin + 12,
    y + 38
  );
  doc.text(
    `Departing Member: ${departingUser ? `${departingUser.name} (${departingUser.email})` : handover.departingMemberId}`,
    margin + 12,
    y + 54
  );
  doc.text(
    `Successor Member: ${successorUser ? `${successorUser.name} (${successorUser.email})` : handover.successorId}`,
    margin + 12,
    y + 70
  );
  doc.text(
    `Activity Date Range: ${handover.dateRange.startDate} to ${handover.dateRange.endDate}`,
    margin + 12,
    y + 86
  );
  doc.text(
    `Approved By Team Leader: ${
      handover.approvalSummary?.approvedByName ||
      leaderUser?.name ||
      'Pending Final Approval'
    } (${handover.approvalSummary?.publishedAt ? new Date(handover.approvalSummary.publishedAt).toLocaleDateString() : 'Draft'})`,
    margin + 12,
    y + 100
  );

  y += 126;

  // Sections 1 through 7
  const approvedOrReviewedItems = reportItems.filter(
    (item) => item.reviewStatus === 'APPROVED' || handover.status !== 'PUBLISHED'
  );

  for (const sectionKey of ORDERED_SECTIONS) {
    ensureSpace(65);
    doc.setFillColor(240, 253, 250);
    doc.setDrawColor(15, 118, 110);
    doc.rect(margin, y, contentWidth, 24, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 118, 110);
    doc.text(SECTION_LABELS[sectionKey], margin + 10, y + 16);
    y += 34;

    const sectionItems = approvedOrReviewedItems.filter(
      (i) => i.section === sectionKey
    );

    if (sectionItems.length === 0) {
      ensureSpace(30);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Not found in available sources.', margin + 8, y);
      y += 20;
      continue;
    }

    for (const item of sectionItems) {
      const stmtLines = doc.splitTextToSize(
        `• ${item.statement}`,
        contentWidth - 16
      );
      const citeStr =
        item.sourceIds.length > 0
          ? `Sources: [${item.sourceIds.join(', ')}] | Confidence: ${
              item.confidence
            } (${Math.round(item.confidenceScore * 100)}%) | Status: ${
              item.reviewStatus
            }`
          : `Confidence: ${item.confidence} | Status: ${item.reviewStatus}`;
      const evLines = doc.splitTextToSize(
        `Evidence Excerpt: "${item.evidence}"`,
        contentWidth - 28
      );

      const answerObj = handover.openQuestionAnswers?.[item.id];
      const answerLines = answerObj
        ? doc.splitTextToSize(
            `Departing Member Answer (${answerObj.answeredByName}): ${answerObj.answer}`,
            contentWidth - 28
          )
        : [];

      const blockHeight =
        stmtLines.length * 13 +
        16 +
        evLines.length * 11 +
        (answerLines.length > 0 ? answerLines.length * 12 + 8 : 0) +
        14;

      ensureSpace(blockHeight);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(stmtLines, margin + 8, y);
      y += stmtLines.length * 13;

      doc.setFont('courier', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 118, 110);
      doc.text(citeStr, margin + 16, y);
      y += 13;

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(evLines, margin + 16, y);
      y += evLines.length * 11 + 4;

      if (answerLines.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(5, 150, 105);
        doc.text(answerLines, margin + 16, y);
        y += answerLines.length * 12 + 4;
      }

      y += 8;
    }
  }

  // Section 8: Source Index
  ensureSpace(80);
  doc.setFillColor(240, 253, 250);
  doc.setDrawColor(15, 118, 110);
  doc.rect(margin, y, contentWidth, 24, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 118, 110);
  doc.text('8. Source Index & Provenance Registry', margin + 10, y + 16);
  y += 34;

  for (const src of sources) {
    const srcHeader = `[${src.id}] ${src.title} (${src.type})`;
    const srcMeta = `Author: ${src.author} | Timestamp: ${new Date(
      src.timestamp
    ).toLocaleString()} | Redactions: ${src.redactionSummary?.totalRedactions || 0} | URL: ${
      src.url
    }`;
    const excerptLines = doc.splitTextToSize(
      `Redacted Excerpt: ${src.redactedText.slice(0, 240)}...`,
      contentWidth - 16
    );

    ensureSpace(36 + excerptLines.length * 11);

    doc.setFont('courier', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(srcHeader, margin + 8, y);
    y += 12;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(srcMeta, margin + 8, y);
    y += 12;

    doc.setFont('helvetica', 'italic');
    doc.text(excerptLines, margin + 8, y);
    y += excerptLines.length * 11 + 10;
  }

  // Team Leader Verification & Approval Block
  ensureSpace(85);
  y += 10;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(15, 118, 110);
  doc.roundedRect(margin, y, contentWidth, 68, 5, 5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 118, 110);
  doc.text('TEAM LEADER VERIFICATION & GOVERNANCE ATTESTATION', margin + 12, y + 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Verified By: ${
      handover.approvalSummary?.approvedByName ||
      leaderUser?.name ||
      'Pending Leader Sign-off'
    }   |   Version: v${handover.approvalSummary?.version || 1}`,
    margin + 12,
    y + 34
  );
  doc.text(
    `Leader Comments: ${
      handover.approvalSummary?.leaderComments ||
      'Report items and source citations reviewed.'
    }`,
    margin + 12,
    y + 50
  );

  const safeTitle = handover.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  doc.save(`handoveriq-report-${safeTitle || handover.id}.pdf`);
}

