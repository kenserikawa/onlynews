# OnlyNews «grounded»: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir la web estática de titulares de NewsAPI por un agregador al estilo Ground News: historias agrupadas de ~37 medios RSS (España + Internacional), barra de cobertura izquierda/centro/derecha, blindspots, ficha comparativa y personalización local.

**Architecture:** Un pipeline Node (`pipeline/`) que el GitHub Action ejecuta cada hora: descarga los RSS, los normaliza, agrupa los artículos en historias con TF-IDF + *average-link*, puntúa la cobertura y escribe JSON en `site/data/`. La web (`site/`) es HTML + CSS + módulos ES sin compilación, que solo lee esos JSON. La lógica de cobertura (`site/js/coverage.js`) la comparten el pipeline y la web.

**Tech Stack:** Node 22 (ESM, `node:test`), `fast-xml-parser` 4.x, HTML/CSS/JS nativos, Google Fonts (Inter, Newsreader), GitHub Actions + Pages, Playwright (solo para la verificación manual, fuera del repo).

**Spec:** `docs/superpowers/specs/2026-10-12-onlynews-grounded-design.md`

## Global Constraints

- Node ≥ 22, módulos ES (`"type": "module"`); una sola dependencia de producción: `fast-xml-parser` `^4.5.0`.
- Sin frameworks ni paso de compilación en `site/`; sin jQuery, Bootstrap ni d3.
- Todo contenido procedente de feeds se inserta como texto (`textContent` / nodos de texto); nunca `innerHTML` con datos externos. URLs de artículos e imágenes solo `http:`/`https:`.
- Artículos de más de 48 h se descartan. Ventana máxima de una historia: 36 h. Máximo 40 artículos por historia.
- Escala de sesgo −2…+2 o `null`. Lado: `left` si ≤ −1, `center` si 0, `right` si ≥ +1, `unrated` si `null`.
- Blindspot: `sourceCount ≥ 3`, un lado ≥ 80 % de los medios con orientación (izquierda+centro+derecha) y 0 medios del lado contrario.
- Relevancia: `sourceCount × 0.5^(horas desde lastSeen / 12)`.
- Claves de localStorage: `onlynews:saved`, `onlynews:hiddenSources`, `onlynews:theme` (`auto|light|dark`), `onlynews:market`.
- Si fallan más del 50 % de los feeds de un mercado, el build sale con código ≠ 0 y no se despliega.
- `REFINE_ENDPOINT` (opcional) activa el punto de extensión del modelo; en v1 no cambia nada.
- Interfaz en español. Cron del Action: `17 * * * *`.
- La app PHP/Symfony (`src/`, `templates/`, `public/`…) no se toca.
- Trabajo en la rama `feat/grounded`; nada se mezcla en `master` sin confirmación del usuario (cada push a `master` despliega).

## Review Focus

1. **Un feed devuelve 200 con una página HTML** (p. ej. un *challenge* de Cloudflare): debe registrarse como fallo («Formato de feed no reconocido»), no producir artículos basura. → test en Task 2.
2. **Items con enlace relativo o solo con `<guid>`**: se resuelven contra la web del medio o el guid; si no hay URL válida, el item se descarta. → test en Task 2.
3. **Fechas futuras o con zona horaria rara** («EDT», sin día de la semana): se aceptan y las futuras se recortan a «ahora», para no colocarse siempre arriba. → test en Task 2.
4. **El usuario oculta todos los medios de una historia, o de todo un mercado**: la historia desaparece y la portada muestra un estado vacío en lugar de romperse. → test en Task 1 (`withoutSources`) y en la verificación de Task 10.
5. **Una historia guardada ya no está en los datos** (caducó): la ficha muestra «ya no está en portada» con el título guardado y la opción de quitarla. → verificación en Task 10.

---

## Estructura de ficheros

```
package.json, package-lock.json         dependencias y scripts del pipeline
pipeline/
  sources.json                          catálogo de medios (con URLs de feed)
  text.js                               normalización, tokens, entidades HTML, hash
  parse.js                              RSS 2.0 / Atom / RDF → Article[]
  fetch.js                              descarga concurrente con timeout
  cluster.js                            TF-IDF + average-link → Cluster[]
  refine.js                             punto de extensión del modelo (no-op)
  score.js                              Cluster[] → Story[] (cobertura, blindspot, orden)
  build.js                              orquestador + CLI
  tools/inspect.js                      imprime historias para calibrar
  test/*.test.js                        node:test
site/
  index.html                            shell de la app
  icon.svg                              favicon
  css/styles.css                        estilos (tokens, claro/oscuro)
  js/coverage.js                        sideOf, coverageOf, blindspotOf, withoutSources (compartido)
  js/dom.js                             h(), safeUrl, timeAgo, fold, plural
  js/prefs.js                           localStorage con fallback en memoria
  js/data.js                            carga de JSON con caché + filtrado de medios ocultos
  js/components.js                      barra de cobertura, tarjetas, paneles
  js/main.js                            router por hash, tema, buscador, pie
  js/views/{home,story,search,saved,sources}.js
.github/workflows/pages.yml             test + build + deploy horario
```

Se eliminan: `site/js/{app,background-svg,button-animation,onhover-article-animation,remove-card-animation}.js`, `site/css/custom.css`, `site/images/globe.png`, `scripts/fetch-news.sh`.

---

### Task 1: Base del pipeline: `text.js` y `coverage.js`

**Files:**
- Create: `package.json`, `pipeline/text.js`, `site/js/coverage.js`
- Create: `pipeline/test/text.test.js`, `pipeline/test/coverage.test.js`
- Modify: `.gitignore` (añadir `/node_modules/`)

**Interfaces:**
- Produces (`pipeline/text.js`):
  - `normalize(text: string): string`: minúsculas, sin acentos ni puntuación, espacios simples.
  - `tokens(text: string, lang: 'es'|'en'): string[]`: tokens sin palabras vacías; descarta los de < 3 caracteres salvo números.
  - `decodeEntities(text: string): string`
  - `cleanText(text: string): string`: decodifica entidades, quita etiquetas HTML y colapsa espacios.
  - `truncate(text: string, max: number): string`
  - `hash(text: string): string`: FNV-1a 32 bits en base 36.
- Produces (`site/js/coverage.js`):
  - `SIDES = ['left','center','right','unrated']`, `SIDE_LABELS`, `BIAS_LABELS`
  - `sideOf(bias: number|null): 'left'|'center'|'right'|'unrated'`
  - `coverageOf(sourceIds: string[], biasOf: (id) => number|null): {left, center, right, unrated}`: cuenta medios distintos.
  - `blindspotOf(coverage): null|'left'|'right'`
  - `withoutSources(stories: Story[], hidden: Set<string>, biasOf): Story[]`

- [ ] **Step 1: Crear `package.json` e instalar la dependencia**

```json
{
  "name": "onlynews-pipeline",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "node --test \"pipeline/test/*.test.js\"",
    "build": "node pipeline/build.js site/data",
    "inspect": "node pipeline/tools/inspect.js"
  },
  "dependencies": {
    "fast-xml-parser": "^4.5.0"
  }
}
```

Run: `npm install` (genera `package-lock.json`). Añadir al final de `.gitignore`:

```
###> pipeline (node) ###
/node_modules/
###< pipeline ###
```

- [ ] **Step 2: Escribir los tests que fallan**

`pipeline/test/text.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, tokens, decodeEntities, cleanText, truncate, hash } from '../text.js';

test('normalize quita acentos, puntuación y mayúsculas', () => {
    assert.equal(normalize('¡Última hora: Sánchez, en el Congreso!'), 'ultima hora sanchez en el congreso');
});

test('tokens descarta palabras vacías y tokens cortos, pero conserva números', () => {
    assert.deepEqual(tokens('El Gobierno aprueba 2 leyes de vivienda', 'es'), ['gobierno', 'aprueba', '2', 'leyes', 'vivienda']);
    assert.deepEqual(tokens('The president says he will veto the bill', 'en'), ['president', 'veto', 'bill']);
});

test('decodeEntities resuelve entidades con nombre, numéricas y acentos españoles', () => {
    assert.equal(decodeEntities('&#8220;Hola&#x201D; &iquest;qu&eacute;? Espa&ntilde;a &amp; m&aacute;s'), '“Hola” ¿qué? España & más');
    assert.equal(decodeEntities('&desconocida; &#0;'), '&desconocida; &#0;');
});

test('cleanText quita HTML, también si viene escapado, y colapsa espacios', () => {
    assert.equal(cleanText('<p>Primer <b>párrafo</b></p>\n\n<script>x()</script> fin'), 'Primer párrafo fin');
    assert.equal(cleanText('&lt;p&gt;Texto &amp;quot;citado&amp;quot;&lt;/p&gt;'), 'Texto "citado"');
    assert.equal(cleanText(undefined), '');
});

test('truncate corta en límite de palabra y añade elipsis', () => {
    const long = 'palabra '.repeat(60).trim();
    const out = truncate(long, 300);
    assert.ok(out.length <= 301, `longitud ${out.length}`);
    assert.ok(out.endsWith('…'));
    assert.ok(!out.includes('palab…'));
    assert.equal(truncate('corto', 300), 'corto');
});

test('hash es determinista y alfanumérico', () => {
    assert.equal(hash('https://a.es/1'), hash('https://a.es/1'));
    assert.notEqual(hash('https://a.es/1'), hash('https://a.es/2'));
    assert.match(hash('x'), /^[0-9a-z]+$/);
});
```

`pipeline/test/coverage.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sideOf, coverageOf, blindspotOf, withoutSources } from '../../site/js/coverage.js';

const BIAS = { l2: -2, l1: -1, la: -1, lb: -2, c0: 0, r1: 1, r2: 2, u: null };
const biasOf = id => BIAS[id] ?? null;

test('sideOf agrupa la escala de 5 niveles en 3 lados más sin clasificar', () => {
    assert.equal(sideOf(-2), 'left');
    assert.equal(sideOf(-1), 'left');
    assert.equal(sideOf(0), 'center');
    assert.equal(sideOf(1), 'right');
    assert.equal(sideOf(2), 'right');
    assert.equal(sideOf(null), 'unrated');
    assert.equal(sideOf(undefined), 'unrated');
});

test('coverageOf cuenta medios distintos, no artículos', () => {
    assert.deepEqual(coverageOf(['l2', 'l2', 'c0', 'r1', 'u'], biasOf), { left: 1, center: 1, right: 1, unrated: 1 });
});

test('blindspotOf aplica el umbral del 80 % y exige 3 medios y 0 del lado contrario', () => {
    assert.equal(blindspotOf({ left: 4, center: 1, right: 0, unrated: 0 }), 'left');
    assert.equal(blindspotOf({ left: 3, center: 1, right: 0, unrated: 0 }), null);
    assert.equal(blindspotOf({ left: 5, center: 0, right: 1, unrated: 0 }), null);
    assert.equal(blindspotOf({ left: 0, center: 0, right: 3, unrated: 0 }), 'right');
    assert.equal(blindspotOf({ left: 2, center: 0, right: 0, unrated: 0 }), null);
    assert.equal(blindspotOf({ left: 0, center: 0, right: 0, unrated: 4 }), null);
});

function story(id, sourceIds) {
    const articles = sourceIds.map((sourceId, i) => ({
        sourceId, title: `${id} por ${sourceId}`, summary: '', url: `https://${sourceId}.es/${id}`,
        image: i === 1 ? `https://img/${sourceId}.jpg` : null, publishedAt: '2026-10-11T10:00:00.000Z',
    }));
    const coverage = coverageOf(sourceIds, biasOf);
    return { id, title: articles[0].title, summary: null, image: articles.find(a => a.image)?.image ?? null,
        firstSeen: '', lastSeen: '', coverage, sourceCount: new Set(sourceIds).size, blindspot: blindspotOf(coverage), articles };
}

test('withoutSources devuelve la misma lista si no hay medios ocultos', () => {
    const stories = [story('s-1', ['l2', 'r1'])];
    assert.equal(withoutSources(stories, new Set(), biasOf), stories);
});

test('withoutSources recalcula cobertura, título e imagen y elimina historias vacías', () => {
    const stories = [story('s-1', ['r1', 'l2', 'l1', 'la', 'lb']), story('s-2', ['r1'])];
    const out = withoutSources(stories, new Set(['r1']), biasOf);
    assert.equal(out.length, 1);
    assert.equal(out[0].title, 's-1 por l2');
    assert.equal(out[0].image, 'https://img/l2.jpg');
    assert.deepEqual(out[0].coverage, { left: 4, center: 0, right: 0, unrated: 0 });
    assert.equal(out[0].sourceCount, 4);
    assert.equal(out[0].blindspot, 'left');
});

test('withoutSources con todos los medios ocultos devuelve una lista vacía', () => {
    const stories = [story('s-1', ['l2', 'r1'])];
    assert.deepEqual(withoutSources(stories, new Set(['l2', 'r1']), biasOf), []);
});
```

- [ ] **Step 3: Ejecutar y comprobar que fallan**

Run: `npm test`
Expected: FAIL, `Cannot find module '…/pipeline/text.js'` y `…/site/js/coverage.js`.

- [ ] **Step 4: Implementar `pipeline/text.js`**

```js
// Utilidades de texto compartidas por el pipeline: normalización para el agrupado,
// limpieza del HTML que traen los feeds y un hash corto para ids estables.

const STOPWORDS = {
    es: `al algo algunas algunos ante antes como con contra cual cuando del desde donde durante ella ellas ellos
        entre era eran esa esas ese eso esos esta estaba estado estan estas este esto estos fue fueron han hasta
        hay las les los mas mismo muy nada nos nuestra nuestro otra otras otro otros para pero poco por porque
        que quien sea segun ser sido sin sobre son sus tambien tan tanto tiene tienen todo todos tras una uno unos
        hace puede pueden cada dos tres ano anos hoy ayer manana asi aun mientras ademas solo sera seran haber habia
        van dice dicen despues entonces ultima ultimo ultimas ultimos hora horas directo video videos foto fotos
        claves minuto noticias nuevo nueva gran sera estos esas cuanto cuantos donde quien`,
    en: `the and for are but not you all any can had her was one our out has have him his how its may new now
        old see two who did get got let say says said she too use that with this from they will would there their
        what about which when your more been were into over after than them then some could also just like only
        other these those being while where does here live latest update updates video watch news week year years
        today amid why`,
};
const STOP = Object.fromEntries(Object.entries(STOPWORDS).map(([lang, words]) => [lang, new Set(words.split(/\s+/))]));

