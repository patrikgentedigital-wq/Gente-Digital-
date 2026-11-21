const refreshIntervalMs = 60 * 60 * 1000;

export function startIxcRefresh(read: (signal: AbortSignal) => Promise<void>): () => void {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function schedule() {
    if (!controller.signal.aborted) {
      timeout = setTimeout(refresh, refreshIntervalMs);
    }
  }

  function refresh() {
    void read(controller.signal).then(schedule, schedule);
  }

  refresh();
  return () => {
    controller.abort();
    clearTimeout(timeout);
  };
}
