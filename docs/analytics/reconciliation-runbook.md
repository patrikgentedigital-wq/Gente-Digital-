# Runbook de reconciliação analítica

## Objetivo

Comparar, com evidência registrada, os indicadores das páginas `GERAL`, `ATENDIMENTO` e `CANCELAMENTOS` do painel com o relatório de referência do Data Studio. O Data Studio e o PDF são referências de conferência; não são fontes de ingestão do painel.

## Estado atual

**Status:** `not_comparable` para a matriz inteira.

Ainda não houve leitura autorizada do Data Studio junto com uma execução válida de ingestão Opa!/IXC e uma leitura persistida no painel. Portanto, não há valor `expected`, `actual` ou `difference` de produção neste documento. Os valores exibidos no PDF não devem ser copiados para a matriz como se fossem uma fotografia atual.

## Pré-condições

Antes de iniciar uma rodada, confirmar todos os itens abaixo:

1. A rota de listagem e a paginação do Opa! Suite estão confirmadas por documentação/configuração autorizada.
2. Os endpoints IXC de contratos, vendas e cancelamentos estão confirmados, incluindo filtros, status e campos de data.
3. A migration e as tabelas analíticas estão aplicadas no ambiente autorizado.
4. O workflow analítico é separado, pausado por padrão e faz somente leitura nas fontes.
5. A janela é curta e idêntica nas duas leituras, com timezone `America/Sao_Paulo` registrado.
6. Não há mudança simultânea de filtro, regra de deduplicação ou competência entre as leituras.
7. Os payloads e identificadores usados como evidência foram sanitizados antes de entrar em logs ou documentação.

Se uma pré-condição falhar, a rodada fica `not_comparable`. Não preencher o valor ausente com zero, valor antigo, estimativa ou número do PDF.

## Registro da rodada

Preencher uma cópia desta seção para cada rodada autorizada:

| Campo | Valor |
| --- | --- |
| ID da rodada | `<id-sanitizado>` |
| Data/hora do Data Studio | `<ISO-8601>` |
| Data/hora da leitura do painel | `<ISO-8601>` |
| Período inicial | `<ISO-8601 ou vazio>` |
| Período final | `<ISO-8601 ou vazio>` |
| Timezone | `America/Sao_Paulo` |
| Filtros do Data Studio | `<descrição sanitizada>` |
| Filtros da API | `<from/to e demais filtros>` |
| Última sincronização Opa! | `<ISO-8601 ou indisponível>` |
| Última sincronização IXC | `<ISO-8601 ou indisponível>` |
| Execução/sync run | `<id-sanitizado>` |
| Evidência | `<link ou referência interna autorizada>` |

Não registrar token, header, URL autenticada, telefone, nome, protocolo ou identificador real.

## Matriz de comparação

Para cada linha, capturar o valor do Data Studio como `expected` e o valor do painel como `actual` somente se ambos tiverem a mesma janela, filtro, timezone, regra de data e regra de deduplicação.

| metricId | Página | expected | actual | difference | status | reason |
| --- | --- | --- | --- | --- | --- | --- |
| `geral.leads` | `GERAL` | `<valor>` | `<valor>` | `<valor>` | `match|mismatch|not_comparable` | `<causa comprovada ou vazio>` |
| `geral.vendas` | `GERAL` | `<valor>` | `<valor>` | `<valor>` | `match|mismatch|not_comparable` | `<causa comprovada ou vazio>` |
| `geral.contratos` | `GERAL` | `<valor>` | `<valor>` | `<valor>` | `match|mismatch|not_comparable` | `<causa comprovada ou vazio>` |
| `atendimento.total` | `ATENDIMENTO` | `<valor>` | `<valor>` | `<valor>` | `match|mismatch|not_comparable` | `<causa comprovada ou vazio>` |
| `atendimento.protocolos` | `ATENDIMENTO` | `<valor>` | `<valor>` | `<valor>` | `match|mismatch|not_comparable` | `<causa comprovada ou vazio>` |
| `atendimento.canal` | `ATENDIMENTO` | `<valor>` | `<valor>` | `<valor>` | `match|mismatch|not_comparable` | `<causa comprovada ou vazio>` |
| `atendimento.status` | `ATENDIMENTO` | `<valor>` | `<valor>` | `<valor>` | `match|mismatch|not_comparable` | `<causa comprovada ou vazio>` |
| `cancelamentos.total` | `CANCELAMENTOS` | `<valor>` | `<valor>` | `<valor>` | `match|mismatch|not_comparable` | `<causa comprovada ou vazio>` |
| `cancelamentos.motivo` | `CANCELAMENTOS` | `<valor>` | `<valor>` | `<valor>` | `match|mismatch|not_comparable` | `<causa comprovada ou vazio>` |

Use `compareMetric` de `lib/analytics/reconciliation.ts` para gerar cada resultado. A função não aplica tolerância numérica nem coerção textual. Um valor ausente retorna `not_comparable`.

## Interpretação dos estados

- `match`: valores comparáveis e exatamente iguais, com a mesma regra de apuração.
- `mismatch`: valores comparáveis e diferentes. A causa pode ficar registrada apenas quando houver evidência, por exemplo, horários de atualização diferentes ou filtros diferentes comprovados.
- `not_comparable`: falta de valor, fonte não confirmada, janela diferente, regra de data desconhecida, cobertura parcial ou ausência de persistência confiável.

Um `mismatch` sem causa comprovada não deve ser publicado como paridade. Abrir uma nova correção de contrato, filtro ou fonte antes de promover o indicador.

## Ordem da verificação

1. Conferir `ATENDIMENTO`, porque é a página dependente da listagem histórica e paginação Opa!.
2. Conferir `CANCELAMENTOS`, validando evento, status, motivo e `data_cancelamento` no IXC.
3. Conferir `GERAL` depois que as fontes individuais estiverem estáveis, separando leads, vendas e contratos.
4. Registrar divergências por componente, nunca somente um total consolidado.
5. Repetir a rodada após qualquer mudança de fonte, filtro, janela ou deduplicação.

## Ação após a rodada

- Todos `match`: registrar a data da rodada, a cobertura e as limitações; isso comprova apenas a janela verificada, não todas as janelas históricas.
- Algum `mismatch` com causa confirmada: registrar a causa, corrigir o contrato ou filtro e repetir a comparação.
- Algum `mismatch` sem causa: interromper a publicação e abrir investigação.
- Algum `not_comparable`: manter o indicador parcial/indisponível no painel e registrar o gate pendente.

## Limites de segurança

Este runbook não autoriza login, consulta remota, execução de workflow, carga de dados, alteração de agenda n8n ou publicação do painel. A execução real exige autorização específica e deve deixar somente evidência sanitizada.
