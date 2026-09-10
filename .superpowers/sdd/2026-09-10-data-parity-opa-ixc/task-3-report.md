# Relatório da Tarefa 3

## Status

Concluída no worktree `data-parity-opa-ixc`, partindo de `9ea44bcf8c1713adeb704e48323112ecdb82fa9f`.

## Implementação

- Criado `lib/analytics/metrics.ts` com os contratos e agregadores puros de atendimento, cancelamentos e resumo geral.
- Atendimento: filtra por `data_referencia`, inclui os limites da janela, deduplica por protocolo quando disponível e usa `source_id` como fallback. Mantém registros sem vínculo no total e ordena agrupamentos por contagem decrescente e chave ascendente.
- Cancelamentos: filtra por janela, deduplica por `source_id`, conta somente eventos `cancelamento` no total e separa `renovacao`, `upgrade` e `downgrade`.
- Resumo geral: conta leads, vendas, contratos e pré-contratos distintos por `source_id`, respeitando a janela.
- Datas analíticas passam por `normalizeSourceTimestamp`. O agregador rejeita date-only, datas impossíveis, horários inválidos e lixo, aceita ISO com Z, offset explícito, horário local do domínio e milissegundos, e compara instantes sem depender do timezone do processo.
- O resumo de atendimento distingue `vinculado`, `nao_vinculado`, `ambiguo` e `nao_aplicavel`. O total inclui os quatro estados; `unlinked` conta somente `nao_vinculado`.
- Duplicatas de protocolo são agrupadas com namespace explícito (`protocol:` e `source:`). O representante é escolhido por serialização canônica determinística. Dimensões divergentes não são descartadas silenciosamente e incrementam `protocolConflicts`.
- Criado `tests/regression/analytics-metrics.test.ts` com fixtures sintéticas para deduplicação, permutação de conflitos, separação de namespaces, limites, timezone sob `TZ=UTC`, ISO com offsets, milissegundos, datas inválidas, agrupamento, tipos de cancelamento e contagem geral.

## Validação

- `npx tsx --test tests/regression/analytics-metrics.test.ts`: 4/4 testes aprovados.
- `TZ=UTC npx tsx --test tests/regression/analytics-metrics.test.ts`: 7/7 testes aprovados.
- `TZ=UTC npm test`: 32/32 testes aprovados.
- `npx tsc --noEmit`: aprovado.
- `npm run lint`: 0 erros; 2 warnings preexistentes em `components/views/colaboradores.tsx` e `components/views/leads.tsx`, ambos sobre `react-hook-form` e React Compiler.
- `git diff --check`: aprovado.

## Limites e preocupações pendentes

- O mapa de paridade ainda marca como "a confirmar" a semântica de algumas fontes e campos de `GERAL`; os agregadores implementam apenas o contrato sintético desta tarefa.
- `protocolConflicts` evidencia conflitos de dimensões, mas o representante determinístico não expressa uma verdade semântica da fonte. A integração real deve reconciliar esses conflitos antes de publicar indicadores definitivos.
- Nenhuma chamada real a Opa, IXC ou Supabase foi feita, e nenhum workflow remoto foi alterado ou executado.
