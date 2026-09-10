# Relatório da Tarefa 4

## Status

**Parcial, com bloqueio de infraestrutura local.** O trabalho foi feito exclusivamente no worktree `data-parity-opa-ixc`, partindo de `8f86aa9ba295fee5ed4a536fa9cdacbd975b33ee`.

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
- `tests/fixtures/analytics/database-contract.ts`: contrato fixture-only, sem payload, segredo, credencial ou dado real.
- `tests/regression/analytics-database-contract.test.ts`: asserções locais sobre tabelas, estados permitidos e conjunto de entidades com `source_id` único.

O contrato mantém payloads crus somente na camada `integration`, exige RLS nas tabelas `public`, limita estados a `success`, `partial`, `failed` e `unavailable`, e deixa chaves de vínculo opcionais. A migration oficial e o teste SQL pgTAP não foram criados porque o brief exige gerar a migration pelo comando da CLI, que não está disponível. As asserções SQL para execução futura ficaram documentadas, sem fingir aplicação ou validação em Postgres.

## Verificações

- `npx tsx --test tests/regression/analytics-database-contract.test.ts`: 2 passed.
- `npm test`: 37 passed, 0 failed.
- `git diff --check`: passou.
- Varredura dos arquivos novos: somente nomes de campos e limites de segurança documentados; nenhum valor de segredo ou payload real.
- Não executados: `supabase db reset`, introspecção de tabelas/índices/RLS e SQL remoto, por ausência da CLI/banco e por restrição explícita da tarefa.

## Commit

Commit criado com:

```text
feat: add analytics source schema
```

O hash do commit está registrado no retorno final após a criação.

## Pendências e bloqueios

1. Instalar ou disponibilizar a CLI Supabase e um banco local isolado.
2. Executar `supabase migration new create_analytics_sources` e preencher o arquivo timestampado gerado, sem inventar nome de migration.
3. Criar/executar as asserções SQL com pgTAP ou runner equivalente contra o banco local.
4. Verificar constraints, índices e `relrowsecurity` após `supabase db reset`.
5. Só depois avaliar qualquer aplicação autorizada fora do ambiente local. Nenhum workflow Opa!, agenda, carga ou fonte remota foi alterado.
