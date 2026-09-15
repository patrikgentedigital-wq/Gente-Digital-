# Analytics section readiness implementation plan

> **Para agentes de implementação:** use `superpowers:subagent-driven-development` ou `superpowers:executing-plans` para executar este plano tarefa por tarefa. As etapas usam checkboxes para acompanhamento.

**Objetivo:** permitir que o painel mostre cada área somente quando a fonte daquela área estiver comprovadamente pronta, sem esconder OPA e IXC válidos por causa de métricas ainda não carregadas e sem transformar métricas indisponíveis em zero.

**Arquitetura:** a API continuará sendo a única fronteira de leitura do Supabase. A resposta passará a informar o estado de `geral`, `atendimento` e `cancelamentos` separadamente. A interface usará esse estado por aba e manterá `null` para indicadores sem fonte confirmada.

**Tecnologias:** Next.js App Router, React, TypeScript, Supabase server-side, Node test runner via `tsx`.

**Especificação:** `docs/superpowers/specs/2026-09-10-data-parity-opa-ixc-design.md`.

## Restrições globais

- O escopo contém somente `GERAL`, `ATENDIMENTO` e `CANCELAMENTOS`.
- O navegador nunca consulta Opa! Suite ou IXC diretamente.
- A chave secreta do Supabase permanece somente em servidor ou n8n.
- Uma fonte parcial, falha ou sem cobertura não pode aparecer como indicador numérico confirmado.
- Valores `0` continuam válidos somente quando a fonte está pronta e a consulta confirmou ausência de registros.
- Toda mudança de comportamento deve seguir teste falhando, implementação mínima e teste verde.

---

### Tarefa 1: Cobrir o contrato de prontidão por seção

**Arquivos:**

- Modificar: `tests/regression/analytics-readiness.test.ts`
- Modificar: `tests/regression/analytics-api-contract.test.ts`

**Interface produzida:** `AnalyticsOverviewResponse.meta.sections` com os estados das três áreas.

- [x] Escrever teste que carregue leads disponíveis, vendas e contratos não confirmados, OPA e IXC com sincronização `success`, e espere `geral: partial`, `atendimento: success` e `cancelamentos: success`.
- [x] Escrever teste que confirme que uma área sem cobertura não retorna estado `success` e não pode ser exibida como número confirmado.
- [x] Atualizar o fixture de resposta da API para declarar os três estados de seção.
- [x] Rodar o teste direcionado primeiro em estado RED e depois confirmar o GREEN após a implementação.

### Tarefa 2: Produzir estados e valores seguros na camada analítica

**Arquivos:**

- Modificar: `lib/analytics/response.ts`
- Modificar: `lib/analytics/query.ts`
- Modificar: `lib/analytics/metrics.ts` somente se a tipagem dos estados vazios exigir valores nulos

**Interfaces produzidas:**

```ts
type AnalyticsSectionId = 'geral' | 'atendimento' | 'cancelamentos';

interface AnalyticsSectionStatuses {
  geral: AnalyticsStatus;
  atendimento: AnalyticsStatus;
  cancelamentos: AnalyticsStatus;
}
```

- [x] Derivar `geral` a partir das famílias de leads, vendas e contratos, mantendo `null` para famílias que ainda não têm carga própria.
- [x] Derivar `atendimento` a partir da família OPA e `cancelamentos` a partir da família IXC.
- [x] Entregar resumo vazio com valores nulos quando a seção não tiver cobertura pronta, mantendo zero somente para uma consulta válida que retornou nenhum registro.
- [x] Serializar `meta.sections` por allow-list e manter a remoção de payloads e erros internos.
- [x] Rodar os dois testes da Tarefa 1 e confirmar o verde.

### Tarefa 3: Usar prontidão por aba no painel

**Arquivos:**

- Modificar: `components/views/analytics/analytics-view.tsx` somente se o contrato de meta exigir ajuste de tipo
- Modificar: `components/views/analytics/geral-view.tsx`
- Modificar: `components/views/analytics/atendimento-view.tsx`
- Modificar: `components/views/analytics/cancelamentos-view.tsx`
- Modificar: `components/views/analytics/analytics-primitives.tsx`

- [x] Fazer `GERAL` exibir as métricas disponíveis e manter `—` nas métricas sem fonte confirmada.
- [x] Fazer `ATENDIMENTO` exibir OPA quando a seção estiver `success`, mesmo que `GERAL` permaneça `partial` por vendas ou contratos.
- [x] Fazer `CANCELAMENTOS` exibir IXC quando a seção estiver `success`, mesmo que outra seção esteja parcial.
- [x] Ajustar mensagens para explicar cobertura parcial sem afirmar que toda a leitura está indisponível.
- [x] Rodar `npm test`, `npm run lint`, `npm run build` e `git diff --check` após a última alteração de código.
- [x] Fazer validação visual local com a API indisponível e validar o fixture parcial nos testes de prontidão, confirmando ausência de zeros artificiais.

## Gate de entrega

O trabalho só será considerado pronto quando os testes diferenciarem estado geral de estado por seção, a API permanecer protegida e o painel mostrar os dados OPA/IXC confirmados sem liberar indicadores de fonte ainda inexistente. O branch local não será publicado nem o workflow n8n será ativado por este plano.
