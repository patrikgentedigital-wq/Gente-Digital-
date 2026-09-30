# Indicações de pós-venda no Indique e Ganhe

**Status:** proposta para revisão; nenhuma implementação ou alteração de dados foi feita.

## Problema e resultado esperado

Registrar os contatos coletados após cada venda, ligar cada coleta ao contrato de origem, acompanhar os contatos como leads no fluxo existente e contar os contratos novos confirmados no IXC. A gestão consegue avaliar a coleta e o fechamento separadamente por colaborador.

Registrar vendas que geraram zero contatos também é necessário. Sem isso, o painel não distingue falta de indicação de falta de registro. A cobertura geral só pode ser calculada quando houver uma fonte completa de todas as vendas elegíveis, incluindo aquelas sem coleta.

A solicitação indica um fluxo para a equipe interna, dentro do painel existente. Assumo que a identidade contabilizada na coleta é a do colaborador que a realizou; quem atende ou fecha a oportunidade fica registrado à parte.

## Opções e escolha

1. Apenas rotular os leads como pós-venda. É simples, mas não registra as vendas de origem que geraram zero contatos.
2. Registrar uma coleta por contrato e vincular a ela os contatos que se tornam leads. Reaproveita o Kanban e permite auditar coletas sem contatos, duplicidades e conversões. **Recomendo esta opção.**
3. Criar um CRM separado. Duplicaria contatos e etapas de atendimento que já existem.

## Fluxo

1. Em Leads, o colaborador inicia **Registrar coleta de pós-venda** e informa o identificador exato do contrato de origem no IXC.
2. O servidor valida o contrato com a configuração IXC existente e mostra os dados mínimos para conferência. Se não localizar ou verificar um contrato elegível, não confirma o registro.
3. O servidor identifica o colaborador pela sessão autenticada e seu cadastro. Um administrador pode corrigir uma atribuição com justificativa e registro de auditoria.
4. O colaborador inclui os nomes e telefones recebidos ou confirma explicitamente **Não recebeu contatos**.
5. Cada novo contato se torna um lead vinculado à coleta e segue pelo Kanban atual. O colaborador que coletou é registrado separadamente de quem atende ou fecha o lead.
6. Para contabilizar uma venda, o sistema verifica o identificador exato do contrato novo no IXC. Se não conseguir vinculá-lo inequivocamente a um lead, deixa o item para revisão autorizada.

## Dados e identidade

Manter `leads.ref` com seu significado atual de origem ou cliente indicador. O módulo existente de comissões usa esse campo; reutilizá-lo para o coletor pode alterar créditos e pagamentos. A origem e a autoria da coleta devem ficar separadas.

Criar `post_sale_collections`, com uma coleta por contrato de origem. Registrar o identificador único do contrato IXC, o cliente, a data da venda, o colaborador coletor, o usuário autenticado, o resultado (`contacts_collected` ou `no_referral`) e as datas necessárias à auditoria. Uma restrição única ao contrato impede registro duplicado em reenvios.

Vincular os leads novos à coleta pelo campo `post_sale_collection_id` e guardar o coletor por identificador estável de `colaboradores`. Não inferir a identidade do coletor pelo CPF da pessoa indicada nem por nomes livres.

Permitir vários contratos novos para um mesmo lead em `post_sale_conversions`, registrando para cada contrato o ID do IXC e a data de confirmação. Impedir que o mesmo ID de contrato seja contado mais de uma vez. A associação automática exige verificar o contrato no IXC e encontrar um único telefone normalizado correspondente ao cliente. Se não houver correspondência única, encaminhar para revisão; só um administrador pode confirmar manualmente, com justificativa.

Se o telefone já existir como lead, preservar sua atribuição original. Sinalizar a duplicidade e impedir novo cadastro ou crédito automático. A associação de um lead existente exige acesso autorizado e auditoria.

## Interface

Manter componentes, cores, tipografia e estados já usados no painel. Acrescentar a ação no topo da página de Leads e uma visão **Pós-venda**, com filtros e tabela, mantendo o Kanban acessível.

Na coleta, mostrar o contrato validado, o cliente, a data, o colaborador e a lista de contatos. Oferecer as ações **Adicionar contato**, **Não recebeu contatos** e **Registrar coleta**. Impedir confirmação enquanto o contrato não estiver validado ou houver telefones repetidos na mesma lista.

Exibir estados claros para contrato já registrado, não encontrado, erro do IXC e erro recuperável. Permitir retomar um rascunho se a conexão falhar.

No relatório, separar coletor e responsável pelo fechamento. Exibir vendas de origem registradas, contatos recebidos e válidos, duplicidades, inválidos, leads em atendimento, leads com contrato confirmado, contratos confirmados e tempo até o primeiro atendimento. Permitir abrir os registros por trás dos totais e exportar CSV com os filtros selecionados.

## Indicadores e períodos

Separar data da coleta e data da conversão para que uma indicação coletada no fim do mês e fechada no seguinte possa ser consultada por qualquer um dos períodos.

Calcular a conversão como contatos únicos válidos que geraram pelo menos um contrato confirmado, divididos pelo total de contatos únicos válidos. Mostrar também o número total de contratos novos confirmados: um lead pode gerar vários contratos sem contar como vários contatos convertidos.

Na primeira versão, apresentar a base como **vendas de origem registradas no painel**. Não declarar cobertura sobre todas as vendas elegíveis até confirmar e reconciliar uma fonte IXC completa, inclusive para vendas sem coleta.

Usar o fuso horário `America/Sao_Paulo` e períodos inclusivos. Leads antigos sem coletor ou contrato associado ficam como **não informado**; não atribuir histórico por aproximação.

## Acesso, consistência e falhas

Exigir usuário autenticado e papel autorizado. Resolver o coletor no servidor pela sessão e pelo vínculo em `colaboradores`; nunca confiar no ID recebido do navegador. Restringir vendedores aos registros permitidos pelo vínculo verificado. Administradores podem consultar a equipe e corrigir atribuições com auditoria.

Proteger as tabelas expostas com RLS e nunca enviar tokens do IXC ao navegador. Salvar a coleta e seus leads associados de modo atômico e idempotente, impedindo registro parcial ou duplicado após erro de rede. Não mostrar a coleta como registrada antes da confirmação do banco.

Separar a situação operacional do Kanban da confirmação de contrato. Mover um lead manualmente para **Ganho** não comprova uma venda para esse relatório.

## Critérios de aceite

- Cada contrato de origem admite no máximo uma coleta confirmada.
- É possível confirmar zero contatos sem criar um lead fictício.
- Cada contato novo entra no Kanban ligado à coleta e a um colaborador identificado.
- Cliente indicador, coletor, responsável pelo atendimento e contrato fechado continuam identificados separadamente.
- Contratos confirmados dependem de verificação IXC; status manual `Ganho` não basta.
- Um lead pode ter vários contratos confirmados sem duplicar a contagem de contatos convertidos.
- Duplicidades preservam a atribuição anterior e não geram recompensa automática.
- O relatório distingue o período de coleta, o de conversão, leads em atendimento e casos em revisão.
- O painel não afirma cobertura total sem uma base reconciliada das vendas elegíveis.
- A funcionalidade não altera regras ou pagamentos atuais do Indique e Ganhe.

## Fora de escopo

Alterar comissões ou recalcular pagamentos, atribuir leads históricos por aproximação, reabrir abas administrativas ocultas, publicar o painel ou usar vendas reais durante testes.
