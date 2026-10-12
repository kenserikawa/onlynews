// Arranque de la web: router por hash, tema, buscador y estado de los feeds.
import { prefs } from './prefs.js';
import { loadJson, loadMarket } from './data.js';
import { marketSummary } from './coverage.js';
import { MARKET_NAMES, t } from './components.js';
import { scoreLine } from './satire/voice.js';
import { h, timeAgo } from './dom.js';
import { renderHome } from './views/home.js';
import { renderStory } from './views/story.js';
import { renderSearch } from './views/search.js';
import { renderSaved } from './views/saved.js';
import { renderSources } from './views/sources.js';
import { renderAwards } from './views/awards.js';
import { renderBingo } from './views/bingo.js';

const MARKETS = ['es', 'intl'];
// Iconos SVG fijos (no son datos externos), porque los glifos ◐☀☾ faltan en muchas fuentes.
const ICON = body => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
// El botón muestra el tema al que se pasa al pulsarlo.
const THEME_ICONS = {
    light: ICON('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    dark: ICON('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
};
const THEME_NAMES = { light: 'claro', dark: 'oscuro' };
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

const app = document.getElementById('app');
const searchForm = document.querySelector('.search');
const themeButton = document.getElementById('theme-toggle');
const monitor = document.getElementById('monitor');
const satireButton = document.getElementById('satire-toggle');
const tagline = document.getElementById('tagline');
let renderToken = 0;
let monitorToken = 0;

// «auto» sigue al sistema hasta el primer clic; desde ahí el botón alterna claro/oscuro
// según lo que se ve, sin pasos intermedios que no cambian nada en pantalla.
function effectiveTheme(theme) {
    if (theme !== 'auto') return theme;
    return systemDark.matches ? 'dark' : 'light';
}

function applyTheme(theme) {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    const next = effectiveTheme(theme) === 'dark' ? 'light' : 'dark';
    themeButton.innerHTML = THEME_ICONS[next];
    themeButton.title = `Cambiar a tema ${THEME_NAMES[next]}`;
    themeButton.setAttribute('aria-label', `Cambiar a tema ${THEME_NAMES[next]}`);
}

function parseRoute() {
    const raw = location.hash.slice(1) || '/';
    const [path, query = ''] = raw.split('?');
    return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
}

function setActiveMarket(market) {
    for (const link of document.querySelectorAll('[data-market]')) {
        if (link.dataset.market === market) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    }
}

async function show(viewPromise, { keepScroll = false } = {}) {
    const token = ++renderToken;
    // Al repintar la misma ruta (cambio de modo) se mantiene la vista hasta tener la nueva,
    // para no encoger la página y perder el scroll.
    const scrollY = window.scrollY;
    app.setAttribute('aria-busy', 'true');
    if (!keepScroll) app.replaceChildren(h('p', { class: 'loading' }, 'Cargando…'));
    try {
        const node = await viewPromise;
        if (token !== renderToken) return;
        app.replaceChildren(node);
    } catch (error) {
        if (token !== renderToken) return;
        console.error(error);
        app.replaceChildren(h('div', { class: 'notice' },
            h('h1', {}, 'No hemos podido cargar las noticias'),
            h('p', {}, 'Los datos aún no están disponibles o ha fallado la conexión. Prueba a recargar en unos minutos.')));
    } finally {
        if (token === renderToken) app.removeAttribute('aria-busy');
    }
    window.scrollTo(0, keepScroll ? scrollY : 0);
}

// Modo coña: marca (pegatina y lema), estado del interruptor y voz de los textos.
function applySatire() {
    document.body.classList.toggle('is-satire', prefs.satire);
    satireButton.setAttribute('aria-pressed', String(prefs.satire));
    satireButton.title = prefs.satire ? 'Desactivar modo satírico' : 'Activar modo satírico';
    tagline.textContent = t('tagline');
    tagline.hidden = !tagline.textContent;
}

// Franja «monitor» bajo la cabecera: medios con artículos, reparto por lado y blindspots
// del mercado actual, calculados con los mismos datos que la portada.
async function showMonitor(market) {
    const token = ++monitorToken;
    try {
        const { stories, sourcesById } = await loadMarket(market);
        if (token !== monitorToken) return;
        const summary = marketSummary(stories, id => sourcesById[id]?.bias ?? null);
        const item = (side, text) => h('span', { class: `monitor-item${side ? ` monitor-item--${side}` : ''}` }, text);
        const blindspots = h('span', { class: 'monitor-alert' }, `${summary.blindspots} ${summary.blindspots === 1 ? 'blindspot' : 'blindspots'}`);
        monitor.replaceChildren(prefs.satire
            ? h('div', { class: 'wrap monitor-inner' },
                item(null, t('monitor', { market: MARKET_NAMES[market], n: summary.sources })),
                h('span', { class: 'monitor-score' }, scoreLine(summary.share)),
                h('a', { class: 'monitor-link', href: `#/${market}/premios` }, 'Premios'),
                h('a', { class: 'monitor-link', href: `#/${market}/bingo` }, 'Bingo'),
                blindspots)
            : h('div', { class: 'wrap monitor-inner' },
                item(null, t('monitor', { market: MARKET_NAMES[market], n: summary.sources })),
                item('left', `Izq ${summary.share.left}%`),
                item('center', `Centro ${summary.share.center}%`),
                item('right', `Der ${summary.share.right}%`),
                blindspots));
        monitor.hidden = false;
    } catch {
        if (token === monitorToken) monitor.hidden = true;
    }
}

function hideMonitor() {
    monitorToken++;
    monitor.hidden = true;
}

function route({ keepScroll = false } = {}) {
    const { parts, params } = parseRoute();
    const opts = { keepScroll };
    if (parts[0] === 'fuentes') {
        setActiveMarket(null);
        hideMonitor();
        searchForm.q.value = '';
        return show(renderSources(), opts);
    }
    const market = MARKETS.includes(parts[0]) ? parts[0] : null;
    if (!market) {
        location.replace(`#/${MARKETS.includes(prefs.market) ? prefs.market : 'es'}`);
        return;
    }
    prefs.market = market;
    setActiveMarket(market);
    showMonitor(market);
    const sub = parts[1];
    const query = params.get('q') ?? '';
    searchForm.q.value = sub === 'buscar' ? query : '';

    if (sub === 'premios' || sub === 'bingo') {
        // Un enlace compartido a premios o bingo activa el modo: esas páginas son el chiste.
        if (!prefs.satire) {
            prefs.satire = true;
            applySatire();
            showMonitor(market);
            showFeedStatus();
        }
        return show(sub === 'premios' ? renderAwards(market) : renderBingo(market), opts);
    }
    if (!sub) return show(renderHome(market), opts);
    if (sub === 'buscar') return show(renderSearch(market, query), opts);
    if (sub === 'guardadas') return show(renderSaved(market), opts);
    if (sub.startsWith('s-')) return show(renderStory(market, sub), opts);
    return show(Promise.resolve(h('div', { class: 'notice' },
        h('h1', {}, 'Página no encontrada'),
        h('p', {}, h('a', { href: `#/${market}` }, 'Volver a la portada')))));
}

async function showFeedStatus() {
    const status = document.getElementById('feed-status');
    try {
        const meta = await loadJson('meta');
        const ok = meta.feeds.filter(feed => feed.ok).length;
        const n = meta.feeds.length;
        const key = n - ok === 0 ? 'footerFeedsAll' : n - ok === 1 ? 'footerFeedsOne' : 'footerFeeds';
        status.textContent = `${t(key, { ok, n, rest: n - ok })} · ${timeAgo(meta.generatedAt)}`;
    } catch {
        status.textContent = '';
    }
}

// El enlace «Saltar al contenido» no debe pasar por el router de hashes.
document.querySelector('.skip-link').addEventListener('click', event => {
    event.preventDefault();
    app.focus();
});

searchForm.addEventListener('submit', event => {
    event.preventDefault();
    const query = searchForm.q.value.trim();
    const market = MARKETS.includes(prefs.market) ? prefs.market : 'es';
    location.hash = query ? `#/${market}/buscar?q=${encodeURIComponent(query)}` : `#/${market}`;
});

themeButton.addEventListener('click', () => {
    prefs.theme = effectiveTheme(prefs.theme) === 'dark' ? 'light' : 'dark';
    applyTheme(prefs.theme);
});

satireButton.addEventListener('click', () => {
    prefs.satire = !prefs.satire;
    applySatire();
    showFeedStatus();
    // Premios y bingo solo existen en modo coña: al apagarlo desde ahí se vuelve a la portada.
    const { parts } = parseRoute();
    if (!prefs.satire && (parts[1] === 'premios' || parts[1] === 'bingo')) {
        location.hash = `#/${parts[0]}`;
        return;
    }
    route({ keepScroll: true });
});

applyTheme(prefs.theme);
applySatire();
systemDark.addEventListener('change', () => applyTheme(prefs.theme));
window.addEventListener('hashchange', route);
route();
showFeedStatus();
