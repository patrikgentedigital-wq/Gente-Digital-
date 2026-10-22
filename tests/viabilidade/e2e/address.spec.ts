import { test, expect } from '@playwright/test';

test('endereco localiza a rua, exige confirmar o imovel e consulta sem digitar coordenadas', async ({ page }) => {
  await page.route('**/api/viabilidade?view=status', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ mode: 'LIVE', enabled: true, sources: [], audit: {} }) }));
  let searchBody: Record<string, unknown> = {};
  let evaluationBody: Record<string, unknown> = {};
  await page.route('**/api/viabilidade/endereco', async route => {
    searchBody = route.request().postDataJSON();
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ places: [{ id: 'W10', label: 'Passagem Floriano, Capanema, Pará', city: 'Capanema', location: { latitude: -1.187635, longitude: -47.183039 } }], cached: false }) });
  });
  await page.route('**/api/viabilidade', async route => {
    evaluationBody = route.request().postDataJSON();
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'address-fixture', origin: 'LIVE', evaluatedAt: new Date().toISOString(), status: 'ANALISE_TECNICA', recommendedCtoId: null, candidates: [], reasons: [], network: null }) });
  });
  await page.route('**/api/viabilidade?view=ctos*', route => route.fulfill({ contentType: 'application/json', body: '{"rows":[]}' }));
  await page.goto('/?tab=viabilidade');
  await page.getByLabel('Região', { exact: true }).selectOption('CP');
  await page.getByLabel('Rua', { exact: true }).fill('Passagem Floriano');
  await page.getByLabel('Número', { exact: true }).fill('123');
  await page.getByLabel('Bairro', { exact: true }).fill('Centro');
  await page.getByRole('button', { name: 'Localizar endereço', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Passagem Floriano, Capanema, Pará', exact: true })).toBeVisible();
  expect(searchBody).toEqual({ street: 'Passagem Floriano', neighborhood: 'Centro', city: 'Capanema' });
  await page.getByRole('button', { name: 'Passagem Floriano, Capanema, Pará', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Consultar viabilidade', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Ponto de instalação', exact: true })).toBeVisible();
  await expect(page.getByText('CTOs e cabos serão carregados ao consultar a viabilidade.', { exact: true })).toBeVisible();
  await expect(page.getByText('Leitura automática do FiberDocs indisponível.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirmar localização', exact: true }).click();
  await page.screenshot({ path: 'output/playwright/endereco-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Consultar viabilidade', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Análise técnica', exact: true })).toBeVisible();
  expect(evaluationBody).toMatchObject({ region: 'CP', latitude: -1.187635, longitude: -47.183039 });
  await page.locator('.leaflet-container').click({ position: { x: 180, y: 180 } });
  await expect(page.getByRole('button', { name: 'Consultar viabilidade', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Análise técnica', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirmar localização', exact: true }).click();
  await page.getByRole('button', { name: 'Consultar viabilidade', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Análise técnica', exact: true })).toBeVisible();
  expect(evaluationBody.latitude).not.toBe(-1.187635);
  expect(evaluationBody.longitude).not.toBe(-47.183039);
  await page.getByLabel('Rua', { exact: true }).fill('Outra rua');
  await expect(page.getByRole('button', { name: 'Consultar viabilidade', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Análise técnica', exact: true })).toHaveCount(0);
});

test('rua nao encontrada permite localizar a cidade e escolher o imovel no mapa', async ({ page }) => {
  await page.route('**/api/viabilidade?view=status', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ mode: 'LIVE', enabled: true, sources: [], audit: {} }) }));
  await page.route('**/api/viabilidade/endereco', async route => {
    const body = route.request().postDataJSON();
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ places: body.street ? [] : [{ id: 'R20', label: 'Capanema, Pará', city: 'Capanema', location: { latitude: -1.19, longitude: -47.18 } }], cached: false }) });
  });
  await page.goto('/?tab=viabilidade');
  await page.getByLabel('Região', { exact: true }).selectOption('CP');
  await page.getByLabel('Rua', { exact: true }).fill('Rua ainda não cadastrada');
  await page.getByRole('button', { name: 'Localizar endereço', exact: true }).click();
  await expect(page.getByText('A rua não apareceu. Marque o imóvel no mapa da cidade ou informe latitude e longitude.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir mapa da cidade', exact: true }).click();
  await page.getByRole('button', { name: 'Capanema, Pará', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Consultar viabilidade', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Ponto de instalação', exact: true })).toBeVisible();
});
