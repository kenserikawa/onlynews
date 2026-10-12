// Carga de los JSON que genera el pipeline, con caché por sesión.
import { withoutSources } from './coverage.js';
import { prefs } from './prefs.js';
import { kickerFor } from './satire/kickers.js';
import { isSensitive } from './satire/guard.js';

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
    if (!prefs.satire) return { stories: visible, sourcesById, generatedAt: data.generatedAt };
    // La línea roja se decide con TODOS los medios: ocultar uno no puede borrar la pista de una tragedia.
    const sensitiveIds = new Set(data.stories.filter(isSensitive).map(story => story.id));
    const stories = visible.map(story => {
        const marked = sensitiveIds.has(story.id) ? { ...story, sensitive: true } : story;
        return { ...marked, kicker: kickerFor(marked, sourcesById) };
    });
    return { stories, sourcesById, generatedAt: data.generatedAt };
}