export function normalize(text) {
    return String(text ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

export function tokens(text, lang) {
    const stop = STOP[lang] ?? STOP.en;
    return normalize(text)
        .split(' ')
        .filter(word => word && !stop.has(word) && (word.length >= 3 || /^\d+$/.test(word)));
}

const ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—',
    laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', euro: '€', iexcl: '¡',
    iquest: '¿', ordm: 'º', ordf: 'ª', deg: '°', middot: '·', bull: '•',
};
for (const vowel of 'aeiouAEIOU') ENTITIES[`${vowel}acute`] = `${vowel}́`.normalize('NFC');
for (const vowel of 'aeiouAEIOU') ENTITIES[`${vowel}grave`] = `${vowel}̀`.normalize('NFC');
for (const vowel of 'aeiouAEIOU') ENTITIES[`${vowel}uml`] = `${vowel}̈`.normalize('NFC');
Object.assign(ENTITIES, { ntilde: 'ñ', Ntilde: 'Ñ', ccedil: 'ç', Ccedil: 'Ç' });

export function decodeEntities(text) {
    return String(text ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
        if (entity[0] === '#') {
            const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
        }
        return ENTITIES[entity] ?? ENTITIES[entity.toLowerCase()] ?? match;
    });
}

export function cleanText(text) {
    // Primero se decodifica por si el HTML viene escapado (&lt;p&gt;), luego se quitan
    // las etiquetas y se decodifica de nuevo lo que quedara doblemente escapado.
    const withoutTags = decodeEntities(text)
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]*>/g, ' ');
    return decodeEntities(withoutTags).replace(/\s+/g, ' ').trim();
}

export function truncate(text, max) {
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
    return `${base.replace(/[\s,.;:]+$/, '')}…`;
}

export function hash(text) {
    let h = 0x811c9dc5;
    for (const char of String(text)) {
        h ^= char.codePointAt(0);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}
```

- [ ] **Step 5: Implementar `site/js/coverage.js`**

```js
// Lógica de cobertura compartida: la usan el pipeline (score.js) y la web
// (para recalcular cuando el usuario oculta medios). Sin dependencias del DOM.

export const SIDES = ['left', 'center', 'right', 'unrated'];

export const SIDE_LABELS = { left: 'Izquierda', center: 'Centro', right: 'Derecha', unrated: 'Sin clasificar' };

export const BIAS_LABELS = {
    '-2': 'Izquierda', '-1': 'Centro-izquierda', '0': 'Centro', '1': 'Centro-derecha', '2': 'Derecha', 'null': 'Sin clasificar',
};

export function sideOf(bias) {
    if (bias == null) return 'unrated';
    if (bias <= -1) return 'left';
    if (bias >= 1) return 'right';
    return 'center';
}

export function coverageOf(sourceIds, biasOf) {
    const coverage = { left: 0, center: 0, right: 0, unrated: 0 };
    for (const id of new Set(sourceIds)) coverage[sideOf(biasOf(id))]++;
    return coverage;
}

export function blindspotOf(coverage) {
    const { left = 0, center = 0, right = 0, unrated = 0 } = coverage;
    const rated = left + center + right;
    if (left + center + right + unrated < 3 || rated === 0) return null;
    if (right === 0 && left / rated >= 0.8) return 'left';
    if (left === 0 && right / rated >= 0.8) return 'right';
    return null;
}

export function withoutSources(stories, hidden, biasOf) {
    if (!hidden.size) return stories;
    return stories.flatMap(story => {
        const articles = story.articles.filter(article => !hidden.has(article.sourceId));
        if (!articles.length) return [];
        if (articles.length === story.articles.length) return [story];
        const coverage = coverageOf(articles.map(article => article.sourceId), biasOf);
        return [{
            ...story,
            title: articles[0].title,
            image: articles.find(article => article.image)?.image ?? null,
            articles,
            coverage,
            sourceCount: new Set(articles.map(article => article.sourceId)).size,
            blindspot: blindspotOf(coverage),
        }];
    });
}
```

- [ ] **Step 6: Ejecutar los tests**

Run: `npm test`
Expected: PASS (todos los tests de `text` y `coverage`).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore pipeline/text.js pipeline/test/text.test.js site/js/coverage.js pipeline/test/coverage.test.js
git commit -m "feat(pipeline): text utils and shared coverage logic"
```

---

### Task 2: `parse.js`: RSS 2.0 / Atom / RDF → artículos

**Files:**
- Create: `pipeline/parse.js`, `pipeline/test/parse.test.js`

**Interfaces:**
- Consumes: `cleanText`, `decodeEntities`, `truncate`, `hash` de `pipeline/text.js`.
- Produces:
  - `parseFeed(xml: string, source: {id, market, site}, opts?: {now?: Date}): Article[]`. Lanza `Error` si el XML no es un feed reconocible.
  - `normalizeUrl(raw: string, base?: string): string|null`
  - `Article = {id: 'a-<hash>', url, title, summary, image: string|null, publishedAt: ISO, sourceId, market}`

- [ ] **Step 1: Escribir los tests que fallan**

`pipeline/test/parse.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, normalizeUrl } from '../parse.js';

const now = new Date('2026-10-11T20:00:00Z');
const source = { id: 'medio', market: 'es', site: 'https://medio.es' };

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel><title>Medio</title><link>https://medio.es</link>
<item>
  <title><![CDATA[El Gobierno aprueba la ley &amp; más]]></title>
  <link>https://medio.es/noticia-1?utm_source=rss&amp;id=7#arriba</link>
  <description><![CDATA[<p>Primer <b>párrafo</b> &quot;citado&quot;</p><img src="https://img.medio.es/inline.jpg">]]></description>
  <pubDate>Sun, 11 Oct 2026 20:00:00 +0200</pubDate>
  <media:content url="https://img.medio.es/1.jpg" type="image/jpeg" />
</item>
<item>
  <title>Sin imagen en media pero con img en el cuerpo</title>
  <guid isPermaLink="true">https://medio.es/noticia-2</guid>
  <description>&lt;p&gt;Texto &lt;img src="https://img.medio.es/2.jpg"&gt;&lt;/p&gt;</description>
  <dc:date>2026-10-11T19:00:00Z</dc:date>
</item>
<item><title>Vieja</title><link>https://medio.es/vieja</link><pubDate>Thu, 08 Oct 2026 10:00:00 GMT</pubDate></item>
<item><title></title><link>https://medio.es/sin-titulo</link></item>
<item><title>Duplicada</title><link>https://medio.es/noticia-1?utm_medium=x&amp;id=7</link></item>
<item><title>Del futuro</title><link>https://medio.es/futuro</link><pubDate>Mon, 12 Oct 2026 23:00:00 GMT</pubDate>
  <enclosure url="https://img.medio.es/f.png" type="image/png" length="1"/></item>
<item><title>Relativa</title><link>/relativa</link><pubDate>Sat, 10 Oct 2026 09:00:00 EDT</pubDate></item>
<item><title>Sin enlace</title><guid isPermaLink="false">abc-123</guid></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
<entry>
  <title type="html">Titular &lt;em&gt;atom&lt;/em&gt;</title>
  <link rel="self" href="https://atom.es/self"/><link rel="alternate" href="https://atom.es/a1"/>
  <updated>2026-10-11T18:30:00Z</updated>
  <summary type="html">&lt;p&gt;Resumen atom&lt;/p&gt;</summary>
</entry>
</feed>`;

const RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel><title>DW</title></channel>
<item><title>RDF item</title><link>https://rdf.de/1</link><dc:date>2026-10-11T17:00:00Z</dc:date><description>Desc</description></item>
</rdf:RDF>`;

test('RSS 2.0: limpia títulos, URLs, entradillas, imágenes y fechas', () => {
    const articles = parseFeed(RSS, source, { now });
    assert.deepEqual(articles.map(a => a.url), [
        'https://medio.es/noticia-1?id=7',
        'https://medio.es/noticia-2',
        'https://medio.es/futuro',
        'https://medio.es/relativa',
    ]);
    const [first, second, future, relative] = articles;
    assert.equal(first.title, 'El Gobierno aprueba la ley & más');
    assert.equal(first.summary, 'Primer párrafo "citado"');
    assert.equal(first.image, 'https://img.medio.es/1.jpg');
    assert.equal(first.publishedAt, '2026-10-11T18:00:00.000Z');
    assert.equal(first.sourceId, 'medio');
    assert.equal(first.market, 'es');
    assert.match(first.id, /^a-[0-9a-z]+$/);
    assert.equal(second.summary, 'Texto');
    assert.equal(second.image, 'https://img.medio.es/2.jpg');
    assert.equal(future.publishedAt, now.toISOString(), 'las fechas futuras se recortan a ahora');
    assert.equal(future.image, 'https://img.medio.es/f.png');
    assert.equal(relative.publishedAt, '2026-10-10T13:00:00.000Z', 'acepta zonas como EDT');
});

test('Atom: usa el enlace alternate y limpia title/summary con HTML', () => {
    const [entry] = parseFeed(ATOM, source, { now });
    assert.equal(entry.url, 'https://atom.es/a1');
    assert.equal(entry.title, 'Titular atom');
    assert.equal(entry.summary, 'Resumen atom');
    assert.equal(entry.image, null);
});

test('RDF (RSS 1.0) se reconoce', () => {
    const [item] = parseFeed(RDF, source, { now });
    assert.equal(item.url, 'https://rdf.de/1');
    assert.equal(item.summary, 'Desc');
});

test('una página HTML o texto basura lanza error de formato', () => {
    assert.throws(() => parseFeed('<!DOCTYPE html><html><body>Just a moment...</body></html>', source, { now }), /no reconocido/);
    assert.throws(() => parseFeed('esto no es xml', source, { now }), /no reconocido|XML inválido/);
});

test('un feed válido sin items devuelve lista vacía', () => {
    assert.deepEqual(parseFeed('<rss><channel><title>x</title></channel></rss>', source, { now }), []);
});

test('entradillas largas se recortan a 300 caracteres', () => {
    const xml = `<rss><channel><item><title>T</title><link>https://m.es/l</link><description>${'palabra '.repeat(80)}</description></item></channel></rss>`;
    const [item] = parseFeed(xml, source, { now });
    assert.ok(item.summary.length <= 301);
    assert.ok(item.summary.endsWith('…'));
});

test('normalizeUrl quita tracking y fragmento, resuelve relativas y rechaza otros protocolos', () => {
    assert.equal(normalizeUrl('https://a.es/x?utm_campaign=1&fbclid=2&id=3#top'), 'https://a.es/x?id=3');
    assert.equal(normalizeUrl('/y', 'https://a.es'), 'https://a.es/y');
    assert.equal(normalizeUrl('javascript:alert(1)'), null);
    assert.equal(normalizeUrl(''), null);
    assert.equal(normalizeUrl('abc-123'), null);
});
```

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `node --test pipeline/test/parse.test.js`
Expected: FAIL, `Cannot find module '…/pipeline/parse.js'`.

- [ ] **Step 3: Implementar `pipeline/parse.js`**

```js
// Convierte un feed RSS 2.0, Atom o RDF en artículos normalizados.
import { XMLParser } from 'fast-xml-parser';
import { cleanText, decodeEntities, truncate, hash } from './text.js';

const MAX_AGE_MS = 48 * 3600 * 1000;
const FUTURE_TOLERANCE_MS = 3600 * 1000;
const SUMMARY_MAX = 300;
const TRACKING_PARAM = /^(utm_.*|fbclid|gclid|ns_.*|ocid|cmpid|mc_cid|mc_eid)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;
const ARRAY_TAGS = new Set(['item', 'entry', 'link', 'media:content', 'media:thumbnail', 'enclosure']);

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    textNodeName: '#text',
    parseTagValue: false,
    processEntities: true,
    htmlEntities: true,
    trimValues: true,
    isArray: name => ARRAY_TAGS.has(name),
});

function textOf(value) {
    if (value == null) return '';
    if (Array.isArray(value)) return textOf(value[0]);
    if (typeof value === 'object') return textOf(value['#text']);
    return String(value);
}

export function normalizeUrl(raw, base) {
    const value = String(raw ?? '').trim();
    if (!value) return null;
    try {
        const url = base ? new URL(value, base) : new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        url.hash = '';
        for (const key of [...url.searchParams.keys()]) {
            if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
        }
        return url.href;
    } catch {
        return null;
    }
}

function linkOf(item) {
    for (const link of item.link ?? []) {
        if (link && typeof link === 'object') {
            const rel = link['@rel'] ?? 'alternate';
            if (link['@href'] && rel === 'alternate') return link['@href'];
            if (link['#text']) return link['#text'];
        } else if (link) {
            return String(link);
        }
    }
    const guid = item.guid;
    const isPermaLink = !(guid && typeof guid === 'object' && guid['@isPermaLink'] === 'false');
    return isPermaLink ? textOf(guid) : '';
}

function dateOf(item, now) {
    for (const key of ['pubDate', 'dc:date', 'published', 'updated', 'dc:created']) {
        const raw = textOf(item[key]).trim();
        if (!raw) continue;
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) continue;
        return date - now > FUTURE_TOLERANCE_MS ? now : date;
    }
    return now;
}

function imageOf(item, html, base) {
    const media = [...(item['media:content'] ?? [])];
    for (const group of [].concat(item['media:group'] ?? [])) media.push(...[].concat(group?.['media:content'] ?? []));
    for (const entry of media) {
        const url = entry?.['@url'];
        const type = entry?.['@type'] ?? '';
        const medium = entry?.['@medium'] ?? '';
        const isImage = medium === 'image' || type.startsWith('image/') || (!medium && !type && IMAGE_EXT.test(url ?? ''));
        const normalized = isImage && normalizeUrl(url, base);
        if (normalized) return normalized;
    }
    for (const thumb of item['media:thumbnail'] ?? []) {
        const normalized = normalizeUrl(thumb?.['@url'], base);
        if (normalized) return normalized;
    }
    for (const enclosure of item.enclosure ?? []) {
        if ((enclosure?.['@type'] ?? '').startsWith('image/')) {
            const normalized = normalizeUrl(enclosure['@url'], base);
            if (normalized) return normalized;
        }
    }
    const inline = /<img[^>]+src=["']([^"']+)["']/i.exec(decodeEntities(html));
    return inline ? normalizeUrl(decodeEntities(inline[1]), base) : null;
}

