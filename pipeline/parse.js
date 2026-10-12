// Convierte un feed RSS 2.0, Atom o RDF en artículos normalizados.
import { XMLParser } from 'fast-xml-parser';
import { cleanText, decodeEntities, truncate, hash } from './text.js';

const MAX_AGE_MS = 48 * 3600 * 1000;
const FUTURE_TOLERANCE_MS = 3600 * 1000;
const SUMMARY_MAX = 300;
const TRACKING_PARAM = /^(utm_.*|fbclid|gclid|ns_.*|ocid|cmpid|mc_cid|mc_eid)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;
const GENERIC_IMAGE = /^(default|placeholder|no[-_]?image|noimage|sin[-_]?imagen|blank|spacer)([-_.]?(news|thumb|image|img|og))*\.(jpe?g|png|gif|webp|svg)$/i;
const TRACKING_IMAGE = /imrworldwide\.com|scorecardresearch\.com|doubleclick\.net|google-analytics\.com|quantserve\.com|chartbeat\.net|feedburner\.com\/~r|\/cgi-bin\/|[/.]pixel[./?]/i;
const ARRAY_TAGS = new Set(['item', 'entry', 'link', 'media:content', 'media:thumbnail', 'enclosure']);

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    textNodeName: '#text',
    parseTagValue: false,
    // El tope por defecto (1000 expansiones por documento) cuenta también &quot; o &#8220;,
    // y los feeds grandes lo superan. Se sube solo ese tope; la profundidad y el tamaño de
    // las entidades del DOCTYPE siguen limitados.
    processEntities: { enabled: true, maxTotalExpansions: 200_000, maxExpansionDepth: 10 },
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
    // Un guid solo vale como enlace si es una URL absoluta: «12345» resuelto contra la web
    // del medio daría un enlace inventado.
    const guid = item.guid;
    const isPermaLink = !(guid && typeof guid === 'object' && guid['@isPermaLink'] === 'false');
    const value = isPermaLink ? textOf(guid).trim() : '';
    return /^https?:\/\//i.test(value) ? value : '';
}

// V8 entiende GMT, UTC y las zonas de EE. UU. (EDT…), pero no las europeas abreviadas.
const ZONE_OFFSETS = { CEST: '+0200', CET: '+0100', BST: '+0100', WEST: '+0100', WET: '+0000', EEST: '+0300', EET: '+0200' };
const ZONE_PATTERN = new RegExp(`\\b(${Object.keys(ZONE_OFFSETS).join('|')})\\b`);

function dateOf(item, now) {
    for (const key of ['pubDate', 'dc:date', 'published', 'updated', 'dc:created']) {
        const raw = textOf(item[key]).trim().replace(ZONE_PATTERN, zone => ZONE_OFFSETS[zone]);
        if (!raw) continue;
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) continue;
        return date - now > FUTURE_TOLERANCE_MS ? now : date;
    }
    return now;
}

// Una imagen solo cuenta si es una URL válida, no es un píxel de seguimiento y no es la
// miniatura genérica que algunos medios ponen cuando el artículo no tiene foto.
function usableImage(raw, base) {
    const url = normalizeUrl(raw, base);
    if (!url || TRACKING_IMAGE.test(url)) return null;
    const file = new URL(url).pathname.split('/').pop();
    return GENERIC_IMAGE.test(file) ? null : url;
}

function imageOf(item, html, base) {
    const media = [...(item['media:content'] ?? [])];
    for (const group of [].concat(item['media:group'] ?? [])) media.push(...[].concat(group?.['media:content'] ?? []));
    for (const entry of media) {
        const url = entry?.['@url'];
        const type = entry?.['@type'] ?? '';
        const medium = entry?.['@medium'] ?? '';
        const isImage = medium === 'image' || type.startsWith('image/') || (!medium && !type && IMAGE_EXT.test(url ?? ''));
        const usable = isImage && usableImage(url, base);
        if (usable) return usable;
    }
    for (const thumb of item['media:thumbnail'] ?? []) {
        const usable = usableImage(thumb?.['@url'], base);
        if (usable) return usable;
    }
    for (const enclosure of item.enclosure ?? []) {
        if ((enclosure?.['@type'] ?? '').startsWith('image/')) {
            const usable = usableImage(enclosure['@url'], base);
            if (usable) return usable;
        }
    }
    // Primera <img> del cuerpo que no sea un píxel 1×1.
    for (const [tag, src] of decodeEntities(html).matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
        if (/\b(width|height)=["']?[01]["'\s/>]/i.test(tag)) continue;
        const usable = usableImage(decodeEntities(src), base);
        if (usable) return usable;
    }
    return null;
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
