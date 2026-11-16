import { jsPDF } from 'jspdf';
import type {
  Handover,
  Project,
  ReportItem,
  ReportSection,
  SourceDocument,
  UserProfile,
} from '../../src/types/index.ts';

const SECTION_LABELS: Record<ReportSection, string> = {
  PROJECT_SNAPSHOT: '1. Project Overview & Snapshot',
  KEY_DECISIONS: '2. Key Decisions & Reasoning',
  PENDING_WORK: '3. Pending Tasks & Owners',
  PROBLEMS_ISSUES: '4. Problems & Unresolved Issues',
  DEPENDENCIES: '5. Project Dependencies',
  RISKS: '6. Risks & Severity Levels',
  OPEN_QUESTIONS: '7. Open Questions & Answers',
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

export function generateServerHandoverPDF(params: {
  handover: Handover;
  project: Project | null;
  reportItems: ReportItem[];
  sources: SourceDocument[];
  usersMap: Record<string, UserProfile>;
  reportVersion?: number;
}): Buffer {
  const { handover, project, reportItems, sources, usersMap, reportVersion } = params;
  const version = reportVersion || handover.approvalSummary?.version || 1;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  let y = 48;

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 54) {
      doc.addPage();
      y = 48;
    }
  };

  // Top Branding Banner
  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, pageWidth, 86, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('HANDOVERIQ — VERIFIED HANDOVER REPORT', margin, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    `Report ID: ${handover.id}   |   Version: v${version}   |   Status: ${handover.status}`,
    margin,
    52
  );
  doc.text(
    `Generated: ${new Date().toISOString()}   |   Approval: ${handover.approvalStatus || 'PENDING'}`,
    margin,
    68
  );

  y = 104;
  doc.setTextColor(15, 23, 42);

  // Project & Participant Metadata Card
  const departingUser = usersMap[handover.departingMemberId];
  const successorUser = usersMap[handover.successorId];
  const leaderUser =
    (handover.approvedBy && usersMap[handover.approvedBy]) ||
    (project?.teamLeadId && usersMap[project.teamLeadId]) ||
    null;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 134, 6, 6, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(handover.title, margin + 12, y + 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    `Project: ${project?.name || handover.projectId} (${project?.status || 'ACTIVE'})`,
    margin + 12,
    y + 38
  );
  doc.text(
    `Departing Member: ${
      departingUser ? `${departingUser.name} (${departingUser.email})` : handover.departingMemberId
    }`,
    margin + 12,
    y + 54
  );
  doc.text(
    `Successor: ${
      successorUser ? `${successorUser.name} (${successorUser.email})` : handover.successorId
    }`,
    margin + 12,
    y + 70
  );
  doc.text(
    `Team Leader: ${
      leaderUser
        ? `${leaderUser.name} (${leaderUser.email})`
        : handover.approvalSummary?.approvedByName || 'Assigned Team Leader'
    }`,
    margin + 12,
    y + 86
  );
  doc.text(
    `Created: ${new Date(handover.createdAt).toLocaleDateString()}   |   Approved: ${
      handover.approvalSummary?.approvedAt
        ? new Date(handover.approvalSummary.approvedAt).toLocaleDateString()
        : 'Pending Approval'
    }`,
    margin + 12,
    y + 102
  );
  doc.text(
    `Date Range: ${handover.dateRange.startDate} to ${handover.dateRange.endDate}`,
    margin + 12,
    y + 118
  );
  y += 150;

  if (project?.description) {
    ensureSpace(50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Project Overview:', margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const overviewLines = doc.splitTextToSize(project.description, contentWidth);
    doc.text(overviewLines, margin, y);
    y += overviewLines.length * 12 + 12;
  }

  // Approval Attestation Banner
  if (handover.approvalSummary) {
    ensureSpace(58);
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(167, 243, 208);
    doc.roundedRect(margin, y, contentWidth, 48, 5, 5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(6, 95, 70);
    doc.text(
      `Version v${version} Approved by ${
        handover.approvalSummary.approvedByName || 'Team Leader'
      } on ${
        handover.approvalSummary.approvedAt
          ? new Date(handover.approvalSummary.approvedAt).toLocaleString()
          : 'N/A'
      }`,
      margin + 10,
      y + 18
    );
    doc.setFont('helvetica', 'normal');
    const commentsLines = doc.splitTextToSize(
      `Comments: ${handover.approvalSummary.leaderComments || 'Verified and approved.'}`,
      contentWidth - 20
    );
    doc.text(commentsLines.slice(0, 2), margin + 10, y + 34);
    doc.setTextColor(15, 23, 42);
    y += 62;
  }

  // Report Sections
  for (const sec of ORDERED_SECTIONS) {
    const items = reportItems.filter((i) => i.section === sec);
    ensureSpace(44);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 22, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`${SECTION_LABELS[sec]} (${items.length})`, margin + 8, y + 15);
    y += 32;

    if (items.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Not found in available sources.', margin + 8, y);
      y += 20;
      continue;
    }

    for (const item of items) {
      const stmtLines = doc.splitTextToSize(`• ${item.statement}`, contentWidth - 16);
      const evLines = item.evidence
        ? doc.splitTextToSize(`Source Evidence: "${item.evidence}"`, contentWidth - 24)
        : [];
      const refText = `Sources: ${item.sourceIds.join(', ') || item.sourceFileName} | Confidence: ${
        item.confidence
      } (${Math.round((item.confidenceScore || 0.85) * 100)}%) | Status: ${item.reviewStatus}`;
      const blockHeight = stmtLines.length * 13 + evLines.length * 11 + 32;
      ensureSpace(blockHeight);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(stmtLines, margin + 8, y);
      y += stmtLines.length * 13 + 3;

      if (evLines.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        doc.text(evLines, margin + 16, y);
        y += evLines.length * 11 + 3;
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 118, 110);
      doc.text(refText, margin + 16, y);
      y += 16;
    }
    y += 6;
  }

  // Verified Source Index
  ensureSpace(48);
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentWidth, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`8. Verified Source Index (${sources.length})`, margin + 8, y + 15);
  y += 30;

  for (const src of sources) {
    ensureSpace(26);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    const line = `[${src.id}] ${src.title} (${src.type}) — Author: ${src.author} | Redactions: ${
      src.redactionSummary?.totalRedactions || 0
    }${src.url && src.url.startsWith('http') ? ` | URL: ${src.url}` : ''}`;
    const wrapped = doc.splitTextToSize(line, contentWidth - 12);
    doc.text(wrapped, margin + 8, y);
    y += wrapped.length * 12 + 4;
  }

  // Add page numbers to every page
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `HandoverIQ Enterprise Governance Report • v${version}`,
      margin,
      pageHeight - 24
    );
    doc.text(
      `Page ${p} of ${totalPages}`,
      pageWidth - margin - 54,
      pageHeight - 24
    );
  }

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

