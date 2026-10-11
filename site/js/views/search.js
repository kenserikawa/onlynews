import { h, fold } from '../dom.js';
import { loadMarket } from '../data.js';
import { storyRow, MARKET_NAMES } from '../components.js';

export async function renderSearch(market, query) {
    const { stories, sourcesById } = await loadMarket(market);
    const needle = fold(query.trim());
    document.title = needle ? `Buscar «${query}» · OnlyNews` : 'Buscar · OnlyNews';
    const matches = needle
        ? stories.filter(story => fold([
            story.title,
            ...story.articles.map(article => article.title),
            ...story.articles.map(article => sourcesById[article.sourceId]?.name ?? ''),
        ].join(' ')).includes(needle))
        : [];
    return h('section', { class: 'page' },
        h('h1', { class: 'page-title' }, needle ? `Resultados para «${query}»` : 'Buscar'),
        h('p', { class: 'hint' }, `Busca en las historias de las últimas 48 h · ${MARKET_NAMES[market]}`),
        matches.length
            ? h('ol', { class: 'story-list', style: 'margin-top:20px' }, matches.map(story => storyRow(story, market)))
            : h('p', { class: 'empty', style: 'margin-top:20px' }, needle ? 'No hay historias que coincidan.' : 'Escribe algo en el buscador.'));
}
