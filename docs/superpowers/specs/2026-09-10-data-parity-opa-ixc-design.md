# Paridade de dados Opa! Suite e IXC no Indique e Ganhe

**Status:** proposta aprovada para especificação e revisão; implementação ainda não iniciada.

**Data:** 2026-09-10

## Objetivo

Reproduzir no painel do Indique e Ganhe os dados das páginas `GERAL`, `ATENDIMENTO` e `CANCELAMENTOS` do relatório de referência do Data Studio, usando dados atuais do Opa! Suite, IXC e das tabelas existentes da aplicação.

O requisito de igualdade é de dados, não de aparência. Para o mesmo período e os mesmos filtros, o painel deve produzir os mesmos valores, totais, agrupamentos, registros brutos e regras de cálculo do relatório de referência.

## Escopo

### Incluído

- Página `GERAL`.
- Página `ATENDIMENTO`.
- Página `CANCELAMENTOS`.
- Carga histórica e atualização incremental, condicionadas à capacidade comprovada das APIs.
- Preservação dos valores brutos retornados pelas fontes.
- Relacionamento entre Opa! Suite e IXC apenas por chaves comprovadas.
- Persistência auditável no Supabase.
- API protegida do Next.js para os indicadores.
- Reconciliação dos resultados com o Data Studio.

### Não incluído

- Páginas `HUNTER` e `FARMER`.
- Dependência do Data Studio como fonte operacional do painel.
- Cópia fixa dos números do snapshot.
- Consulta direta do Opa! Suite ou do IXC pelo navegador.
- Execução de workflows de produção nesta fase de desenho.
- Alteração de credenciais, ativação de agenda ou publicação.
- Recriação obrigatória do layout visual do Data Studio.

## Evidências atuais

- O relatório de referência exibe `Opa! Suite` como fonte e contém dimensões de atendimento, incluindo protocolo, contato, canal, atendente, departamento, datas, motivo, status, avaliação, FCR e indicadores de finalização.
- O n8n possui workflows operacionais do Opa! Suite e uma chamada server-side autenticada para `GET https://gentedigital.opasuite.com.br/api/v1/atendimento`, usando uma credencial Bearer existente e consultando atendimento por protocolo com limite unitário.
- A chamada observada comprova acesso operacional à API, mas não comprova a rota de listagem histórica, filtros por período, paginação ou a origem direta de todos os indicadores do relatório.
- O checkout do projeto é uma aplicação Next.js com Supabase e já possui integração relacionada ao IXC, mas não possui modelo nativo completo para atendimentos Opa! Suite.
- Existe uma Data Table operacional do n8n para atendimentos vistos pelo agente. Ela não contém, sozinha, todos os campos necessários para reproduzir as três páginas.

## Requisitos funcionais

### RF-01: Escopo de páginas

O produto deve disponibilizar dados somente para `GERAL`, `ATENDIMENTO` e `CANCELAMENTOS` neste ciclo.

### RF-02: Paridade de dados

Cada indicador, tabela ou agrupamento deve ter uma definição explícita com:

```text
página
componente
campo de origem
fonte
endpoint ou consulta
filtro
data de referência
regra de contagem ou cálculo
agrupamento
chave de relacionamento
resultado de validação
```

Para um período e filtro equivalentes, a diferença aceitável entre o painel e o Data Studio é zero, salvo diferença documentada de horário de atualização ou limitação comprovada da fonte.

### RF-03: Preservação do dado bruto

O número exibido no relatório deve ser armazenado como valor original, em campo separado, sem ser convertido automaticamente em nome de cliente.

O modelo deve distinguir:

```text
contato_bruto ou identificador_bruto
tipo_identificador
ixc_customer_id
ixc_contract_id
nome_cliente_ixc
status_vinculo
```

`nome_cliente_ixc` será nulo quando não houver correspondência segura. `status_vinculo` deve representar `vinculado`, `nao_vinculado`, `ambiguo` ou `nao_aplicavel`.

### RF-04: Responsabilidade das fontes

Opa! Suite será a fonte preferencial de atendimentos e interações. IXC será a fonte preferencial de cliente, contrato, serviço, situação contratual, venda e cancelamento. A página `GERAL` poderá combinar as fontes e as tabelas atuais do Indique e Ganhe, mas cada componente deve confirmar sua fonte e regra durante o mapeamento.

