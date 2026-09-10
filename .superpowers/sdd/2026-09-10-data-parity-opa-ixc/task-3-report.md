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
- Duplicatas de protocolo são agrupadas com namespace explícito (`protocol:` e `source:`). Duplicatas semanticamente idênticas contam uma vez. Se `canal`, `status` ou `status_vinculo` divergirem dentro do mesmo protocolo, o grupo conta uma vez em `total`, incrementa `protocolConflicts` e é excluído de todos os agregados dimensionais. Essa é a política fail-closed até a fonte confirmar a semântica.
- Criado `tests/regression/analytics-metrics.test.ts` com fixtures sintéticas para deduplicação, permutação de conflitos, separação de namespaces, limites, timezone sob `TZ=UTC`, ISO com offsets, milissegundos, datas inválidas, agrupamento, tipos de cancelamento e contagem geral.

## Validação

- `TZ=UTC npx tsx --test tests/regression/analytics-metrics.test.ts`: 10/10 testes aprovados.
- `TZ=UTC npm test`: 35/35 testes aprovados.
- `npx tsc --noEmit`: aprovado.
- `npm run lint`: 0 erros; 2 warnings preexistentes em `components/views/colaboradores.tsx` e `components/views/leads.tsx`, ambos sobre `react-hook-form` e React Compiler.
- `git diff --check`: aprovado.

## Rodada 2 de correção

- Removida a seleção de representante por `JSON.stringify` para grupos de protocolo conflitantes. O agregador não escolhe uma dimensão arbitrária para esses grupos.
- Adicionados testes de permutação que confirmam a invariância à ordem e verificam que nenhuma dimensão do grupo conflitante aparece nos agrupamentos ou nos contadores de vínculo.
- O filtro analítico passou a rejeitar date-only no formato ISO (`2026-09-01`) e nos formatos brasileiros (`01/09/2026` e `1/9/2026`). O formato brasileiro completo com horário válido continua aceito.

## Rodada 3 de cobertura

- O teste do protocolo conflitante verifica explicitamente `linked = 0`, `unlinked = 0`, `ambiguous = 0`, `notApplicable = 0`, além de `total`, `protocolConflicts`, `byChannel = []` e `byStatus = []`.
- Cada variante date-only, com e sem espaços externos, é testada em uma chamada e um resultado independentes: `2026-09-01`, `01/09/2026` e `1/9/2026`.
- O timestamp brasileiro completo com horário válido permanece em teste separado, incluindo as variantes preenchida e não preenchida do dia e mês.
- A cobertura de namespaces de protocolo e `source_id` permanece em teste separado, sem alterar a produção.

## Limites e preocupações pendentes

- O mapa de paridade ainda marca como "a confirmar" a semântica de algumas fontes e campos de `GERAL`; os agregadores implementam apenas o contrato sintético desta tarefa.
- `protocolConflicts` evidencia conflitos de dimensões e o grupo conflitante fica fora dos agregados dimensionais. A integração real deve reconciliar esses conflitos antes de publicar indicadores definitivos.
- Nenhuma chamada real a Opa, IXC ou Supabase foi feita, e nenhum workflow remoto foi alterado ou executado.
