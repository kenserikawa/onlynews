import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchFeeds } from '../fetch.js';

const response = (status, body = '') => ({ ok: status >= 200 && status < 300, status, text: async () => body });

test('devuelve el XML en orden y marca los errores HTTP y de red', async () => {
    const fetchImpl = async url => {
        if (url.endsWith('/404')) return response(404);
        if (url.endsWith('/boom')) throw new Error('ECONNRESET');
        return response(200, `<rss>${url}</rss>`);
    };
    const feeds = ['https://a/ok', 'https://b/404', 'https://c/boom'].map((url, i) => ({ sourceId: `s${i}`, url }));
    const results = await fetchFeeds(feeds, { fetchImpl });
    assert.deepEqual(results, [
        { sourceId: 's0', url: 'https://a/ok', ok: true, xml: '<rss>https://a/ok</rss>' },
        { sourceId: 's1', url: 'https://b/404', ok: false, error: 'HTTP 404' },
        { sourceId: 's2', url: 'https://c/boom', ok: false, error: 'ECONNRESET' },
    ]);
});

test('respeta el límite de concurrencia', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchImpl = async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(resolve => setTimeout(resolve, 5));
        inFlight--;
        return response(200, '<rss/>');
    };
    const feeds = Array.from({ length: 20 }, (_, i) => ({ sourceId: `s${i}`, url: `https://x/${i}` }));
    await fetchFeeds(feeds, { fetchImpl, concurrency: 3 });
    assert.equal(maxInFlight, 3);
});

test('corta las peticiones lentas con un error de timeout', async () => {
    const fetchImpl = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    const [result] = await fetchFeeds([{ sourceId: 's', url: 'https://lento' }], { fetchImpl, timeoutMs: 30 });
    assert.deepEqual(result, { sourceId: 's', url: 'https://lento', ok: false, error: 'Timeout 30 ms' });
});

test('lista vacía devuelve lista vacía', async () => {
    assert.deepEqual(await fetchFeeds([], { fetchImpl: async () => response(200) }), []);
});
