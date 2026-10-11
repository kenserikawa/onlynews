import { h } from '../dom.js';
import { loadMarket } from '../data.js';
import { prefs } from '../prefs.js';
import { storyRow, MARKET_NAMES } from '../components.js';

export async function renderSaved(market) {
    const { stories } = await loadMarket(market);
    document.title = 'Guardadas · OnlyNews';
    const byId = new Map(stories.map(story => [story.id, story]));
    const saved = Object.entries(prefs.saved())
        .filter(([, entry]) => entry.market === market)
        .sort(([, a], [, b]) => b.savedAt.localeCompare(a.savedAt));

    const list = h('ol', { class: 'story-list', style: 'margin-top:20px' });
    for (const [id, entry] of saved) {
        if (byId.has(id)) {
            list.append(storyRow(byId.get(id), market));
            continue;
        }
        const item = h('li', { class: 'row' },
            h('div', { class: 'row-text', style: 'padding:14px 0' },
                h('h3', { class: 'story-title' }, entry.title),
                h('p', { class: 'story-meta' }, 'Ya no está en portada · ',
                    h('button', { type: 'button', class: 'btn', onclick: () => { prefs.removeSaved(id); item.remove(); } }, 'Quitar'))));
        list.append(item);
    }

    return h('section', { class: 'page' },
        h('h1', { class: 'page-title' }, 'Guardadas'),
        h('p', { class: 'hint' }, `${MARKET_NAMES[market]} · se guardan solo en este navegador`),
        saved.length ? list : h('p', { class: 'empty', style: 'margin-top:20px' }, 'Aún no has guardado ninguna historia.'));
}
