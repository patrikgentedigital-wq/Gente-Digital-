# Indicações de pós-venda no Indique e Ganhe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar as coletas de contatos feitas depois de uma venda, acompanhar os contatos no Kanban existente e medir contratos novos confirmados por verificação no IXC.

**Architecture:** A interface de Leads chama rotas server-side autenticadas. Uma camada de domínio valida contratos e telefones, reconcilia contratos ativos do IXC e calcula métricas; o banco guarda coletas, cada contato e cada contrato confirmado, mantendo `leads.ref` com o significado atual. A gravação da coleta e de seus leads é transacional e idempotente.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase/PostgREST com acesso `service_role` somente no servidor, SQL de migration, `node:test` com `tsx`, ESLint.

**Spec:** [2026-09-30-indicacoes-pos-venda-design.md](../specs/2026-09-30-indicacoes-pos-venda-design.md)

## Premissas de implementação

- Executar em um worktree isolado criado de `origin/main`, que está 63 commits à frente do checkout atual; levar para ele somente a especificação aprovada no commit `9b3df72` e este plano. Preservar os não rastreados existentes `automacoes/` e `docs/` no checkout atual.
- O CLI Supabase e o scaffold `supabase/` não existem neste checkout. Inicializar o scaffold apenas se necessário, usar `supabase migration new` para gerar o arquivo com o nome correto e revisar todo arquivo criado por `supabase init`. Não aplicar nem publicar a migration nesta execução.
- Reconciliar contratos em ação administrativa explícita, usando os helpers e credenciais IXC existentes. Não inferir conversão pelo status `Ganho` nem pelo payload atual do webhook, que não garante um ID exato de contrato.
- Preencher `leads.ref` com o cliente de origem confirmado pelo contrato, nunca com o colaborador coletor. O coletor continua em coluna própria; isso protege o significado atual de `ref` usado por comissões.
- Para métricas de atendimento, usar o primeiro evento confiável de `lead_history`; se não houver evento interpretável, informar o dado como indisponível.

## Global Constraints

- Manter `leads.ref` com seu significado atual de origem ou cliente indicador.
- Guardar a origem e a autoria da coleta separadamente.
- Guardar o coletor por identificador estável de `colaboradores`.
- Não inferir a identidade do coletor pelo CPF da pessoa indicada nem por nomes livres.
- Uma restrição única ao contrato impede registro duplicado em reenvios.
- Impedir que o mesmo ID de contrato seja contado mais de uma vez.
- A associação automática exige verificar o contrato no IXC e encontrar um único telefone normalizado correspondente ao cliente.
- Se o telefone já existir como lead, preservar sua atribuição original; sinalizar a duplicidade e impedir novo cadastro ou crédito automático.
- Usar o fuso horário `America/Sao_Paulo` e períodos inclusivos.
- Leads antigos sem coletor ou contrato associado ficam como **não informado**; não atribuir histórico por aproximação.
- Na primeira versão, apresentar a base como **vendas de origem registradas no painel**.
- Não declarar cobertura sobre todas as vendas elegíveis até confirmar e reconciliar uma fonte IXC completa, inclusive para vendas sem coleta.
- Exigir usuário autenticado e papel autorizado; resolver o coletor no servidor pela sessão e vínculo em `colaboradores`.
- Restringir vendedores aos registros permitidos pelo vínculo verificado.
- Administradores podem consultar a equipe e corrigir atribuições com auditoria.
- Proteger as tabelas expostas com RLS e nunca enviar tokens do IXC ao navegador.
- Revogar `anon` e `authenticated` somente das tabelas novas; conceder explicitamente ao `service_role` o acesso necessário pelo Data API.
- Salvar a coleta e seus leads associados de modo atômico e idempotente.
- Não mostrar a coleta como registrada antes da confirmação do banco.
- Separar a situação operacional do Kanban da confirmação de contrato.
- Mover um lead manualmente para **Ganho** não comprova uma venda para esse relatório.
- Não alterar comissões ou recalcular pagamentos, atribuir leads históricos por aproximação, reabrir abas administrativas ocultas, publicar o painel ou usar vendas reais durante testes.

## Review Focus

