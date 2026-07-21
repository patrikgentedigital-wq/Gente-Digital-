import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Inicializa Rate Limiter (evita crash se Redis não estiver configurado)
const redis = (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) 
  ? new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN }) 
  : null;

const ratelimit = redis 
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(15, '1 m') })
  : null;

// Schemas Zod
const LeadHistorySchema = z.object({
  date: z.string().max(50).optional(),
  action: z.string().max(100).optional(),
  note: z.string().max(250).optional()
});

const AiPayloadSchema = z.object({
  action: z.string().min(1),
  lead: z.object({
    name: z.string().max(100).optional().default('Cliente'),
    status: z.string().max(50).optional().default('Pendente'),
    value: z.number().optional().default(0),
    history: z.array(LeadHistorySchema).optional().default([])
  }).optional().default({}),
  metrics: z.record(z.any()).optional().default({})
});

function sanitizeString(str: any, maxLength = 250): string {
  if (typeof str !== 'string') return '';
  return str
    .slice(0, maxLength)
    .replace(/[\r\n]+/g, ' ')
    .replace(/[<>{}]/g, '')
    .trim();
}

function sanitizeHistory(history: any[]): any[] {
  if (!Array.isArray(history)) return [];
  return history.slice(0, 10).map(item => ({
    date: sanitizeString(item?.date, 50),
    action: sanitizeString(item?.action, 100),
    note: sanitizeString(item?.note, 200)
  }));
}

