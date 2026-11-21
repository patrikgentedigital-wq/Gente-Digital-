import 'server-only';

const RETRYABLE_STATUS = new Set([408, 502, 503, 504]);

export async function readCommercialIxcPage(
  url: string,
  authorization: string,
  body: Record<string, string>,
  deadline: number,
  fetcher: typeof fetch = fetch,
  maxAttempts = 2,
): Promise<unknown> {
  const requestBody = JSON.stringify(body);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
      if (!transient || attempt === maxAttempts) throw error;
      continue;
    }

    if (response.ok) return response.json();
    await response.body?.cancel();
    if (!RETRYABLE_STATUS.has(response.status) || attempt === maxAttempts) {
      throw new Error('Falha na consulta ao IXC.');
    }
  }
  throw new Error('Tempo de consulta ao IXC excedido.');
}
