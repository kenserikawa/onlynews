import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refine } from '../refine.js';

test('sin REFINE_ENDPOINT devuelve los mismos grupos', async () => {
    const clusters = [{ articles: [] }];
    assert.equal(await refine(clusters, { env: {} }), clusters);
});

test('con REFINE_ENDPOINT avisa de que aún no está implementado y no cambia nada', async () => {
    const clusters = [{ articles: [] }];
    const warnings = [];
    const out = await refine(clusters, { env: { REFINE_ENDPOINT: 'http://localhost:8000/v1' }, log: { warn: m => warnings.push(m) } });
    assert.equal(out, clusters);
    assert.equal(warnings.length, 1);
});
