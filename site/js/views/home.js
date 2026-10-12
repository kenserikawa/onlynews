import { h } from '../dom.js';
import { loadMarket } from '../data.js';
import { t, MARKET_NAMES, leadStory, storyCard, storyRow, blindspotPanel, savedPanel, methodPanel, satirePanel } from '../components.js';

const GRID_SIZE = 6;

export async function renderHome(market) {
    const { stories } = await loadMarket(market);
    document.title = `${MARKET_NAMES[market]} · OnlyNews`;
    if (!stories.length) {
        return h('div', { class: 'notice' },
            h('h1', {}, 'No hay historias que mostrar'),
            h('p', {}, 'Puede que hayas ocultado todos los medios. ', h('a', { href: '#/fuentes' }, 'Revisa los medios visibles'), '.'));
    }

    const multi = stories.filter(story => story.sourceCount > 1);
    const singles = stories.filter(story => story.sourceCount === 1);
    const lead = multi.find(story => story.sourceCount >= 3) ?? multi[0] ?? singles[0];
    const rest = multi.filter(story => story !== lead);
    const otherSingles = singles.filter(story => story !== lead);

    return h('div', { class: 'home' },
        h('div', { class: 'home-main' },
            h('h1', { class: 'visually-hidden' }, `Portada · ${MARKET_NAMES[market]}`),
            leadStory(lead, market),
            rest.length ? h('section', { 'aria-labelledby': 'top-h' },
                h('h2', { id: 'top-h', class: 'section-title' }, t('topSection')),
                h('div', { class: 'card-grid' }, rest.slice(0, GRID_SIZE).map(story => storyCard(story, market)))) : null,
            rest.length > GRID_SIZE ? h('section', { 'aria-labelledby': 'more-h' },
                h('h2', { id: 'more-h', class: 'section-title section-title--dark' }, t('moreSection')),
                h('ol', { class: 'story-list' }, rest.slice(GRID_SIZE).map(story => storyRow(story, market)))) : null,
            otherSingles.length ? h('details', { class: 'singles' },
                h('summary', {}, `${t('singles')} (${otherSingles.length})`),
                h('ol', { class: 'story-list story-list--compact' }, otherSingles.map(story => storyRow(story, market, { compact: true })))) : null),
        h('aside', { class: 'home-aside' },
            satirePanel(market),
            blindspotPanel(multi, market),
            savedPanel(stories, market),
            methodPanel()));
}
