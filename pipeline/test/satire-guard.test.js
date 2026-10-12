import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashString, pick } from '../../site/js/satire/pick.js';
import { isSensitive, isSensitiveTitle, normalizeTitle } from '../../site/js/satire/guard.js';

test('pick es determinista y usa todas las opciones con semillas distintas', () => {
    assert.equal(pick(['a', 'b', 'c'], 's-123'), pick(['a', 'b', 'c'], 's-123'));
    const seen = new Set(Array.from({ length: 60 }, (_, i) => pick(['a', 'b', 'c'], `s-${i}`)));
    assert.deepEqual([...seen].sort(), ['a', 'b', 'c']);
    assert.equal(typeof hashString('x'), 'number');
});

test('normalizeTitle quita acentos, signos y mayúsculas', () => {
    assert.equal(normalizeTitle('¡Última hora: Sánchez «dimite»!'), 'ultima hora sanchez dimite');
});

test('isSensitiveTitle detecta sucesos con víctimas', () => {
    for (const title of [
        'Muere un joven de 21 años tras ser apuñalado en un local de Granada',
        'Al menos 12 muertos y 300 heridos en un ataque contra el aeropuerto de Riad',
        'Un coche atropella a dos peatones en Madrid',
        'Hallan una bomba de la Guerra Civil en un solar',
        'Naufragio frente a Yibuti: 139 migrantes ahogados',
        'Detenido por la agresión sexual a una menor',
        'Man killed in shooting outside Chicago school',
    ]) assert.equal(isSensitiveTitle(title), true, title);
});

test('isSensitiveTitle no salta con metáforas ni clichés', () => {
    for (const title of [
        'Sánchez pide al Supremo que frene el "atropello" de Feijóo y Abascal',
        'El Papa León XIV será operado de un nódulo en el pulmón',
        'El bombazo del verano: la gira que nadie esperaba',
        'Rufián encabezará la lista de ERC al Congreso',
        'Diego Simeone renueva diez años con el Atlético',
        'Trump fires his national security adviser',
    ]) assert.equal(isSensitiveTitle(title), false, title);
});

test('isSensitive mira el título de la historia y todos sus artículos', () => {
    const story = { title: 'Incidente en Granada', articles: [{ title: 'Incidente en Granada' }, { title: 'Muere un joven en Granada' }] };
    assert.equal(isSensitive(story), true);
    assert.equal(isSensitive({ title: 'Rufián repite', articles: [{ title: 'Rufián repite' }] }), false);
});
