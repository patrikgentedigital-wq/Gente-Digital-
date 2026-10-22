# Auditoria das abas de CTO

Fonte: [planilha ATUALIZAÇÃO CTOs](https://docs.google.com/spreadsheets/d/1apvB79R6ayVUkLTP7tlqRxYhJaIvVv7nvmbHZdRiyIQ/edit).

Leitura de metadados e intervalos A:K pelo conector Google, em blocos de até 400 linhas. Foram lidas as 1.013 linhas da aba CP e as 761 da aba AC. Este levantamento não leu as colunas de observação M:O/N:O. O relatório registra somente contagens, sem nomes, endereços, coordenadas ou notas originais.

| Verificação | CP | AC |
| --- | ---: | ---: |
| Linhas de dados com coluna A preenchida | 657 | 732 |
| Nomes reconhecidos pelo normalizador | 648 | 688 |
| Nomes não reconhecidos | 9 | 44 |
| Chaves repetidas na mesma aba | 0 | 102 |
| Vagas ausentes ou fora do formato inteiro | 18 | 92 |
| Vagas iguais a zero | 79 | 48 |
| Vagas positivas no formato esperado | 560 | 592 |
| Coordenadas ausentes ou fora do formato esperado | 133 | 506 |
| Data de atualização ausente | 25 | 101 |
| Data inválida ou futura | 0 | 0 |
| Data anterior aos últimos 30 dias | 583 | 615 |
| Data nos últimos 30 dias | 49 | 16 |
| Vagas acima da capacidade declarada | 5 | 5 |

Os problemas se sobrepõem. Linhas com coluna A preenchida podem incluir marcadores e não equivalem a CTOs ativas no IXC. Chaves repetidas são agrupamentos ambíguos do normalizador, não prova de erro na rede. Não usar a primeira linha em caso de ambiguidade nem transformar célula vazia em zero.

Em 06/10/2026, uma consulta IXC somente de listagem percorreu as 4 páginas de `rad_caixa_ftth`: 1.358 registros, total estável e IDs sem repetição. Foram encontrados 1.356 registros ativos, 2 inativos, 1 sem coordenadas e 0 com coordenadas fora do formato numérico/limites geográficos. Os marcadores nos nomes associados a `id_projeto=1` indicam AC e a `id_projeto=2` indicam CP; há muitos nomes sem marcador. Esses valores são candidatos de mapeamento e precisam de confirmação operacional antes de seleção regional automática.

## O que falta para usar decisões reais

- Confirmar o seletor regional (campo e IDs) no IXC e validar todas as páginas, sem repetição nem perda.
- Resolver as 102 chaves ambíguas de AC com uma dimensão operacional confirmada.
- Conciliar CTOs e coordenadas do IXC com a linha única da planilha; manter análise técnica quando não houver correspondência segura.
- Conferir as 10 linhas com vagas acima do split e corrigir ou confirmar as 110 sem vagas válidas.
- Definir a validade operacional das vagas. O recorte de 30 dias foi usado para auditoria, não aprovado como regra.
- Confirmar restrições técnicas depois de validar o vínculo da CTO; esta leitura não avaliou colunas de observação.
- Configurar no servidor uma conta Google com escopo `spreadsheets.readonly` e acesso à planilha. O conector desta conversa não fornece credencial de servidor para o painel.
- Conectar uma fonte confiável do trajeto de instalação. A distância reta só seleciona candidatas e não prova a passagem do cabo.

O n8n não é necessário para a consulta interativa no painel. Ele pode apoiar tarefas agendadas ou notificações, mas não substitui as verificações acima nem a autorização do servidor.
