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
