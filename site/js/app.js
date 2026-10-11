// Versión estática de OnlyNews para GitHub Pages.
// Los datos los descarga un GitHub Action (scripts/fetch-news.sh) a data/*.json;
// aquí solo se leen y se pintan con el mismo marcado que las plantillas Twig.

const CATEGORIES = {
    '/general': 'general',
    '/business': 'business',
    '/entertainment': 'entertainment',
    '/health': 'health',
    '/science': 'science',
    '/sports': 'sports',
    '/tech': 'technology',
};

const results = document.getElementById('results');
const statusLine = document.getElementById('status');
const searchForm = document.getElementById('search-form');
const cache = {};

function loadJson(name) {
    if (!cache[name]) {
        cache[name] = fetch(`data/${name}.json`, { cache: 'no-cache' }).then(response => {
            if (!response.ok) throw new Error(`data/${name}.json → HTTP ${response.status}`);
            return response.json();
        });
        cache[name].catch(() => delete cache[name]);
    }
    return cache[name];
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function safeUrl(url) {
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
    } catch {
        return null;
    }
}

function formatDate(iso) {
    const date = new Date(iso);
    if (isNaN(date)) return '';
    return date.toLocaleString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

function copyLink(url) {
    navigator.clipboard?.writeText(url);
}

// Mismo marcado que el macro displayArticles de templates/search/index.html.twig:
// onhover-article-animation.js depende de esa estructura (children[6] = enlace a la fuente).
function articleCard(article, id) {
    const card = el('div', 'blurred card flex-md-row mb-4 box-shadow h-md-250');
    card.id = id;
    card.setAttribute('onmouseover', 'highlight(this)');
    card.setAttribute('onmouseout', 'readjust(this)');

    const body = el('div', 'card-body d-flex flex-column align-items-start');
    const inner = el('div', 'p-3');
    const url = safeUrl(article.url);
    const link = el('a', 'text-decoration-none text-dark');
    if (url) link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.append(el('p', 'text-danger', article.source?.name || ''));
    inner.append(
        el('h1', 'h3 font-weight-bold', article.title || ''),
        el('h2', 'h5', article.description || ''),
        el('br'),
        el('span', '', formatDate(article.publishedAt)),
        el('br'),
        el('em', '', article.author ? `By ${article.author}` : ''),
        link,
    );
    body.append(inner);
    card.append(body);

    const image = safeUrl(article.urlToImage);
    if (image) {
        const img = el('img', 'blurred-img article-img p-2 mr-4 card-img-right flex-auto d-none d-md-block rounded align-middle my-auto');
        img.src = image;
        img.loading = 'lazy';
        img.alt = '';
        img.onerror = () => img.remove();
        card.append(img);
    }

    const actions = el('div', 'card-header border-white border-left d-flex flex-column align-items-start');
    const remove = el('a', 'btn-option mx-auto');
    remove.style.cursor = 'pointer';
    remove.title = 'Remove report';
    remove.onclick = () => removeCard(id);
    remove.append(el('i', 'fas fa-times fa-lg'));

    const share = el('div', 'btn-group dropleft');
    const shareButton = el('a', 'btn-option mx-auto mt-2 dropdown-button-custom');
    shareButton.style.cursor = 'pointer';
    shareButton.title = 'Share';
    shareButton.dataset.toggle = 'dropdown';
    shareButton.append(el('i', 'fas fa-share-alt fa-lg'));
    const menu = el('div', 'dropdown-menu');
    const copy = el('a', 'dropdown-item', 'Copy url');
    copy.style.cursor = 'pointer';
    copy.onclick = () => url && copyLink(url);
    menu.append(copy);
    share.append(shareButton, menu);

    actions.append(remove, share);
    card.append(actions);
    return card;
}

// Mismo marcado que el macro displayGeneralSources de templates/news/index.html.twig.
function sourceCard(source) {
    const card = el('div', 'card w-100 mb-2');
    const body = el('div', 'card-body');
    body.append(el('h3', 'display-5', source.name || ''), el('h3', 'h4', source.description || ''));
    const url = safeUrl(source.url);
    if (url) {
        const link = el('a', 'text-decoration-none text-dark');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.append(el('h3', 'h6 text-danger', url));
        body.append(link);
    }
    card.append(body);
    return card;
}

function selectCategory(route) {
    document.querySelectorAll('.category-button').forEach(button => {
        const selected = button.id === route;
        ['bg-danger', 'text-white', 'w-25', 'brand'].forEach(cls => button.classList.toggle(cls, selected));
        button.classList.toggle('text-danger', !selected);
    });
}

async function showHeadlines(query) {
    const data = await loadJson('headlines');
    let articles = (data.articles || []).filter(article => article.title !== '[Removed]');
    if (query) {
        const needle = query.toLowerCase();
        articles = articles.filter(article =>
            [article.title, article.description, article.source?.name, article.author]
                .some(field => field && field.toLowerCase().includes(needle)));
        document.title = `OnlyNews | ${query}`;
        statusLine.textContent = `${articles.length} results for "${query}" in today's headlines`;
    } else {
        document.title = 'OnlyNews | Results';
    }
    results.replaceChildren(...articles.map((article, i) => articleCard(article, i)));
}

async function showCategory(category) {
    const data = await loadJson(`sources-${category}`);
    document.title = `OnlyNews | ${category[0].toUpperCase()}${category.slice(1)}`;
    results.replaceChildren(...(data.sources || []).map(sourceCard));
}

async function render() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const [route, queryString] = hash.split('?');
    const query = new URLSearchParams(queryString || '').get('q')?.trim();

    selectCategory(route);
    statusLine.textContent = '';
    searchForm.query.value = route === '/search' ? query || '' : '';
    try {
        if (CATEGORIES[route]) {
            await showCategory(CATEGORIES[route]);
        } else {
            await showHeadlines(route === '/search' ? query : null);
        }
        const meta = await loadJson('meta').catch(() => null);
        if (meta?.updatedAt && !statusLine.textContent) {
            statusLine.textContent = `Updated ${formatDate(meta.updatedAt)}`;
        }
    } catch (error) {
        console.error(error);
        results.replaceChildren();
        statusLine.textContent = 'News data is not available yet.';
    }
    drawBackground();
}

searchForm.addEventListener('submit', event => {
    event.preventDefault();
    location.hash = `#/search?q=${encodeURIComponent(searchForm.query.value.trim())}`;
});

window.addEventListener('hashchange', render);
render();
