import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bingoFor, CLICHES } from '../../site/js/satire/bingo.js';

let n = 0;
const story = (sourceId, title, at) => ({ id: `s-${++n}`, title, sourceCount: 1, coverage: {}, blindspot: null,
    articles: [{ sourceId, title, url: `https://${sourceId}.es/${n}`, summary: '', image: null, publishedAt: at }] });

test('el cartón tiene 16 casillas de la bolsa y es estable por fecha', () => {
    const a = bingoFor([], '2026-10-12');
    assert.equal(a.cells.length, 16);
    assert.ok(a.cells.every(cell => CLICHES.es.includes(cell.phrase) && cell.hit === null));
    assert.deepEqual(bingoFor([], '2026-10-12').cells.map(c => c.phrase), a.cells.map(c => c.phrase));
    assert.notDeepEqual(bingoFor([], '2026-10-13').cells.map(c => c.phrase), a.cells.map(c => c.phrase));
    assert.equal(CLICHES.es.length, 24);
    assert.equal(CLICHES.en.length, 24);
});

test('cada casilla la canta el primer medio en publicar ese cliché', () => {
    const card = bingoFor([], '2026-10-12');
    const phrase = card.cells[0].phrase;
    const stories = [story('tarde', `Tarde: ${phrase} del día`, '2026-10-11T12:00:00Z'), story('pronto', `${phrase} en Madrid`, '2026-10-11T08:00:00Z')];
    const hit = bingoFor(stories, '2026-10-12').cells[0].hit;
    assert.equal(hit.sourceId, 'pronto');
});

test('una fila completa canta línea con el medio que la cerró', () => {
    const card = bingoFor([], '2026-10-12');
    const stories = card.cells.slice(0, 4).map((cell, i) => story(`m${i}`, `Titular con ${cell.phrase}`, `2026-10-11T0${i}:00:00Z`));
    const result = bingoFor(stories, '2026-10-12');
    const line = result.lines.find(l => l.cells.join() === '0,1,2,3');
    assert.ok(line, JSON.stringify(result.lines));
    assert.equal(line.sourceId, 'm3');
    assert.equal(line.at, '2026-10-11T03:00:00Z');
});

test('las historias sensibles no marcan casillas', () => {
    const phrase = bingoFor([], '2026-10-12').cells[0].phrase;
    const result = bingoFor([story('x', `${phrase}: muere un hombre`, '2026-10-11T08:00:00Z')], '2026-10-12');
    assert.equal(result.cells[0].hit, null);
});

test('en inglés usa su propia bolsa', () => {
    assert.ok(bingoFor([], '2026-10-12', { lang: 'en' }).cells.every(cell => CLICHES.en.includes(cell.phrase)));
});
