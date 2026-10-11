import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreStories } from '../score.js';

const NOW = new Date('2026-10-11T20:00:00Z');
const SOURCES = { l1: { bias: -2 }, l2: { bias: -1 }, l3: { bias: -1 }, l4: { bias: -2 }, c1: { bias: 0 }, r1: { bias: 1 }, r2: { bias: 2 }, u1: { bias: null } };

function art(sourceId, slug, hoursAgo = 1, image = null) {
    return { id: `a-${sourceId}-${slug}`, url: `https://${sourceId}.es/${slug}`, title: `${slug} (${sourceId})`, summary: 's',
        image, publishedAt: new Date(NOW - hoursAgo * 3600e3).toISOString(), sourceId, market: 'es' };
}

test('calcula cobertura por medios distintos, título, imagen y fechas', () => {
    const cluster = { articles: [art('l1', 'x', 2), art('l1', 'x2', 1), art('c1', 'x', 3, 'https://img/c1.jpg'), art('r1', 'x', 5)] };
    const [story] = scoreStories([cluster], SOURCES, NOW);
    assert.deepEqual(story.coverage, { left: 1, center: 1, right: 1, unrated: 0 });
    assert.equal(story.sourceCount, 3);
    assert.equal(story.title, 'x (l1)');
    assert.equal(story.image, 'https://img/c1.jpg');
    assert.equal(story.firstSeen, new Date(NOW - 5 * 3600e3).toISOString());
    assert.equal(story.lastSeen, new Date(NOW - 1 * 3600e3).toISOString());
    assert.equal(story.summary, null);
    assert.equal(story.blindspot, null);
    assert.deepEqual(Object.keys(story.articles[0]).sort(), ['image', 'publishedAt', 'sourceId', 'summary', 'title', 'url']);
    assert.ok(!('relevance' in story));
});

test('marca blindspots de izquierda y derecha', () => {
    const left = { articles: ['l1', 'l2', 'l3', 'l4', 'c1'].map(s => art(s, 'izq')) };
    const right = { articles: ['r1', 'r2', 'c1'].map(s => art(s, 'der')).concat(art('u1', 'der')) };
    const stories = scoreStories([left, right], SOURCES, NOW);
    assert.equal(stories.find(s => s.title.startsWith('izq')).blindspot, 'left');
    assert.equal(stories.find(s => s.title.startsWith('der')).blindspot, null, '2 de 3 con orientación es < 80 %');
});

test('el id es estable cuando la historia gana artículos más nuevos', () => {
    const base = { articles: [art('l1', 'y', 5), art('r1', 'y', 4)] };
    const grown = { articles: [art('c1', 'y', 1), ...base.articles] };
    assert.equal(scoreStories([base], SOURCES, NOW)[0].id, scoreStories([grown], SOURCES, NOW)[0].id);
    assert.match(scoreStories([base], SOURCES, NOW)[0].id, /^s-[0-9a-z]+$/);
});

test('ordena por medios × decaimiento con vida media de 12 h', () => {
    const big = { articles: ['l1', 'l2', 'c1', 'r1', 'r2'].map(s => art(s, 'big', 1)) };
    const small = { articles: ['l1', 'r1'].map(s => art(s, 'small', 1)) };
    const old = { articles: ['l1', 'l2', 'c1', 'r1', 'r2'].map(s => art(s, 'old', 48)) };
    const order = scoreStories([old, small, big], SOURCES, NOW).map(s => s.title.split(' ')[0]);
    assert.deepEqual(order, ['big', 'small', 'old']);
});

test('un medio desconocido cuenta como sin clasificar', () => {
    const [story] = scoreStories([{ articles: [art('nuevo', 'z')] }], SOURCES, NOW);
    assert.deepEqual(story.coverage, { left: 0, center: 0, right: 0, unrated: 1 });
});