export function parseFeed(xml, source, { now = new Date() } = {}) {
    let doc;
    try {
        doc = parser.parse(xml);
    } catch (error) {
        throw new Error(`XML inválido: ${error.message}`);
    }
    const isObject = doc && typeof doc === 'object';
    const kind = !isObject ? null : 'rss' in doc ? 'rss' : 'rdf:RDF' in doc ? 'rdf' : 'feed' in doc ? 'atom' : null;
    if (!kind) throw new Error('Formato de feed no reconocido');
    // Un <channel> vacío llega como '' → se trata como feed válido sin items.
    const raw = kind === 'rss' ? doc.rss?.channel : kind === 'rdf' ? doc['rdf:RDF'] : doc.feed;
    const root = raw && typeof raw === 'object' ? raw : {};

    const articles = [];
    const seen = new Set();
    for (const item of root.item ?? root.entry ?? []) {
        const url = normalizeUrl(linkOf(item), source.site);
        const title = cleanText(textOf(item.title));
        if (!url || !title || seen.has(url)) continue;
        const date = dateOf(item, now);
        if (now - date > MAX_AGE_MS) continue;
        seen.add(url);

        const summaryHtml = textOf(item.description) || textOf(item.summary) || textOf(item['content:encoded']) || textOf(item.content);
        const allHtml = [textOf(item.description), textOf(item['content:encoded']), textOf(item.summary), textOf(item.content)].join(' ');
        articles.push({
            id: `a-${hash(url)}`,
            url,
            title,
            summary: truncate(cleanText(summaryHtml), SUMMARY_MAX),
            image: imageOf(item, allHtml, source.site),
            publishedAt: date.toISOString(),
            sourceId: source.id,
            market: source.market,
        });
    }
    return articles;
}
```

- [ ] **Step 4: Ejecutar los tests**

Run: `node --test pipeline/test/parse.test.js`
Expected: PASS. Si falla el test de RDF porque `fast-xml-parser` anida los items de otra forma, se ajusta la lectura de `root` en `parseFeed`, no el test.

- [ ] **Step 5: Commit**

```bash
git add pipeline/parse.js pipeline/test/parse.test.js
git commit -m "feat(pipeline): parse RSS/Atom/RDF feeds into normalized articles"
```

---

### Task 3: `fetch.js`: descarga concurrente

**Files:**
- Create: `pipeline/fetch.js`, `pipeline/test/fetch.test.js`

**Interfaces:**
- Produces: `fetchFeeds(feeds: {sourceId, url}[], opts?: {fetchImpl?, concurrency? = 8, timeoutMs? = 10000}): Promise<{sourceId, url, ok: boolean, xml?: string, error?: string}[]>`, en el mismo orden que la entrada. Nunca rechaza.

- [ ] **Step 1: Escribir los tests que fallan**

`pipeline/test/fetch.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchFeeds } from '../fetch.js';

const response = (status, body = '') => ({ ok: status >= 200 && status < 300, status, text: async () => body });

test('devuelve el XML en orden y marca los errores HTTP y de red', async () => {
    const fetchImpl = async url => {
        if (url.endsWith('/404')) return response(404);
        if (url.endsWith('/boom')) throw new Error('ECONNRESET');
        return response(200, `<rss>${url}</rss>`);
    };
    const feeds = ['https://a/ok', 'https://b/404', 'https://c/boom'].map((url, i) => ({ sourceId: `s${i}`, url }));
    const results = await fetchFeeds(feeds, { fetchImpl });
    assert.deepEqual(results, [
        { sourceId: 's0', url: 'https://a/ok', ok: true, xml: '<rss>https://a/ok</rss>' },
        { sourceId: 's1', url: 'https://b/404', ok: false, error: 'HTTP 404' },
        { sourceId: 's2', url: 'https://c/boom', ok: false, error: 'ECONNRESET' },
    ]);
});

test('respeta el límite de concurrencia', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchImpl = async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise(resolve => setTimeout(resolve, 5));
        inFlight--;
        return response(200, '<rss/>');
    };
    const feeds = Array.from({ length: 20 }, (_, i) => ({ sourceId: `s${i}`, url: `https://x/${i}` }));
    await fetchFeeds(feeds, { fetchImpl, concurrency: 3 });
    assert.equal(maxInFlight, 3);
});

test('corta las peticiones lentas con un error de timeout', async () => {
    const fetchImpl = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    const [result] = await fetchFeeds([{ sourceId: 's', url: 'https://lento' }], { fetchImpl, timeoutMs: 30 });
    assert.deepEqual(result, { sourceId: 's', url: 'https://lento', ok: false, error: 'Timeout 30 ms' });
});

test('lista vacía devuelve lista vacía', async () => {
    assert.deepEqual(await fetchFeeds([], { fetchImpl: async () => response(200) }), []);
});
```

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `node --test pipeline/test/fetch.test.js`
Expected: FAIL, `Cannot find module '…/pipeline/fetch.js'`.

- [ ] **Step 3: Implementar `pipeline/fetch.js`**

```js
// Descarga los feeds en paralelo con un límite de concurrencia y un timeout por petición.
// Nunca rechaza: cada fallo queda registrado en su resultado.

const USER_AGENT = 'Mozilla/5.0 (compatible; onlynews-bot/1.0)';
const ACCEPT = 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8';

export async function fetchFeeds(feeds, { fetchImpl = globalThis.fetch, concurrency = 8, timeoutMs = 10_000 } = {}) {
    const results = new Array(feeds.length);
    let next = 0;

    async function fetchOne({ sourceId, url }) {
        try {
            const res = await fetchImpl(url, {
                headers: { 'User-Agent': USER_AGENT, Accept: ACCEPT },
                signal: AbortSignal.timeout(timeoutMs),
                redirect: 'follow',
            });
            if (!res.ok) return { sourceId, url, ok: false, error: `HTTP ${res.status}` };
            return { sourceId, url, ok: true, xml: await res.text() };
        } catch (error) {
            const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
            return { sourceId, url, ok: false, error: isTimeout ? `Timeout ${timeoutMs} ms` : String(error?.message ?? error) };
        }
    }

    async function worker() {
        while (next < feeds.length) {
            const index = next++;
            results[index] = await fetchOne(feeds[index]);
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, feeds.length) }, worker));
    return results;
}
```

- [ ] **Step 4: Ejecutar los tests**

Run: `node --test pipeline/test/fetch.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/fetch.js pipeline/test/fetch.test.js
git commit -m "feat(pipeline): concurrent feed fetching with timeout"
```

---

### Task 4: `cluster.js`: agrupar artículos en historias

**Files:**
- Create: `pipeline/cluster.js`, `pipeline/test/cluster.test.js`

**Interfaces:**
- Consumes: `tokens(text, lang)` de `pipeline/text.js`; `Article` de Task 2.
- Produces:
  - `clusterArticles(articles: Article[], opts: {lang: 'es'|'en', threshold? = 0.32, maxSpanHours? = 36, maxSize? = 40}): Cluster[]`
  - `Cluster = {articles: Article[]}`, con los artículos ordenados de más a menos representativo (similitud media al resto). Determinista para la misma entrada en cualquier orden.

- [ ] **Step 1: Escribir los tests que fallan**

`pipeline/test/cluster.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clusterArticles } from '../cluster.js';

const NOW = Date.parse('2026-10-11T20:00:00Z');
function art(id, sourceId, title, summary = '', hoursAgo = 1) {
    return { id, url: `https://${sourceId}.es/${id}`, title, summary, image: null,
        publishedAt: new Date(NOW - hoursAgo * 3600e3).toISOString(), sourceId, market: 'es' };
}

const CORPUS = [
    art('a1', 'elpais', 'La DANA descarga lluvias torrenciales en Valencia y obliga a evacuar a 2.000 vecinos', 'Las lluvias torrenciales de la DANA inundan varios municipios de Valencia'),
    art('a2', 'elmundo', 'Evacuados 2.000 vecinos en Valencia por las lluvias torrenciales de la DANA', 'La DANA deja inundaciones en Valencia'),
    art('a3', 'abc', 'La DANA obliga a evacuar a miles de vecinos en Valencia por las lluvias torrenciales'),
    art('a4', 'eldiario', 'Lluvias torrenciales en Valencia: la DANA fuerza la evacuación de 2.000 vecinos'),
    art('b1', 'elpais', 'El Real Madrid gana al Barcelona en el clásico con un gol de Mbappé', 'Mbappé decide el clásico'),
    art('b2', 'abc', 'Mbappé da al Real Madrid la victoria en el clásico ante el Barcelona'),
    art('c1', 'elmundo', 'El Gobierno aprueba la reforma de las pensiones en el Consejo de Ministros'),
    art('d1', 'eldiario', 'El Gobierno anuncia un plan de vivienda para jóvenes'),
    art('e1', 'okdiario', 'Sánchez viaja a China para reunirse con Xi Jinping'),
    art('f1', 'elespanol', 'Sánchez defiende en el Congreso la ley de amnistía'),
    art('g1', 'larazon', 'Un incendio forestal en Zamora arrasa 5.000 hectáreas'),
    art('g2', 'cope', 'Un incendio forestal en Zamora arrasa 5.000 hectáreas'),
    art('g3', 'efe', 'Incendio en Zamora: 5.000 hectáreas arrasadas por el fuego forestal'),
];

const groupOf = (clusters, id) => clusters.find(c => c.articles.some(a => a.id === id)).articles.map(a => a.id).sort();

test('agrupa las piezas de la misma historia de distintos medios', () => {
    const clusters = clusterArticles(CORPUS, { lang: 'es' });
    assert.deepEqual(groupOf(clusters, 'a1'), ['a1', 'a2', 'a3', 'a4']);
    assert.deepEqual(groupOf(clusters, 'b1'), ['b1', 'b2']);
    assert.deepEqual(groupOf(clusters, 'g1'), ['g1', 'g2', 'g3']);
});

test('no junta historias que solo comparten un nombre propio frecuente', () => {
    const clusters = clusterArticles(CORPUS, { lang: 'es' });
    assert.deepEqual(groupOf(clusters, 'c1'), ['c1']);
    assert.deepEqual(groupOf(clusters, 'd1'), ['d1']);
    assert.deepEqual(groupOf(clusters, 'e1'), ['e1']);
    assert.deepEqual(groupOf(clusters, 'f1'), ['f1']);
});

test('ordena los artículos de cada historia del más al menos representativo', () => {
    const clusters = clusterArticles(CORPUS, { lang: 'es' });
    const fire = clusters.find(c => c.articles.some(a => a.id === 'g1')).articles.map(a => a.id);
    assert.ok(['g1', 'g2'].includes(fire[0]));
    assert.equal(fire[2], 'g3');
});

test('es determinista aunque cambie el orden de entrada', () => {
    const a = clusterArticles(CORPUS, { lang: 'es' });
    const b = clusterArticles([...CORPUS].reverse(), { lang: 'es' });
    assert.deepEqual(a.map(c => c.articles.map(x => x.id)), b.map(c => c.articles.map(x => x.id)));
});

test('no une artículos separados por más de maxSpanHours', () => {
    const old = [art('h1', 's1', 'Terremoto de magnitud 6 sacude Granada', '', 1), art('h2', 's2', 'Terremoto de magnitud 6 sacude Granada', '', 40)];
    assert.equal(clusterArticles(old, { lang: 'es' }).length, 2);
});

test('no crea historias de más de maxSize artículos', () => {
    const same = Array.from({ length: 5 }, (_, i) => art(`k${i}`, `s${i}`, 'Apagón general deja sin luz a toda la Península'));
    const clusters = clusterArticles(same, { lang: 'es', maxSize: 3 });
    assert.ok(clusters.every(c => c.articles.length <= 3));
    assert.equal(clusters.reduce((n, c) => n + c.articles.length, 0), 5);
});

test('lista vacía devuelve lista vacía', () => {
    assert.deepEqual(clusterArticles([], { lang: 'es' }), []);
});
```

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `node --test pipeline/test/cluster.test.js`
Expected: FAIL, `Cannot find module '…/pipeline/cluster.js'`.

- [ ] **Step 3: Implementar `pipeline/cluster.js`**

```js
// Agrupa artículos de un mismo mercado en historias.
// TF-IDF sobre título (peso doble) + entradilla, similitud coseno y un agrupado
// aglomerativo por average-link: se recorren las parejas de mayor a menor similitud y
// dos grupos se unen solo si la similitud media entre todos sus miembros supera el umbral.
import { tokens } from './text.js';

function vectorize(docs) {
    const df = new Map();
    for (const doc of docs) for (const word of new Set(doc)) df.set(word, (df.get(word) ?? 0) + 1);
    const n = docs.length;
    return docs.map(doc => {
        const tf = new Map();
        for (const word of doc) tf.set(word, (tf.get(word) ?? 0) + 1);
        const vector = new Map();
        let norm = 0;
        for (const [word, count] of tf) {
            const weight = count * (Math.log((n + 1) / (df.get(word) + 1)) + 1);
            vector.set(word, weight);
            norm += weight * weight;
        }
        norm = Math.sqrt(norm) || 1;
        for (const [word, weight] of vector) vector.set(word, weight / norm);
        return vector;
    });
}

function pairSimilarities(vectors) {
    const n = vectors.length;
    const index = new Map();
    vectors.forEach((vector, i) => {
        for (const word of vector.keys()) {
            if (!index.has(word)) index.set(word, []);
            index.get(word).push(i);
        }
    });
    const sims = new Map();
    for (let i = 0; i < n; i++) {
        const acc = new Map();
        for (const [word, weight] of vectors[i]) {
            for (const j of index.get(word)) {
                if (j > i) acc.set(j, (acc.get(j) ?? 0) + weight * vectors[j].get(word));
            }
        }
        for (const [j, sim] of acc) if (sim > 0) sims.set(i * n + j, sim);
    }
    return sims;
}