Nenhum registro de origem deve ser sobrescrito por um valor enriquecido de outra fonte.

### RF-05: Carga histórica e incremental

O pipeline deve suportar, quando a API permitir:

- carga inicial por janelas de período;
- paginação determinística;
- atualização incremental por data de alteração ou cursor;
- reprocessamento de uma janela sem duplicar registros;
- captura de eventos complementares por webhook;
- reconciliação periódica para eventos perdidos.

Se a fonte não oferecer algum desses recursos, a limitação deve aparecer no estado da sincronização e no resultado da reconciliação.

### RF-06: Idempotência

O identificador da origem deve ser a chave primária lógica de cada entidade. Protocolo, ID de cliente, ID de contrato ou outro identificador só poderá ser usado como chave quando sua semântica estiver confirmada.

Reprocessar a mesma página ou janela deve atualizar o registro existente, não criar duplicata.

### RF-07: Estado de atualização

O painel deve exibir, direta ou indiretamente pela API, a situação da última sincronização válida:

```text
ultima_atualizacao
periodo_carregado
fonte
registros_recebidos
registros_processados
registros_com_falha
status
```

Os estados mínimos são `success`, `partial`, `failed` e `unavailable`. Falha de sincronização não pode ser convertida em zero.

## Modelo de dados

### Camada de integração restrita

Payloads completos e informações potencialmente sensíveis devem ficar em uma camada de acesso restrito, fora do fluxo direto do navegador:

```text
integration.opa_records_raw
integration.ixc_records_raw
integration.sync_runs
```

Cada registro bruto deve ter origem, identificador externo, hash do payload, data de recebimento e execução de sincronização. Logs não devem incluir payload completo, tokens, telefones ou dados pessoais desnecessários.

### Camada normalizada

As entidades normalizadas devem manter os campos necessários para auditoria e consulta:

```text
public.opa_attendances
public.opa_interactions
public.ixc_customers
public.ixc_contracts
public.ixc_sales
public.ixc_cancellations
```

Os nomes são contratos lógicos do design. A migration deverá confirmar tipos, índices, nulabilidade, chaves externas e grants antes de ser aplicada.

Campos de proveniência comuns:

```text
source_system
source_id
source_updated_at
synced_at
sync_run_id
```

Relacionamentos Opa! Suite ↔ IXC devem ser opcionais. Um atendimento sem correspondência no IXC permanece consultável e contabilizável.

### Camada analítica

Os dados exibidos pelo painel devem ser derivados de consultas analíticas, não de valores fixos:

```text
public.atendimento_summary
public.cancelamentos_summary
public.geral_summary
```

As views ou consultas equivalentes devem documentar a data de referência, os filtros e a regra de deduplicação. Se uma view for exposta pelo Data API, deverá ter RLS e comportamento de segurança compatível com o modelo de acesso. Views privilegiadas não devem virar um bypass implícito de RLS.

## Fluxo de dados

```text
Opa! Suite API ou webhook
        ↓
n8n: sincronização analítica isolada
        ↓
integration: registro bruto restrito
        ↓
opa_attendances / opa_interactions

IXC API ou fluxo de integração existente
        ↓
n8n ou adaptador server-side validado
        ↓
integration: registro bruto restrito
        ↓
ixc_customers / ixc_contracts / ixc_sales / ixc_cancellations

Entidades normalizadas
        ↓
Views e consultas analíticas
        ↓
Route Handler protegido do Next.js
        ↓
Painel: GERAL / ATENDIMENTO / CANCELAMENTOS
```

O pipeline analítico não deve ser acoplado ao fluxo raiz transacional do atendimento. A credencial Bearer já existente deve ser referenciada pelo n8n sem copiar ou expor o token.

## Regras de negócio a validar

Antes de publicar qualquer indicador, o mapa de equivalência deve resolver:

