# Entrada por endereço no painel de viabilidade

O modo padrão aceita rua, número, bairro e cidade. O atendente localiza a rua,
seleciona o resultado, ajusta o imóvel no mapa e confirma a localização. O
painel preenche latitude/longitude internamente. O marcador pode ser arrastado
ou reposicionado com um clique; qualquer alteração invalida a confirmação e
remove o resultado anterior. A opção **Usar coordenadas** continua disponível.

Sem chave contratada, a pesquisa usa Nominatim/OpenStreetMap somente com nomes
públicos de rua, bairro e cidade em Pará/Brasil. Número, referência, identidade
do cliente e identificador do lead não são enviados ao provedor. O serviço
localiza a rua, não garante a posição do número: a confirmação do imóvel é
obrigatória. Quando a rua não consta na base, **Abrir mapa da cidade** permite
buscar a cidade e selecionar o imóvel visualmente.

`POST /api/viabilidade/endereco` exige sessão de admin/vendedor e origem do
próprio painel. Não consulta a cada tecla. Aceita no máximo 2 KB e somente
`street`, `neighborhood`, `city`. Resultados são filtrados por cidade,
Pará/Brasil e coordenadas válidas. Não há geração de coordenadas por IA.

A migração `202610060002_viability_geocoding.sql` instala cache de pesquisas
públicas por 24 h e controle global atômico de uma consulta nova a cada 1,1 s,
compartilhado entre as instâncias Vercel. RLS e permissões restringem essas
tabelas e a função ao servidor. Consultas em cache dispensam chamadas ao
provedor. Entradas expiradas são removidas ao gravar novos resultados. Falha
no controle/cache impede novas pesquisas externas, sem fallback irrestrito.

`VIABILITY_GEOCODING_URL` permite mudar o endpoint sem editar o software,
inclusive para uma instância Nominatim própria. O endpoint deve usar HTTPS.
O padrão público não oferece SLA; buscas indisponíveis ou ambíguas ficam
visíveis e não iniciam uma avaliação de viabilidade.

O endereço descritivo e a localização final seguem apenas para o endpoint
interno de viabilidade; continuam excluídos do histórico operacional. Essa
entrada não elimina pendências de cabos, vagas ou capacidade do FiberDocs,
IXC e planilha.

Fontes: [política Nominatim](https://operations.osmfoundation.org/policies/nominatim/)
e [API de busca](https://nominatim.org/release-docs/latest/api/Search/).
