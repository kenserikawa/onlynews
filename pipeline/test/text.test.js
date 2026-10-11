import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, tokens, stemTokens, decodeEntities, cleanText, truncate, hash } from '../text.js';

test('normalize quita acentos, puntuación y mayúsculas', () => {
    assert.equal(normalize('¡Última hora: Sánchez, en el Congreso!'), 'ultima hora sanchez en el congreso');
});

test('tokens descarta palabras vacías y tokens cortos, pero conserva números', () => {
    assert.deepEqual(tokens('El Gobierno aprueba 2 leyes de vivienda', 'es'), ['gobierno', 'aprueba', '2', 'leyes', 'vivienda']);
    assert.deepEqual(tokens('The president says he will veto the bill', 'en'), ['president', 'veto', 'bill']);
});

test('decodeEntities resuelve entidades con nombre, numéricas y acentos españoles', () => {
    assert.equal(decodeEntities('&#8220;Hola&#x201D; &iquest;qu&eacute;? Espa&ntilde;a &amp; m&aacute;s'), '“Hola” ¿qué? España & más');
    assert.equal(decodeEntities('&desconocida; &#0;'), '&desconocida; &#0;');
});

test('cleanText quita HTML, también si viene escapado, y colapsa espacios', () => {
    assert.equal(cleanText('<p>Primer <b>párrafo</b></p>\n\n<script>x()</script> fin'), 'Primer párrafo fin');
    assert.equal(cleanText('&lt;p&gt;Texto &amp;quot;citado&amp;quot;&lt;/p&gt;'), 'Texto "citado"');
    assert.equal(cleanText(undefined), '');
});

test('truncate corta en límite de palabra y añade elipsis', () => {
    const long = 'palabra '.repeat(60).trim();
    const out = truncate(long, 300);
    assert.ok(out.length <= 301, `longitud ${out.length}`);
    assert.ok(out.endsWith('…'));
    assert.ok(!out.includes('palab…'));
    assert.equal(truncate('corto', 300), 'corto');
});

test('hash es determinista y alfanumérico', () => {
    assert.equal(hash('https://a.es/1'), hash('https://a.es/1'));
    assert.notEqual(hash('https://a.es/1'), hash('https://a.es/2'));
    assert.match(hash('x'), /^[0-9a-z]+$/);
});

test('stemTokens recorta a raíces de 5 letras y quita fechas y números para el agrupado', () => {
    assert.deepEqual(stemTokens('Trump anuncia una tregua energética el lunes 12 de octubre', 'es'), ['trump', 'anunc', 'tregu', 'energ']);
    assert.deepEqual(stemTokens('Energy truce announced on Monday, October 12', 'en'), ['energ', 'truce', 'annou']);
    assert.deepEqual(stemTokens('alto el fuego energético', 'es'), stemTokens('alto el fuego para la energía', 'es'));
});