export function clusterArticles(articles, { lang, threshold = 0.32, maxSpanHours = 36, maxSize = 40 } = {}) {
    const items = [...articles].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const n = items.length;
    if (!n) return [];

    const docs = items.map(article => {
        const title = tokens(article.title, lang);
        return [...title, ...title, ...tokens(article.summary ?? '', lang)];
    });
    const sims = pairSimilarities(vectorize(docs));
    const sim = (i, j) => (i === j ? 1 : sims.get(i < j ? i * n + j : j * n + i) ?? 0);
    const time = items.map(article => Date.parse(article.publishedAt));
    const maxSpan = maxSpanHours * 3600e3;

    const clusters = items.map((_, i) => ({ members: [i], min: time[i], max: time[i] }));
    const owner = items.map((_, i) => i);
    const edges = [...sims]
        .filter(([, value]) => value >= threshold)
        .map(([key, value]) => [Math.floor(key / n), key % n, value])
        .sort((a, b) => b[2] - a[2] || a[0] - b[0] || a[1] - b[1]);

    for (const [i, j] of edges) {
        const a = owner[i];
        const b = owner[j];
        if (a === b) continue;
        const A = clusters[a];
        const B = clusters[b];
        if (A.members.length + B.members.length > maxSize) continue;
        if (Math.max(A.max, B.max) - Math.min(A.min, B.min) > maxSpan) continue;
        let total = 0;
        for (const x of A.members) for (const y of B.members) total += sim(x, y);
        if (total / (A.members.length * B.members.length) < threshold) continue;

        const [keep, drop] = a < b ? [a, b] : [b, a];
        const K = clusters[keep];
        const D = clusters[drop];
        K.members.push(...D.members);
        K.min = Math.min(K.min, D.min);
        K.max = Math.max(K.max, D.max);
        for (const member of D.members) owner[member] = keep;
        clusters[drop] = null;
    }

    return clusters.filter(Boolean).map(({ members }) => {
        const centrality = new Map(members.map(i => [
            i,
            members.length === 1 ? 1 : members.reduce((sum, j) => sum + (i === j ? 0 : sim(i, j)), 0) / (members.length - 1),
        ]));
        const ordered = [...members].sort((x, y) => centrality.get(y) - centrality.get(x) || time[y] - time[x] || x - y);
        return { articles: ordered.map(i => items[i]) };
    });
}
```

- [ ] **Step 4: Ejecutar los tests**

Run: `node --test pipeline/test/cluster.test.js`
Expected: PASS.

Si fallan los tests de «agrupa» o «no junta», **no se tocan los textos del corpus**. Se imprime la matriz de similitudes con un script temporal en el scratchpad (fuera del repo) y se ajusta el `threshold` por defecto dentro de 0.25–0.40. Si ningún valor separa ambos casos, se añade `avgThreshold = threshold * 0.8` para el criterio de la media y se documenta en el commit.

- [ ] **Step 5: Commit**

```bash
git add pipeline/cluster.js pipeline/test/cluster.test.js
git commit -m "feat(pipeline): TF-IDF average-link story clustering"
```

---

### Task 5: `score.js` y `refine.js`

**Files:**
- Create: `pipeline/score.js`, `pipeline/refine.js`, `pipeline/test/score.test.js`, `pipeline/test/refine.test.js`

**Interfaces:**
- Consumes: `coverageOf`, `blindspotOf` de `site/js/coverage.js`; `hash` de `pipeline/text.js`; `Cluster` de Task 4.
- Produces:
  - `scoreStories(clusters: Cluster[], sourcesById: Record<string, {bias}>, now?: Date): Story[]`, ordenadas por relevancia descendente (empate: `id`).
  - `Story = {id: 's-<hash>', title, summary: null, image, firstSeen, lastSeen, coverage: {left, center, right, unrated}, sourceCount, blindspot, articles: [{sourceId, title, summary, url, image, publishedAt}]}`
  - `refine(clusters: Cluster[], ctx?: {env?, log?, market?}): Promise<Cluster[]>`

- [ ] **Step 1: Escribir los tests que fallan**

`pipeline/test/score.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreStories } from '../score.js';

const NOW = new Date('2026-10-11T20:00:00Z');
const SOURCES = { l1: { bias: -2 }, l2: { bias: -1 }, l3: { bias: -1 }, l4: { bias: -2 }, c1: { bias: 0 }, r1: { bias: 1 }, r2: { bias: 2 }, u1: { bias: null } };

function art(sourceId, slug, hoursAgo = 1, image = null) {
    return { id: `a-${sourceId}-${slug}`, url: `https://${sourceId}.es/${slug}`, title: `${slug} (${sourceId})`, summary: 's',
        image, publishedAt: new Date(NOW - hoursAgo * 3600e3).toISOString(), sourceId, market: 'es' };
}

test('calcula cobertura por medios distintos, título, imagen y fechas', () => {
    const cluster = { articles: [art('l1', 'x', 2), art('l1', 'x2', 1), art('c1', 'x', 3, 'https://img/c1.jpg'), art('r1', 'x', 5)] };
    const [story] = scoreStories([cluster], SOURCES, NOW);
    assert.deepEqual(story.coverage, { left: 1, center: 1, right: 1, unrated: 0 });
    assert.equal(story.sourceCount, 3);
    assert.equal(story.title, 'x (l1)');
    assert.equal(story.image, 'https://img/c1.jpg');
    assert.equal(story.firstSeen, new Date(NOW - 5 * 3600e3).toISOString());
    assert.equal(story.lastSeen, new Date(NOW - 1 * 3600e3).toISOString());
    assert.equal(story.summary, null);
    assert.equal(story.blindspot, null);
    assert.deepEqual(Object.keys(story.articles[0]).sort(), ['image', 'publishedAt', 'sourceId', 'summary', 'title', 'url']);
    assert.ok(!('relevance' in story));
});

test('marca blindspots de izquierda y derecha', () => {
    const left = { articles: ['l1', 'l2', 'l3', 'l4', 'c1'].map(s => art(s, 'izq')) };
    const right = { articles: ['r1', 'r2', 'c1'].map(s => art(s, 'der')).concat(art('u1', 'der')) };
    const stories = scoreStories([left, right], SOURCES, NOW);
    assert.equal(stories.find(s => s.title.startsWith('izq')).blindspot, 'left');
    assert.equal(stories.find(s => s.title.startsWith('der')).blindspot, null, '2 de 3 con orientación es < 80 %');
});

test('el id es estable cuando la historia gana artículos más nuevos', () => {
    const base = { articles: [art('l1', 'y', 5), art('r1', 'y', 4)] };
    const grown = { articles: [art('c1', 'y', 1), ...base.articles] };
    assert.equal(scoreStories([base], SOURCES, NOW)[0].id, scoreStories([grown], SOURCES, NOW)[0].id);
    assert.match(scoreStories([base], SOURCES, NOW)[0].id, /^s-[0-9a-z]+$/);
});

test('ordena por medios × decaimiento con vida media de 12 h', () => {
    const big = { articles: ['l1', 'l2', 'c1', 'r1', 'r2'].map(s => art(s, 'big', 1)) };
    const small = { articles: ['l1', 'r1'].map(s => art(s, 'small', 1)) };
    const old = { articles: ['l1', 'l2', 'c1', 'r1', 'r2'].map(s => art(s, 'old', 48)) };
    const order = scoreStories([old, small, big], SOURCES, NOW).map(s => s.title.split(' ')[0]);
    assert.deepEqual(order, ['big', 'small', 'old']);
});

test('un medio desconocido cuenta como sin clasificar', () => {
    const [story] = scoreStories([{ articles: [art('nuevo', 'z')] }], SOURCES, NOW);
    assert.deepEqual(story.coverage, { left: 0, center: 0, right: 0, unrated: 1 });
});
```

`pipeline/test/refine.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refine } from '../refine.js';

test('sin REFINE_ENDPOINT devuelve los mismos grupos', async () => {
    const clusters = [{ articles: [] }];
    assert.equal(await refine(clusters, { env: {} }), clusters);
});

test('con REFINE_ENDPOINT avisa de que aún no está implementado y no cambia nada', async () => {
    const clusters = [{ articles: [] }];
    const warnings = [];
    const out = await refine(clusters, { env: { REFINE_ENDPOINT: 'http://localhost:8000/v1' }, log: { warn: m => warnings.push(m) } });
    assert.equal(out, clusters);
    assert.equal(warnings.length, 1);
});
```

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `node --test pipeline/test/score.test.js pipeline/test/refine.test.js`
Expected: FAIL, módulos no encontrados.

- [ ] **Step 3: Implementar `pipeline/score.js`**

```js
// Convierte los grupos de artículos en historias: cobertura por orientación,
// blindspot, id estable y orden por relevancia.
import { coverageOf, blindspotOf } from '../site/js/coverage.js';
import { hash } from './text.js';

const HALF_LIFE_MS = 12 * 3600e3;

export function scoreStories(clusters, sourcesById, now = new Date()) {
    const biasOf = id => sourcesById[id]?.bias ?? null;
    return clusters
        .map(({ articles }) => {
            const times = articles.map(article => Date.parse(article.publishedAt));
            const oldest = articles.reduce((first, article) =>
                article.publishedAt < first.publishedAt || (article.publishedAt === first.publishedAt && article.url < first.url) ? article : first);
            const coverage = coverageOf(articles.map(article => article.sourceId), biasOf);
            const sourceCount = new Set(articles.map(article => article.sourceId)).size;
            const lastSeen = Math.max(...times);
            return {
                id: `s-${hash(oldest.url)}`,
                title: articles[0].title,
                summary: null,
                image: articles.find(article => article.image)?.image ?? null,
                firstSeen: new Date(Math.min(...times)).toISOString(),
                lastSeen: new Date(lastSeen).toISOString(),
                coverage,
                sourceCount,
                blindspot: blindspotOf(coverage),
                articles: articles.map(({ sourceId, title, summary, url, image, publishedAt }) => ({ sourceId, title, summary, url, image, publishedAt })),
                relevance: sourceCount * 0.5 ** (Math.max(0, now - lastSeen) / HALF_LIFE_MS),
            };
        })
        .sort((a, b) => b.relevance - a.relevance || (a.id < b.id ? -1 : 1))
        .map(({ relevance, ...story }) => story);
}
```

- [ ] **Step 4: Implementar `pipeline/refine.js`**

```js
// Punto de extensión para un modelo de lenguaje pequeño (servido con una API compatible
// con OpenAI: vLLM, Ollama, llama.cpp). Su trabajo futuro será fusionar o separar grupos
// dudosos y escribir un titular y un resumen neutrales. En v1 no cambia nada.
//
// Variables: REFINE_ENDPOINT (activa el paso), REFINE_MODEL, REFINE_API_KEY.
export async function refine(clusters, { env = process.env, log = console, market = '' } = {}) {
    if (!env.REFINE_ENDPOINT) return clusters;
    log.warn(`REFINE_ENDPOINT definido, pero el refinado aún no está implementado; ${market || 'mercado'} sin refinar.`);
    return clusters;
}
```

- [ ] **Step 5: Ejecutar los tests**

Run: `npm test`
Expected: PASS (todos los tests hasta ahora).

- [ ] **Step 6: Commit**

```bash
git add pipeline/score.js pipeline/refine.js pipeline/test/score.test.js pipeline/test/refine.test.js
git commit -m "feat(pipeline): story scoring, blindspots and refine extension point"
```

---

### Task 6: `sources.json`, `build.js`, herramienta de inspección y calibración real

**Files:**
- Create: `pipeline/sources.json`, `pipeline/build.js`, `pipeline/tools/inspect.js`, `pipeline/test/build.test.js`
- Modify: `docs/superpowers/specs/2026-10-12-onlynews-grounded-design.md` (sección 3: medios que se caen)

**Interfaces:**
- Consumes: `fetchFeeds`, `parseFeed`, `clusterArticles`, `refine`, `scoreStories`.
- Produces:
  - `build({sources, outDir, fetchImpl?, now?, env?, log?}): Promise<{feeds: FeedStat[]}>`. Lanza si fallan más del 50 % de los feeds de un mercado.
  - `FeedStat = {sourceId, url, ok, count, error?}`
  - Ficheros: `<outDir>/es.json`, `intl.json` (`{market, generatedAt, stories}`), `sources.json` (`[{id, name, market, bias, site}]`), `meta.json` (`{generatedAt, feeds: FeedStat[]}`).
  - CLI: `node pipeline/build.js [outDir=site/data]`.

- [ ] **Step 1: Crear `pipeline/sources.json`**

Feeds comprobados el 2026-10-12. Público, El Periódico, EFE, Vozpópuli, La Razón, RTVE, CNN, Reuters y AP no tienen un RSS usable y quedan fuera.

```json
[
  { "id": "eldiario", "name": "elDiario.es", "market": "es", "bias": -2, "site": "https://www.eldiario.es", "feeds": ["https://www.eldiario.es/rss/"] },
  { "id": "infolibre", "name": "infoLibre", "market": "es", "bias": -2, "site": "https://www.infolibre.es", "feeds": ["https://www.infolibre.es/rss"] },
  { "id": "elsalto", "name": "El Salto", "market": "es", "bias": -2, "site": "https://www.elsaltodiario.com", "feeds": ["https://www.elsaltodiario.com/general/feed"] },
  { "id": "elpais", "name": "El País", "market": "es", "bias": -1, "site": "https://elpais.com", "feeds": ["https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada"] },
  { "id": "cadenaser", "name": "Cadena SER", "market": "es", "bias": -1, "site": "https://cadenaser.com", "feeds": ["https://cadenaser.com/arc/outboundfeeds/rss/?outputType=xml"] },
  { "id": "europapress", "name": "Europa Press", "market": "es", "bias": 0, "site": "https://www.europapress.es", "feeds": ["https://www.europapress.es/rss/rss.aspx"] },
  { "id": "20minutos", "name": "20minutos", "market": "es", "bias": 0, "site": "https://www.20minutos.es", "feeds": ["https://www.20minutos.es/rss/"] },
  { "id": "lavanguardia", "name": "La Vanguardia", "market": "es", "bias": 0, "site": "https://www.lavanguardia.com", "feeds": ["https://www.lavanguardia.com/rss/home.xml"] },
  { "id": "cincodias", "name": "Cinco Días", "market": "es", "bias": 0, "site": "https://cincodias.elpais.com", "feeds": ["https://feeds.elpais.com/mrss-s/pages/ep/site/cincodias.elpais.com/portada"] },
  { "id": "elmundo", "name": "El Mundo", "market": "es", "bias": 1, "site": "https://www.elmundo.es", "feeds": ["https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml"] },
  { "id": "elconfidencial", "name": "El Confidencial", "market": "es", "bias": 1, "site": "https://www.elconfidencial.com", "feeds": ["https://rss.elconfidencial.com/espana/"] },
  { "id": "elespanol", "name": "El Español", "market": "es", "bias": 1, "site": "https://www.elespanol.com", "feeds": ["https://www.elespanol.com/rss/"] },
  { "id": "expansion", "name": "Expansión", "market": "es", "bias": 1, "site": "https://www.expansion.com", "feeds": ["https://e00-expansion.uecdn.es/rss/portada.xml"] },
  { "id": "abc", "name": "ABC", "market": "es", "bias": 2, "site": "https://www.abc.es", "feeds": ["https://www.abc.es/rss/2.0/portada/"] },
  { "id": "eldebate", "name": "El Debate", "market": "es", "bias": 2, "site": "https://www.eldebate.com", "feeds": ["https://www.eldebate.com/rss/home.xml"] },
  { "id": "theobjective", "name": "The Objective", "market": "es", "bias": 2, "site": "https://theobjective.com", "feeds": ["https://theobjective.com/feed/"] },
  { "id": "libertaddigital", "name": "Libertad Digital", "market": "es", "bias": 2, "site": "https://www.libertaddigital.com", "feeds": ["https://feeds2.feedburner.com/libertaddigital/portada"] },
  { "id": "okdiario", "name": "OKDiario", "market": "es", "bias": 2, "site": "https://okdiario.com", "feeds": ["https://okdiario.com/feed"] },
  { "id": "newtral", "name": "Newtral", "market": "es", "bias": null, "site": "https://www.newtral.es", "feeds": ["https://www.newtral.es/feed/"] },
  { "id": "maldita", "name": "Maldita.es", "market": "es", "bias": null, "site": "https://maldita.es", "feeds": ["https://maldita.es/feed/"] },

  { "id": "guardian", "name": "The Guardian", "market": "intl", "bias": -1, "site": "https://www.theguardian.com", "feeds": ["https://www.theguardian.com/world/rss"] },
  { "id": "nyt", "name": "The New York Times", "market": "intl", "bias": -1, "site": "https://www.nytimes.com", "feeds": ["https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"] },
  { "id": "npr", "name": "NPR", "market": "intl", "bias": -1, "site": "https://www.npr.org", "feeds": ["https://feeds.npr.org/1001/rss.xml"] },
  { "id": "independent", "name": "The Independent", "market": "intl", "bias": -1, "site": "https://www.independent.co.uk", "feeds": ["https://www.independent.co.uk/news/world/rss"] },
  { "id": "aljazeera", "name": "Al Jazeera", "market": "intl", "bias": -1, "site": "https://www.aljazeera.com", "feeds": ["https://www.aljazeera.com/xml/rss/all.xml"] },
  { "id": "bbc", "name": "BBC News", "market": "intl", "bias": 0, "site": "https://www.bbc.com/news", "feeds": ["https://feeds.bbci.co.uk/news/world/rss.xml"] },
  { "id": "politico", "name": "Politico", "market": "intl", "bias": 0, "site": "https://www.politico.com", "feeds": ["https://rss.politico.com/politics-news.xml"] },
  { "id": "thehill", "name": "The Hill", "market": "intl", "bias": 0, "site": "https://thehill.com", "feeds": ["https://thehill.com/news/feed/"] },
  { "id": "dw", "name": "DW", "market": "intl", "bias": 0, "site": "https://www.dw.com/en", "feeds": ["https://rss.dw.com/rdf/rss-en-all"] },
  { "id": "france24", "name": "France 24", "market": "intl", "bias": 0, "site": "https://www.france24.com/en", "feeds": ["https://www.france24.com/en/rss"] },
  { "id": "wsj", "name": "The Wall Street Journal", "market": "intl", "bias": 1, "site": "https://www.wsj.com", "feeds": ["https://feeds.content.dowjones.io/public/rss/RSSWorldNews"] },
  { "id": "telegraph", "name": "The Telegraph", "market": "intl", "bias": 1, "site": "https://www.telegraph.co.uk", "feeds": ["https://www.telegraph.co.uk/rss.xml"] },
  { "id": "foxnews", "name": "Fox News", "market": "intl", "bias": 2, "site": "https://www.foxnews.com", "feeds": ["https://moxie.foxnews.com/google-publisher/latest.xml"] },
  { "id": "nypost", "name": "New York Post", "market": "intl", "bias": 2, "site": "https://nypost.com", "feeds": ["https://nypost.com/feed/"] },
  { "id": "dailymail", "name": "Daily Mail", "market": "intl", "bias": 2, "site": "https://www.dailymail.co.uk", "feeds": ["https://www.dailymail.co.uk/news/index.rss"] },
  { "id": "washexaminer", "name": "Washington Examiner", "market": "intl", "bias": 2, "site": "https://www.washingtonexaminer.com", "feeds": ["https://www.washingtonexaminer.com/feed/"] },
  { "id": "breitbart", "name": "Breitbart", "market": "intl", "bias": 2, "site": "https://www.breitbart.com", "feeds": ["https://feeds.feedburner.com/breitbart"] }
]
```

- [ ] **Step 2: Escribir el test que falla**

`pipeline/test/build.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../build.js';

