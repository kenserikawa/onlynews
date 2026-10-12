import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeBlocks } from '../../site/js/layout.js';

const story = (id, image = false) => ({ id, image: image ? `https://img/${id}.jpg` : null });
const ids = blocks => blocks.map(block => [block.template, block.items.map(item => item.id)]);
const flat = blocks => blocks.flatMap(block => block.items.map(item => item.id));

test('sin resultados no hay bloques', () => {
    assert.deepEqual(composeBlocks([]), []);
});

test('un solo resultado va en una fila', () => {
    assert.deepEqual(ids(composeBlocks([story('a', true)])), [['row', ['a']]]);
});

test('la grande del hero es el primer resultado con foto y las pequeñas siguen el orden', () => {
    const stories = [story('a'), story('b'), story('c', true), story('d'), story('e')];
    assert.deepEqual(ids(composeBlocks(stories)), [['hero', ['c', 'a', 'b', 'd']], ['row', ['e']]]);
});

test('el hero admite menos de 3 pequeñas cuando hay pocos resultados', () => {
    assert.deepEqual(ids(composeBlocks([story('a'), story('b', true)])), [['hero', ['b', 'a']]]);
});

test('sin ninguna foto no hay hero: parejas y luego filas', () => {
    const stories = ['a', 'b', 'c', 'd', 'e'].map(id => story(id));
    assert.deepEqual(ids(composeBlocks(stories)), [['pair', ['a', 'b']], ['pair', ['c', 'd']], ['row', ['e']]]);
});

test('patrón por defecto: hero, pareja, pareja y el resto en filas', () => {
    const stories = Array.from({ length: 12 }, (_, i) => story(`s${i}`, i % 3 === 0));
    const blocks = composeBlocks(stories);
    assert.deepEqual(blocks.map(block => block.template), ['hero', 'pair', 'pair', 'row', 'row', 'row', 'row']);
    assert.ok(blocks[0].items[0].image, 'la grande del hero tiene foto');
    assert.deepEqual([...flat(blocks)].sort(), stories.map(s => s.id).sort(), 'ni se pierde ni se repite ningún resultado');
});

test('una pareja incompleta pasa a fila', () => {
    const stories = [story('a', true), story('b'), story('c'), story('d'), story('e'), story('f')];
    assert.deepEqual(ids(composeBlocks(stories)), [['hero', ['a', 'b', 'c', 'd']], ['pair', ['e', 'f']]]);
    assert.deepEqual(ids(composeBlocks(stories.slice(0, 5))), [['hero', ['a', 'b', 'c', 'd']], ['row', ['e']]]);
});

test('el patrón es configurable', () => {
    const stories = [story('a'), story('b'), story('c', true), story('d')];
    assert.deepEqual(ids(composeBlocks(stories, ['pair', 'hero'])), [['pair', ['a', 'b']], ['hero', ['c', 'd']]]);
});
