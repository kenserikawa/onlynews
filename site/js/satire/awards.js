// Premios del día: rankings sobre los titulares reales (sin historias sensibles).
import { isSensitive, normalizeTitle } from './guard.js';

const MIN_ARTICLES = 10;
const LISTS = {
    es: {
        combat: ['atropello', 'nerviosismo', 'dinamita', 'estalla', 'zasca', 'escandal', 'bochorn', 'humill', 'demoledor',
            'brutal', 'polemic', 'indign', 'vergonz', 'furia', 'desat', 'arrasa', 'hunde', 'caos', 'revienta', 'fulmina',
            'aplasta', 'ridicul', 'golpe'],
        clickbaitStart: ['asi ', 'esto es lo que', 'lo que se sabe', 'por que', 'que es ', 'quien es', 'las claves'],
    },
    en: {
        combat: ['slam', 'chaos', 'outrage', 'fury', 'furious', 'meltdown', 'bombshell', 'scathing', 'rips', 'savage',
            'humiliat', 'brutal', 'lashes out', 'torches'],
        clickbaitStart: ['here s', 'what we know', 'why ', 'how ', 'this is', 'what to know', 'who is'],
    },
};
const ACRONYMS = new Set(['PSOE', 'DANA', 'OTAN', 'NASA', 'UEFA', 'FIFA', 'COVID', 'IBEX', 'EEUU', 'OCDE', 'CCOO', 'LGTBI',
    'ERTE', 'IRPF', 'SEPE', 'AEMET', 'CNMV', 'BBVA', 'RTVE', 'NATO', 'MAGA', 'NASDAQ', 'OPEC', 'UNESCO', 'UNICEF']);

const isCombat = (title, list) => normalizeTitle(title).split(' ').some(word => list.combat.some(root => word.startsWith(root)));
const isClickbait = (title, list) => /[¿?]/.test(title) || list.clickbaitStart.some(start => `${normalizeTitle(title)} `.startsWith(start));
const ROMAN = /^[IVXLCDM]+$/;
const SHOUT_LABELS = new Set(['ultima hora', 'en directo', 'directo', 'video', 'urgente', 'atencion', 'exclusiva', 'watch', 'live', 'breaking', 'exclusive']);
// Grito: exclamaciones, una etiqueta en mayúsculas («ÚLTIMA HORA:», «WATCH:») o dos palabras
// seguidas en mayúsculas. Las siglas sueltas (ONCE, RFEF, CCTV, XVIII…) no cuentan.
function isShout(title) {
    if (/[¡!]/.test(title)) return true;
    const label = title.match(/^\s*([\p{Lu}\s]{4,}):/u);
    if (label && SHOUT_LABELS.has(normalizeTitle(label[1]))) return true;
    let run = 0;
    for (const raw of title.split(/\s+/)) {
        const word = raw.replace(/[^\p{L}]/gu, '');
        const caps = word.length >= 3 && word === word.toUpperCase() && /\p{Lu}/u.test(word) && !ACRONYMS.has(word) && !ROMAN.test(word);
        run = caps ? run + 1 : 0;
        if (run >= 2) return true;
    }
    return false;
}
const evidenceOf = articles => articles.slice(0, 3).map(({ sourceId, title, url }) => ({ sourceId, title, url }));
const nameOf = (sourcesById, id) => sourcesById[id]?.name ?? id;

function bestBy(entries, score) {
    return entries
        .filter(entry => score(entry) > 0)
        .sort((a, b) => score(b) - score(a) || b.total - a.total || (a.id < b.id ? -1 : 1))[0];
}

function percentAward(bySource, test, sourcesById, meta) {
    const entries = Object.entries(bySource)
        .filter(([, list]) => list.length >= MIN_ARTICLES)
        .map(([id, list]) => { const hits = list.filter(test); return { id, total: list.length, hits, pct: Math.round((hits.length * 100) / list.length) }; });
    const best = bestBy(entries, entry => entry.pct);
    if (!best) return null;
    return { ...meta, winner: nameOf(sourcesById, best.id), figure: `${best.pct} %`, blurb: meta.blurb(nameOf(sourcesById, best.id), best), evidence: evidenceOf(best.hits) };
}

export function awardsFor(stories, sourcesById, { lang = 'es' } = {}) {
    const list = LISTS[lang] ?? LISTS.es;
    const safe = stories.filter(story => !isSensitive(story));
    const bySource = {};
    for (const story of safe) for (const article of story.articles) (bySource[article.sourceId] ??= []).push(article);
    const awards = [];

    awards.push(percentAward(bySource, a => isCombat(a.title, list), sourcesById,
        { id: 'adjetivometro', emoji: '🏆', title: 'Adjetivómetro', blurb: (name, b) => `${name}: ${b.pct} % de titulares en pie de guerra` }));
    awards.push(percentAward(bySource, a => isClickbait(a.title, list), sourcesById,
        { id: 'clickbait', emoji: '🎣', title: 'Clickbaitómetro', blurb: name => `${name} pregunta, tú haces clic` }));

    const solos = {};
    for (const story of safe.filter(s => s.sourceCount === 1)) (solos[story.articles[0].sourceId] ??= []).push(story.articles[0]);
    const solo = bestBy(Object.entries(solos).map(([id, arts]) => ({ id, total: arts.length, arts })), entry => entry.total);
    if (solo) awards.push({ id: 'solo-yo', emoji: '🕵️', title: 'Solo yo me he enterado', winner: nameOf(sourcesById, solo.id),
        figure: String(solo.total), blurb: `${solo.total} exclusivas que no quiso nadie más`, evidence: evidenceOf(solo.arts) });

    const copies = safe.map(story => {
        const groups = new Map();
        for (const article of story.articles) {
            const key = normalizeTitle(article.title);
            if (!groups.has(key)) groups.set(key, []);
            if (!groups.get(key).some(a => a.sourceId === article.sourceId)) groups.get(key).push(article);
        }
        const top = [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
        return { id: story.id, total: story.sourceCount, story, top };
    });
    const copy = bestBy(copies.filter(c => c.top.length >= 3), c => c.top.length);
    if (copy) awards.push({ id: 'copia-pega', emoji: '📋', title: 'Copia y pega de oro', winner: copy.top[0].title,
        figure: `${copy.top.length} medios`, blurb: `${copy.top.length} medios, una sola frase`, evidence: evidenceOf(copy.top) });

    awards.push(percentAward(bySource, a => isShout(a.title), sourcesById,
        { id: 'grito', emoji: '📢', title: 'Grito del día', blurb: name => `${name} no habla: grita` }));

    const consensus = bestBy(safe.filter(s => s.coverage?.left >= 1 && s.coverage?.center >= 1 && s.coverage?.right >= 1)
        .map(story => ({ id: story.id, total: story.sourceCount, story })), entry => entry.total);
    if (consensus) {
        const bySide = ['left', 'center', 'right'].map(side => consensus.story.articles.find(a => {
            const bias = sourcesById[a.sourceId]?.bias;
            return side === 'left' ? bias < 0 : side === 'right' ? bias > 0 : bias === 0;
        })).filter(Boolean);
        awards.push({ id: 'consenso', emoji: '🤝', title: 'Consenso del día', winner: consensus.story.title,
            figure: `${consensus.total} medios`, blurb: 'Lo único en lo que hoy está de acuerdo la prensa',
            evidence: evidenceOf(bySide.length ? bySide : consensus.story.articles) });
    }
    return awards.filter(Boolean);
}
