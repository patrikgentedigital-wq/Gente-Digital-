import 'server-only';

const RETRYABLE_STATUS = new Set([408, 502, 503, 504]);

export async function readCommercialIxcPage(
  url: string,
  authorization: string,
  body: Record<string, string>,
  deadline: number,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const requestBody = JSON.stringify(body);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    let response: Response;
    try {
      response = await fetcher(url, {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json', ixcsoft: 'listar' },
        body: requestBody,
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(Math.min(8_000, remaining)),
      });
    } catch (error) {
      const transient = error instanceof TypeError
        || (error instanceof DOMException && error.name === 'TimeoutError');
      if (!transient || attempt === 1) throw error;
      continue;
    }

    if (response.ok) return response.json();
    await response.body?.cancel();
    if (!RETRYABLE_STATUS.has(response.status) || attempt === 1) {
      throw new Error('Falha na consulta ao IXC.');
    }
  }
  throw new Error('Tempo de consulta ao IXC excedido.');
}
