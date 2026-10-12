// Orquesta el pipeline: descarga → normaliza → agrupa → refina → puntúa → escribe site/data/.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchFeeds } from './fetch.js';
import { parseFeed } from './parse.js';
import { clusterArticles } from './cluster.js';
import { refine } from './refine.js';
import { scoreStories } from './score.js';

export const MARKETS = { es: { lang: 'es' }, intl: { lang: 'en' } };
const MAX_SINGLE_SOURCE_STORIES = 150;

async function writeJson(file, data) {
    await writeFile(file, `${JSON.stringify(data)}\n`);
}

function collect(fetched, sourcesById, now) {
    const feeds = [];
    const articles = Object.fromEntries(Object.keys(MARKETS).map(market => [market, new Map()]));
    for (const result of fetched) {
        const source = sourcesById[result.sourceId];
        let count = 0;
        let error = result.ok ? null : result.error;
        if (result.ok) {
            try {
                const parsed = parseFeed(result.xml, source, { now });
                count = parsed.length;
                for (const article of parsed) {
                    if (!articles[source.market].has(article.id)) articles[source.market].set(article.id, article);
                }
                if (!count) error = 'Sin artículos recientes';
            } catch (parseError) {
                error = parseError.message;
            }
        }
        feeds.push({ sourceId: result.sourceId, url: result.url, ok: !error, count, ...(error ? { error } : {}) });
    }
    return { feeds, articles };
}

function assertHealthy(feeds, sourcesById) {
    for (const market of Object.keys(MARKETS)) {
        const marketFeeds = feeds.filter(feed => sourcesById[feed.sourceId].market === market);
        const failed = marketFeeds.filter(feed => !feed.ok).length;
        if (failed > marketFeeds.length / 2) {
            throw new Error(`Fallan ${failed}/${marketFeeds.length} feeds del mercado ${market}; no se publica`);
        }
    }
}

export async function build({ sources, outDir, fetchImpl, now = new Date(), env = process.env, log = console }) {
    const sourcesById = Object.fromEntries(sources.map(source => [source.id, source]));
    const fetched = await fetchFeeds(sources.flatMap(source => source.feeds.map(url => ({ sourceId: source.id, url }))), { fetchImpl });
    const { feeds, articles } = collect(fetched, sourcesById, now);
    assertHealthy(feeds, sourcesById);

    const generatedAt = now.toISOString();
    const outputs = {};
    for (const [market, { lang }] of Object.entries(MARKETS)) {
        const clusters = await refine(clusterArticles([...articles[market].values()], { lang }), { env, log, market });
        const stories = scoreStories(clusters, sourcesById, now);
        const multi = stories.filter(story => story.sourceCount > 1);
        const singles = stories
            .filter(story => story.sourceCount === 1)
            .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
            .slice(0, MAX_SINGLE_SOURCE_STORIES);
        outputs[market] = { market, generatedAt, stories: [...multi, ...singles] };
    }

    await mkdir(outDir, { recursive: true });
    for (const [market, data] of Object.entries(outputs)) await writeJson(path.join(outDir, `${market}.json`), data);
    await writeJson(path.join(outDir, 'sources.json'), sources.map(({ id, name, market, bias, site }) => ({ id, name, market, bias, site })));
    await writeJson(path.join(outDir, 'meta.json'), { generatedAt, feeds });
    return { feeds };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const outDir = process.argv[2] ?? 'site/data';
    const sources = JSON.parse(await readFile(new URL('./sources.json', import.meta.url), 'utf8'));
    try {
        const { feeds } = await build({ sources, outDir });
        console.log(`OK: ${feeds.filter(feed => feed.ok).length}/${feeds.length} feeds → ${outDir}`);
        for (const feed of feeds.filter(feed => !feed.ok)) console.warn(`  ✗ ${feed.sourceId}: ${feed.error}`);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
    // Algunos servidores (El Correo, p. ej.) dejan conexiones keep-alive abiertas que
    // mantendrían vivo el proceso — y el Action colgado — mucho después de escribir los datos.
    process.exit();
}