- `user_metadata.role` não pode conceder acesso administrativo; vendedor não pode ler coletas de outro colaborador nem contornar o escopo pela leitura direta do navegador. Cobrir em `tests/regression/post-sale-api.test.ts` e no teste de fronteira de Leads.
- Reenvio, zero contatos, telefone inválido, telefone duplicado em formato diferente e duplicidade com lead existente não podem criar coleta/leads parciais nem sobrescrever atribuição. Cobrir em `tests/regression/post-sale-domain.test.ts` e `post-sale-migration.test.ts`.
- `ref` deve continuar sendo o cliente/origem e `post_sale_collection_id`/colaborador devem ficar separados; status manual `Ganho` e webhook sem ID de contrato não podem criar conversão. Cobrir nos testes de handler e no contrato de regressão de comissões.
- Um contrato IXC ativo só pode ser ligado automaticamente a um único contato por telefone normalizado; ambiguidade fica pendente para revisão administrativa com justificativa. Cobrir com handlers IXC injetáveis, sem rede nem credenciais reais.
- Data da coleta e ativação do contrato devem filtrar meses distintos corretamente em `America/Sao_Paulo`; vários contratos de um contato contam como vários contratos e um contato convertido. Cobrir em `post-sale-domain.test.ts`.

## Tasks

### Task 1: Criar o modelo persistente e a gravação atômica

**Files:** `supabase/config.toml` (somente se necessário), `supabase/migrations/<nome gerado pelo CLI>.sql`, `tests/regression/post-sale-migration.test.ts`.

**Interfaces:**

- `post_sale_collections`: contrato de origem IXC textual e único, cliente de origem, data da venda, `collector_colaborador_id` (`colaboradores.id`), usuário que registrou, resultado (`contacts_collected` ou `no_referral`) e timestamps.
- `post_sale_contacts`: uma linha por contato submetido, telefone normalizado, estado (`created_lead`, `duplicate_existing` ou `invalid`), motivo e `lead_id` anulável. Duplicatas e inválidos ficam auditáveis sem criar lead fictício.
- `post_sale_conversions`: ID textual e único do contrato IXC, data de ativação e verificação, contato ligado anulável, estado (`confirmed` ou `pending_review`), revisor e justificativa. Um contato pode ter vários contratos.
- `leads.post_sale_collection_id` nullable. Descobrir o tipo real de `leads.id` antes de declarar referências; `colaboradores.id` é `text`.
- RPC `create_post_sale_collection_with_contacts(...)`, `SECURITY INVOKER`, que grava coleta, contatos, leads novos e histórico em uma transação. A rota só recebe o colaborador já resolvido no servidor. `ON CONFLICT` pela origem IXC devolve resultado idempotente, sem uma segunda coleta.

- [x] Escrever primeiro `post-sale-migration.test.ts`, cobrindo as três tabelas, unicidades, checks, relação nullable, RLS, grants explícitos mínimos ao `service_role`, revokes por tabela para `anon`/`authenticated`, execução restrita da RPC e ausência de revoke amplo ou segredo no SQL.
- [x] Rodar `npm test` e confirmar que o novo contrato de migration falha antes de criar o schema, preservando a suíte atual.
- [x] Inicializar apenas o scaffold Supabase necessário; gerar a migration com `supabase migration new post_sale_referrals` e manter o caminho/nome emitidos pelo CLI.
- [x] Inspecionar a definição implantada/documentada de `leads.id`, `colaboradores.id`, políticas e índices de telefone; ajustar a migration ao tipo real sem apagar, normalizar em massa ou reatribuir registros existentes. Acesso MCP ao catálogo de produção foi negado; a migration resolve o tipo físico pelo catálogo ao aplicar.
- [x] Implementar tabelas, índices, RLS deny-by-default, revokes somente nas tabelas novas para `anon`/`authenticated`, grants explícitos mínimos para `service_role` e RPC `SECURITY INVOKER` com `search_path` fixo; não criar policies genéricas para autenticados.
- [x] Implementar no RPC a deduplicação transacional por telefone normalizado, preservando leads existentes, e inserir leads novos com `ref` do cliente de origem e o vínculo `post_sale_collection_id`.
- [x] Rodar `npm test` e confirmar que o teste da migration passa; inspecionar `git diff --check` e os arquivos gerados pelo `supabase init` antes de incluí-los.
- [x] Commitar somente os arquivos desta tarefa: `feat: criar persistencia de indicacoes pos-venda`.

### Task 2: Implementar regras de domínio, IXC e métricas

**Files:** `lib/post-sale/phones.ts`, `lib/post-sale/contracts.ts`, `lib/post-sale/metrics.ts`, `lib/post-sale/ixc.ts`, `tests/regression/post-sale-domain.test.ts`.

**Interfaces:**

