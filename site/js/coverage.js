// Lógica de cobertura compartida: la usan el pipeline (score.js) y la web
// (para recalcular cuando el usuario oculta medios). Sin dependencias del DOM.

export const SIDES = ['left', 'center', 'right', 'unrated'];

export const SIDE_LABELS = { left: 'Izquierda', center: 'Centro', right: 'Derecha', unrated: 'Sin clasificar' };

export const BIAS_LABELS = {
    '-2': 'Izquierda', '-1': 'Centro-izquierda', '0': 'Centro', '1': 'Centro-derecha', '2': 'Derecha', 'null': 'Sin clasificar',
};

export function sideOf(bias) {
    if (bias == null) return 'unrated';
    if (bias <= -1) return 'left';
    if (bias >= 1) return 'right';
    return 'center';
}

export function coverageOf(sourceIds, biasOf) {
    const coverage = { left: 0, center: 0, right: 0, unrated: 0 };
    for (const id of new Set(sourceIds)) coverage[sideOf(biasOf(id))]++;
    return coverage;
}

export function blindspotOf(coverage) {
    const { left = 0, center = 0, right = 0, unrated = 0 } = coverage;
    const rated = left + center + right;
    if (left + center + right + unrated < 3 || rated === 0) return null;
    if (right === 0 && left / rated >= 0.8) return 'left';
    if (left === 0 && right / rated >= 0.8) return 'right';
    return null;
}

export function withoutSources(stories, hidden, biasOf) {
    if (!hidden.size) return stories;
    return stories.flatMap(story => {
        const articles = story.articles.filter(article => !hidden.has(article.sourceId));
        if (!articles.length) return [];
        if (articles.length === story.articles.length) return [story];
        const coverage = coverageOf(articles.map(article => article.sourceId), biasOf);
        return [{
            ...story,
            title: articles[0].title,
            image: articles.find(article => article.image)?.image ?? null,
            articles,
            coverage,
            sourceCount: new Set(articles.map(article => article.sourceId)).size,
            blindspot: blindspotOf(coverage),
        }];
    });
}
