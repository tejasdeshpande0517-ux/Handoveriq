import React from 'react';

export const LoadingSkeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className="bg-white border border-slate-200 rounded-xl p-5 h-28"
          >
            <div className="h-3 w-24 bg-slate-200 rounded mb-3" />
            <div className="h-7 w-16 bg-slate-200 rounded mb-2" />
            <div className="h-2.5 w-32 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        {Array.from({ length: rows }).map((_, idx) => (
          <div
            key={idx}
            className="h-12 bg-slate-100 rounded-lg border border-slate-200/60"
          />
        ))}
      </div>
    </div>
  );
};