```ts
normalizePhoneDigits(input: string): string
validateOriginContract(contractId: string): Promise<VerifiedOriginContract>
reconcileContractsForContacts(contacts: PostSaleContact[], ixc: IxcGateway): Promise<ConversionCandidate[]>
buildPostSaleMetrics(data: PostSaleDataset, window: PostSaleWindow): PostSaleMetrics
```

- [x] Escrever testes para telefones em formatos diferentes, limites de tamanho, repetição dentro da lista, ID IXC textual com zeros à esquerda e datas inválidas.
- [x] Escrever testes de métricas para zero contatos, origem registrada, pendências, vários contratos em um contato e conversão em mês diferente da coleta, com janela inclusiva de São Paulo.
- [x] Rodar `npm test` e confirmar falha inicial nos novos casos.
- [x] Implementar normalização somente de dígitos, sem converter identificadores IXC em número nem remover zeros à esquerda.
- [x] Implementar gateway injetável usando `getIxcCredentials` e `fetchIxcWithTimeout`; verificar ID exato, status ativo, cliente e data válida; devolver erro sanitizado sem log de telefone, payload ou credencial.
- [x] Implementar associação automática somente para uma correspondência única de telefone; retorno zero ou múltiplo deve produzir caso para revisão, nunca escolher pelo nome mais próximo.
- [x] Implementar métricas separando data da coleta de data de ativação; `Ganho` isolado não participa dos contratos confirmados e dados antigos sem vínculo aparecem como não informados.
- [x] Rodar `npm test` e confirmar que os testes de domínio passam; commit: `feat: definir regras de pos-venda e reconciliacao ixc`.

### Task 3: Criar APIs protegidas para coleta, escopo e reconciliação

**Files:** `app/api/post-sale/contracts/validate/route.ts`, `app/api/post-sale/collections/route.ts`, `app/api/post-sale/reconcile/route.ts`, `app/api/post-sale/conversions/[id]/review/route.ts`, `app/api/leads/route.ts`, `lib/post-sale/handlers.ts`, `tests/regression/post-sale-api.test.ts`, `tests/regression/analytics-server-boundary.test.ts`.

**Interfaces:**

- `POST /api/post-sale/contracts/validate`: valida um contrato exato no IXC e retorna somente os dados necessários à conferência.
- `GET, POST /api/post-sale/collections`: lista por papel e período ou cria coleta com contatos usando a RPC transacional; ignora qualquer `collector_colaborador_id` enviado pelo navegador.
- `POST /api/post-sale/reconcile`: somente admin; verifica contratos ativos exatos para contatos pós-venda e grava confirmado ou pendente idempotentemente.
- `POST /api/post-sale/conversions/:id/review`: somente admin; liga caso pendente a um contato e exige justificativa, revisor e auditoria persistidos.
- `GET /api/leads`: inclui ao escopo próprio os leads vinculados às coletas do colaborador autenticado, sem alterar filtro/semântica de `ref`.

- [x] Criar testes injetáveis para `401`, `403`, papel resolvido sem confiar em `user_metadata`, falha/timeout IXC, contrato inativo, corpo adulterado com ID de outro coletor, e vendedor que consulta ID de coleta alheia.
- [x] Cobrir idempotência em retries, confirmação `no_referral`, erro no meio da persistência, duplicata existente e telefone ambíguo encaminhado a revisão.
- [x] Cobrir que status manual `Ganho` e webhook IXC sem ID exato não criam `post_sale_conversions`; cobrir revisão admin com justificativa obrigatória.
- [x] Rodar `npm test` e confirmar falha dos novos cenários antes dos handlers.
- [x] Implementar os handlers com dependências injetáveis e rotas com autenticação, papel seguro e checagem do vínculo sessão→colaborador; chamar `getUserRole` sem passar `user_metadata` para estas decisões.
- [x] No escopo vendedor, consultar os IDs de `post_sale_collections` próprios e unir esses leads aos leads já permitidos por `ref`, deduplicando IDs. Não usar filtros `.or()` construídos a partir de entrada livre.
- [x] Ampliar o relatório de API com filtro por coletor/período, totais e linhas necessárias a drill-down/exportação; vendedor recebe apenas sua própria visão.
- [x] Atualizar testes de fronteira para exigir cliente IXC, `service_role` e `supabase-admin` somente no servidor.
- [x] Rodar `npm test` e revisar respostas de erro/seleção de campos para não vazar token, payload IXC ou registros de outro colaborador; commit: `feat: proteger APIs de coleta e conversao`.

