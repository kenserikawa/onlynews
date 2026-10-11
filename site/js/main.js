// Arranque de la web: router por hash, tema, buscador y estado de los feeds.
import { prefs } from './prefs.js';
import { loadJson } from './data.js';
import { h, timeAgo } from './dom.js';
import { renderHome } from './views/home.js';
import { renderStory } from './views/story.js';
import { renderSearch } from './views/search.js';
import { renderSaved } from './views/saved.js';
import { renderSources } from './views/sources.js';

const MARKETS = ['es', 'intl'];
const THEMES = { auto: ['◐', 'Tema automático'], light: ['☀', 'Tema claro'], dark: ['☾', 'Tema oscuro'] };
const NEXT_THEME = { auto: 'light', light: 'dark', dark: 'auto' };

const app = document.getElementById('app');
const searchForm = document.querySelector('.search');
const themeButton = document.getElementById('theme-toggle');
let renderToken = 0;

function applyTheme(theme) {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    const [icon, label] = THEMES[theme];
    themeButton.textContent = icon;
    themeButton.title = label;
    themeButton.setAttribute('aria-label', `${label}. Cambiar tema`);
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

async function show(viewPromise) {
    const token = ++renderToken;
    app.setAttribute('aria-busy', 'true');
    app.replaceChildren(h('p', { class: 'loading' }, 'Cargando…'));
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
    window.scrollTo(0, 0);
}

function route() {
    const { parts, params } = parseRoute();
    if (parts[0] === 'fuentes') {
        setActiveMarket(null);
        searchForm.q.value = '';
        return show(renderSources());
    }
    const market = MARKETS.includes(parts[0]) ? parts[0] : null;
    if (!market) {
        location.replace(`#/${MARKETS.includes(prefs.market) ? prefs.market : 'es'}`);
        return;
    }
    prefs.market = market;
    setActiveMarket(market);
    const sub = parts[1];
    const query = params.get('q') ?? '';
    searchForm.q.value = sub === 'buscar' ? query : '';

    if (!sub) return show(renderHome(market));
    if (sub === 'buscar') return show(renderSearch(market, query));
    if (sub === 'guardadas') return show(renderSaved(market));
    if (sub.startsWith('s-')) return show(renderStory(market, sub));
    return show(Promise.resolve(h('div', { class: 'notice' },
        h('h1', {}, 'Página no encontrada'),
        h('p', {}, h('a', { href: `#/${market}` }, 'Volver a la portada')))));
}

async function showFeedStatus() {
    const status = document.getElementById('feed-status');
    try {
        const meta = await loadJson('meta');
        const ok = meta.feeds.filter(feed => feed.ok).length;
        status.textContent = `${ok}/${meta.feeds.length} fuentes actualizadas · ${timeAgo(meta.generatedAt)}`;
    } catch {
        status.textContent = '';
    }
}

searchForm.addEventListener('submit', event => {
    event.preventDefault();
    const query = searchForm.q.value.trim();
    const market = MARKETS.includes(prefs.market) ? prefs.market : 'es';
    location.hash = query ? `#/${market}/buscar?q=${encodeURIComponent(query)}` : `#/${market}`;
});

themeButton.addEventListener('click', () => {
    prefs.theme = NEXT_THEME[prefs.theme];
    applyTheme(prefs.theme);
});

applyTheme(prefs.theme);
window.addEventListener('hashchange', route);
route();
showFeedStatus();
