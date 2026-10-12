import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickerFor } from '../../site/js/satire/kickers.js';

const SOURCES = { l1: { name: 'Izq Uno', bias: -2 }, l2: { name: 'Izq Dos', bias: -1 }, c1: { name: 'Centro Uno', bias: 0 },
    c2: { name: 'Centro Dos', bias: 0 }, r1: { name: 'Der Uno', bias: 1 }, r2: { name: 'Der Dos', bias: 2 }, r3: { name: 'Der Tres', bias: 2 },
    r4: { name: 'El Correo', bias: 0 } };

function story(id, pairs, extra = {}) {
    const articles = pairs.map(([sourceId, title]) => ({ sourceId, title, url: `https://${sourceId}.es/${id}`, summary: '', image: null, publishedAt: '2026-10-11T10:00:00Z' }));
    const sides = { left: new Set(), center: new Set(), right: new Set(), unrated: new Set() };
    for (const a of articles) { const b = SOURCES[a.sourceId]?.bias; sides[b == null ? 'unrated' : b < 0 ? 'left' : b > 0 ? 'right' : 'center'].add(a.sourceId); }
    const coverage = Object.fromEntries(Object.entries(sides).map(([k, v]) => [k, v.size]));
    return { id, title: articles[0].title, articles, coverage, sourceCount: new Set(articles.map(a => a.sourceId)).size, blindspot: null, ...extra };
}

test('nunca hay antetítulo en historias sensibles', () => {
    const s = story('s-1', [['r1', 'Muere un joven en Granada'], ['r2', 'Muere un joven en Granada'], ['r3', 'Muere un joven en Granada']], { blindspot: 'right' });
    assert.equal(kickerFor(s, SOURCES), null);
});

test('blindspot gana a cualquier otra regla', () => {
    const s = story('s-2', [['r1', 'Robles habla de Ceuta'], ['r2', 'Robles habla de Ceuta'], ['r3', 'Robles habla de Ceuta'], ['r4', 'Robles y Ceuta']], { blindspot: 'right' });
    const k = kickerFor(s, SOURCES);
    assert.match(k, /derecha|izquierda/i);
    assert.doesNotMatch(k, /misma frase|idénticos/);
});

test('copia y pega con 3 o más titulares idénticos', () => {
    const t = 'El Gobierno aprueba los presupuestos';
    assert.match(kickerFor(story('s-3', [['l1', t], ['c1', t], ['r1', t], ['r2', 'Otro titular']]), SOURCES), /3 (medios|titulares)/);
});

test('guerra de palabras lista los términos rivales tal como aparecen', () => {
    const s = story('s-4', [['l1', 'Trump anuncia una tregua energética'], ['c1', 'Trump anuncia un alto el fuego'], ['r1', 'Trump logra un pacto']]);
    const k = kickerFor(s, SOURCES);
    for (const term of ['tregua', 'alto el fuego', 'pacto']) assert.ok(k.includes(`«${term}»`), k);
});

test('consenso con 6 o más medios y los tres lados', () => {
    const s = story('s-5', [['l1', 'El Papa será operado'], ['l2', 'Operarán al Papa'], ['c1', 'El Papa, al quirófano'], ['c2', 'Papa operado'], ['r1', 'El Papa se opera'], ['r2', 'Operación del Papa']]);
    assert.match(kickerFor(s, SOURCES), /6 medios|polarización/);
});

test('lado mayoritario cuando un lado aporta el 75 % o más sin ser blindspot', () => {
    const s = story('s-6', [['r1', 'Feijóo presenta su plan'], ['r2', 'El plan de Feijóo'], ['r3', 'Feijóo y su plan'], ['l1', 'Plan de Feijóo, críticas']]);
    assert.match(kickerFor(s, SOURCES), /La derecha, muy pendiente\. La izquierda, mirando el móvil/);
});

test('exclusiva solitaria nombra al medio', () => {
    assert.match(kickerFor(story('s-7', [['r4', 'Aquí no hay quien viva en Deusto']]), SOURCES), /El Correo/);
});

test('sin regla aplicable no hay antetítulo y el resultado es determinista', () => {
    const s = story('s-8', [['l1', 'Rufián repite'], ['r1', 'Rufián, candidato']]);
    assert.equal(kickerFor(s, SOURCES), null);
    const e = story('s-9', [['r4', 'Exclusiva local']]);
    assert.equal(kickerFor(e, SOURCES), kickerFor(e, SOURCES));
});