const NOW = new Date('2026-10-11T20:00:00Z');
const rss = items => `<rss><channel>${items.map(([title, url]) =>
    `<item><title>${title}</title><link>${url}</link><pubDate>Sun, 11 Oct 2026 19:00:00 GMT</pubDate></item>`).join('')}</channel></rss>`;

const SOURCES = [
    { id: 's1', name: 'Uno', market: 'es', bias: -1, site: 'https://uno.es', feeds: ['https://uno.es/rss'] },
    { id: 's2', name: 'Dos', market: 'es', bias: 1, site: 'https://dos.es', feeds: ['https://dos.es/rss'] },
    { id: 's3', name: 'Tres', market: 'es', bias: 0, site: 'https://tres.es', feeds: ['https://tres.es/rss'] },
    { id: 'i1', name: 'One', market: 'intl', bias: 0, site: 'https://one.com', feeds: ['https://one.com/rss'] },
    { id: 'i2', name: 'Two', market: 'intl', bias: 2, site: 'https://two.com', feeds: ['https://two.com/rss'] },
];

const FEEDS = {
    'https://uno.es/rss': rss([['La DANA obliga a evacuar a 2.000 vecinos en Valencia', 'https://uno.es/dana'], ['Noticia solo de Uno sobre teatro', 'https://uno.es/teatro']]),
    'https://dos.es/rss': rss([['Evacuados 2.000 vecinos en Valencia por la DANA', 'https://dos.es/dana']]),
    'https://tres.es/rss': rss([['Resultados de la liga de baloncesto', 'https://tres.es/acb']]),
    'https://one.com/rss': rss([['Storm hits the coast of Florida', 'https://one.com/storm']]),
};

const fakeFetch = async url => FEEDS[url]
    ? { ok: true, status: 200, text: async () => FEEDS[url] }
    : { ok: false, status: 500, text: async () => '' };

const quiet = { warn() {}, log() {} };

test('escribe los cuatro JSON con historias agrupadas y el estado de cada feed', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'onlynews-'));
    const { feeds } = await build({ sources: SOURCES, outDir, fetchImpl: fakeFetch, now: NOW, env: {}, log: quiet });

    assert.deepEqual((await readdir(outDir)).sort(), ['es.json', 'intl.json', 'meta.json', 'sources.json']);
    const es = JSON.parse(await readFile(path.join(outDir, 'es.json'), 'utf8'));
    assert.equal(es.market, 'es');
    assert.equal(es.generatedAt, NOW.toISOString());
    const dana = es.stories.find(s => s.sourceCount === 2);
    assert.ok(dana, 'la DANA de Uno y Dos forma una historia');
    assert.deepEqual(dana.coverage, { left: 1, center: 0, right: 1, unrated: 0 });
    assert.equal(es.stories.filter(s => s.sourceCount === 1).length, 2);
    assert.equal(es.stories[0], dana, 'las historias multi-medio van primero');

    const sources = JSON.parse(await readFile(path.join(outDir, 'sources.json'), 'utf8'));
    assert.deepEqual(Object.keys(sources[0]).sort(), ['bias', 'id', 'market', 'name', 'site']);

    const meta = JSON.parse(await readFile(path.join(outDir, 'meta.json'), 'utf8'));
    assert.deepEqual(meta.feeds.find(f => f.sourceId === 'i2'), { sourceId: 'i2', url: 'https://two.com/rss', ok: false, count: 0, error: 'HTTP 500' });
    assert.equal(feeds.filter(f => f.ok).length, 4);
});

test('falla si cae más de la mitad de los feeds de un mercado', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'onlynews-'));
    const broken = async url => (url === 'https://uno.es/rss' ? fakeFetch(url) : { ok: false, status: 503, text: async () => '' });
    await assert.rejects(build({ sources: SOURCES, outDir, fetchImpl: broken, now: NOW, env: {}, log: quiet }), /es/);
    assert.deepEqual(await readdir(outDir), [], 'no escribe nada si aborta');
});

test('un feed con 0 artículos recientes cuenta como fallo pero no rompe', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'onlynews-'));
    const empty = async url => (url === 'https://tres.es/rss' ? { ok: true, status: 200, text: async () => '<rss><channel></channel></rss>' } : fakeFetch(url));
    const { feeds } = await build({ sources: SOURCES, outDir, fetchImpl: empty, now: NOW, env: {}, log: quiet });
    assert.deepEqual(feeds.find(f => f.sourceId === 's3'), { sourceId: 's3', url: 'https://tres.es/rss', ok: false, count: 0, error: 'Sin artículos recientes' });
});
```

- [ ] **Step 3: Ejecutar y comprobar que falla**

Run: `node --test pipeline/test/build.test.js`
Expected: FAIL, `Cannot find module '…/pipeline/build.js'`.

- [ ] **Step 4: Implementar `pipeline/build.js`**

```js
// Orquesta el pipeline: descarga → normaliza → agrupa → refina → puntúa → escribe site/data/.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchFeeds } from './fetch.js';
import { parseFeed } from './parse.js';
import { clusterArticles } from './cluster.js';
import { refine } from './refine.js';
import { scoreStories } from './score.js';

export const MARKETS = { es: { lang: 'es' }, intl: { lang: 'en' } };
const MAX_SINGLE_SOURCE_STORIES = 150;

async function writeJson(file, data) {
    await writeFile(file, `${JSON.stringify(data)}\n`);
}

function collect(fetched, sourcesById, now) {
    const feeds = [];
    const articles = Object.fromEntries(Object.keys(MARKETS).map(market => [market, new Map()]));
    for (const result of fetched) {
        const source = sourcesById[result.sourceId];
        let count = 0;
        let error = result.ok ? null : result.error;
        if (result.ok) {
            try {
                const parsed = parseFeed(result.xml, source, { now });
                count = parsed.length;
                for (const article of parsed) {
                    if (!articles[source.market].has(article.id)) articles[source.market].set(article.id, article);
                }
                if (!count) error = 'Sin artículos recientes';
            } catch (parseError) {
                error = parseError.message;
            }
        }
        feeds.push({ sourceId: result.sourceId, url: result.url, ok: !error, count, ...(error ? { error } : {}) });
    }
    return { feeds, articles };
}

function assertHealthy(feeds, sourcesById) {
    for (const market of Object.keys(MARKETS)) {
        const marketFeeds = feeds.filter(feed => sourcesById[feed.sourceId].market === market);
        const failed = marketFeeds.filter(feed => !feed.ok).length;
        if (failed > marketFeeds.length / 2) {
            throw new Error(`Fallan ${failed}/${marketFeeds.length} feeds del mercado ${market}; no se publica`);
        }
    }
}

