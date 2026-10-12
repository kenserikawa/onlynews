// Línea roja del modo coña: historias con víctimas o sucesos no reciben ningún chiste.
// Preferimos pasarnos de prudentes: una noticia neutra sin chiste no pasa nada.
const PREFIXES = [
    'muert', 'muere', 'mueren', 'murio', 'mortal', 'fallec', 'asesin', 'apunal', 'homicid', 'feminicid', 'viol',
    'abus', 'atentado', 'terroris', 'naufrag', 'ahogad', 'accidente', 'siniestro', 'victima', 'desaparecid',
    'secuestr', 'tiroteo', 'herido', 'incendio', 'explosion', 'suicid', 'cadaver', 'atropella',
    // inglés (edición Internacional)
    'kill', 'death', 'murder', 'stab', 'shooting', 'rape', 'abuse', 'victim', 'injur',
    'wounded', 'crash', 'drown', 'shipwreck', 'missing', 'kidnap', 'suicide', 'massacre', 'bombing', 'wildfire',
];
const PHRASES = ['mata a', 'matan a', 'agresion sexual'];
// Palabras completas: como raíz darían falsos positivos («bombazo», «Diego», «diez», «deadline»).
const WORDS = new Set(['bomba', 'bombas', 'disparo', 'disparos', 'bomb', 'bombs', 'die', 'dies', 'died', 'dead', 'shot', 'shots']);

export function normalizeTitle(text) {
    return String(text ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function isSensitiveTitle(title) {
    const normalized = normalizeTitle(title);
    const words = normalized.split(' ');
    if (words.some(word => WORDS.has(word) || PREFIXES.some(prefix => word.startsWith(prefix)))) return true;
    const padded = ` ${normalized} `;
    return PHRASES.some(phrase => padded.includes(` ${phrase} `));
}

export function isSensitive(story) {
    return isSensitiveTitle(story.title) || story.articles.some(article => isSensitiveTitle(article.title));
}
