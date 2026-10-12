// Línea roja del modo coña: historias con víctimas o sucesos no reciben ningún chiste.
// Preferimos pasarnos de prudentes: una noticia neutra sin chiste no pasa nada.
const PREFIXES = [
    // castellano
    'muert', 'muere', 'mueren', 'murio', 'mortal', 'fallec', 'asesin', 'apunal', 'acuchill', 'homicid', 'feminicid',
    'matanza', 'masacr', 'viol', 'abus', 'agred', 'agresi', 'paliza', 'pederast', 'atentado', 'atent', 'terroris',
    'naufrag', 'ahogad', 'accidente', 'siniestro', 'victima', 'desaparec', 'secuestr', 'rehen', 'tiroteo', 'dispar',
    'herid', 'incendi', 'llamas', 'explosion', 'explot', 'suicid', 'cadaver', 'atropella', 'ataque', 'atac',
    'bombarde', 'misil', 'dron', 'guerra', 'ofensiva', 'inundac', 'riada', 'terremoto', 'sismo', 'tsunami', 'huracan',
    'tormenta', 'borrasca', 'evacu', 'tragedia', 'tragic', 'hunde', 'gaza', 'hamas', 'huti', 'hezbol', 'ucrani', 'yihad',
    'rescat', 'salvamento', 'patera', 'cayuco', 'atrapad',
    // inglés (edición Internacional)
    'kill', 'death', 'deadly', 'fatal', 'slain', 'slaughter', 'murder', 'stab', 'shoot', 'gun', 'rape', 'rapist',
    'assault', 'abuse', 'victim', 'injur', 'wound', 'crash', 'drown', 'shipwreck', 'missing', 'kidnap', 'hostage',
    'suicide', 'massacre', 'bombing', 'explos', 'blast', 'strike', 'struck', 'airstrike', 'missile', 'drone', 'attack',
    'invasion', 'hurricane', 'storm', 'flood', 'earthquake', 'quake', 'tornado', 'wildfire', 'blaze', 'flame', 'poison',
    'casualt', 'hijack', 'genocide', 'terror', 'evacuat', 'tragedy', 'tragic', 'ukrain', 'houthi', 'hezbollah',
    'rescue', 'trapped', 'stranded',
];
const PHRASES = ['agresion sexual', 'sin vida', 'pierde la vida', 'pierden la vida', 'perdio la vida', 'sexual assault', 'death toll'];
// Palabras completas: como raíz darían falsos positivos («bombazo», «Diego», «diez», «matrícula», «fires» de despedir).
const WORDS = new Set(['bomba', 'bombas', 'bomb', 'bombs', 'bombed', 'bomber', 'bombers', 'die', 'dies', 'died', 'dead',
    'shot', 'shots', 'war', 'wars', 'fire', 'mata', 'matan', 'mato', 'matar', 'mataron', 'matado', 'matada', 'dana']);

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

// Mira títulos y entradillas de todos los artículos. `story.sensitive` lo precalcula data.js
// con TODOS los medios, para que ocultar un medio no borre la pista de una tragedia.
export function isSensitive(story) {
    if (story.sensitive === true) return true;
    return isSensitiveTitle(story.title)
        || story.articles.some(article => isSensitiveTitle(article.title) || isSensitiveTitle(article.summary));
}