- qual data representa o período de cada indicador;
- abertura, início, última interação ou finalização do atendimento;
- definição de atendimento único;
- tratamento de reabertura e duplicidade;
- definição de vinculado, não vinculado e ambíguo;
- semântica do número bruto;
- venda, contrato e pré-contrato;
- cancelamento e data de cancelamento;
- renovação, upgrade e downgrade;
- tratamento de valores nulos e sem classificação;
- filtros e agrupamentos usados pelo Data Studio;
- origem de cada componente da página `GERAL`;
- relacionamento entre protocolo, cliente, contrato, lead e vendedor.

Não se deve inferir o significado de um campo apenas pelo rótulo `Cliente`, `Contato` ou `IdCliente`.

## Segurança e acesso

- Tokens do Opa! Suite, IXC e Supabase ficam somente em credenciais server-side ou no n8n.
- O frontend não consulta endpoints externos autenticados.
- Toda tabela em schema exposto deve ter RLS habilitado e políticas alinhadas ao perfil do usuário.
- A autorização do painel deve usar uma fonte de role autoritativa, não `user_metadata` editável pelo usuário.
- Dados brutos e identificadores de contato devem ser limitados aos perfis que realmente precisam deles.
- Logs e mensagens de erro devem omitir payloads, tokens e identificadores pessoais desnecessários.
- A camada de integração deve permitir auditoria sem tornar dados sensíveis acessíveis por uma view pública genérica.

## Estratégia de entrega

### Etapa 1: mapa de equivalência

Catalogar todos os componentes das três páginas e confirmar fonte, campo, filtro, cálculo e resultado esperado. Nenhuma carga de produção é necessária para concluir essa etapa.

### Etapa 2: fatia vertical de `ATENDIMENTO`

Validar uma janela pequena de leitura do Opa! Suite, persistir dados normalizados, calcular um indicador e comparar com o Data Studio. A etapa só avança quando a divergência estiver explicada ou zerada.

### Etapa 3: `CANCELAMENTOS`

Mapear IXC, status, datas e motivos; validar os totais e agrupamentos do relatório.

### Etapa 4: `GERAL`

Consolidar dados atuais do Indique e Ganhe com IXC e, se comprovado pelo mapeamento, Opa! Suite. Validar os indicadores compostos depois das fontes individuais.

### Etapa 5: endurecimento

Adicionar incremental, reconciliação periódica, alertas de falha, índices, RLS, estados de cobertura e documentação operacional.

## Critérios de aceite

O primeiro módulo será considerado pronto somente quando:

1. Os endpoints, filtros e paginação utilizados estiverem registrados.
2. A carga não duplicar registros ao ser reexecutada.
3. O valor bruto do relatório for preservado sem conversão indevida.
4. Registros não vinculados continuarem presentes.
5. O mesmo período e filtro produzirem o mesmo resultado do Data Studio, ou a diferença estiver documentada por uma limitação comprovada da fonte.
6. O painel informar a última atualização e o estado de cobertura.
7. Nenhuma credencial aparecer no frontend, logs ou fixtures.
8. Testes unitários, integração local e validação do build passarem após a última alteração.
9. Nenhuma sincronização de produção for executada como parte dos testes locais.

## Riscos e limites conhecidos

- A chamada Opa! Suite observada hoje é uma consulta unitária por protocolo; a extração histórica ainda depende da rota de listagem e de sua paginação.
- A fonte exibida pelo Data Studio não prova que todos os indicadores comerciais e contratuais sejam originados exclusivamente do Opa! Suite.
- O IXC pode representar um mesmo cliente, contrato ou evento com chaves diferentes das usadas pelo Opa! Suite.
- O snapshot do Data Studio pode ter horário de atualização diferente do horário da sincronização local.
- O modelo atual de autorização e a exposição de novas tabelas precisam ser revisados antes de liberar indicadores sensíveis.

## Decisão

Adotar uma camada analítica própria, sincronizada por workflows n8n separados, persistida no Supabase e consumida por uma API protegida do Next.js. Implementar em ordem `ATENDIMENTO`, `CANCELAMENTOS` e `GERAL`, sempre validando os dados contra o Data Studio e mantendo os valores brutos e a proveniência das fontes.

Esta especificação não autoriza execução de workflows, alteração de banco, mudança de credenciais, publicação ou ativação de produção. Essas ações dependem de um plano de implementação posterior e de gates de validação próprios.