export async function build({ sources, outDir, fetchImpl, now = new Date(), env = process.env, log = console }) {
    const sourcesById = Object.fromEntries(sources.map(source => [source.id, source]));
    const fetched = await fetchFeeds(sources.flatMap(source => source.feeds.map(url => ({ sourceId: source.id, url }))), { fetchImpl });
    const { feeds, articles } = collect(fetched, sourcesById, now);
    assertHealthy(feeds, sourcesById);

    const generatedAt = now.toISOString();
    const outputs = {};
    for (const [market, { lang }] of Object.entries(MARKETS)) {
        const clusters = await refine(clusterArticles([...articles[market].values()], { lang }), { env, log, market });
        const stories = scoreStories(clusters, sourcesById, now);
        const multi = stories.filter(story => story.sourceCount > 1);
        const singles = stories
            .filter(story => story.sourceCount === 1)
            .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
            .slice(0, MAX_SINGLE_SOURCE_STORIES);
        outputs[market] = { market, generatedAt, stories: [...multi, ...singles] };
    }

    await mkdir(outDir, { recursive: true });
    for (const [market, data] of Object.entries(outputs)) await writeJson(path.join(outDir, `${market}.json`), data);
    await writeJson(path.join(outDir, 'sources.json'), sources.map(({ id, name, market, bias, site }) => ({ id, name, market, bias, site })));
    await writeJson(path.join(outDir, 'meta.json'), { generatedAt, feeds });
    return { feeds };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const outDir = process.argv[2] ?? 'site/data';
    const sources = JSON.parse(await readFile(new URL('./sources.json', import.meta.url), 'utf8'));
    try {
        const { feeds } = await build({ sources, outDir });
        console.log(`OK: ${feeds.filter(feed => feed.ok).length}/${feeds.length} feeds → ${outDir}`);
        for (const feed of feeds.filter(feed => !feed.ok)) console.warn(`  ✗ ${feed.sourceId}: ${feed.error}`);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
```

Nota: el test «no escribe nada si aborta» exige que `assertHealthy` se ejecute antes de `mkdir`, como arriba.

- [ ] **Step 5: Ejecutar los tests**

Run: `npm test`
Expected: PASS (todos).

- [ ] **Step 6: Crear `pipeline/tools/inspect.js`**

```js
// Imprime las historias de una ejecución para revisarlas a mano y calibrar el agrupado.
// Uso: node pipeline/tools/inspect.js [es|intl] [site/data]
import { readFile } from 'node:fs/promises';

const market = process.argv[2] ?? 'es';
const dir = process.argv[3] ?? 'site/data';
const data = JSON.parse(await readFile(`${dir}/${market}.json`, 'utf8'));
const multi = data.stories.filter(story => story.sourceCount > 1);

console.log(`${market}: ${data.stories.length} historias · ${multi.length} con ≥2 medios · ${data.stories.filter(s => s.sourceCount >= 3).length} con ≥3`);
for (const story of multi) {
    const { left, center, right, unrated } = story.coverage;
    const blind = story.blindspot ? `  BLINDSPOT ${story.blindspot}` : '';
    console.log(`\n[${story.sourceCount}] ${story.title}  (I${left} C${center} D${right} ?${unrated})${blind}`);
    for (const article of story.articles) console.log(`    - ${article.sourceId.padEnd(16)} ${article.title}`);
}
```

- [ ] **Step 7: Ejecución real y calibración (criterios de éxito 1 y 2)**

Run: `npm run build && node pipeline/tools/inspect.js es | head -150 && node pipeline/tools/inspect.js intl | head -80`

Expected:
- `OK: N/37 feeds`, con N ≥ 30.
- España con ≥ 15 historias de ≥ 3 medios.

Revisar a mano las 20 primeras historias multi-medio de España y contar las agrupaciones erróneas: dos sucesos distintos en una misma historia, o la misma historia partida en dos con ≥ 3 medios cada una.
- Si hay más de 2 erróneas o menos de 15 historias de ≥ 3 medios, ajustar `threshold` en `clusterArticles` (por defecto 0.32, rango 0.25–0.40), volver a ejecutar `npm test` (los tests de Task 4 deben seguir en verde) y repetir.
- Anotar en el mensaje de commit el umbral final y los números obtenidos.

Si un feed de `sources.json` falla de forma persistente («HTTP 403», «Formato de feed no reconocido»), quitarlo de la lista y anotarlo en la spec.

- [ ] **Step 8: Actualizar la spec (sección 3)**

En `docs/superpowers/specs/2026-10-12-onlynews-grounded-design.md`, sustituir el párrafo que empieza por «Clasificación **orientativa**» por:

```markdown
Clasificación **orientativa**: la línea editorial tal como suele describirse públicamente. En el
internacional, apoyada en AllSides / Ad Fontes. Feeds verificados el 2026-10-12; quedan fuera por no
tener RSS usable: Público, El Periódico, EFE, Vozpópuli, La Razón, RTVE, CNN, Reuters y AP. El
catálogo vivo está en `pipeline/sources.json`.
```

- [ ] **Step 9: Commit**

```bash
git add pipeline/sources.json pipeline/build.js pipeline/tools/inspect.js pipeline/test/build.test.js docs/superpowers/specs/2026-10-12-onlynews-grounded-design.md
git commit -m "feat(pipeline): build orchestrator, source catalog and inspect tool

Calibración: threshold=<valor>, es=<n> historias ≥3 medios, <k>/20 agrupaciones erróneas"
```

---

### Task 7: Base de la web: shell, estilos, utilidades y router

**Files:**
- Create: `site/index.html` (reescrito), `site/icon.svg`, `site/css/styles.css`, `site/js/dom.js`, `site/js/prefs.js`, `site/js/data.js`, `site/js/main.js`, `pipeline/test/site-dom.test.js`
- Create (provisionales; se completan en Tasks 8–10): `site/js/components.js`, `site/js/views/{home,story,search,saved,sources}.js`
- Delete: `site/js/app.js`, `site/js/background-svg.js`, `site/js/button-animation.js`, `site/js/onhover-article-animation.js`, `site/js/remove-card-animation.js`, `site/css/custom.css`, `site/images/globe.png`

**Interfaces:**
- Consumes: `withoutSources` de `site/js/coverage.js`.
- Produces:
  - `dom.js`:
    - `h(tag, props?, ...children): HTMLElement`. `props`: `class`, `dataset`, `on<evento>`, y el resto como atributos. Los hijos de tipo string pasan a nodos de texto.
    - `safeUrl(url): string|null`
    - `timeAgo(iso, now? = Date.now()): string`
    - `fold(text): string`
    - `plural(n, one, many): string`
  - `prefs.js`: `prefs.theme`, `prefs.market` (get/set), `prefs.saved(): Record<id, {title, market, savedAt}>`, `prefs.isSaved(id)`, `prefs.toggleSaved(story, market): boolean`, `prefs.removeSaved(id)`, `prefs.hiddenSources(): Set<string>`, `prefs.setSourceHidden(id, hidden)`
  - `data.js`:
    - `loadJson(name): Promise<any>`
    - `loadMarket(market): Promise<{stories, sourcesById, generatedAt}>`, con los medios ocultos ya filtrados.
  - Firma de las vistas (`views/*.js`): `async render*(…): Promise<HTMLElement>`
    - `renderHome(market)`, `renderStory(market, id)`, `renderSearch(market, query)`, `renderSaved(market)`, `renderSources()`
  - `components.js`: `MARKET_NAMES = {es: 'España', intl: 'Internacional'}`

- [ ] **Step 1: Test de las utilidades puras de `dom.js`**

`pipeline/test/site-dom.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl, timeAgo, fold, plural } from '../../site/js/dom.js';

test('safeUrl solo deja pasar http(s)', () => {
    assert.equal(safeUrl('https://a.es/x'), 'https://a.es/x');
    assert.equal(safeUrl('javascript:alert(1)'), null);
    assert.equal(safeUrl('data:text/html,hi'), null);
    assert.equal(safeUrl(null), null);
    assert.equal(safeUrl('no es url'), null);
});

test('timeAgo en español', () => {
    const now = Date.parse('2026-10-11T20:00:00Z');
    assert.equal(timeAgo('2026-10-11T19:59:40Z', now), 'ahora');
    assert.equal(timeAgo('2026-10-11T19:35:00Z', now), 'hace 25 min');
    assert.equal(timeAgo('2026-10-11T17:00:00Z', now), 'hace 3 h');
    assert.equal(timeAgo('2026-10-09T20:00:00Z', now), 'hace 2 d');
    assert.equal(timeAgo('basura', now), '');
});

test('fold ignora mayúsculas y acentos', () => {
    assert.equal(fold('Sánchez CAMIÓN'), 'sanchez camion');
});

test('plural', () => {
    assert.equal(plural(1, 'medio', 'medios'), '1 medio');
    assert.equal(plural(3, 'medio', 'medios'), '3 medios');
});
```

Run: `node --test pipeline/test/site-dom.test.js`. Expected: FAIL (módulo no encontrado).

- [ ] **Step 2: Implementar `site/js/dom.js`**

```js
// Utilidades del DOM y de formato. Las funciones puras (todas salvo h) se testean en Node.

export function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value == null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? '' : String(value));
    }
    node.append(...children.flat(Infinity).filter(child => child != null && child !== false));
    return node;
}

export function safeUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
    } catch {
        return null;
    }
}

export function timeAgo(iso, now = Date.now()) {
    const time = Date.parse(iso);
    if (Number.isNaN(time)) return '';
    const minutes = Math.round(Math.max(0, now - time) / 60000);
    if (minutes < 1) return 'ahora';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    return `hace ${Math.round(hours / 24)} d`;
}

export function fold(text) {
    return String(text ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

export function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many}`;
}
```

Run: `node --test pipeline/test/site-dom.test.js`. Expected: PASS.

- [ ] **Step 3: Implementar `site/js/prefs.js`**

```js
// Preferencias del lector en localStorage. Si el almacenamiento no está disponible
// (modo privado, bloqueado), se guardan en memoria y la web funciona igual sin recordar.
const PREFIX = 'onlynews:';
const memory = new Map();

function read(key, fallback) {
    try {
        const raw = localStorage.getItem(PREFIX + key);
        if (raw != null) return JSON.parse(raw);
    } catch { /* se usa la copia en memoria */ }
    return memory.has(key) ? memory.get(key) : fallback;
}

function write(key, value) {
    memory.set(key, value);
    try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch { /* sin almacenamiento persistente */ }
}

export const prefs = {
    get theme() {
        const theme = read('theme', 'auto');
        return ['auto', 'light', 'dark'].includes(theme) ? theme : 'auto';
    },
    set theme(value) { write('theme', value); },

    get market() { return read('market', 'es'); },
    set market(value) { write('market', value); },

    saved() {
        const saved = read('saved', {});
        return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    },
    isSaved(id) { return Object.hasOwn(this.saved(), id); },
    toggleSaved(story, market) {
        const saved = this.saved();
        if (Object.hasOwn(saved, story.id)) delete saved[story.id];
        else saved[story.id] = { title: story.title, market, savedAt: new Date().toISOString() };
        write('saved', saved);
        return Object.hasOwn(saved, story.id);
    },
    removeSaved(id) {
        const saved = this.saved();
        delete saved[id];
        write('saved', saved);
    },

    hiddenSources() {
        const hidden = read('hiddenSources', []);
        return new Set(Array.isArray(hidden) ? hidden : []);
    },
    setSourceHidden(id, hidden) {
        const set = this.hiddenSources();
        if (hidden) set.add(id);
        else set.delete(id);
        write('hiddenSources', [...set]);
    },
};
```

- [ ] **Step 4: Implementar `site/js/data.js`**

```js
// Carga de los JSON que genera el pipeline, con caché por sesión.
import { withoutSources } from './coverage.js';
import { prefs } from './prefs.js';

const cache = new Map();

export function loadJson(name) {
    if (!cache.has(name)) {
        const promise = fetch(`data/${name}.json`, { cache: 'no-cache' }).then(response => {
            if (!response.ok) throw new Error(`data/${name}.json → HTTP ${response.status}`);
            return response.json();
        });
        cache.set(name, promise);
        promise.catch(() => cache.delete(name));
    }
    return cache.get(name);
}

export async function loadMarket(market) {
    const [data, sources] = await Promise.all([loadJson(market), loadJson('sources')]);
    const sourcesById = Object.fromEntries(sources.map(source => [source.id, source]));
    const stories = withoutSources(data.stories, prefs.hiddenSources(), id => sourcesById[id]?.bias ?? null);
    return { stories, sourcesById, generatedAt: data.generatedAt };
}
```

- [ ] **Step 5: Escribir `site/index.html` y `site/icon.svg`**

`site/index.html`:

```html
<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>OnlyNews</title>
    <meta name="description" content="Las mismas noticias, contadas por todos los medios: compara cómo las cubren izquierda, centro y derecha.">
    <meta name="color-scheme" content="light dark">
    <link rel="icon" href="icon.svg" type="image/svg+xml">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,500;6..72,600;6..72,700&display=swap">
    <link rel="stylesheet" href="css/styles.css">
    <script>
        try {
            const theme = JSON.parse(localStorage.getItem('onlynews:theme'));
            if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
        } catch { /* tema automático */ }
    </script>
    <script type="module" src="js/main.js"></script>
</head>
<body>
    <a class="skip-link" href="#app">Saltar al contenido</a>
    <header class="site-header">
        <div class="wrap header-inner">
            <a class="brand" href="#/" aria-label="OnlyNews, portada"><span class="brand-only">ONLY</span><span class="brand-news">NEWS</span></a>
            <nav class="market-tabs" aria-label="Edición">
                <a href="#/es" data-market="es">España</a>
                <a href="#/intl" data-market="intl">Internacional</a>
            </nav>
            <form class="search" role="search">
                <label class="visually-hidden" for="q">Buscar historias</label>
                <input id="q" name="q" type="search" placeholder="Buscar historias" autocomplete="off">
            </form>
            <div class="header-actions">
                <button type="button" class="icon-btn" id="theme-toggle"></button>
                <a class="icon-btn" href="#/fuentes" aria-label="Medios y ajustes" title="Medios y ajustes">⚙</a>
            </div>
        </div>
    </header>
    <main id="app" class="wrap" tabindex="-1"></main>
    <footer class="site-footer">
        <div class="wrap">
            <p id="feed-status"></p>
            <p><a href="#/fuentes">Cómo clasificamos los medios</a> · Clasificación orientativa · <a href="https://github.com/kenserikawa/onlynews">Código</a></p>
        </div>
    </footer>
</body>
</html>
```

`site/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#d62839"/><path d="M9 23V9h3.2l7 9.4V9H23v14h-3.2l-7-9.4V23z" fill="#fff"/></svg>
```

- [ ] **Step 6: Escribir `site/css/styles.css`**

```css
:root {
    --bg: #faf9f7;
    --surface: #ffffff;
    --surface-2: #f2f0ec;
    --text: #1b1b1f;
    --muted: #5f6168;
    --border: #e3e0da;
    --brand: #d62839;
    --brand-ink: #ffffff;
    --left: #2f6fdb;
    --center: #8a8f98;
    --right: #b5523b;
    --unrated: #c9ccd1;
    --focus: #2f6fdb;
    --radius: 12px;
    --shadow: 0 1px 2px rgb(0 0 0 / .04), 0 4px 16px rgb(0 0 0 / .05);
    --serif: 'Newsreader', Georgia, 'Times New Roman', serif;
    --sans: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    color-scheme: light;
}

@media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
        --bg: #111214; --surface: #1a1b1e; --surface-2: #232428; --text: #ececee; --muted: #a3a5ab;
        --border: #2e3035; --left: #6b9bf0; --center: #9aa0a8; --right: #e07a5f; --unrated: #555b63;
        --focus: #6b9bf0; --shadow: none; color-scheme: dark;
    }
}
:root[data-theme="dark"] {
    --bg: #111214; --surface: #1a1b1e; --surface-2: #232428; --text: #ececee; --muted: #a3a5ab;
    --border: #2e3035; --left: #6b9bf0; --center: #9aa0a8; --right: #e07a5f; --unrated: #555b63;
    --focus: #6b9bf0; --shadow: none; color-scheme: dark;
}

