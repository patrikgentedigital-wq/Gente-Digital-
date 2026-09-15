import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function sanitizeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  // Risco de injeção de fórmula apenas com =, +, @, tab ou CR.
  // O '-' é removido da lista para que números negativos passem limpos.
  if (/^[=+@\t\r]/.test(str)) {
    return `"'${str}"`;
  }
  return `"${str}"`;
}
