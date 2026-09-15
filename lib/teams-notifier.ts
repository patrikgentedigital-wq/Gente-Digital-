/**
 * Módulo de Notificação Direta para o Microsoft Teams via Incoming Webhook (DevOps Regra 9)
 */

import { StructuredLogPayload } from './logger';

// Chaves sensíveis que não devem ser enviadas para o Teams
const SENSITIVE_KEY_PATTERN = /(token|authorization|password|secret|key)/i;
const METADATA_MAX_LENGTH = 1000;

/**
 * Serializa os metadados removendo chaves sensíveis e truncando o resultado
 * para não expor credenciais nem estourar o payload do webhook.
 */
function sanitizeMetadata(metadata: Record<string, any>): string {
  try {
    const safeEntries = Object.entries(metadata).filter(([k]) => !SENSITIVE_KEY_PATTERN.test(k));
    const safeObj = Object.fromEntries(safeEntries);
    const json = JSON.stringify(safeObj, null, 2);
    return json.length > METADATA_MAX_LENGTH ? json.slice(0, METADATA_MAX_LENGTH) + '…' : json;
  } catch {
    return '[metadados não serializáveis]';
  }
}

export async function sendTeamsAlert(payload: StructuredLogPayload): Promise<boolean> {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl || webhookUrl.includes('placeholder')) {
    // Se a URL do webhook não estiver configurada, pula silenciosamente
    return false;
  }

  const isError = payload.level === 'ERROR';
  const themeColor = isError ? 'FF0000' : payload.level === 'WARN' ? 'FFA500' : '0076D7';
  const iconEmoji = isError ? '🚨' : payload.level === 'WARN' ? '⚠️' : 'ℹ️';

  const cardPayload = {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor,
    summary: `${iconEmoji} Alerta [${payload.level}]: ${payload.message}`,
    sections: [
      {
        activityTitle: `${iconEmoji} Alerta de Sistema: ${payload.service.toUpperCase()}`,
        activitySubtitle: `Nível: **${payload.level}** | Ambiente: **${payload.environment}**`,
        facts: [
          { name: 'Mensagem:', value: payload.message },
          { name: 'Timestamp:', value: payload.timestamp },
          { name: 'Request ID:', value: payload.requestId || 'N/A' },
          ...(payload.metadata ? [{ name: 'Metadados:', value: sanitizeMetadata(payload.metadata) }] : []),
          ...(payload.error ? [{ name: 'Erro:', value: `**${payload.error.name}**: ${payload.error.message}` }] : []),
        ],
        text: payload.error?.stack 
          ? `**Stack Trace:**\n\`\`\`text\n${payload.error.stack.slice(0, 500)}...\n\`\`\`` 
          : undefined,
      },
    ],
  };

  try {
    // Timeout de 5s para não travar o fluxo de erro caso o Teams esteja lento/indisponível
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    let ok = false;
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cardPayload),
        signal: controller.signal,
      });
      ok = response.ok;
    } finally {
      clearTimeout(timeoutId);
    }
    return ok;
  } catch (err) {
    console.error('Falha ao enviar notificação para o Microsoft Teams:', err);
    return false;
  }
}
