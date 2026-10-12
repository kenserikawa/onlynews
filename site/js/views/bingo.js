import { h, safeUrl } from '../dom.js';
import { loadMarket } from '../data.js';
import { t, MARKET_NAMES } from '../components.js';
import { bingoFor } from '../satire/bingo.js';

const hhmm = iso => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

export async function renderBingo(market) {
    const { stories, sourcesById, generatedAt } = await loadMarket(market);
    document.title = `${t('bingoTitle')} · OnlyNews`;
    const { cells, lines } = bingoFor(stories, (generatedAt ?? new Date().toISOString()).slice(0, 10), { lang: market === 'intl' ? 'en' : 'es' });
    const inLine = new Set(lines.flatMap(line => line.cells));
    const name = id => sourcesById[id]?.name ?? id;
    return h('section', { class: 'page satire-page' },
        h('h1', { class: 'page-title' }, `${t('bingoTitle')} · ${MARKET_NAMES[market]}`),
        h('p', { class: 'hint' }, t('bingoIntro')),
        lines.map(line => h('p', { class: 'bingo-line' }, t('bingoLine', { source: name(line.sourceId), time: hhmm(line.at) }))),
        h('ol', { class: 'bingo' }, cells.map((cell, i) => {
            const url = cell.hit && safeUrl(cell.hit.url);
            return h('li', { class: `bingo-cell${cell.hit ? ' is-hit' : ''}${inLine.has(i) ? ' in-line' : ''}` },
                h('span', { class: 'bingo-phrase' }, cell.phrase),
                cell.hit ? h('span', { class: 'bingo-hit' },
                    url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', title: cell.hit.title }, name(cell.hit.sourceId)) : name(cell.hit.sourceId),
                    h('span', { class: 'bingo-time' }, ` · ${hhmm(cell.hit.publishedAt)}`)) : null);
        })),
        cells.some(cell => cell.hit) ? null : h('p', { class: 'empty' }, t('bingoEmpty')));
}
