import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRoadGraph } from '../../.test-build/viabilidade/road-graph.js';
import { estimateStreetRoutes } from '../../.test-build/viabilidade/domain/road-route.js';

test('snapshot CP OSM é carregado localmente e mantém rota conectada pelos IDs de nós', async () => {
  const graph = await loadRoadGraph('CP');
  assert.ok(graph);
  assert.equal(graph.region, 'CP');
  assert.equal(graph.schemaVersion, 1);
  assert.ok(graph.nodes.length > 0);
  assert.ok(graph.edges.length > 0);

  const edge = graph.edges[0];
  const start = graph.nodes.find(node => node.id === edge.from);
  const end = graph.nodes.find(node => node.id === edge.to);
  assert.ok(start && end);
  const routes = estimateStreetRoutes(graph, start.location, [{ id: 'known-road-node', location: end.location }]);
  const route = routes.get('known-road-node');
  assert.ok(route);
  assert.ok(route.points.length >= 2);
  assert.ok(route.streetMeters > 0);
  assert.equal(route.installAccessMeters, 0);
  assert.equal(route.ctoAccessMeters, 0);
  assert.equal(await loadRoadGraph('CP'), graph);
});
