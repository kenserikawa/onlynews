// Convierte los grupos de artículos en historias: cobertura por orientación,
// blindspot, id estable y orden por relevancia.
import { coverageOf, blindspotOf } from '../site/js/coverage.js';
import { hash } from './text.js';

const HALF_LIFE_MS = 12 * 3600e3;

export function scoreStories(clusters, sourcesById, now = new Date()) {
    const biasOf = id => sourcesById[id]?.bias ?? null;
    return clusters
        .map(({ articles }) => {
            const times = articles.map(article => Date.parse(article.publishedAt));
            const oldest = articles.reduce((first, article) =>
                article.publishedAt < first.publishedAt || (article.publishedAt === first.publishedAt && article.url < first.url) ? article : first);
            const coverage = coverageOf(articles.map(article => article.sourceId), biasOf);
            const sourceCount = new Set(articles.map(article => article.sourceId)).size;
            const lastSeen = Math.max(...times);
            return {
                id: `s-${hash(oldest.url)}`,
                title: articles[0].title,
                summary: null,
                image: articles.find(article => article.image)?.image ?? null,
                firstSeen: new Date(Math.min(...times)).toISOString(),
                lastSeen: new Date(lastSeen).toISOString(),
                coverage,
                sourceCount,
                blindspot: blindspotOf(coverage),
                articles: articles.map(({ sourceId, title, summary, url, image, publishedAt }) => ({ sourceId, title, summary, url, image, publishedAt })),
                relevance: sourceCount * 0.5 ** (Math.max(0, now - lastSeen) / HALF_LIFE_MS),
            };
        })
        .sort((a, b) => b.relevance - a.relevance || (a.id < b.id ? -1 : 1))
        .map(({ relevance, ...story }) => story);
}
