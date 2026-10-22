# Estimativa de trajeto por ruas no painel de viabilidade

**Status:** aprovada e implementada; testes locais concluídos em 07/10/2026.

## Objetivo

Exibir um trajeto calculado entre o imóvel e cada CTO candidata, seguindo a malha de ruas do OpenStreetMap (OSM), quando não houver um caminho FiberDocs completo e conectado. O cálculo deve informar a distância viária, os acessos entre os pontos e a reserva operacional de 20 m. A linha no mapa, a metragem e a origem do cálculo devem representar o mesmo resultado produzido no servidor, tanto para OSM quanto para FiberDocs.

A estimativa de ruas serve para orientar a análise técnica. Ela não confirma cabo, continuidade de fibra, ocupação de postes nem autorização de instalação.

## Contexto e premissas

- O painel já separa distância em linha reta, rota calculada e geometria FiberDocs.
- O serviço de decisão não calcula rotas FiberDocs se a leitura da rede estiver incompleta. O mapa atual pode calcular uma linha com os cabos parciais, criando divergência com o cartão que informa “trajeto não calculado”. A nova estimativa deve ter uma única fonte de cálculo no servidor.
- As regiões operacionais aceitas pela API são AC e CP. Cada artefato de ruas terá cobertura declarada; se uma coordenada ficar fora da cobertura, não haverá rota OSM para ela.
- O raio geográfico de 500 m continua sendo uma medida em linha reta exibida separadamente. Ele não deve ser apresentado como comprimento de rua.
- O limite de encaixe de 30 m por extremidade segue o limite já usado pelo cálculo FiberDocs. É uma premissa desta especificação para evitar conectar pontos distantes à malha viária.
- A reserva é adicionada uma vez aos cálculos automáticos de trajeto, incluindo FiberDocs e OSM. Um trajeto medido e confirmado manualmente permanece com o valor registrado, sem acréscimo automático que possa duplicar uma reserva já considerada em campo.

## Alternativa escolhida

Usar um grafo regional de ruas derivado de um snapshot OSM, empacotado com a aplicação e consultado localmente pelo serviço de viabilidade. Um algoritmo determinístico A* encontra o menor percurso no grafo. O servidor devolve a geometria da rota e as parcelas da metragem; a interface apenas apresenta esse resultado.

Não usar IA generativa para inventar uma linha, nem chamar um roteador público por endereço. Isso evita apresentar uma linha plausível sem suporte nos dados e evita enviar coordenadas precisas a um serviço de roteamento externo. As requisições de tiles do mapa continuam seguindo o funcionamento atual e a atribuição do provedor.

## Dados do grafo

1. Gerar um artefato compacto e versionado para cada cobertura operacional configurada (AC e CP), a partir de dados OSM. A geração é uma tarefa de atualização de dados, separada das consultas de clientes.
   - Usar a união dos polígonos públicos disponíveis no snapshot, expandida em 500 m: os limites de Augusto Corrêa e Capanema e o polígono público de Aturiaí. Não inferir um único retângulo a partir de endereços ou coordenadas de clientes/CTOs. Registrar a origem e a data dos polígonos. As demais localidades associadas à operação só recebem rota quando caem nessa cobertura; uma localidade fora dela não gera rota OSM até que sua cobertura seja configurada.