*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font: 400 16px/1.5 var(--sans); }
img { max-width: 100%; display: block; }
a { color: inherit; }
h1, h2, h3 { margin: 0; line-height: 1.2; }
p { margin: 0; }
ol, ul { margin: 0; padding: 0; list-style: none; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 4px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.skip-link { position: absolute; left: 16px; top: -48px; background: var(--surface); padding: 8px 12px; z-index: 20; }
.skip-link:focus { top: 8px; }
.wrap { width: min(1200px, 100% - 32px); margin-inline: auto; }

/* Cabecera */
.site-header { position: sticky; top: 0; z-index: 10; background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
.header-inner { display: grid; grid-template-columns: auto auto 1fr auto; align-items: center; gap: 20px; min-height: 64px; }
.brand { display: inline-flex; font: 800 18px/1 var(--sans); letter-spacing: .02em; text-decoration: none; border-radius: 6px; overflow: hidden; }
.brand-only { background: var(--brand); color: var(--brand-ink); padding: 7px 6px 7px 9px; }
.brand-news { background: var(--brand-ink); color: var(--brand); padding: 7px 9px; border: 2px solid var(--brand); border-left: 0; border-radius: 0 6px 6px 0; }
.market-tabs { display: flex; gap: 4px; background: var(--surface-2); padding: 4px; border-radius: 999px; }
.market-tabs a { padding: 6px 14px; border-radius: 999px; text-decoration: none; font-weight: 500; font-size: 14px; color: var(--muted); }
.market-tabs a[aria-current="page"] { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
.search { justify-self: end; width: min(320px, 100%); }
.search input { width: 100%; padding: 9px 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; font-size: 14px; }
.header-actions { display: flex; gap: 4px; }
.icon-btn { display: inline-grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; border: 1px solid transparent; background: none; color: var(--text); font-size: 18px; text-decoration: none; cursor: pointer; }
.icon-btn:hover { background: var(--surface-2); }

@media (max-width: 760px) {
    .header-inner { grid-template-columns: auto 1fr auto; grid-template-areas: "brand . actions" "tabs search search"; gap: 10px 12px; padding-block: 10px; }
    .brand { grid-area: brand; }
    .header-actions { grid-area: actions; }
    .market-tabs { grid-area: tabs; }
    .search { grid-area: search; width: 100%; }
}

/* Estructura */
main { padding-block: 28px 48px; min-height: 60vh; }
main:focus { outline: none; }
.loading, .empty, .hint { color: var(--muted); }
.notice { max-width: 640px; margin: 48px auto; text-align: center; display: grid; gap: 12px; }
.notice h1 { font: 600 28px/1.2 var(--serif); }
.section-title { font: 700 13px/1 var(--sans); text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 36px 0 14px; }
.page-title { font: 600 32px/1.15 var(--serif); margin-bottom: 8px; }
.site-footer { border-top: 1px solid var(--border); padding: 20px 0 32px; color: var(--muted); font-size: 14px; }
.site-footer .wrap { display: grid; gap: 4px; }

.home { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 40px; align-items: start; }
@media (max-width: 960px) { .home { grid-template-columns: 1fr; } }

/* Cobertura */
.coverage { display: grid; gap: 6px; }
.coverage-bar { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: var(--surface-2); gap: 2px; }
.coverage--lg .coverage-bar { height: 14px; }
.seg { display: block; min-width: 6px; }
.seg--left { background: var(--left); }
.seg--center { background: var(--center); }
.seg--right { background: var(--right); }
.seg--unrated { background: var(--unrated); }
.coverage-legend { display: flex; gap: 12px; font-size: 12px; font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; }
.legend::before { content: ""; display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; vertical-align: 1px; }
.legend--left::before { background: var(--left); }
.legend--center::before { background: var(--center); }
.legend--right::before { background: var(--right); }

/* Tarjetas */
.story-link { display: block; text-decoration: none; color: inherit; border-radius: var(--radius); }
.story-link:hover .story-title { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
.story-title { font-family: var(--serif); font-weight: 600; }
.story-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
.badge { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; padding: 2px 8px; border-radius: 999px; color: #fff; }
.badge--left { background: var(--left); }
.badge--right { background: var(--right); }

.lead { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
.lead .story-link { display: grid; grid-template-columns: 1.3fr 1fr; }
.lead-img { width: 100%; height: 100%; min-height: 280px; object-fit: cover; background: var(--surface-2); }
.lead-body { padding: 24px; display: grid; gap: 14px; align-content: start; }
.lead .story-title { font-size: clamp(26px, 3vw, 36px); line-height: 1.12; }
.lead-summary { color: var(--muted); }
@media (max-width: 760px) {
    .lead .story-link { grid-template-columns: 1fr; }
    .lead-img { min-height: 0; aspect-ratio: 16 / 9; }
}

.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 18px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.card .story-link { height: 100%; display: flex; flex-direction: column; }
.card-img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: var(--surface-2); }
.card-body { padding: 14px 16px 16px; display: grid; gap: 10px; flex: 1; align-content: start; }
.card .story-title { font-size: 19px; }

.story-list { display: grid; }
.row { border-top: 1px solid var(--border); }
.row .story-link { display: grid; grid-template-columns: minmax(0, 1fr) 160px; gap: 16px; align-items: center; padding: 14px 0; }
.row-text { display: grid; gap: 6px; }
.row .story-title { font-size: 18px; }
.story-list--compact .row .story-link { grid-template-columns: 1fr; padding: 10px 0; }
.story-list--compact .story-title { font: 500 15px/1.35 var(--sans); }
@media (max-width: 560px) { .row .story-link { grid-template-columns: 1fr; } }

.singles { margin-top: 36px; }
.singles summary { cursor: pointer; font-weight: 600; color: var(--muted); padding: 8px 0; }

/* Lateral */
.home-aside { display: grid; gap: 20px; position: sticky; top: 88px; }
@media (max-width: 960px) { .home-aside { position: static; } }
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; display: grid; gap: 12px; }
.panel h2 { font: 700 15px/1.2 var(--sans); }
.panel h3 { font: 600 12px/1 var(--sans); text-transform: uppercase; letter-spacing: .06em; margin-top: 4px; }
.panel h3.side-left { color: var(--left); }
.panel h3.side-right { color: var(--right); }
.mini-list { display: grid; gap: 10px; }
.mini { display: grid; gap: 2px; text-decoration: none; }
.mini-title { font: 500 15px/1.35 var(--serif); }
.mini:hover .mini-title { text-decoration: underline; }
.mini-meta { font-size: 12px; color: var(--muted); }
.panel-link { font-size: 14px; font-weight: 600; }

/* Ficha */
.story-page { display: grid; gap: 20px; }
.back { font-size: 14px; color: var(--muted); text-decoration: none; }
.back:hover { color: var(--text); }
.story-head { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 28px; align-items: start; }
.story-head-text { display: grid; gap: 14px; }
.story-page h1 { font: 600 clamp(28px, 4vw, 44px)/1.1 var(--serif); }
.story-hero { border-radius: var(--radius); aspect-ratio: 4 / 3; object-fit: cover; width: 100%; }
@media (max-width: 760px) { .story-head { grid-template-columns: 1fr; } .story-hero { order: -1; aspect-ratio: 16 / 9; } }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: var(--surface-2); font-size: 13px; font-weight: 500; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.dot--left { background: var(--left); }
.dot--center { background: var(--center); }
.dot--right { background: var(--right); }
.dot--unrated { background: var(--unrated); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn { padding: 8px 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: 600 14px/1 var(--sans); cursor: pointer; }
.btn:hover { background: var(--surface-2); }
.btn[aria-pressed="true"] { background: var(--text); color: var(--bg); border-color: var(--text); }

.side-tabs { display: none; gap: 6px; overflow-x: auto; }
.side-tab { flex: 1; padding: 8px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: 600 13px/1 var(--sans); white-space: nowrap; cursor: pointer; }
.side-tab[aria-selected="true"] { color: #fff; border-color: transparent; }
.side-tab--left[aria-selected="true"] { background: var(--left); }
.side-tab--center[aria-selected="true"] { background: var(--center); }
.side-tab--right[aria-selected="true"] { background: var(--right); }
.side-tab--unrated[aria-selected="true"] { background: var(--muted); }
.columns { display: grid; grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr)); gap: 18px; align-items: start; }
.column { display: grid; gap: 12px; }
.column-title { display: flex; align-items: center; gap: 8px; font: 700 14px/1 var(--sans); text-transform: uppercase; letter-spacing: .06em; padding-bottom: 10px; border-bottom: 3px solid var(--center); }
.column--left .column-title { border-color: var(--left); color: var(--left); }
.column--right .column-title { border-color: var(--right); color: var(--right); }
.column--unrated .column-title { border-color: var(--unrated); color: var(--muted); }
.article { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; display: grid; gap: 8px; }
.article-source { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; }
.bias-label { font-weight: 400; color: var(--muted); }
.article h3 { font: 600 18px/1.25 var(--serif); }
.article h3 a { text-decoration: none; }
.article h3 a:hover { text-decoration: underline; }
.article-summary { font-size: 14px; color: var(--muted); }
.article-time { font-size: 12px; color: var(--muted); }
@media (max-width: 760px) {
    .side-tabs { display: flex; }
    .columns { grid-template-columns: 1fr; }
    .column:not(.is-active) { display: none; }
    .column-title { display: none; }
}

/* Medios */
.sources-page { display: grid; gap: 16px; max-width: 820px; }
.prose { display: grid; gap: 10px; color: var(--muted); }
.prose strong { color: var(--text); }
.source-group { display: grid; gap: 8px; }
.source-group h3 { font: 600 14px/1 var(--sans); display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.source-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
.source-row input { width: 18px; height: 18px; accent-color: var(--text); }
.source-row a { margin-left: auto; font-size: 13px; color: var(--muted); }
.source-down { font-size: 12px; color: var(--right); }

@media (prefers-reduced-motion: no-preference) {
    .story-link, .btn, .icon-btn { transition: background-color .15s ease, color .15s ease; }
}
```

- [ ] **Step 7: Crear `site/js/components.js` (mínimo) y las vistas provisionales**

`site/js/components.js`:

```js
export const MARKET_NAMES = { es: 'España', intl: 'Internacional' };
```

Cada vista provisional (`site/js/views/home.js`, `story.js`, `search.js`, `saved.js`, `sources.js`) exporta su función con este cuerpo, sustituyendo el nombre:

```js
import { h } from '../dom.js';

export async function renderHome(market) {
    return h('p', { class: 'loading' }, `Portada ${market} en construcción`);
}
```

Los nombres son: `renderStory(market, id)`, `renderSearch(market, query)`, `renderSaved(market)` y `renderSources()`. Las Tasks 8–10 las reemplazan entero.

- [ ] **Step 8: Implementar `site/js/main.js`**

```js
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
```

- [ ] **Step 9: Borrar los ficheros antiguos y comprobar en el navegador**

```bash
git rm site/js/app.js site/js/background-svg.js site/js/button-animation.js site/js/onhover-article-animation.js site/js/remove-card-animation.js site/css/custom.css site/images/globe.png
```

Ejecutar `npm run build` (para tener datos reales en `site/data/`) y servir con `python3 -m http.server 8090 -d site`. Antes, reservar el puerto: `ccres comprobar puerto:8090` y `ccres reservar puerto:8090 --hasta 2h --motivo "onlynews grounded"`.

Comprobar en `http://localhost:8090/`:
- `#/` redirige a `#/es` y la pestaña España queda marcada.
- Aparece el texto provisional y el pie muestra «N/37 fuentes actualizadas».
- El botón de tema cicla automático → claro → oscuro.
- `#/es/buscar?q=x` rellena el buscador.
- No hay errores en consola.

Run: `npm test`. Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add -A site pipeline/test/site-dom.test.js
git commit -m "feat(site): new app shell, design tokens, router and preferences"
```

---

### Task 8: Componentes y portada

**Files:**
- Modify: `site/js/components.js` (completo)
- Modify: `site/js/views/home.js` (completo)

**Interfaces:**
- Consumes: `h`, `safeUrl`, `timeAgo`, `plural` (dom.js); `SIDES`, `SIDE_LABELS` (coverage.js); `loadMarket` (data.js); `prefs` (prefs.js).
- Produces (`components.js`):
  - `MARKET_NAMES`
  - `coverageBar(coverage, {large?}): HTMLElement`
  - `storyMeta(story): HTMLElement`
  - `storyImage(url, className): HTMLImageElement|null`
  - `leadStory(story, market)`, `storyCard(story, market)`, `storyRow(story, market, {compact?})`, `storyMini(story, market)`
  - `blindspotPanel(stories, market)`, `savedPanel(stories, market)`

- [ ] **Step 1: Implementar `site/js/components.js`**

```js
// Piezas de interfaz reutilizadas por las vistas. Todo el texto de los feeds entra como texto.
import { h, safeUrl, timeAgo, plural } from './dom.js';
import { SIDES, SIDE_LABELS } from './coverage.js';
import { prefs } from './prefs.js';

export const MARKET_NAMES = { es: 'España', intl: 'Internacional' };
const SHORT = { left: 'I', center: 'C', right: 'D' };

export function coverageBar(coverage, { large = false } = {}) {
    const present = SIDES.filter(side => coverage[side] > 0);
    const label = present.map(side => `${coverage[side]} ${SIDE_LABELS[side].toLowerCase()}`).join(', ');
    return h('div', { class: `coverage${large ? ' coverage--lg' : ''}`, role: 'img', 'aria-label': `Cobertura: ${label}` },
        h('div', { class: 'coverage-bar' }, present.map(side => h('span', { class: `seg seg--${side}`, style: `flex-grow:${coverage[side]}` }))),
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
    return h('section', { class: 'panel', 'aria-labelledby': 'blindspots-h' },
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
```

- [ ] **Step 2: Implementar `site/js/views/home.js`**

```js
import { h } from '../dom.js';
import { loadMarket } from '../data.js';
import { MARKET_NAMES, leadStory, storyCard, storyRow, blindspotPanel, savedPanel } from '../components.js';

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
                h('h2', { id: 'top-h', class: 'section-title' }, 'Más cubiertas'),
                h('div', { class: 'card-grid' }, rest.slice(0, GRID_SIZE).map(story => storyCard(story, market)))) : null,
            rest.length > GRID_SIZE ? h('section', { 'aria-labelledby': 'more-h' },
                h('h2', { id: 'more-h', class: 'section-title' }, 'Más historias'),
                h('ol', { class: 'story-list' }, rest.slice(GRID_SIZE).map(story => storyRow(story, market)))) : null,
            otherSingles.length ? h('details', { class: 'singles' },
                h('summary', {}, `Solo en un medio (${otherSingles.length})`),
                h('ol', { class: 'story-list story-list--compact' }, otherSingles.map(story => storyRow(story, market, { compact: true })))) : null),
        h('aside', { class: 'home-aside' },
            blindspotPanel(multi, market),
            savedPanel(stories, market)));
}
```

- [ ] **Step 3: Comprobar en el navegador**

Con el servidor de Task 7, abrir `#/es` y `#/intl` a 1280 px y a 390 px de ancho, en tema claro y oscuro. Comprobar:
- Historia principal con imagen y barra grande.
- Rejilla de 6 tarjetas, lista «Más historias» y «Solo en un medio» plegado.
- Lateral con Blindspots y Guardadas (debajo en móvil).
- Las barras muestran los números I/C/D.
- Las imágenes rotas desaparecen sin dejar hueco.
- Sin errores en consola y sin scroll horizontal a 390 px.

- [ ] **Step 4: Commit**

```bash
git add site/js/components.js site/js/views/home.js
git commit -m "feat(site): home with lead story, coverage bars and blindspots"
```

---

### Task 9: Ficha comparativa de historia

**Files:**
- Modify: `site/js/views/story.js` (completo)

**Interfaces:**
- Consumes: `loadMarket`, `prefs`, `h`, `safeUrl`, `timeAgo`, `SIDES`, `SIDE_LABELS`, `BIAS_LABELS`, `sideOf`, `coverageBar`, `storyMeta`, `storyImage`.
- Produces: `renderStory(market, id): Promise<HTMLElement>`

- [ ] **Step 1: Implementar `site/js/views/story.js`**

```js
import { h, safeUrl, timeAgo } from '../dom.js';
import { loadMarket } from '../data.js';
import { prefs } from '../prefs.js';
import { SIDE_LABELS, BIAS_LABELS, sideOf } from '../coverage.js';
import { coverageBar, storyMeta, storyImage } from '../components.js';

function missingStory(market, id) {
    const saved = prefs.saved()[id];
    document.title = 'Historia no disponible · OnlyNews';
    return h('div', { class: 'notice' },
        h('h1', {}, 'Esta historia ya no está en portada'),
        h('p', {}, saved
            ? `Guardaste «${saved.title}», pero ya no aparece en las noticias de las últimas 48 h.`
            : 'Puede que haya caducado: mostramos las noticias de las últimas 48 h.'),
        h('p', {},
            h('a', { href: `#/${market}` }, 'Volver a la portada'),
            saved ? ' · ' : null,
            saved ? h('button', { type: 'button', class: 'btn', onclick: () => { prefs.removeSaved(id); location.hash = `#/${market}/guardadas`; } }, 'Quitar de guardadas') : null));
}

function articleItem(article, source) {
    const url = safeUrl(article.url);
    const side = sideOf(source?.bias ?? null);
    return h('li', { class: 'article' },
        h('p', { class: 'article-source' },
            h('span', { class: `dot dot--${side}`, 'aria-hidden': 'true' }),
            source?.name ?? article.sourceId,
            h('span', { class: 'bias-label' }, `· ${BIAS_LABELS[String(source?.bias ?? null)]}`)),
        h('h3', {}, url
            ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, article.title)
            : article.title),
        article.summary ? h('p', { class: 'article-summary' }, article.summary) : null,
        h('p', { class: 'article-time' }, timeAgo(article.publishedAt)));
}

