// Bingo del titular: cartón de 16 clichés del día que se marca solo con los titulares.
import { hashString } from './pick.js';
import { isSensitive, normalizeTitle } from './guard.js';

export const CLICHES = {
    es: ['última hora', 'en directo', 'lo que se sabe', 'las claves', 'zasca', 'estalla', 'polémica', 'vídeo', 'viral',
        'insólito', 'así es', 'esto es lo que', 'atención', 'sorpresa', 'histórico', 'brutal', 'revienta', 'arrasa',
        'hilo', 'exclusiva', 'confirmado', 'alerta', 'bombazo', 'por qué'],
    en: ['breaking', 'live', 'what we know', 'explainer', 'slams', 'erupts', 'controversy', 'video', 'viral', 'shocking',
        'here s', 'everything you need', 'watch', 'surprise', 'historic', 'brutal', 'blasts', 'sweeps', 'thread',
        'exclusive', 'confirmed', 'alert', 'bombshell', 'why'],
};
const LINES = [
    [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
    [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15],
    [0, 5, 10, 15], [3, 6, 9, 12],
];

export function bingoFor(stories, date, { lang = 'es' } = {}) {
    const bag = CLICHES[lang] ?? CLICHES.es;
    const phrases = [...bag].sort((a, b) => hashString(`${date}|${a}`) - hashString(`${date}|${b}`)).slice(0, 16);
    const articles = stories
        .filter(story => !isSensitive(story))
        .flatMap(story => story.articles)
        .map(article => ({ ...article, normalized: ` ${normalizeTitle(article.title)} ` }))
        .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.sourceId.localeCompare(b.sourceId));

    const cells = phrases.map(phrase => {
        const target = ` ${normalizeTitle(phrase)} `;
        const first = articles.find(article => article.normalized.includes(target));
        return { phrase, hit: first ? { sourceId: first.sourceId, title: first.title, url: first.url, publishedAt: first.publishedAt } : null };
    });

    const lines = LINES
        .filter(line => line.every(i => cells[i].hit))
        .map(line => {
            const last = line.map(i => cells[i].hit).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
            return { cells: line, sourceId: last.sourceId, at: last.publishedAt };
        });
    return { cells, lines };
}
