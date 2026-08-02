export const REFERRAL_COOKIE_NAME = 'gente_digital_ref';
export const REFERRAL_VISITOR_KEY = 'gente_digital_referral_visitor_v1';

export const REF_PATTERN = /^[\p{L}\p{M}\p{N} _.-]+$/u;
export const TRACKING_CODE_PATTERN = /^[A-F0-9]{4}(?:-[A-F0-9]{4}){3}$/;

export function normalizeReferralCode(value: string | null | undefined): string {
  if (!value) return '';

  const normalized = value
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);

  return REF_PATTERN.test(normalized) ? normalized : '';
}

export function normalizeTrackingCode(value: string | null | undefined): string {
  if (!value) return '';

  const normalized = value.trim().toUpperCase();
  return TRACKING_CODE_PATTERN.test(normalized) ? normalized : '';
}

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '').slice(0, 13);
}

export const REFERRAL_STATUS_LABELS: Record<string, { title: string; description: string }> = {
  Pendente: {
    title: 'Indicação recebida',
    description: 'Seu pedido entrou na fila de atendimento da Gente Digital.',
  },
  'Contato inicial': {
    title: 'Contato iniciado',
    description: 'A equipe já iniciou o atendimento com a pessoa indicada.',
  },
  'Em negociação': {
    title: 'Em atendimento',
    description: 'A contratação está em análise ou negociação com a equipe comercial.',
  },
  Ganho: {
    title: 'Instalação confirmada',
    description: 'A conversão foi confirmada e a recompensa seguirá a regra e o prazo do programa.',
  },
  Errado: {
    title: 'Dados precisam de revisão',
    description: 'A equipe não conseguiu concluir o contato. Fale com o atendimento para revisar os dados.',
  },
};
