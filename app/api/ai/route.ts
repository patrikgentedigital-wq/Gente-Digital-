import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(req: NextRequest) {
  try {
    const { action, lead, metrics } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!action) {
      return NextResponse.json({ error: 'Parâmetros inválidos. É necessário informar a action.' }, { status: 400 });
    }

    if (!apiKey) {
      console.warn('GEMINI_API_KEY não encontrada nas variáveis de ambiente. Usando respostas simuladas (Mock).');
      
      // Fallback/Mock responses when GEMINI_API_KEY is not defined
      if (action === 'qualify') {
        const value = lead.value || 0;
        let qualification = 'Morno';
        let reason = 'Histórico básico. Adicione GEMINI_API_KEY no seu .env.local para qualificação avançada por IA.';
        let nextSteps = 'Entrar em contato por WhatsApp para entender o interesse do cliente.';

        if (value > 1000 || lead.status === 'Em contato') {
          qualification = 'Quente';
          reason = 'Lead demonstrou alto interesse ou tem alto valor agregado. (Simulado por IA local)';
          nextSteps = 'Oferecer desconto exclusivo ou agendamento de instalação imediata nas próximas 24 horas.';
        } else if (lead.status === 'Não vencemos') {
          qualification = 'Frio';
          reason = 'Lead categorizado como perdido. (Simulado por IA local)';
          nextSteps = 'Guardar contato na base para campanhas de re-engajamento no próximo trimestre.';
        }

        return NextResponse.json({
          status: 'success',
          isMock: true,
          qualification,
          reason,
          nextSteps
        });
      } else if (action === 'generate-message') {
        const message = `Olá, ${lead.name}! Tudo bem?\n\nVi que você se interessou pelos nossos serviços do Gente Digital. Gostaria de entender melhor como podemos te ajudar a escalar sua operação comercial.\n\nPodemos marcar uma rápida conversa de 5 minutos ainda hoje?\n\n(Aviso: Adicione GEMINI_API_KEY no .env.local para gerar mensagens altamente personalizadas por IA)`;
        return NextResponse.json({
          status: 'success',
          isMock: true,
          message
        });
      } else if (action === 'dashboard-summary') {
        const summary = `*Análise Simulada:*\nNeste mês você gerou ótimos números! As conversões estão saudáveis, mas notei que a etapa "Contato Inicial" está acumulando alguns leads. Sugiro focar sua equipe nisso hoje.\n\n(Aviso: Adicione GEMINI_API_KEY no .env.local para gerar resumos reais por IA)`;
        return NextResponse.json({
          status: 'success',
          isMock: true,
          summary
        });
      }

      return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    }

    // Real API Call using Google Gen AI SDK
    const ai = new GoogleGenAI({ apiKey });

    if (action === 'qualify') {
      const prompt = `Você é um analista de vendas inteligente no sistema Gente Digital. Analise o lead de telecomunicações a seguir e qualifique a intenção de compra dele (Quente, Morno ou Frio).
Dados do Lead:
- Nome: ${lead.name}
- Status atual no funil: ${lead.status}
- Valor do plano: R$ ${lead.value || 'Não especificado'}
- Histórico de interações: ${JSON.stringify(lead.history || [])}

Retorne exclusivamente um JSON válido com as chaves "qualification" (devendo ser apenas "Quente", "Morno" ou "Frio"), "reason" (explicação em português do porquê da classificação, em até 2 parágrafos) e "nextSteps" (próxima ação sugerida para o vendedor). Não utilize formatação markdown de bloco de código (\`\`\`json) na resposta.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });

      const textResult = response.text?.trim() || '{}';
      try {
        // Strip any accidental markdown formatting if the model still generated it
        const cleanJson = textResult.replace(/^```json/, '').replace(/```$/, '').trim();
        const jsonResult = JSON.parse(cleanJson);
        return NextResponse.json({
          status: 'success',
          ...jsonResult
        });
      } catch (parseError) {
        console.error('Failed to parse Gemini response as JSON:', textResult, parseError);
        return NextResponse.json({
          status: 'success',
          qualification: 'Morno',
          reason: 'Lead analisado, mas a resposta de IA não pôde ser estruturada. Detalhes brutas: ' + textResult,
          nextSteps: 'Verifique o histórico do lead e faça contato padrão.'
        });
      }

    } else if (action === 'generate-message') {
      const prompt = `Escreva uma mensagem comercial curta e persuasiva em português brasileiro para ser enviada por WhatsApp para o cliente:
- Nome: ${lead.name}
- Status no funil: ${lead.status}
- Valor contratado/negócio: R$ ${lead.value || 'Não informado'}
- Histórico recente: ${JSON.stringify(lead.history || [])}

A mensagem deve ser direta, amigável, incluir quebras de linha adequadas, e convidar para o próximo passo comercial natural (como agendamento, tirar dúvidas do plano, ou formalizar contrato). Use emojis de forma moderada e profissional. Não utilize placeholders como [Nome] ou [Telefone] na resposta final, preencha tudo. Retorne apenas o texto final da mensagem.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
      });

      const textResult = response.text?.trim() || '';
      return NextResponse.json({
        status: 'success',
        message: textResult
      });

    } else if (action === 'dashboard-summary') {
      const prompt = `Você é um analista de vendas e diretor comercial de alto nível em uma empresa que utiliza o sistema Gente Digital. Analise as métricas do painel abaixo e escreva um resumo executivo direto e empolgante, focando no que está bom e no que precisa de atenção urgente.
Métricas do Dashboard:
${JSON.stringify(metrics || {}, null, 2)}

Seja muito breve (apenas 1 parágrafo robusto), profissional, encorajador e forneça um insight prático baseado nestes dados. Utilize formatação amigável. Retorne apenas o texto final do resumo.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt
      });

      const summaryResult = response.text?.trim() || 'A análise não pôde ser gerada no momento.';
      return NextResponse.json({
        status: 'success',
        summary: summaryResult
      });
    }

    return NextResponse.json({ error: 'Ação de IA desconhecida.' }, { status: 400 });

  } catch (error: any) {
    console.error('Error in AI Route Handler:', error);
    return NextResponse.json({ error: 'Falha interna na API de IA', details: error.message || error }, { status: 500 });
  }
}
