import { h, fold, plural } from '../dom.js';
import { loadMarket } from '../data.js';
import { composeBlocks } from '../layout.js';
import { storyRow, storyCard, heroLead, storySmall, MARKET_NAMES } from '../components.js';

// Cada plantilla de layout.js tiene aquí su forma de pintarse; las filas seguidas
// se agrupan en una sola lista.
function renderBlocks(blocks, market) {
    const nodes = [];
    let rows = null;
    for (const { template, items } of blocks) {
        if (template === 'row') {
            if (!rows) nodes.push(rows = h('ol', { class: 'story-list' }));
            rows.append(storyRow(items[0], market));
            continue;
        }
        rows = null;
        if (template === 'hero') {
            const [lead, ...side] = items;
            nodes.push(h('div', { class: 'block block--hero' },
                heroLead(lead, market),
                side.length ? h('div', { class: 'hero-side' }, side.map(story => storySmall(story, market))) : null));
        } else if (template === 'pair') {
            nodes.push(h('div', { class: 'block block--pair' }, items.map(story => storyCard(story, market))));
        }
    }
    return nodes;
}

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
        h('p', { class: 'hint' },
            matches.length ? h('span', { class: 'results-count' }, `${plural(matches.length, 'historia', 'historias')} · `) : null,
            `Busca en las historias de las últimas 48 h · ${MARKET_NAMES[market]}`),
        matches.length
            ? h('div', { class: 'results' }, renderBlocks(composeBlocks(matches), market))
            : h('p', { class: 'empty', style: 'margin-top:20px' }, needle ? 'No hay historias que coincidan.' : 'Escribe algo en el buscador.'));
}