2. Converter trechos viários selecionados em nós e arestas com coordenadas, geometria ordenada, comprimento geodésico e identificadores de origem necessários à reconstrução da rota. A classificação de vias incluídas e excluídas deve ser explícita e mantida junto ao gerador.
3. Guardar no artefato a data do snapshot, a cobertura geográfica, a versão do gerador, os critérios de seleção e contagens de nós/arestas. O painel identifica a data da base usada.
4. Empacotar o grafo somente no servidor. Não misturar no artefato endereços, CTOs ou outros dados privados do IXC. A atualização substitui o snapshot por um novo artefato versionado.
5. Validar tamanho descompactado, cobertura e tempo de carregamento dentro dos limites da função hospedada antes de publicar. Se o grafo não couber ou exceder o orçamento de execução, interromper e revisar a arquitetura; não trocar silenciosamente por um roteador público.
6. Exibir atribuição a OpenStreetMap na interface e distribuir os dados derivados conforme os termos aplicáveis da ODbL. Referências: [Copyright e atribuição do OpenStreetMap](https://www.openstreetmap.org/copyright) e [FAQ de licença da OpenStreetMap Foundation](https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ).

## Cálculo e precedência

Para cada CTO ativa com coordenada válida e elegível à consulta:

1. Manter a distância em linha reta como métrica separada.
2. Localizar no grafo o ponto de rua mais próximo do imóvel e o ponto de rua mais próximo da CTO. Cada encaixe precisa estar a até 30 m; sem encaixe válido, não criar rota.
3. Executar A* entre os encaixes, usando o comprimento geodésico das arestas. Usar a distância geodésica até o destino como heurística. A geometria da rota deve preservar os pontos intermediários da rua; sentidos de circulação de veículos não limitam uma estimativa de infraestrutura fixa.
4. Somar o comprimento das ruas, os dois acessos retos e a reserva: **total estimado = rua + acesso do imóvel + acesso da CTO + 20 m**. A reserva entra exatamente uma vez e não é desenhada como um trecho no mapa, pois sua posição física não é conhecida.
5. Usar o valor não arredondado nas comparações. Arredondar apenas os valores apresentados em metros na tela.

Precedência por CTO:

1. Evidência de trajeto confirmado manualmente, se válida para o imóvel e a CTO.
2. Estimativa FiberDocs quando a leitura da rede estiver completa e houver caminho conectado.
3. Estimativa OSM quando não houver evidência confirmada nem rota FiberDocs completa e conectada, incluindo rede FiberDocs ausente, parcial ou sem caminho.
4. Sem encaixe, sem conexão no grafo ou fora da cobertura OSM: manter “trajeto não calculado” e análise técnica.

Uma leitura FiberDocs parcial não pode gerar uma rota apresentada como caminho da rede. O cálculo OSM é independente do FiberDocs e não combina segmentos parciais de fibra com ruas.

## Resultado e decisão operacional

- A resposta da avaliação inclui, por CTO com estimativa automática, a origem (`FIBERDOCS_ESTIMATE` ou `OSM_ESTIMATE`), o total, as parcelas aplicáveis e a geometria usada no mapa. Para OSM, informa rua/acesso/reserva. A resposta também identifica a versão e a data do grafo quando usada.
- O servidor é a única fonte de cálculo de geometria e metragem: a interface não recalcula rotas FiberDocs nem rotas OSM. A API devolve as geometrias transitórias correspondentes às estimativas; a interface somente desenha a rota da CTO selecionada.
- A forma completa da rota é transitória: não é gravada no histórico/auditoria. O registro persistido guarda a origem, a metragem total, o resultado de análise e a referência da versão do grafo, sem polilinha nem coordenadas adicionais.
- Uma estimativa OSM nunca é evidência suficiente para `VIAVEL`, não cria recomendação automática de CTO e não confirma disponibilidade física. Quando a rota OSM for a única evidência de trajeto, a candidata permanece `ANALISE_TECNICA`; bloqueios independentes já comprovados pelas fontes, como falta de vagas, continuam valendo.
- Acima de 500 m, mostrar que a estimativa calculada excede o limite de referência e manter análise técnica; a estimativa de rua, sozinha, não deve declarar `INVIAVEL`, pois a rota de fibra instalada pode divergir da malha viária.
- A reserva de 20 m participa do total exibido e da comparação com 500 m. Exemplo: rua 260 m + acessos 12 m + 8 m + reserva 20 m = total estimado 300 m.

## Interface do mapa e cartões

- Exibir a rota OSM devolvida pelo servidor, sem recalculá-la no cliente. A polilinha deve ter cor e estilo distintos das linhas FiberDocs e da distância em linha reta.
- A legenda identifica “Rota estimada pelas ruas (OSM)”. Os cartões e o histórico identificam a mesma origem e mostram o detalhamento: trecho pelas ruas, acesso ao imóvel, acesso à CTO e reserva de 20 m.
- Mostrar a reserva no detalhamento, sem prolongar a polilinha por 20 m arbitrários. Distância em linha reta permanece explicitamente nomeada como tal.
- Mostrar a data do snapshot e atribuição OpenStreetMap perto do mapa. A interface informa que a rota é estimada e requer conferência técnica; tiles, ruas e proximidade não provam a existência de fibra.
- Em ausência de rota, explicar se faltou cobertura do grafo, encaixe dentro de 30 m ou conexão entre os pontos, quando essa causa puder ser determinada sem expor dados internos.

## Privacidade, falhas e limites

- A busca de rota ocorre no backend usando o artefato local; nenhuma coordenada da consulta é enviada a um endpoint público de roteamento.
- O serviço valida região e coordenadas antes de consultar o grafo. Artefato ausente, inválido ou sem cobertura resulta em falha fechada para análise técnica, nunca em uma linha reta apresentada como rota viária.
- A geometria OSM descreve ruas cadastradas, que podem estar incompletas, desatualizadas ou não corresponder ao trajeto físico de fibra. Acessos retos de até 30 m e a reserva operacional também são aproximações.
- Tiles de mapa permanecem sujeitos ao provedor já configurado; o mapa atualmente informa que o provedor recebe a área aproximada exibida.

## Critérios de aceitação

1. Com FiberDocs ausente, parcial ou sem caminho contínuo, uma consulta dentro da cobertura OSM pode mostrar linha seguindo a geometria das ruas e um total que inclui os acessos e exatamente 20 m de reserva.
2. A metragem exibida no cartão, no histórico e na seleção do mapa deriva da mesma resposta do servidor; linha reta, FiberDocs e OSM são identificados separadamente.
3. Uma consulta fora da cobertura, sem encaixe permitido ou sem rota conectada não desenha uma rota OSM e continua em análise técnica.
4. A metragem OSM, sozinha, não atribui `VIAVEL` nem `INVIAVEL` e não gera recomendação automática. Se a rota OSM for a única evidência de trajeto, o resultado fica em análise técnica; bloqueios independentes comprovados continuam aplicáveis.
5. Uma rota estimada de até 500 m permanece marcada como estimativa e inclui a reserva no total; acima de 500 m mostra o limite excedido sem transformar a estimativa em reprovação definitiva.
6. Nenhuma chamada de roteamento externo é necessária durante a consulta, e nenhuma polilinha do cliente é persistida no histórico.

## Fora de escopo

- Confirmar a existência, continuidade, ocupação ou autorização de uso da fibra e dos postes.
- Substituir o cadastro de cabos do FiberDocs, alterar vagas/capacidade do IXC ou planilha, ou automatizar uma aprovação de instalação.
- Usar IA generativa, serviço público de roteamento por endereço ou dados privados para completar ruas ausentes do OSM.
- Alterar a política de 500 m em linha reta ou a forma de confirmação técnica em campo.

## Referências técnicas

- [Documentação da API OSRM](https://project-osrm.org/docs/v5.24.0/api/), consultada para comparar a alternativa de roteador separado.
- [Política do servidor de demonstração OSRM](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server), que informa limites de uso e ausência de garantia de disponibilidade para o serviço público de demonstração.
- [OpenStreetMap Copyright](https://www.openstreetmap.org/copyright).
