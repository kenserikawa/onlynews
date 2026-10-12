// Carga de los JSON que genera el pipeline, con caché por sesión.
import { withoutSources } from './coverage.js';
import { prefs } from './prefs.js';
import { kickerFor } from './satire/kickers.js';

const cache = new Map();

export function loadJson(name) {
    if (!cache.has(name)) {
        const promise = fetch(`data/${name}.json`, { cache: 'no-cache' }).then(response => {
            if (!response.ok) throw new Error(`data/${name}.json → HTTP ${response.status}`);
            return response.json();
        });
        cache.set(name, promise);
        promise.catch(() => cache.delete(name));
    }
    return cache.get(name);
}

export async function loadMarket(market) {
    const [data, sources] = await Promise.all([loadJson(market), loadJson('sources')]);
    const sourcesById = Object.fromEntries(sources.map(source => [source.id, source]));
    const visible = withoutSources(data.stories, prefs.hiddenSources(), id => sourcesById[id]?.bias ?? null);
    const stories = prefs.satire ? visible.map(story => ({ ...story, kicker: kickerFor(story, sourcesById) })) : visible;
    return { stories, sourcesById, generatedAt: data.generatedAt };
}
