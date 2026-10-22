# Cálculo de rota FiberDocs no painel de viabilidade

Cada consulta lê IXC, planilha e FiberDocs em paralelo. O FiberDocs fornece os
postes e a geometria ordenada dos cabos pelos recursos `df_elemento`,
`df_elemento_coordenada` e `df_coordenada`. Coordenadas inválidas, leitura
parcial, paginação incompleta e cabos sem geometria não são tratados como uma
rota utilizável.

O motor projeta o ponto de instalação e cada CTO candidata no segmento de cabo
mais próximo, quando o acesso direto até a fibra não passa de 30 m. A metragem
FiberDocs soma o trecho da polilinha e os dois acessos; o total automático
acrescenta uma reserva única de 20 m. O algoritmo busca o menor caminho
conectado e calcula todas as CTOs candidatas em uma única travessia do grafo.

Dentro da rede, os vértices consecutivos de um mesmo cabo são conectados.
Elementos de cabo distintos se conectam quando compartilham exatamente uma
extremidade ou quando um poste cadastrado está a até 3 m de seus vértices.
Linhas que apenas se cruzam no mapa, sem extremidade comum ou poste, ficam
desconectadas. A falta de coordenada de poste não impede usar cabos completos;
sem conexão comprovável, o resultado permanece em análise.

Uma metragem calculada de até 500 m pode sustentar `VIAVEL` quando a CTO está
ativa, a vaga atual existe, IXC e planilha concordam e não há outra pendência.
Se capacidade, associação, vagas ou integridade das fontes divergirem, o
cartão mostra a metragem e a origem FiberDocs, mas mantém `ANALISE_TECNICA`.
Rotas acima de 500 m são inelegíveis. A tela apresenta as capacidades de IXC e
planilha lado a lado para explicar divergências.

O resultado é uma estimativa da geometria cadastrada. Os acessos de até 30 m
por ponta são medidos em linha direta; quando a rota FiberDocs não está disponível ou não conecta os pontos, o servidor tenta um snapshot OSM local e calcula pelas vias mapeadas. Essa estimativa permanece em análise técnica e não comprova cabo, ocupação ou autorização. A equipe ainda confirma continuidade, travessias,
passagem física e autorização de uso dos postes. O cálculo é determinístico e
não envia endereços ou coordenadas a uma IA externa.

O mapa recebe a geometria retornada pelo mesmo cálculo do servidor, para que metragem e desenho representem uma única decisão. A reserva de 20 m entra no total, mas não é desenhada. A aba **Fontes e pendências** também
permite atualizar a rede em modo somente leitura. Um KML pode ser carregado
localmente para conferência visual, mas não altera nem aprova a decisão do
servidor.

## Formato e diagnóstico

O formato de `df_elemento_coordenada` varia entre instalações. O adaptador
aceita coordenadas estruturadas ou pares latitude/longitude, associa pontos
pelo ID do elemento e os ordena pela sequência disponível. Se o formato não
for reconhecido, o painel mostra nomes de campos para diagnóstico, sem expor
valores, IDs ou coordenadas crus. A leitura da rede exige sessão autorizada e
não devolve credenciais nem observações livres do IXC.

## Validação operacional

1. Compare a contagem de cabos e postes no FiberDocs com a leitura do painel
   em AC e CP.
2. Consulte instalações conhecidas e compare a metragem com a rota executada
   em campo, principalmente nos acessos finais e nas travessias.
3. Corrija no FiberDocs extremidades desconectadas, postes ausentes e cabos
   sem geometria. O motor mantém esses casos em análise até haver conexão
   comprovável.
# Rotas FiberDocs e fallback viário OSM

O painel usa uma rota FiberDocs somente quando a leitura de cabos tem geometria completa e há caminho topologicamente conectado da CTO ao imóvel. Cruzamentos geométricos sem nó compartilhado ou poste cadastrado não são unidos. Cada ponta pode ter acesso estimado de até 30 m até a fibra.

Se a leitura FiberDocs estiver indisponível, incompleta ou não formar caminho conectado, a consulta usa o grafo regional local de ruas do OpenStreetMap, quando a posição de instalação e a CTO estiverem na cobertura e a até 30 m de uma via. O fallback é calculado no servidor sobre um snapshot preparado; o navegador recebe a geometria para desenhá-la. Não há chamada pública de roteamento por endereço. A rota OSM indica o caminho pelas ruas mapeadas, não cabos da Gente Digital, continuidade de fibra, ocupação ou autorização de passagem. Ela sempre exige análise técnica.

As estimativas automáticas FiberDocs e OSM somam `trecho de rede/rua + acesso do imóvel + acesso da CTO + 20 m de reserva`. A reserva entra no total usado para comparar com 500 m e no detalhamento da ficha técnica, mas não vira uma linha no mapa. O valor confirmado manualmente não recebe reserva adicional. A rota desenhada e o total exibido vêm do mesmo cálculo do servidor; polilinhas não são gravadas no histórico.

Os grafos e os polígonos usados na cobertura ficam em `data/viabilidade/osm`. Revise as localidades cobertas e gere os snapshots com `npm.cmd run viabilidade:osm:build`. A data-base e a versão do grafo acompanham a avaliação quando OSM for usado. A atribuição cartográfica é [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright), sob ODbL.
