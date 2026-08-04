'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'success' | 'primary';
  inputLabel?: string;
  inputValue?: string;
  inputPlaceholder?: string;
  onInputChange?: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'primary',
  inputLabel,
  inputValue = '',
  inputPlaceholder,
  onInputChange,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    confirmRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const toneClasses = {
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    success: 'bg-green-600 hover:bg-green-700 text-white',
    primary: 'bg-brand-charcoal dark:bg-brand-yellow dark:text-brand-charcoal text-white hover:bg-gray-800 dark:hover:bg-yellow-400',
  }[tone];

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl border border-brand-border dark:border-gray-800 animate-in zoom-in-95 duration-200">
        <div className="flex items-start gap-4 mb-4">
          <div className={`p-2.5 rounded-xl shrink-0 ${
            tone === 'danger'
              ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400'
              : 'bg-brand-yellow/20 text-brand-charcoal dark:text-brand-yellow'
          }`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h3 className="font-display font-bold text-lg text-brand-charcoal dark:text-white leading-snug pt-1">{title}</h3>
        </div>
        <div className="text-sm text-brand-muted dark:text-gray-400 leading-relaxed mb-6">{message}</div>
        {inputLabel && onInputChange && (
          <div className="mb-6">
            <label htmlFor="confirm-dialog-input" className="mb-2 block text-sm font-bold text-brand-charcoal dark:text-gray-200">{inputLabel}</label>
            <input
              id="confirm-dialog-input"
              value={inputValue}
              onChange={(event) => onInputChange(event.target.value)}
              placeholder={inputPlaceholder}
              required
              autoComplete="off"
              className="w-full rounded-xl border border-brand-border bg-gray-50 px-4 py-3 text-sm text-brand-charcoal outline-none transition focus:border-brand-yellow focus:ring-2 focus:ring-brand-yellow/30 dark:border-gray-700 dark:bg-zinc-800 dark:text-white"
            />
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 border border-brand-border dark:border-gray-700 text-brand-charcoal dark:text-gray-300 font-bold text-sm rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={Boolean(inputLabel && inputValue.trim().length < 3)}
            className={`flex-1 py-3 font-bold text-sm rounded-xl shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-50 ${toneClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
