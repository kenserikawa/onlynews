import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VOICE, say, scoreLine } from '../../site/js/satire/voice.js';

test('toda clave tiene versión normal y versión coña', () => {
    for (const [key, entry] of Object.entries(VOICE)) {
        assert.equal(typeof entry.normal, 'string', key);
        assert.ok(entry.cona && typeof entry.cona === 'string', `${key} sin versión coña`);
    }
});

test('say rellena variables y elige la voz', () => {
    assert.equal(say('footerFeeds', 'normal', { ok: 61, n: 63 }), '61/63 fuentes actualizadas');
    assert.equal(say('footerFeeds', 'cona', { ok: 61, n: 63, rest: 2 }), '61/63 fuentes actualizadas. Las otras 2, en el café');
    assert.equal(say('topSection', 'cona'), 'Lo que copia todo el mundo');
    assert.equal(say('footerFeedsOne', 'cona', { ok: 62, n: 63 }), '62/63 fuentes actualizadas. La otra, en el café');
    assert.equal(say('footerFeedsAll', 'cona', { ok: 63, n: 63 }), '63/63 fuentes actualizadas. Ni una en el café: sospechoso');
    assert.throws(() => say('noExiste', 'normal'), /noExiste/);
});

test('la intro de premios nombra la prensa de cada edición', () => {
    assert.match(say('awardsIntro', 'cona', { press: 'prensa internacional' }), /prensa internacional/);
});

test('scoreLine narra el reparto como un partido', () => {
    assert.equal(scoreLine({ left: 24, center: 32, right: 44 }), 'La derecha gana 44–24 en la liga de publicar. El centro pide el VAR');
    assert.equal(scoreLine({ left: 50, center: 20, right: 30 }), 'La izquierda gana 50–30 en la liga de publicar. El centro pide el VAR');
    assert.equal(scoreLine({ left: 40, center: 20, right: 40 }), 'Empate técnico en la liga de publicar. Nadie pide el VAR');
});
