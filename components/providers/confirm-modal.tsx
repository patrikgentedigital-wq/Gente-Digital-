'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Trash2, DollarSign, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'success';
  icon?: 'trash' | 'dollar' | 'alert';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  icon = 'alert',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // Focus no botão de cancelar ao abrir (default seguro para ações destrutivas)
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => cancelBtnRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Fechar com Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onCancel]);

  const variantStyles = {
    danger: {
      iconBg: 'bg-red-100 dark:bg-red-950/50',
      iconColor: 'text-red-600 dark:text-red-400',
      btnClass: 'bg-red-600 hover:bg-red-700 text-white',
    },
    warning: {
      iconBg: 'bg-amber-100 dark:bg-amber-950/50',
      iconColor: 'text-amber-600 dark:text-amber-400',
      btnClass: 'bg-amber-500 hover:bg-amber-600 text-white',
    },
    success: {
      iconBg: 'bg-green-100 dark:bg-green-950/50',
      iconColor: 'text-green-600 dark:text-green-400',
      btnClass: 'bg-green-600 hover:bg-green-700 text-white',
    },
  };

  const IconComponent = icon === 'trash' ? Trash2 : icon === 'dollar' ? DollarSign : AlertTriangle;
  const styles = variantStyles[variant];

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={onCancel}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 12 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-800 w-full max-w-sm p-6"
          >
            {/* Close button */}
            <button
              onClick={onCancel}
              aria-label="Fechar modal"
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Icon */}
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${styles.iconBg}`}>
              <IconComponent className={`w-6 h-6 ${styles.iconColor}`} />
            </div>

            {/* Content */}
            <h3
              id="confirm-modal-title"
              className="font-bold text-lg text-slate-900 dark:text-white mb-2"
            >
              {title}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
              {message}
            </p>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                ref={cancelBtnRef}
                onClick={onCancel}
                className="flex-1 py-2.5 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-slate-300 font-semibold text-sm rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={`flex-1 py-2.5 font-bold text-sm rounded-xl shadow-sm transition-all ${styles.btnClass}`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
