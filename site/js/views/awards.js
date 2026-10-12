import { h, safeUrl } from '../dom.js';
import { loadMarket } from '../data.js';
import { t, MARKET_NAMES } from '../components.js';
import { awardsFor } from '../satire/awards.js';

export async function renderAwards(market) {
    const { stories, sourcesById } = await loadMarket(market);
    document.title = `${t('awardsTitle')} · OnlyNews`;
    const awards = awardsFor(stories, sourcesById, { lang: market === 'intl' ? 'en' : 'es' });
    return h('section', { class: 'page satire-page' },
        h('h1', { class: 'page-title' }, `${t('awardsTitle')} · ${MARKET_NAMES[market]}`),
        h('p', { class: 'hint' }, t('awardsIntro', { press: market === 'intl' ? 'prensa internacional' : 'prensa española' })),
        awards.length
            ? h('div', { class: 'awards' }, awards.map(award => h('article', { class: 'award' },
                h('p', { class: 'award-name' }, h('span', { 'aria-hidden': 'true' }, award.emoji), ` ${award.title}`),
                h('h2', { class: 'award-winner' }, award.winner),
                h('p', { class: 'award-figure' }, award.figure),
                h('p', { class: 'award-blurb' }, award.blurb),
                h('ul', { class: 'award-evidence' }, award.evidence.map(e => {
                    const url = safeUrl(e.url);
                    return h('li', {}, h('span', { class: 'award-source' }, sourcesById[e.sourceId]?.name ?? e.sourceId), ' ',
                        url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, e.title) : e.title);
                })))))
            : h('p', { class: 'empty' }, t('awardsEmpty')));
}
