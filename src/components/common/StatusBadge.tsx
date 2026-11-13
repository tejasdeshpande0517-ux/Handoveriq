import React from 'react';
import type {
  ConfidenceLevel,
  DepartingReviewStatus,
  HandoverStatus,
  ReviewStatus,
  UserRole,
} from '../../types';

export const HandoverStatusBadge: React.FC<{ status: HandoverStatus }> = ({
  status,
}) => {
  const config: Record<
    HandoverStatus,
    { label: string; classes: string; dot: string }
  > = {
    DRAFT: {
      label: 'Draft',
      classes: 'bg-slate-100 text-slate-700 border-slate-200',
      dot: 'bg-slate-400',
    },
    INGESTING: {
      label: 'Ingesting Sources',
      classes: 'bg-sky-50 text-sky-700 border-sky-200',
      dot: 'bg-sky-500',
    },
    ANALYZED: {
      label: 'AI Analyzed',
      classes: 'bg-teal-50 text-teal-700 border-teal-200',
      dot: 'bg-teal-500',
    },
    DEPARTING_REVIEW: {
      label: 'Departing Review',
      classes: 'bg-amber-50 text-amber-800 border-amber-200',
      dot: 'bg-amber-500',
    },
    LEADER_REVIEW: {
      label: 'Leader Verification',
      classes: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      dot: 'bg-indigo-500',
    },
    REVISION_REQUESTED: {
      label: 'Revision Requested',
      classes: 'bg-orange-50 text-orange-800 border-orange-200',
      dot: 'bg-orange-500',
    },
    APPROVED: {
      label: 'Approved',
      classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dot: 'bg-emerald-500',
    },
    PUBLISHED: {
      label: 'Published & Verified',
      classes: 'bg-emerald-50 text-emerald-800 border-emerald-300',
      dot: 'bg-emerald-600',
    },
  };

  const c = config[status] || config.DRAFT;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${c.classes}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
};

export const RoleBadge: React.FC<{ role: UserRole | string }> = ({ role }) => {
  const styles: Record<string, string> = {
    ADMIN: 'bg-slate-900 text-white border-slate-800',
    TEAM_LEADER: 'bg-teal-50 text-teal-800 border-teal-200',
    DEPARTING_MEMBER: 'bg-amber-50 text-amber-800 border-amber-200',
    SUCCESSOR: 'bg-sky-50 text-sky-800 border-sky-200',
  };
  const labels: Record<string, string> = {
    ADMIN: 'Administrator',
    TEAM_LEADER: 'Team Leader',
    DEPARTING_MEMBER: 'Departing Member',
    SUCCESSOR: 'Successor',
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border ${
        styles[role] || 'bg-slate-100 text-slate-700 border-slate-200'
      }`}
    >
      {labels[role] || role}
    </span>
  );
};

export const ConfidenceBadge: React.FC<{
  confidence: ConfidenceLevel;
  score?: number;
}> = ({ confidence, score }) => {
  const styles: Record<ConfidenceLevel, string> = {
    HIGH: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
    LOW: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium border ${styles[confidence]}`}
    >
      {confidence}
      {typeof score === 'number' ? ` (${Math.round(score * 100)}%)` : ''}
    </span>
  );
};

export const ReviewStatusBadge: React.FC<{ status: ReviewStatus }> = ({
  status,
}) => {
  const styles: Record<ReviewStatus, string> = {
    PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
    APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    REJECTED: 'bg-red-50 text-red-700 border-red-200',
    REVISION_REQUESTED: 'bg-orange-50 text-orange-800 border-orange-200',
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[status]}`}
    >
      {status}
    </span>
  );
};

export const DepartingStatusBadge: React.FC<{
  status: DepartingReviewStatus;
}> = ({ status }) => {
  const styles: Record<DepartingReviewStatus, string> = {
    UNREVIEWED: 'bg-slate-100 text-slate-600 border-slate-200',
    CONFIRMED: 'bg-teal-50 text-teal-700 border-teal-200',
    DISPUTED: 'bg-red-50 text-red-700 border-red-200',
  };
  const labels: Record<DepartingReviewStatus, string> = {
    UNREVIEWED: 'Unreviewed by Departing',
    CONFIRMED: 'Confirmed by Departing',
    DISPUTED: 'Disputed by Departing',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
};

