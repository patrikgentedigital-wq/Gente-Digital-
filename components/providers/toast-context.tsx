'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (title: string, options?: { type?: ToastType; description?: string; duration?: number }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((
    title: string,
    options?: { type?: ToastType; description?: string; duration?: number }
  ) => {
    const id = Math.random().toString(36).substring(2, 9);
    const type = options?.type || 'info';
    const duration = options?.duration || 4000;

    const newToast: ToastItem = {
      id,
      title,
      type,
      description: options?.description,
      duration,
    };

    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const success = useCallback((title: string, description?: string) => {
    addToast(title, { type: 'success', description });
  }, [addToast]);

  const error = useCallback((title: string, description?: string) => {
    addToast(title, { type: 'error', description });
  }, [addToast]);

  const info = useCallback((title: string, description?: string) => {
    addToast(title, { type: 'info', description });
  }, [addToast]);

  const warning = useCallback((title: string, description?: string) => {
    addToast(title, { type: 'warning', description });
  }, [addToast]);

  const toastHandler = useCallback((title: string, options?: { type?: ToastType; description?: string; duration?: number }) => {
    addToast(title, options);
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toast: toastHandler, success, error, info, warning, removeToast }}>
      {children}
      <div className="fixed top-5 right-5 z-[99999] flex flex-col gap-3 pointer-events-none max-w-sm w-full px-4 sm:px-0">
        <AnimatePresence>
          {toasts.map((t) => (
            <ToastCard key={t.id} toast={t} onClose={() => removeToast(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-brand-yellow shrink-0 mt-0.5" />;
    }
  };

  const getBorderColor = () => {
    switch (toast.type) {
      case 'success':
        return 'border-l-4 border-l-emerald-500';
      case 'error':
        return 'border-l-4 border-l-rose-500';
      case 'warning':
        return 'border-l-4 border-l-amber-500';
      case 'info':
      default:
        return 'border-l-4 border-l-brand-yellow';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`pointer-events-auto flex items-start justify-between gap-3 bg-white dark:bg-[#1e1e24] p-4 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-gray-100 dark:border-gray-800 ${getBorderColor()}`}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {getIcon()}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-brand-charcoal dark:text-white leading-snug">
            {toast.title}
          </p>
          {toast.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
              {toast.description}
            </p>
          )}
        </div>
      </div>
      <button
        onClick={onClose}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast deve ser usado dentro de um ToastProvider');
  }
  return context;
}
