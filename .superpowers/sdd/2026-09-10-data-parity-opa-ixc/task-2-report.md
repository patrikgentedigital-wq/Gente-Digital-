# Relatório da Tarefa 2

## Status

Concluída localmente a partir de `2c99ddd`, sem chamadas Opa, IXC ou Supabase, sem alteração de workflow remoto e sem dados de demonstração no produto.

## Implementação

- Criados os contratos de domínio em `lib/analytics/types.ts` para fontes, identificadores, vínculos, atendimentos Opa, cancelamentos IXC e métricas datadas.
- Criado `lib/analytics/normalizers.ts`.
- `preserveRawIdentifier` mantém o identificador como texto, remove apenas espaços externos e retorna `null` para entrada nula ou vazia. Zeros à esquerda são preservados.
- `classifyIdentifier` só classifica quando recebe uma dica de campo explícita. Valores numéricos, tamanhos de telefone e dicas genéricas permanecem `unknown`.
- `normalizeSourceTimestamp` usa o timezone explícito `America/Sao_Paulo` para valores sem offset, preserva a semântica de offsets fornecidos em ISO e retorna ISO UTC ou `null` para entradas inválidas.
- O parser brasileiro exige correspondência integral, valida limites de calendário e relógio e rejeita rollovers, como `31/02/2026`, `32/01/2026`, `13/13/2026`, `24:00:00` e lixo residual.
- `preserveRawIdentifier` mantém strings na fronteira, inclusive `9007199254740993`, e lança `RangeError` para inteiro numérico não seguro em vez de serializar o valor arredondado.
- Criada e ampliada a regressão `tests/regression/analytics-normalizers.test.ts`, incluindo nulos, string vazia, valor numérico, espaços, identificadores ambíguos, inteiros fora do limite seguro, timestamp ISO com offsets e timestamp brasileiro sob `TZ=UTC`.

## Evidência TDD

- RED confirmado antes da implementação: 3 falhas nas regressões dos achados do reviewer, cobrindo serialização de inteiro não seguro, timezone local e rollover de data.
- GREEN confirmado após a implementação: 9 testes específicos aprovados.
- Suíte específica executada com o processo iniciado em `TZ=UTC`: 9 testes aprovados, 0 falhas.
- Suíte completa executada com `TZ=UTC`: 25 testes aprovados, 0 falhas.
- `npx tsc --noEmit`: aprovado.
- `npm run lint`: 0 erros e 2 warnings preexistentes de `react-hooks/incompatible-library` em `components/views/colaboradores.tsx` e `components/views/leads.tsx`.

## Limites e preocupações pendentes

- A classificação depende do contrato/dica do campo. Não há inferência automática de telefone, cliente ou protocolo por formato, conforme o contrato da tarefa.
- Datas brasileiras sem offset são interpretadas em `America/Sao_Paulo`; timestamps ISO com offset usam o offset recebido. A validação de ingestão e persistência ficará para as tarefas posteriores.
- Inteiros não seguros recebidos como número são rejeitados. A origem deve transportar identificadores como strings para preservar todos os dígitos.
- Não foi feita validação contra fontes ou bancos reais, nem ativação/publicação de workflow.
