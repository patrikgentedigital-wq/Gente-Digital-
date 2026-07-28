/**
 * Módulo de Notificação Direta para o Microsoft Teams via Incoming Webhook (DevOps Regra 9)
 */

import { StructuredLogPayload } from './logger';

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
          ...(payload.metadata ? [{ name: 'Metadados:', value: JSON.stringify(payload.metadata, null, 2) }] : []),
          ...(payload.error ? [{ name: 'Erro:', value: `**${payload.error.name}**: ${payload.error.message}` }] : []),
        ],
        text: payload.error?.stack 
          ? `**Stack Trace:**\n\`\`\`text\n${payload.error.stack.slice(0, 500)}...\n\`\`\`` 
          : undefined,
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cardPayload),
    });
    return response.ok;
  } catch (err) {
    console.error('Falha ao enviar notificação para o Microsoft Teams:', err);
    return false;
  }
}