// Resposta Inteligente Fallback para Resumo do Dashboard
function generateDynamicSummary(metrics: any): string {
  const total = metrics?.totalLeads ?? 0;
  const conv = metrics?.conversões ?? 0;
  const rate = metrics?.conversionRate ?? '0%';
  const clicks = metrics?.cliques ?? 0;
  const leadsTrend = metrics?.leadsTrend ?? '+0%';
  const convsTrend = metrics?.convsTrend ?? '+0%';

  return `📈 **Resumo Executivo do Painel Comercial**\n\n` +
    `No período atual, sua operação registrou **${total} leads acumulados** (${leadsTrend} em relação ao período anterior) com **${conv} conversões concluídas** (${convsTrend}), resultando em uma taxa de conversão de **${rate}** a partir de **${clicks} acessos** aos seus links de indicação.\n\n` +
    `💡 **Direcionamento Estratégico:**\n` +
    `• O volume de captação por indicações apresenta bom ritmo.\n` +
    `• Foque no acompanhamento dos leads nas etapas "Contato Inicial" e "Em Negociação" no funil Kanban para maximizar a conversão nesta semana.`;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Rate Limiting
    if (ratelimit) {
      const ip = req.headers.get('x-forwarded-for') ?? 'anonymous';
      const { success } = await ratelimit.limit(`ai_endpoint_${ip}`);
      if (!success) {
        return NextResponse.json({ error: 'Muitas requisições. Tente novamente em um minuto.' }, { status: 429 });
      }
    }

    // 2. Validação Zod
    const rawBody = await req.json();
    const parsed = AiPayloadSchema.safeParse(rawBody);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload inválido', details: parsed.error.format() }, { status: 400 });
    }

    const { action, lead, metrics } = parsed.data;

    if (!action) {
      return NextResponse.json({ error: 'Parâmetros inválidos. É necessário informar a action.' }, { status: 400 });
    }

    const safeLead = {
      name: sanitizeString(lead.name, 100) || 'Cliente',
      status: sanitizeString(lead.status, 50) || 'Pendente',
      value: typeof lead.value === 'number' ? lead.value : 0,
      history: sanitizeHistory(lead.history)
    };

    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    // Função para tentar chamadas com Fallback de Provedores/Modelos
    const callAI = async (prompt: string): Promise<string> => {
      // Opção A: Gemini API nativa se a chave estiver configurada
      if (geminiKey) {
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }]
            })
          });
          if (res.ok) {
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text;
          }
        } catch (e) {
          console.warn('Gemini API call failed, falling back to OpenRouter/Mock:', e);
        }
      }

      // Opção B: OpenRouter se a chave estiver configurada (testando múltiplos modelos confiáveis)
      if (openrouterKey) {
        const models = [
          'google/gemini-2.0-flash-exp:free',
          'meta-llama/llama-3.3-70b-instruct:free',
          'deepseek/deepseek-r1:free',
          'openrouter/auto'
        ];

        for (const model of models) {
          try {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${openrouterKey}`,
                'HTTP-Referer': 'https://gentedigital.com.br',
                'X-Title': 'Gente Digital CRM',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }]
              })
            });

            if (res.ok) {
              const data = await res.json();
              const text = data.choices?.[0]?.message?.content;
              if (text) return text;
            }
          } catch (e) {
            console.warn(`OpenRouter model ${model} failed:`, e);
          }
        }
      }

      throw new Error('Nenhum provedor de IA disponível');
    };

    // Processamento da Ação do Dashboard
    if (action === 'dashboard-summary') {
      const prompt = `Você é um diretor comercial de alto nível do sistema Gente Digital. Analise as métricas fornecidas no bloco JSON e escreva um resumo executivo muito breve (1 parágrafo), amigável, direto e com insights práticos em português do Brasil.
<<<DATA
${JSON.stringify(metrics || {}, null, 2)}
DATA>>>`;

      try {
        const textResult = await callAI(prompt);
        return NextResponse.json({
          status: 'success',
          summary: textResult.trim()
        });
      } catch (err) {
        // Fallback dinâmico sem falhar o dashboard!
        return NextResponse.json({
          status: 'success',
          isFallback: true,
          summary: generateDynamicSummary(metrics)
        });
      }
    }

    // Processamento de Qualificação de Lead
    if (action === 'qualify') {
      const prompt = `Você é um analista de vendas inteligente no sistema Gente Digital. Analise os dados do lead em JSON e qualifique a intenção de compra (Quente, Morno ou Frio).
<<<DATA
${JSON.stringify(safeLead, null, 2)}
DATA>>>
Retorne estritamente um JSON limpo com as chaves "qualification" ("Quente", "Morno" ou "Frio"), "reason" (explicação breve) e "nextSteps" (próxima ação sugerida).`;

      try {
        const textResult = await callAI(prompt);
        const cleanJson = textResult.replace(/^```json/, '').replace(/```$/, '').trim();
        const jsonResult = JSON.parse(cleanJson);
        return NextResponse.json({
          status: 'success',
          ...jsonResult
        });
      } catch (err) {
        const val = safeLead.value;
        const isHot = val > 1000 || safeLead.status === 'Em negociação';
        return NextResponse.json({
          status: 'success',
          isFallback: true,
          qualification: isHot ? 'Quente' : 'Morno',
          reason: isHot 
            ? 'Lead com negociação ativa ou alto valor estimado no funil.' 
            : 'Lead cadastrado com interesse inicial no produto.',
          nextSteps: 'Entrar em contato via WhatsApp e apresentar plano personalizado.'
        });
      }
    }

    // Processamento de Geração de Mensagem WhatsApp
    if (action === 'generate-message') {
      const prompt = `Escreva uma mensagem comercial curta e persuasiva em português brasileiro para ser enviada por WhatsApp para o cliente abaixo.
<<<DATA
${JSON.stringify(safeLead, null, 2)}
DATA>>>
Seja direto, amigável, inclua emojis moderados e convide para o próximo passo. Retorne apenas o texto da mensagem.`;

      try {
        const textResult = await callAI(prompt);
        return NextResponse.json({
          status: 'success',
          message: textResult.trim()
        });
      } catch (err) {
        return NextResponse.json({
          status: 'success',
          isFallback: true,
          message: `Olá, ${safeLead.name}! Tudo bem?\n\nNotamos seu interesse em nossos planos no Gente Digital. Gostaria de tirar algumas dúvidas rápidas para te ajudar a escolher a melhor opção?\n\nPodemos conversar agora por aqui?`
        });
      }
    }

    return NextResponse.json({ error: 'Ação de IA desconhecida.' }, { status: 400 });

  } catch (error: any) {
    console.error('Error in AI Route Handler:', error);
    return NextResponse.json({ 
      status: 'success',
      isFallback: true,
      summary: 'Resumo gerado: Suas métricas de conversão e indicações estão sendo processadas normalmente.'
    });
  }
}
