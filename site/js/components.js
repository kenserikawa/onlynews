// Piezas de interfaz reutilizadas por las vistas. Todo el texto de los feeds entra como texto.
import { h, safeUrl, timeAgo, plural } from './dom.js';
import { SIDES, SIDE_LABELS } from './coverage.js';
import { prefs } from './prefs.js';

export const MARKET_NAMES = { es: 'España', intl: 'Internacional' };
const SHORT = { left: 'I', center: 'C', right: 'D' };
const SEGMENT_LABELS = { left: 'IZQ', center: 'CEN', right: 'DER', unrated: 'S/C' };

export function coverageBar(coverage, { large = false } = {}) {
    const present = SIDES.filter(side => coverage[side] > 0);
    const label = present.map(side => `${coverage[side]} ${SIDE_LABELS[side].toLowerCase()}`).join(', ');
    return h('div', { class: `coverage${large ? ' coverage--lg' : ''}`, role: 'img', 'aria-label': `Cobertura: ${label}` },
        h('div', { class: 'coverage-bar' }, present.map(side => h('span', { class: `seg seg--${side}`, style: `flex-grow:${coverage[side]}` },
            large ? `${SEGMENT_LABELS[side]} ${coverage[side]}` : null))),
        h('div', { class: 'coverage-legend', 'aria-hidden': 'true' },
            ['left', 'center', 'right'].map(side => h('span', { class: `legend legend--${side}` }, `${SHORT[side]} ${coverage[side]}`))));
}

export function storyMeta(story) {
    return h('p', { class: 'story-meta' },
        h('span', {}, `${plural(story.sourceCount, 'medio', 'medios')} · ${timeAgo(story.lastSeen)}`),
        story.blindspot
            ? h('span', { class: `badge badge--${story.blindspot}` }, `Solo ${story.blindspot === 'left' ? 'izquierda' : 'derecha'}`)
            : null);
}

export function storyImage(url, className) {
    const src = safeUrl(url);
    if (!src) return null;
    const img = h('img', { class: className, src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => img.remove());
    return img;
}

const storyHref = (story, market) => `#/${market}/${story.id}`;

export function leadStory(story, market) {
    const summary = story.summary ?? story.articles[0]?.summary;
    return h('article', { class: 'lead' },
        h('a', { class: 'story-link', href: storyHref(story, market) },
            storyImage(story.image, 'lead-img'),
            h('div', { class: 'lead-body' },
                h('h2', { class: 'story-title' }, story.title),
                summary ? h('p', { class: 'lead-summary' }, summary) : null,
                coverageBar(story.coverage, { large: true }),
                storyMeta(story))));
}

export function storyCard(story, market) {
    return h('article', { class: 'card' },
        h('a', { class: 'story-link', href: storyHref(story, market) },
            storyImage(story.image, 'card-img'),
            h('div', { class: 'card-body' },
                h('h3', { class: 'story-title' }, story.title),
                coverageBar(story.coverage),
                storyMeta(story))));
}

// Grande del bloque hero de los resultados: foto arriba, titular grande y barra.
export function heroLead(story, market) {
    const summary = story.summary ?? story.articles[0]?.summary;
    return h('article', { class: 'card hero-lead' },
        h('a', { class: 'story-link', href: storyHref(story, market) },
            storyImage(story.image, 'card-img'),
            h('div', { class: 'card-body' },
                h('h3', { class: 'story-title' }, story.title),
                summary ? h('p', { class: 'lead-summary' }, summary) : null,
                coverageBar(story.coverage, { large: true }),
                storyMeta(story))));
}

// Pequeña: titular, metadatos y barra; miniatura solo si hay foto.
export function storySmall(story, market) {
    return h('article', { class: 'small' },
        h('a', { class: `story-link${story.image ? ' has-thumb' : ''}`, href: storyHref(story, market) },
            storyImage(story.image, 'small-thumb'),
            h('div', { class: 'small-body' },
                h('h3', { class: 'story-title' }, story.title),
                coverageBar(story.coverage),
                storyMeta(story))));
}

export function storyRow(story, market, { compact = false } = {}) {
    return h('li', { class: 'row' },
        h('a', { class: 'story-link', href: storyHref(story, market) },
            h('div', { class: 'row-text' },
                h('h3', { class: 'story-title' }, story.title),
                storyMeta(story)),
            compact ? null : coverageBar(story.coverage)));
}

export function storyMini(story, market) {
    return h('li', {},
        h('a', { class: 'mini', href: storyHref(story, market) },
            h('span', { class: 'mini-title' }, story.title),
            h('span', { class: 'mini-meta' }, `${plural(story.sourceCount, 'medio', 'medios')} · ${timeAgo(story.lastSeen)}`)));
}

export function blindspotPanel(stories, market) {
    const group = (side, title) => {
        const list = stories.filter(story => story.blindspot === side).slice(0, 5);
        return [
            h('h3', { class: `side-${side}` }, title),
            list.length ? h('ol', { class: 'mini-list' }, list.map(story => storyMini(story, market))) : h('p', { class: 'empty' }, 'Ninguna ahora mismo.'),
        ];
    };
    return h('section', { class: 'panel panel--blindspot', 'aria-labelledby': 'blindspots-h' },
        h('h2', { id: 'blindspots-h' }, 'Blindspots'),
        h('p', { class: 'hint' }, 'Historias que cubre casi solo un lado.'),
        group('left', 'Solo la izquierda'),
        group('right', 'Solo la derecha'));
}

export function savedPanel(stories, market) {
    const saved = Object.entries(prefs.saved()).filter(([, entry]) => entry.market === market);
    const byId = new Map(stories.map(story => [story.id, story]));
    const items = saved
        .sort(([, a], [, b]) => b.savedAt.localeCompare(a.savedAt))
        .slice(0, 5)
        .map(([id, entry]) => byId.has(id)
            ? storyMini(byId.get(id), market)
            : h('li', {}, h('a', { class: 'mini', href: `#/${market}/${id}` },
                h('span', { class: 'mini-title' }, entry.title),
                h('span', { class: 'mini-meta' }, 'Ya no está en portada'))));
    return h('section', { class: 'panel', 'aria-labelledby': 'saved-h' },
        h('h2', { id: 'saved-h' }, 'Guardadas'),
        items.length ? h('ol', { class: 'mini-list' }, items) : h('p', { class: 'empty' }, 'Guarda historias desde su ficha para leerlas luego.'),
        saved.length ? h('a', { class: 'panel-link', href: `#/${market}/guardadas` }, `Ver todas (${saved.length})`) : null);
}

export function methodPanel() {
    return h('section', { class: 'panel panel--note', 'aria-labelledby': 'method-h' },
        h('h2', { id: 'method-h' }, '¿Cómo medimos?'),
        h('p', {}, 'Cada medio tiene una orientación aproximada, de izquierda a derecha. La barra cuenta cuántos medios de cada lado cubren cada historia.'),
        h('a', { href: '#/fuentes' }, 'Ver medios y criterios →'));
}
