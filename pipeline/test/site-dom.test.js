import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl, timeAgo, fold, plural } from '../../site/js/dom.js';

test('safeUrl solo deja pasar http(s)', () => {
    assert.equal(safeUrl('https://a.es/x'), 'https://a.es/x');
    assert.equal(safeUrl('javascript:alert(1)'), null);
    assert.equal(safeUrl('data:text/html,hi'), null);
    assert.equal(safeUrl(null), null);
    assert.equal(safeUrl('no es url'), null);
});

test('timeAgo en español', () => {
    const now = Date.parse('2026-10-11T20:00:00Z');
    assert.equal(timeAgo('2026-10-11T19:59:40Z', now), 'ahora');
    assert.equal(timeAgo('2026-10-11T19:35:00Z', now), 'hace 25 min');
    assert.equal(timeAgo('2026-10-11T17:00:00Z', now), 'hace 3 h');
    assert.equal(timeAgo('2026-10-09T20:00:00Z', now), 'hace 2 d');
    assert.equal(timeAgo('basura', now), '');
});

test('fold ignora mayúsculas y acentos', () => {
    assert.equal(fold('Sánchez CAMIÓN'), 'sanchez camion');
});

test('plural', () => {
    assert.equal(plural(1, 'medio', 'medios'), '1 medio');
    assert.equal(plural(3, 'medio', 'medios'), '3 medios');
});
