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

// Fechas y números unen historias distintas del mismo día («12 de octubre»), así que el
// agrupado los ignora; y recortar a 5 letras junta variantes (energía/energético).
const DATE_WORDS = new Set(`lunes martes miercoles jueves viernes sabado domingo enero febrero marzo abril mayo junio
    julio agosto septiembre octubre noviembre diciembre monday tuesday wednesday thursday friday saturday sunday january
    february march april june july august september october november december`.split(/\s+/));
const STEM_LENGTH = 5;

export function stemTokens(text, lang) {
    return tokens(text, lang)
        .filter(word => !DATE_WORDS.has(word) && !/^\d+$/.test(word))
        .map(word => word.slice(0, STEM_LENGTH));
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
