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
