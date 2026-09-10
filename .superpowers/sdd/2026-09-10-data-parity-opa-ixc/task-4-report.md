# Relatório da Tarefa 4

## Status

**Parcial, com bloqueio de infraestrutura local.** As rodadas 1 e 2 foram feitas exclusivamente no worktree `data-parity-opa-ixc`, sobre o commit revisado `468284e295741d61787b3a7817561f5796f351cc`, partindo originalmente de `8f86aa9ba295fee5ed4a536fa9cdacbd975b33ee`.

## Descoberta inicial

Executados, nesta ordem, os comandos exigidos pelo brief:

```text
supabase --help
supabase db --help
supabase migration --help
```

Os três falharam porque `supabase` não está instalado ou não está no `PATH`. A checagem complementar também não encontrou `docker` nem `docker compose`, e não havia variáveis de conexão Supabase/Postgres expostas no ambiente. Nenhum SQL remoto foi executado.

## Entregas

- `docs/analytics/database-contract.md`: contrato das três tabelas `integration`, sete projeções `public`, proveniência, datas, campos brutos, relações opcionais com IXC, retenção, acesso, RLS e estados de sincronização.
- `tests/fixtures/analytics/database-contract.ts`: manifesto tipado fixture-only, com listas exatas de tabelas, campos mínimos, tipos, índices, relações, RLS, isolamento e alvo de privilégios, sem payload, segredo, credencial ou dado real.
- `tests/regression/analytics-database-contract.test.ts`: asserções locais exatas sobre as três tabelas de integração e sete públicas, seis entidades com `source_id` único, tipos/campos mínimos, payload `jsonb` somente em raw, `request_id` único, estados permitidos, relações opcionais e isolamento.

O contrato mantém payloads crus somente na camada `integration`, exige RLS nas tabelas `public` e `integration` como defesa em profundidade, limita estados a `success`, `partial`, `failed` e `unavailable`, e usa relações text nullable com sufixo `_source_id` para apontar ao `source_id` textual. A migration oficial e o teste SQL pgTAP não foram criados porque o brief exige gerar a migration pelo comando da CLI, que não está disponível. As asserções SQL para execução futura ficaram documentadas, sem fingir aplicação ou validação em Postgres.

## Correções da rodada 1

O reviewer apontou que os testes anteriores verificavam apenas comprimentos e presenças parciais. A rodada substituiu o objeto simples por um manifesto tipado e passou a comparar listas exatas. Também fechou a convenção de relações:

- `text nullable` com sufixo `_source_id` aponta para `source_id` textual;
- `sync_run_id` permanece `uuid nullable` apontando logicamente para `integration.sync_runs.id`;
- relações opcionais são indexadas e as FKs ficam adiadas na migration inicial para permitir ingestão e reprocessamento fora de ordem;
- o encadeamento Opa atendimento → interação → IXC só usa chaves explicitamente previstas, sem inferência de contato, nome ou protocolo;
- todas as entidades de origem têm `source_id` textual, sem payload público;
- as sete tabelas `public` e as três de `integration` exigem RLS, começam sem policies permissivas e negam `anon`/`authenticated`;
- `integration.*` permanece fora do Data API, e o alvo de `REVOKE`/`ALTER DEFAULT PRIVILEGES` é testado como contrato, não como SQL aplicado.

## Correções da rodada 2

O reviewer apontou duas lacunas remanescentes. A rodada adicionou uma expectativa independente para `source_id` nas duas tabelas raw, verificando explicitamente `text`, `not null`, `unique` e índice. Também substituiu o mapa parcial de tipos por `expectedColumnsByTable`, uma expectativa literal completa para cada coluna das três tabelas de integração e sete tabelas públicas.

O teste canonicaliza somente a representação do manifesto para comparar todos os atributos exigidos (`name`, `type`, `nullable`, `unique`, `indexed`, `payload` e `allowedValues` quando aplicável). A comparação é feita contra a expectativa independente e falha para coluna ausente, extra, reordenada ou com qualquer atributo alterado. O manifesto agora materializa `unique`, `indexed` e `payload` como booleanos em cada coluna.

A unicidade ficou separada em duas invariantes: cada `source_id` das duas raw e das seis entidades públicas é único dentro da respectiva tabela; `public.analytics_sync_status`, que não possui `source_id`, mantém adicionalmente a unicidade composta por `source_system`, `period_start` e `period_end`. O teste verifica ambas sem usar a composição como substituta de `source_id`.

### Verificações da rodada 2

- RED: 2 testes falharam, um para a expectativa completa e outro para o `source_id` independente das raw, devido aos atributos omitidos no manifesto anterior.
- GREEN: `npx tsx --test tests/regression/analytics-database-contract.test.ts`: 13 passed, 0 failed.
- `npm test`: 48 passed, 0 failed.
- `npx tsc --noEmit`: passou.
- `npm run lint`: passou com os 2 warnings preexistentes de `react-hooks/incompatible-library` em `components/views/colaboradores.tsx:160` e `components/views/leads.tsx:314`; nenhum erro novo.
- `git diff --check`: passou.
- Não executados: CLI Supabase, Docker, Postgres local, SQL remoto, `service_role`, workflows Opa! e migration manual.

## Verificações

- RED da rodada: 8 testes falharam contra o manifesto antigo, confirmando a lacuna antes da implementação.
- GREEN da rodada: `npx tsx --test tests/regression/analytics-database-contract.test.ts`: 11 passed, 0 failed.
- `npm test`: 46 passed, 0 failed.
- `npx tsc --noEmit`: passou.
- `npm run lint`: passou com 2 warnings preexistentes de `react-hooks/incompatible-library` em `components/views/colaboradores.tsx:160` e `components/views/leads.tsx:314`; nenhum erro novo.
- `git diff --check`: passou.
- Varredura dos arquivos novos: somente nomes de campos e limites de segurança documentados; nenhum valor de segredo ou payload real.
- Não executados: `supabase db reset`, introspecção de tabelas/índices/RLS e SQL remoto, por ausência da CLI/banco e por restrição explícita da tarefa.

## Commit

Commit-base revisado:

```text
8783ab2aae2ed40e10ef0fa14673bf5223a14fdc
```

Commit da rodada 1:

```text
ffcc71e6f4297e73bb23f1ca731c4d125cb21642
```

Mensagem:

```text
fix: strengthen analytics schema contract
```

O relatório foi atualizado em um commit documental posterior. Nenhuma migration foi reescrita ou criada manualmente.

Commit da rodada 2 será registrado após a criação, seguido de um commit documental que acrescentará o hash completo sem reescrever a migration bloqueada.

## Pendências e bloqueios

1. Instalar ou disponibilizar a CLI Supabase e um banco local isolado.
2. Executar `supabase migration new create_analytics_sources` e preencher o arquivo timestampado gerado, sem inventar nome de migration.
3. Criar/executar as asserções SQL com pgTAP ou runner equivalente contra o banco local.
4. Verificar constraints, índices e `relrowsecurity` após `supabase db reset`.
5. Só depois avaliar qualquer aplicação autorizada fora do ambiente local. Nenhum workflow Opa!, agenda, carga ou fonte remota foi alterado.