### Task 4: Integrar o fluxo e relatório à página de Leads

**Files:** `components/views/leads.tsx`, `components/views/post-sale-panel.tsx`, `components/views/post-sale-collection-dialog.tsx`, `components/views/post-sale-review-dialog.tsx`, `tests/regression/post-sale-api.test.ts` (contratos de payload/serialização, se necessário).

- [x] Acrescentar a aba **Pós-venda** e a ação **Registrar coleta de pós-venda**, mantendo Kanban e lista atuais acessíveis.
- [x] Criar o formulário de origem com validação IXC antes da confirmação, cliente/data/colaborador conferidos, múltiplos contatos, ação explícita **Não recebeu contatos**, rascunho recuperável após falha e confirmação somente depois da resposta persistida.
- [x] Mostrar contato inválido e duplicado como estados auditáveis; não criar lead adicional nem substituir a atribuição existente. Exibir o cliente de origem em `ref` e manter coletor/responsável separados.
- [x] Criar relatório com período de coleta e período de conversão independentes, coletor/responsável, registrados, contatos válidos/inválidos/duplicados, em atendimento, pendentes de revisão, contatos convertidos, contratos confirmados e tempo até primeiro atendimento quando disponível.
- [x] Adicionar ação administrativa **Atualizar fechamentos no IXC**, estado de execução e tabela de revisão; não disparar reconciliação nem chamadas IXC automaticamente ao abrir a tela.
- [x] Adicionar filtros e exportação CSV aos registros visíveis, mantendo os escopos e totais idênticos aos da API; rotular a base como **vendas de origem registradas no painel** e omitir cobertura total.
- [x] Corrigir `fetchLeads`: se `/api/leads` retornar sucesso com lista vazia, aceitar a lista vazia; remover fallback client-side sem escopo que consulta todos os leads quando a API falha ou não retorna itens.
- [x] Validar estados de carregamento, vazio, contrato repetido, erro IXC, erro recuperável, acesso negado, revisão pendente e layout em telas estreitas; preservar componentes, cores e tipografia atuais.
- [x] Rodar `npm test`, `npm run lint` e `npm run build`; abrir a tela local com dados sintéticos e verificar fluxo de coleta, filtro, exportação e acesso vendedor/admin; commit: `feat: adicionar painel de indicacoes pos-venda`.

### Task 5: Verificação integrada e limites de publicação

**Files:** testes regressivos existentes e novos, migration gerada, `docs/superpowers/specs/2026-09-30-indicacoes-pos-venda-design.md` somente se a implementação precisar documentar desvio aprovado.

- [x] Executar `npm test`, `npm run lint`, `npm run build` e `git diff --check`; corrigir falhas sem ampliar o escopo de comissão.
- [x] Verificar nos testes e no diff que o status `Ganho` sozinho não vira conversão, que vários contratos não duplicam contato convertido e que nenhum código client-side importa `supabase-admin` ou recebe credenciais IXC.
- [ ] Fazer uma revisão final dos escopos de admin/vendedor, idempotência, RLS/grants, resposta vazia de `/api/leads`, intervalos de data e conteúdo CSV.
- [x] Preservar o checkout atual e seus não rastreados; não executar migration remota, não usar vendas reais e não publicar/deployar nesta etapa.
- [ ] Apresentar ao usuário o diff e qualquer limitação da verificação local do SQL antes de pedir autorização separada para aplicar a migration ou publicar.

## Self-review

- **Cobertura da spec:** coleta com zero contatos, contatos válidos/inválidos/duplicados, vínculo ao Kanban, coletor separado, validação exata do contrato, conversão/pendência, admin review, métricas e CSV aparecem nas tarefas.
- **Granularidade:** cada tarefa tem arquivos definidos, testes antes da implementação e comando de validação; cada commit tem escopo nomeado.
- **Consistência de interfaces:** IDs IXC permanecem `string`; IDs de colaboradores usam `text`; leads usam o tipo nativo verificado da tabela; datas são `timestamptz` e filtros convertem o fuso de São Paulo.
- **Review Focus coberto:** autenticação/escopo na Task 3–4; atomicidade e dedupe na Task 1–3; compatibilidade com comissões/webhook na Task 2–5; ambiguidade IXC na Task 2–3; métricas e períodos nas Tasks 2 e 4.
- **Proporção:** mantém a página/fluxo atual, adiciona somente as entidades e rotas necessárias e deixa publicação, pagamentos e reconciliação ampla de todas as vendas fora desta entrega.