function column(side, articles, sourcesById, active) {
    return h('section', { class: `column column--${side}${active ? ' is-active' : ''}`, id: `col-${side}`, 'aria-label': SIDE_LABELS[side] },
        h('h2', { class: 'column-title' }, `${SIDE_LABELS[side]} · ${articles.length}`),
        articles.length
            ? h('ol', { class: 'column-list', style: 'display:grid;gap:12px' }, articles.map(article => articleItem(article, sourcesById[article.sourceId])))
            : h('p', { class: 'empty' }, 'Ningún medio de este lado ha cubierto la historia.'));
}

export async function renderStory(market, id) {
    const { stories, sourcesById } = await loadMarket(market);
    const story = stories.find(candidate => candidate.id === id);
    if (!story) return missingStory(market, id);
    document.title = `${story.title} · OnlyNews`;

    const biasOf = article => sourcesById[article.sourceId]?.bias ?? null;
    const bySide = { left: [], center: [], right: [], unrated: [] };
    for (const article of story.articles) bySide[sideOf(biasOf(article))].push(article);
    for (const list of Object.values(bySide)) {
        list.sort((a, b) => (biasOf(a) ?? 0) - (biasOf(b) ?? 0) || b.publishedAt.localeCompare(a.publishedAt));
    }
    const sides = ['left', 'center', 'right', ...(bySide.unrated.length ? ['unrated'] : [])];
    const active = sides.reduce((best, side) => (bySide[side].length > bySide[best].length ? side : best), sides[0]);

    const columns = h('div', { class: 'columns', style: `--cols:${sides.length}` },
        sides.map(side => column(side, bySide[side], sourcesById, side === active)));
    const tabs = h('div', { class: 'side-tabs', role: 'tablist', 'aria-label': 'Cobertura por orientación' },
        sides.map(side => h('button', {
            type: 'button', role: 'tab', class: `side-tab side-tab--${side}`, 'aria-controls': `col-${side}`,
            'aria-selected': String(side === active), onclick: () => selectSide(side),
        }, `${SIDE_LABELS[side]} (${bySide[side].length})`)));
    function selectSide(side) {
        for (const tab of tabs.children) tab.setAttribute('aria-selected', String(tab.classList.contains(`side-tab--${side}`)));
        for (const col of columns.children) col.classList.toggle('is-active', col.id === `col-${side}`);
    }

    const sourceIds = [...new Set(story.articles.map(article => article.sourceId))]
        .sort((a, b) => (sourcesById[a]?.bias ?? 0) - (sourcesById[b]?.bias ?? 0));
    const saveButton = h('button', { type: 'button', class: 'btn', 'aria-pressed': String(prefs.isSaved(story.id)) },
        prefs.isSaved(story.id) ? '★ Guardada' : '☆ Guardar');
    saveButton.addEventListener('click', () => {
        const saved = prefs.toggleSaved(story, market);
        saveButton.setAttribute('aria-pressed', String(saved));
        saveButton.textContent = saved ? '★ Guardada' : '☆ Guardar';
    });
    const copyButton = h('button', { type: 'button', class: 'btn' }, 'Copiar enlace');
    copyButton.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(location.href);
            copyButton.textContent = 'Enlace copiado';
        } catch {
            copyButton.textContent = 'No se pudo copiar';
        }
        setTimeout(() => { copyButton.textContent = 'Copiar enlace'; }, 2000);
    });

    return h('article', { class: 'story-page' },
        h('a', { class: 'back', href: `#/${market}` }, '← Portada'),
        h('header', { class: 'story-head' },
            h('div', { class: 'story-head-text' },
                h('h1', {}, story.title),
                story.summary ? h('p', { class: 'lead-summary' }, story.summary) : null,
                coverageBar(story.coverage, { large: true }),
                storyMeta(story),
                h('div', { class: 'chips', 'aria-label': 'Cubierta por' },
                    sourceIds.map(sourceId => h('span', { class: 'chip' },
                        h('span', { class: `dot dot--${sideOf(sourcesById[sourceId]?.bias ?? null)}`, 'aria-hidden': 'true' }),
                        sourcesById[sourceId]?.name ?? sourceId))),
                h('div', { class: 'actions' }, saveButton, copyButton)),
            storyImage(story.image, 'story-hero')),
        tabs,
        columns);
}
```

- [ ] **Step 2: Comprobar en el navegador**

Abrir una historia con ≥ 3 medios desde la portada. Comprobar a 1280 px:
- Titular, barra grande, chips ordenados de izquierda a derecha y tres columnas.
- Las columnas vacías muestran «Ningún medio de este lado…».
- Los enlaces abren en pestaña nueva.
- «Guardar» cambia a «★ Guardada» y aparece en el panel Guardadas de la portada.
- «Copiar enlace» funciona.

A 390 px: aparecen las pestañas de lado, por defecto la que tiene más artículos, y al pulsarlas cambia la columna.

Abrir `#/es/s-noexiste`: se ve «Esta historia ya no está en portada». Atrás/adelante del navegador funcionan.

- [ ] **Step 3: Commit**

```bash
git add site/js/views/story.js
git commit -m "feat(site): comparative story page with left/center/right columns"
```

---

### Task 10: Búsqueda, guardadas y página de medios

**Files:**
- Modify: `site/js/views/search.js`, `site/js/views/saved.js`, `site/js/views/sources.js` (completos)

**Interfaces:**
- Consumes: `loadMarket`, `loadJson`, `prefs`, `h`, `fold`, `storyRow`, `MARKET_NAMES`, `BIAS_LABELS`, `sideOf`.
- Produces: `renderSearch(market, query)`, `renderSaved(market)`, `renderSources()`

- [ ] **Step 1: Implementar `site/js/views/search.js`**

```js
import { h, fold } from '../dom.js';
import { loadMarket } from '../data.js';
import { storyRow, MARKET_NAMES } from '../components.js';

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
        h('p', { class: 'hint' }, `Busca en las historias de las últimas 48 h · ${MARKET_NAMES[market]}`),
        matches.length
            ? h('ol', { class: 'story-list', style: 'margin-top:20px' }, matches.map(story => storyRow(story, market)))
            : h('p', { class: 'empty', style: 'margin-top:20px' }, needle ? 'No hay historias que coincidan.' : 'Escribe algo en el buscador.'));
}
```

- [ ] **Step 2: Implementar `site/js/views/saved.js`**

```js
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
```

- [ ] **Step 3: Implementar `site/js/views/sources.js`**

```js
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
```

- [ ] **Step 4: Verificación de extremo a extremo con Playwright (scratchpad, no se versiona)**

Si `node_modules/playwright` no está en el scratchpad, instalarlo ahí (`npm i playwright@1.58.2`). Guardar `e2e-grounded.mjs` en el scratchpad y ejecutarlo con el servidor de Task 7 activo y datos reales en `site/data/`:

```js
import { chromium } from 'playwright';

const BASE = 'http://localhost:8090/';
const browser = await chromium.launch();
const errors = [];
const fails = [];
const check = (ok, label) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) fails.push(label); };

for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    page.on('console', m => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(`${name}: ${m.text()}`));

    await page.goto(BASE);
    await page.waitForSelector('.lead');
    check(page.url().endsWith('#/es'), `${name}: / redirige a #/es`);
    check(await page.locator('.card').count() > 0, `${name}: rejilla con tarjetas`);
    check(await page.locator('.coverage-legend').first().textContent().then(t => /I \d+/.test(t)), `${name}: la barra muestra números`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: sin scroll horizontal`);
    await page.screenshot({ path: `grounded-home-${name}.png`, fullPage: false });

    await page.click('.lead .story-link');
    await page.waitForSelector('.story-page');
    check(await page.locator('.column').count() >= 3, `${name}: ficha con columnas`);
    if (name === 'mobile') {
        check(await page.locator('.side-tabs').isVisible(), 'mobile: pestañas de lado visibles');
        await page.locator('.side-tab').nth(2).click();
        check(await page.locator('#col-right.is-active').count() === 1, 'mobile: la pestaña Derecha activa su columna');
    }
    await page.click('.actions .btn >> nth=0');
    check(await page.locator('.actions .btn').first().getAttribute('aria-pressed') === 'true', `${name}: guardar marca la historia`);
    const storyUrl = page.url();
    await page.screenshot({ path: `grounded-story-${name}.png`, fullPage: false });

    await page.goto(`${BASE}#/es/guardadas`);
    await page.waitForSelector('.page-title');
    check(await page.locator('.story-list .row').count() >= 1, `${name}: aparece en Guardadas`);

    await page.goto(`${BASE}#/es/s-noexiste`);
    await page.waitForSelector('.notice');
    check((await page.textContent('.notice h1')).includes('ya no está'), `${name}: historia caducada muestra aviso`);

    const term = await page.goto(BASE + '#/es').then(() => page.waitForSelector('.lead .story-title')).then(el => el.textContent()).then(t => t.split(' ').find(w => w.length > 6) ?? t.split(' ')[0]);
    await page.fill('#q', term);
    await page.press('#q', 'Enter');
    await page.waitForSelector('.page-title');
    check(await page.locator('.story-list .row').count() >= 1, `${name}: la búsqueda de «${term}» encuentra resultados`);

    await page.goto(`${BASE}#/intl`);
    await page.waitForSelector('.lead');
    check(await page.locator('[data-market="intl"][aria-current="page"]').count() === 1, `${name}: pestaña Internacional activa`);

    await page.click('#theme-toggle');
    await page.click('#theme-toggle');
    check(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', `${name}: tema oscuro`);
    await page.screenshot({ path: `grounded-dark-${name}.png`, fullPage: false });

    await page.goto(`${BASE}#/fuentes`);
    await page.waitForSelector('.source-row');
    for (const box of await page.locator('section[aria-labelledby="market-es"] input[type=checkbox]').all()) await box.uncheck();
    await page.goto(`${BASE}#/es`);
    await page.waitForSelector('.notice');
    check((await page.textContent('.notice h1')).includes('No hay historias'), `${name}: ocultar todos los medios muestra estado vacío`);
    await page.goto(`${BASE}#/es/${storyUrl.split('/').pop()}`);
    await page.waitForSelector('.notice');
    check(true, `${name}: ficha con todos los medios ocultos no rompe`);
    await page.close();
}

const blocked = await browser.newPage();
await blocked.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('bloqueado'); } }); });
blocked.on('pageerror', e => errors.push(`sin storage: ${e.message}`));
await blocked.goto(BASE);
await blocked.waitForSelector('.lead');
check(true, 'sin localStorage la portada carga');

console.log('errores de consola:', errors);
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
```

Run (desde el scratchpad): `node e2e-grounded.mjs`
Expected: todas las líneas con ✓, `errores de consola: []` y código de salida 0. Revisar a ojo las capturas `grounded-*.png`.

- [ ] **Step 5: Commit**

```bash
git add site/js/views/search.js site/js/views/saved.js site/js/views/sources.js
git commit -m "feat(site): search, saved stories and sources/methodology page"
```

---

### Task 11: Workflow, README y limpieza

**Files:**
- Modify: `.github/workflows/pages.yml`, `README.md`
- Delete: `scripts/fetch-news.sh`

- [ ] **Step 1: Reescribir `.github/workflows/pages.yml`**

```yaml
name: Deploy static site to GitHub Pages

on:
  push:
    branches: [master]
    paths: ['site/**', 'pipeline/**', 'package.json', 'package-lock.json', '.github/workflows/pages.yml']
  schedule:
    - cron: '17 * * * *'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v5

      # Si setup-node@v5 no resolviera, usar @v4 (funciona igual, solo avisa de Node 20).
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Test pipeline
        run: npm test

      - name: Build news data from RSS feeds
        run: node pipeline/build.js site/data

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: site

      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Sustituir la sección «Static version (GitHub Pages)» de `README.md`**

````markdown
## Static version (GitHub Pages)
**https://kenserikawa.github.io/onlynews/**: a Ground News–style aggregator. Stories are grouped across
~37 Spanish and international outlets, with a left/center/right coverage bar, blindspots and a side-by-side
comparison of how each outlet covers the story.

- `pipeline/`: Node script run hourly by `.github/workflows/pages.yml`. It fetches the RSS feeds listed in
  `pipeline/sources.json`, clusters articles into stories (TF-IDF + average-link) and writes `site/data/*.json`.
- `site/`: static front-end (plain HTML/CSS/ES modules) that only reads those JSON files.
- Outlet bias ratings live in `pipeline/sources.json` and are indicative.
- Optional: set `REFINE_ENDPOINT` (OpenAI-compatible API) to plug in a model for refining stories (not implemented yet).

```bash
npm install
npm test                                   # pipeline unit tests
npm run build                              # fetch feeds → site/data/
node pipeline/tools/inspect.js es          # review clustering
python3 -m http.server -d site             # preview at http://localhost:8000
```
````

- [ ] **Step 3: Borrar el script viejo y comprobar todo**

```bash
git rm scripts/fetch-news.sh
npm test
```

Expected: PASS. Comprobar también con `grep -rn "NEWS_API_KEY\|fetch-news" site pipeline .github README.md` que no queda ninguna referencia: debe salir vacío.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/pages.yml README.md
git commit -m "ci: hourly RSS pipeline with tests before deploy; drop NewsAPI"
```

---

### Task 12: Publicar (requiere confirmación del usuario)

- [ ] **Step 1: Pedir confirmación.** Enseñar al usuario las capturas de Task 10 y los números de calibración de Task 6, y preguntar si se mezcla `feat/grounded` en `master` y se hace push. Ese push despliega. No continuar sin un «sí» explícito.

- [ ] **Step 2: Mezclar y publicar**

```bash
git switch master
git merge --ff-only feat/grounded
git push origin master
```

- [ ] **Step 3: Vigilar el workflow y comprobar la web publicada**

Sondear `https://api.github.com/repos/kenserikawa/onlynews/actions/runs?head_sha=<sha>` hasta que termine (usar `rtk proxy curl` para que la salida no se filtre). Comprobar que todos los pasos salen en `success` y volver a ejecutar `e2e-grounded.mjs` con `BASE = 'https://kenserikawa.github.io/onlynews/'`.

Avisar al usuario de que puede borrar el secret `NEWS_API_KEY`, ya sin uso. Liberar el puerto con `ccres liberar puerto:8090` y parar el servidor local.
