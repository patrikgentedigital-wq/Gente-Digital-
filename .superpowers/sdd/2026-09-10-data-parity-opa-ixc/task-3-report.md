# Relatório da Tarefa 3

## Status

Concluída no worktree `data-parity-opa-ixc`, partindo de `9ea44bcf8c1713adeb704e48323112ecdb82fa9f`.

## Implementação

- Criado `lib/analytics/metrics.ts` com os contratos e agregadores puros de atendimento, cancelamentos e resumo geral.
- Atendimento: filtra por `data_referencia`, inclui os limites da janela, deduplica por protocolo quando disponível e usa `source_id` como fallback. Mantém registros sem vínculo no total e ordena agrupamentos por contagem decrescente e chave ascendente.
- Cancelamentos: filtra por janela, deduplica por `source_id`, conta somente eventos `cancelamento` no total e separa `renovacao`, `upgrade` e `downgrade`.
- Resumo geral: conta leads, vendas, contratos e pré-contratos distintos por `source_id`, respeitando a janela.
- Datas inválidas não entram nos agregados. A janela usa `parseFlexibleDate` já existente e não exigiu alteração em `lib/date-filters.ts`.
- Criado `tests/regression/analytics-metrics.test.ts` com fixtures sintéticas para deduplicação, limites, datas inválidas, agrupamento, tipos de cancelamento e contagem geral.

## Validação

- `npx tsx --test tests/regression/analytics-metrics.test.ts`: 4/4 testes aprovados.
- `npm test`: 29/29 testes aprovados.
- `npm run lint`: 0 erros; 2 warnings preexistentes em `components/views/colaboradores.tsx` e `components/views/leads.tsx`, ambos sobre `react-hook-form` e React Compiler.
- `npx tsc --noEmit`: aprovado.
- `git diff --check`: aprovado.

## Limites e preocupações pendentes

- O mapa de paridade ainda marca como "a confirmar" a semântica de algumas fontes e campos de `GERAL`; os agregadores implementam apenas o contrato sintético desta tarefa.
- Duplicatas de atendimento com o mesmo protocolo são reduzidas ao primeiro registro na ordem recebida. A fonte real deverá fornecer uma política explícita de seleção caso registros duplicados tenham dimensões divergentes.
- Nenhuma chamada real a Opa, IXC ou Supabase foi feita, e nenhum workflow remoto foi alterado ou executado.
