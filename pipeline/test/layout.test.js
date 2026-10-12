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

test('sin ninguna foto no hay hero ni parejas: todo en filas', () => {
    const stories = ['a', 'b', 'c'].map(id => story(id));
    assert.deepEqual(ids(composeBlocks(stories)), [['row', ['a']], ['row', ['b']], ['row', ['c']]]);
});

test('las parejas solo llevan resultados con foto y los adelantan; el resto baja a filas en su orden', () => {
    const stories = [story('a', true), story('b'), story('c'), story('d'), story('e'), story('f', true), story('g'), story('h', true), story('i')];
    assert.deepEqual(ids(composeBlocks(stories)), [
        ['hero', ['a', 'b', 'c', 'd']],
        ['pair', ['f', 'h']],
        ['row', ['e']], ['row', ['g']], ['row', ['i']],
    ]);
});

test('patrón por defecto: hero, parejas con foto y el resto en filas', () => {
    const stories = Array.from({ length: 12 }, (_, i) => story(`s${i}`, i % 3 === 0));
    const blocks = composeBlocks(stories);
    assert.deepEqual(blocks.map(block => block.template), ['hero', 'pair', 'row', 'row', 'row', 'row', 'row', 'row']);
    assert.ok(blocks.filter(block => block.template === 'pair').every(block => block.items.every(item => item.image)), 'las parejas siempre con foto');
    assert.ok(blocks[0].items[0].image, 'la grande del hero tiene foto');
    assert.deepEqual([...flat(blocks)].sort(), stories.map(s => s.id).sort(), 'ni se pierde ni se repite ningún resultado');
});

test('una pareja incompleta (menos de 2 con foto) pasa a fila', () => {
    const stories = [story('a', true), story('b'), story('c'), story('d'), story('e', true), story('f', true)];
    assert.deepEqual(ids(composeBlocks(stories)), [['hero', ['a', 'b', 'c', 'd']], ['pair', ['e', 'f']]]);
    assert.deepEqual(ids(composeBlocks(stories.slice(0, 5))), [['hero', ['a', 'b', 'c', 'd']], ['row', ['e']]]);
});

test('el patrón es configurable', () => {
    const stories = [story('a', true), story('b'), story('c', true), story('d', true), story('e')];
    assert.deepEqual(ids(composeBlocks(stories, ['pair', 'hero'])), [['pair', ['a', 'c']], ['hero', ['d', 'b', 'e']]]);
});
