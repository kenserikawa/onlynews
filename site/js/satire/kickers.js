// Antetítulos satíricos: la primera regla que encaja gana; si ninguna, no hay chiste.
import { pick } from './pick.js';
import { isSensitive, normalizeTitle } from './guard.js';

const SIDE_NAME = { left: 'la izquierda', center: 'el centro', right: 'la derecha' };
const OTHER = { left: 'right', right: 'left' };
const cap = text => text[0].toUpperCase() + text.slice(1);

export const WORD_WARS = [
    ['tregua', 'alto el fuego', 'pacto', 'acuerdo', 'armisticio'],
    ['detenido', 'arrestado', 'capturado'],
    ['dimite', 'cesa', 'abandona', 'destituido'],
    ['recorte', 'ajuste', 'reforma', 'tijeretazo'],
    ['okupa', 'ocupación', 'allanamiento'],
    ['inmigrante', 'migrante', 'ilegal', 'irregular'],
    ['subida', 'aumento', 'incremento', 'sablazo'],
    ['crisis', 'tensión', 'choque', 'guerra'],
    ['ceasefire', 'truce', 'deal', 'pause'],
];

function hasTerm(normalizedTitle, term) {
    const target = normalizeTitle(term);
    if (target.includes(' ')) return ` ${normalizedTitle} `.includes(` ${target} `);
    return normalizedTitle.split(' ').some(word => word.startsWith(target));
}

function wordWar(titles) {
    let best = [];
    for (const group of WORD_WARS) {
        const found = group.filter(term => titles.some(title => hasTerm(title, term)));
        if (found.length >= 2 && found.length > best.length) best = found;
    }
    return best.slice(0, 3);
}

function quoteList(terms) {
    const quoted = terms.map(term => `«${term}»`);
    return quoted.length === 2 ? quoted.join(' o ') : `${quoted.slice(0, -1).join(', ')} o ${quoted.at(-1)}`;
}

function identicalCount(story) {
    const groups = new Map();
    for (const article of story.articles) {
        const key = normalizeTitle(article.title);
        if (!groups.has(key)) groups.set(key, new Set());
        groups.get(key).add(article.sourceId);
    }
    return Math.max(0, ...[...groups.values()].map(set => set.size));
}

export function kickerFor(story, sourcesById) {
    if (isSensitive(story)) return null;
    const seed = story.id;
    const { left = 0, center = 0, right = 0 } = story.coverage ?? {};
    const rated = left + center + right;

    if (story.blindspot === 'left' || story.blindspot === 'right') {
        const side = story.blindspot;
        const other = OTHER[side];
        return pick([
            `Solo se enteran ${story.coverage[side]} medios de ${SIDE_NAME[side]}. ${cap(SIDE_NAME[other])}, de puente`,
            `${cap(SIDE_NAME[other])} sigue sin confirmar que esto haya pasado`,
            `Noticia exclusiva para lectores de ${SIDE_NAME[side]}`,
        ], seed);
    }

    const copies = identicalCount(story);
    if (copies >= 3) {
        return pick([
            `${copies} medios llegan a la misma frase a la vez. La nota de agencia, orgullosa`,
            `Récord de originalidad: ${copies} titulares idénticos`,
        ], seed);
    }

    const terms = wordWar(story.articles.map(article => normalizeTitle(article.title)));
    if (terms.length >= 2) {
        return pick([
            `${quoteList(terms)}: depende de a quién preguntes`,
            `Los medios no se ponen de acuerdo ni en la palabra: ${quoteList(terms)}`,
        ], seed);
    }

    if (story.sourceCount >= 6 && left >= 1 && center >= 1 && right >= 1) {
        return pick([
            `Milagro: ${story.sourceCount} medios de izquierda, centro y derecha se ponen de acuerdo en algo`,
            'Se suspende la polarización durante una noticia',
        ], seed);
    }

    if (story.sourceCount >= 3 && rated > 0) {
        const major = ['left', 'right', 'center'].find(side => story.coverage[side] / rated >= 0.75);
        if (major === 'center') return 'El centro, muy pendiente. Los extremos, mirando el móvil';
        if (major) return `${cap(SIDE_NAME[major])}, muy pendiente. ${cap(SIDE_NAME[OTHER[major]])}, mirando el móvil`;
    }

    if (story.sourceCount === 1) {
        const name = sourcesById[story.articles[0].sourceId]?.name ?? story.articles[0].sourceId;
        return pick([
            `Exclusiva de ${name}: el resto de la prensa ha decidido que esto no ha pasado`,
            `${name} se entera; los demás, no`,
            `Solo ${name} lo cuenta. Los demás tendrán sus motivos`,
        ], seed);
    }
    return null;
}
