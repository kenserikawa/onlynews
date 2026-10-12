// Descarga los feeds en paralelo con un límite de concurrencia y un timeout por petición.
// Nunca rechaza: cada fallo queda registrado en su resultado.

const USER_AGENT = 'Mozilla/5.0 (compatible; onlynews-bot/1.0)';
const ACCEPT = 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8';

export async function fetchFeeds(feeds, { fetchImpl = globalThis.fetch, concurrency = 8, timeoutMs = 15_000 } = {}) {
    const results = new Array(feeds.length);
    let next = 0;

    async function fetchOne({ sourceId, url }) {
        // Temporizador propio en vez de AbortSignal.timeout(): aquel no mantiene vivo
        // el proceso, y una petición colgada sin sockets activos lo dejaría terminar a medias.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);
        try {
            const res = await fetchImpl(url, {
                headers: { 'User-Agent': USER_AGENT, Accept: ACCEPT },
                signal: controller.signal,
                redirect: 'follow',
            });
            if (!res.ok) return { sourceId, url, ok: false, error: `HTTP ${res.status}` };
            return { sourceId, url, ok: true, xml: await res.text() };
        } catch (error) {
            const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
            return { sourceId, url, ok: false, error: isTimeout ? `Timeout ${timeoutMs} ms` : String(error?.message ?? error) };
        } finally {
            clearTimeout(timer);
        }
    }

    async function worker() {
        while (next < feeds.length) {
            const index = next++;
            results[index] = await fetchOne(feeds[index]);
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, feeds.length) }, worker));
    return results;
}
