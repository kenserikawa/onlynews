import { h, safeUrl } from '../dom.js';
import { loadJson } from '../data.js';
import { prefs } from '../prefs.js';
import { BIAS_LABELS, sideOf } from '../coverage.js';
import { MARKET_NAMES } from '../components.js';

const LEVELS = [-2, -1, 0, 1, 2, null];

export async function renderSources() {
    const [sources, meta] = await Promise.all([loadJson('sources'), loadJson('meta').catch(() => null)]);
    document.title = 'Medios · OnlyNews';
    const feedOk = new Map();
    for (const feed of meta?.feeds ?? []) feedOk.set(feed.sourceId, (feedOk.get(feed.sourceId) ?? false) || feed.ok);
    const hidden = prefs.hiddenSources();

    const sourceRow = source => {
        const checkbox = h('input', { type: 'checkbox', id: `src-${source.id}` });
        checkbox.checked = !hidden.has(source.id);
        checkbox.addEventListener('change', () => prefs.setSourceHidden(source.id, !checkbox.checked));
        const site = safeUrl(source.site);
        return h('li', { class: 'source-row' },
            checkbox,
            h('label', { for: `src-${source.id}` }, source.name),
            feedOk.get(source.id) === false ? h('span', { class: 'source-down' }, 'sin datos ahora') : null,
            site ? h('a', { href: site, target: '_blank', rel: 'noopener noreferrer' }, new URL(site).hostname.replace(/^www\./, '')) : null);
    };

    const marketSection = market => {
        const ofMarket = sources.filter(source => source.market === market);
        return h('section', { 'aria-labelledby': `market-${market}` },
            h('h2', { id: `market-${market}`, class: 'section-title' }, MARKET_NAMES[market]),
            LEVELS.map(level => {
                const group = ofMarket.filter(source => (source.bias ?? null) === level);
                if (!group.length) return null;
                return h('div', { class: 'source-group' },
                    h('h3', {}, h('span', { class: `dot dot--${sideOf(level)}`, 'aria-hidden': 'true' }), BIAS_LABELS[String(level)]),
                    h('ul', { style: 'display:grid;gap:6px' }, group.map(sourceRow)));
            }));
    };

    return h('section', { class: 'sources-page' },
        h('h1', { class: 'page-title' }, 'Cómo clasificamos los medios'),
        h('div', { class: 'prose' },
            h('p', {}, 'Cada medio tiene una orientación en cinco niveles, de izquierda a derecha, según su línea editorial tal como suele describirse públicamente. En los medios internacionales nos apoyamos en AllSides y Ad Fontes. ', h('strong', {}, 'Es una clasificación orientativa'), ', no un juicio sobre la calidad de cada medio.'),
            h('p', {}, 'La barra de cobertura cuenta ', h('strong', {}, 'medios distintos'), ': azul para izquierda y centro-izquierda, gris para el centro y rojo para centro-derecha y derecha. Las agencias y medios públicos van al centro; los verificadores quedan sin clasificar.'),
            h('p', {}, 'Una historia es un ', h('strong', {}, 'blindspot'), ' cuando la cubren al menos 3 medios, uno de los lados aporta el 80 % o más de los que tienen orientación y ningún medio del lado contrario la ha publicado.'),
            h('p', {}, 'Desmarca un medio para ocultarlo en tu portada; la cobertura se recalcula sin él. Se guarda solo en este navegador.')),
        marketSection('es'),
        marketSection('intl'));
}
