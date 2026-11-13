import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback(
    (type: ToastType, title: string, message?: string) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, title, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((t) => {
          const styles = {
            success: {
              border: 'border-emerald-200 bg-white',
              icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
            },
            error: {
              border: 'border-red-200 bg-white',
              icon: <XCircle className="w-5 h-5 text-red-600 shrink-0" />,
            },
            warning: {
              border: 'border-amber-200 bg-white',
              icon: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />,
            },
            info: {
              border: 'border-teal-200 bg-white',
              icon: <Info className="w-5 h-5 text-teal-600 shrink-0" />,
            },
          }[t.type];

          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-lg ${styles.border} transition-all`}
            >
              {styles.icon}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">{t.title}</p>
                {t.message && (
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                    {t.message}
                  </p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
                aria-label="Close notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

