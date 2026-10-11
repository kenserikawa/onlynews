import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../build.js';

const NOW = new Date('2026-10-11T20:00:00Z');
const rss = items => `<rss><channel>${items.map(([title, url]) =>
    `<item><title>${title}</title><link>${url}</link><pubDate>Sun, 11 Oct 2026 19:00:00 GMT</pubDate></item>`).join('')}</channel></rss>`;

const SOURCES = [
    { id: 's1', name: 'Uno', market: 'es', bias: -1, site: 'https://uno.es', feeds: ['https://uno.es/rss'] },
    { id: 's2', name: 'Dos', market: 'es', bias: 1, site: 'https://dos.es', feeds: ['https://dos.es/rss'] },
    { id: 's3', name: 'Tres', market: 'es', bias: 0, site: 'https://tres.es', feeds: ['https://tres.es/rss'] },
    { id: 'i1', name: 'One', market: 'intl', bias: 0, site: 'https://one.com', feeds: ['https://one.com/rss'] },
    { id: 'i2', name: 'Two', market: 'intl', bias: 2, site: 'https://two.com', feeds: ['https://two.com/rss'] },
];

const FEEDS = {
    'https://uno.es/rss': rss([['La DANA obliga a evacuar a 2.000 vecinos en Valencia', 'https://uno.es/dana'], ['Noticia solo de Uno sobre teatro', 'https://uno.es/teatro']]),
    'https://dos.es/rss': rss([['Evacuados 2.000 vecinos en Valencia por la DANA', 'https://dos.es/dana']]),
    'https://tres.es/rss': rss([['Resultados de la liga de baloncesto', 'https://tres.es/acb']]),
    'https://one.com/rss': rss([['Storm hits the coast of Florida', 'https://one.com/storm']]),
};

const fakeFetch = async url => FEEDS[url]
    ? { ok: true, status: 200, text: async () => FEEDS[url] }
    : { ok: false, status: 500, text: async () => '' };

const quiet = { warn() {}, log() {} };

test('escribe los cuatro JSON con historias agrupadas y el estado de cada feed', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'onlynews-'));
    const { feeds } = await build({ sources: SOURCES, outDir, fetchImpl: fakeFetch, now: NOW, env: {}, log: quiet });

    assert.deepEqual((await readdir(outDir)).sort(), ['es.json', 'intl.json', 'meta.json', 'sources.json']);
    const es = JSON.parse(await readFile(path.join(outDir, 'es.json'), 'utf8'));
    assert.equal(es.market, 'es');
    assert.equal(es.generatedAt, NOW.toISOString());
    const dana = es.stories.find(s => s.sourceCount === 2);
    assert.ok(dana, 'la DANA de Uno y Dos forma una historia');
    assert.deepEqual(dana.coverage, { left: 1, center: 0, right: 1, unrated: 0 });
    assert.equal(es.stories.filter(s => s.sourceCount === 1).length, 2);
    assert.equal(es.stories[0], dana, 'las historias multi-medio van primero');

    const sources = JSON.parse(await readFile(path.join(outDir, 'sources.json'), 'utf8'));
    assert.deepEqual(Object.keys(sources[0]).sort(), ['bias', 'id', 'market', 'name', 'site']);

    const meta = JSON.parse(await readFile(path.join(outDir, 'meta.json'), 'utf8'));
    assert.deepEqual(meta.feeds.find(f => f.sourceId === 'i2'), { sourceId: 'i2', url: 'https://two.com/rss', ok: false, count: 0, error: 'HTTP 500' });
    assert.equal(feeds.filter(f => f.ok).length, 4);
});

test('falla si cae más de la mitad de los feeds de un mercado', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'onlynews-'));
    const broken = async url => (url === 'https://uno.es/rss' ? fakeFetch(url) : { ok: false, status: 503, text: async () => '' });
    await assert.rejects(build({ sources: SOURCES, outDir, fetchImpl: broken, now: NOW, env: {}, log: quiet }), /es/);
    assert.deepEqual(await readdir(outDir), [], 'no escribe nada si aborta');
});

test('un feed con 0 artículos recientes cuenta como fallo pero no rompe', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'onlynews-'));
    const empty = async url => (url === 'https://tres.es/rss' ? { ok: true, status: 200, text: async () => '<rss><channel></channel></rss>' } : fakeFetch(url));
    const { feeds } = await build({ sources: SOURCES, outDir, fetchImpl: empty, now: NOW, env: {}, log: quiet });
    assert.deepEqual(feeds.find(f => f.sourceId === 's3'), { sourceId: 's3', url: 'https://tres.es/rss', ok: false, count: 0, error: 'Sin artículos recientes' });
});
