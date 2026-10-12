import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awardsFor } from '../../site/js/satire/awards.js';

const SOURCES = { a: { name: 'Diario A', bias: -1 }, b: { name: 'Diario B', bias: 1 }, c: { name: 'Diario C', bias: 0 }, d: { name: 'Diario D', bias: 2 } };
let n = 0;
const art = (sourceId, title) => ({ sourceId, title, url: `https://${sourceId}.es/${++n}`, summary: '', image: null, publishedAt: '2026-10-11T10:00:00Z' });
const story = (id, articles, extra = {}) => ({ id, title: articles[0].title, articles, sourceCount: new Set(articles.map(x => x.sourceId)).size,
    coverage: { left: 0, center: 0, right: 0, unrated: 0 }, blindspot: null, ...extra });
const many = (sourceId, count, make) => Array.from({ length: count }, (_, i) => story(`${sourceId}-${i}`, [art(sourceId, make(i))]));

test('adjetivómetro exige 10 artículos y adjunta titulares de prueba', () => {
    const stories = [
        ...many('a', 10, i => (i < 4 ? `Sánchez dinamita el pacto ${i}` : `Noticia tranquila ${i}`)),
        ...many('b', 3, i => `Feijóo estalla ${i}`),
    ];
    const award = awardsFor(stories, SOURCES).find(x => x.id === 'adjetivometro');
    assert.equal(award.winner, 'Diario A');
    assert.equal(award.figure, '40 %');
    assert.equal(award.evidence.length, 3);
    assert.ok(award.evidence.every(e => /dinamita/.test(e.title)));
});

test('las historias sensibles no cuentan para ningún premio', () => {
    const stories = many('a', 10, i => `Muere un hombre tras un brutal ataque ${i}`);
    assert.equal(awardsFor(stories, SOURCES).find(x => x.id === 'adjetivometro'), undefined);
});

test('solo-yo cuenta exclusivas y copia-pega busca titulares idénticos', () => {
    const t = 'El Gobierno aprueba los presupuestos';
    const stories = [story('s-copy', [art('a', t), art('b', t), art('c', t), art('d', 'Otra cosa')]), ...many('c', 4, i => `Exclusiva local ${i}`)];
    const awards = awardsFor(stories, SOURCES);
    assert.equal(awards.find(x => x.id === 'solo-yo').winner, 'Diario C');
    assert.equal(awards.find(x => x.id === 'solo-yo').figure, '4');
    const copy = awards.find(x => x.id === 'copia-pega');
    assert.equal(copy.figure, '3 medios');
    assert.equal(copy.winner, t);
});

test('clickbait y grito detectan preguntas, fórmulas y exclamaciones', () => {
    const stories = [
        ...many('a', 10, i => (i < 5 ? `¿Por qué sube la luz? ${i}` : `Así es el nuevo tren ${i}`)),
        ...many('b', 10, i => (i < 6 ? `¡Increíble! El ÚLTIMO capítulo ${i}` : `Normal ${i}`)),
    ];
    const awards = awardsFor(stories, SOURCES);
    assert.equal(awards.find(x => x.id === 'clickbait').winner, 'Diario A');
    assert.equal(awards.find(x => x.id === 'grito').winner, 'Diario B');
});

test('consenso elige la historia con más medios y los tres lados', () => {
    const s = story('s-cons', [art('a', 'El Papa será operado'), art('b', 'Operan al Papa'), art('c', 'Papa, al quirófano')],
        { coverage: { left: 1, center: 1, right: 1, unrated: 0 } });
    const award = awardsFor([s], SOURCES).find(x => x.id === 'consenso');
    assert.equal(award.winner, 'El Papa será operado');
    assert.equal(award.figure, '3 medios');
});

test('empate en porcentaje: gana el de más artículos y después el id', () => {
    const stories = [...many('a', 10, i => `Caos total ${i}`), ...many('b', 20, i => `Caos total ${i}`)];
    assert.equal(awardsFor(stories, SOURCES).find(x => x.id === 'adjetivometro').winner, 'Diario B');
});

test('en inglés usa sus propias listas', () => {
    const stories = many('a', 10, i => (i < 5 ? `Trump slams critics in fiery speech ${i}` : `Markets steady ${i}`));
    assert.equal(awardsFor(stories, SOURCES, { lang: 'en' }).find(x => x.id === 'adjetivometro').winner, 'Diario A');
});

test('sin datos no hay premios', () => {
    assert.deepEqual(awardsFor([], SOURCES), []);
});
