import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, normalizeUrl } from '../parse.js';

const now = new Date('2026-10-11T20:00:00Z');
const source = { id: 'medio', market: 'es', site: 'https://medio.es' };

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel><title>Medio</title><link>https://medio.es</link>
<item>
  <title><![CDATA[El Gobierno aprueba la ley &amp; más]]></title>
  <link>https://medio.es/noticia-1?utm_source=rss&amp;id=7#arriba</link>
  <description><![CDATA[<p>Primer <b>párrafo</b> &quot;citado&quot;</p><img src="https://img.medio.es/inline.jpg">]]></description>
  <pubDate>Sun, 11 Oct 2026 20:00:00 +0200</pubDate>
  <media:content url="https://img.medio.es/1.jpg" type="image/jpeg" />
</item>
<item>
  <title>Sin imagen en media pero con img en el cuerpo</title>
  <guid isPermaLink="true">https://medio.es/noticia-2</guid>
  <description>&lt;p&gt;Texto &lt;img src="https://img.medio.es/2.jpg"&gt;&lt;/p&gt;</description>
  <dc:date>2026-10-11T19:00:00Z</dc:date>
</item>
<item><title>Vieja</title><link>https://medio.es/vieja</link><pubDate>Thu, 08 Oct 2026 10:00:00 GMT</pubDate></item>
<item><title></title><link>https://medio.es/sin-titulo</link></item>
<item><title>Duplicada</title><link>https://medio.es/noticia-1?utm_medium=x&amp;id=7</link></item>
<item><title>Del futuro</title><link>https://medio.es/futuro</link><pubDate>Mon, 12 Oct 2026 23:00:00 GMT</pubDate>
  <enclosure url="https://img.medio.es/f.png" type="image/png" length="1"/></item>
<item><title>Relativa</title><link>/relativa</link><pubDate>Sat, 10 Oct 2026 09:00:00 EDT</pubDate></item>
<item><title>Sin enlace</title><guid isPermaLink="false">abc-123</guid></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
<entry>
  <title type="html">Titular &lt;em&gt;atom&lt;/em&gt;</title>
  <link rel="self" href="https://atom.es/self"/><link rel="alternate" href="https://atom.es/a1"/>
  <updated>2026-10-11T18:30:00Z</updated>
  <summary type="html">&lt;p&gt;Resumen atom&lt;/p&gt;</summary>
</entry>
</feed>`;

const RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel><title>DW</title></channel>
<item><title>RDF item</title><link>https://rdf.de/1</link><dc:date>2026-10-11T17:00:00Z</dc:date><description>Desc</description></item>
</rdf:RDF>`;

test('RSS 2.0: limpia títulos, URLs, entradillas, imágenes y fechas', () => {
    const articles = parseFeed(RSS, source, { now });
    assert.deepEqual(articles.map(a => a.url), [
        'https://medio.es/noticia-1?id=7',
        'https://medio.es/noticia-2',
        'https://medio.es/futuro',
        'https://medio.es/relativa',
    ]);
    const [first, second, future, relative] = articles;
    assert.equal(first.title, 'El Gobierno aprueba la ley & más');
    assert.equal(first.summary, 'Primer párrafo "citado"');
    assert.equal(first.image, 'https://img.medio.es/1.jpg');
    assert.equal(first.publishedAt, '2026-10-11T18:00:00.000Z');
    assert.equal(first.sourceId, 'medio');
    assert.equal(first.market, 'es');
    assert.match(first.id, /^a-[0-9a-z]+$/);
    assert.equal(second.summary, 'Texto');
    assert.equal(second.image, 'https://img.medio.es/2.jpg');
    assert.equal(future.publishedAt, now.toISOString(), 'las fechas futuras se recortan a ahora');
    assert.equal(future.image, 'https://img.medio.es/f.png');
    assert.equal(relative.publishedAt, '2026-10-10T13:00:00.000Z', 'acepta zonas como EDT');
});

test('Atom: usa el enlace alternate y limpia title/summary con HTML', () => {
    const [entry] = parseFeed(ATOM, source, { now });
    assert.equal(entry.url, 'https://atom.es/a1');
    assert.equal(entry.title, 'Titular atom');
    assert.equal(entry.summary, 'Resumen atom');
    assert.equal(entry.image, null);
});

test('RDF (RSS 1.0) se reconoce', () => {
    const [item] = parseFeed(RDF, source, { now });
    assert.equal(item.url, 'https://rdf.de/1');
    assert.equal(item.summary, 'Desc');
});

test('una página HTML o texto basura lanza error de formato', () => {
    assert.throws(() => parseFeed('<!DOCTYPE html><html><body>Just a moment...</body></html>', source, { now }), /no reconocido/);
    assert.throws(() => parseFeed('esto no es xml', source, { now }), /no reconocido|XML inválido/);
});

test('un feed válido sin items devuelve lista vacía', () => {
    assert.deepEqual(parseFeed('<rss><channel><title>x</title></channel></rss>', source, { now }), []);
});

test('entradillas largas se recortan a 300 caracteres', () => {
    const xml = `<rss><channel><item><title>T</title><link>https://m.es/l</link><description>${'palabra '.repeat(80)}</description></item></channel></rss>`;
    const [item] = parseFeed(xml, source, { now });
    assert.ok(item.summary.length <= 301);
    assert.ok(item.summary.endsWith('…'));
});

test('normalizeUrl quita tracking y fragmento, resuelve relativas y rechaza otros protocolos', () => {
    assert.equal(normalizeUrl('https://a.es/x?utm_campaign=1&fbclid=2&id=3#top'), 'https://a.es/x?id=3');
    assert.equal(normalizeUrl('/y', 'https://a.es'), 'https://a.es/y');
    assert.equal(normalizeUrl('javascript:alert(1)'), null);
    assert.equal(normalizeUrl(''), null);
    assert.equal(normalizeUrl('abc-123'), null);
});

test('feeds grandes con más de 1000 entidades estándar se leen enteros', () => {
    const items = Array.from({ length: 300 }, (_, i) =>
        `<item><title>&quot;Uno&quot; &amp; &quot;dos&quot; ${i}</title><link>https://m.es/${i}?a=1&amp;b=2</link></item>`).join('');
    const articles = parseFeed(`<rss><channel>${items}</channel></rss>`, source, { now });
    assert.equal(articles.length, 300);
    assert.equal(articles[0].title, '"Uno" & "dos" 0');
    assert.equal(articles[0].url, 'https://m.es/0?a=1&b=2');
});

test('no expande entidades anidadas del DOCTYPE (ataque billion laughs)', () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;"><!ENTITY d "&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;"><!ENTITY e "&d;&d;&d;&d;&d;&d;&d;&d;&d;&d;"><!ENTITY f "&e;&e;&e;&e;&e;&e;&e;&e;&e;&e;">]>
<rss><channel><item><title>&f;&f;&f;&f;&f;&f;&f;&f;&f;&f;</title><link>https://m.es/x</link></item></channel></rss>`;
    let titleLength = 0;
    try {
        titleLength = parseFeed(bomb, source, { now })[0]?.title.length ?? 0;
    } catch {
        return; // rechazarlo también es correcto
    }
    assert.ok(titleLength < 1000, `título expandido a ${titleLength} caracteres`);
});

test('entiende zonas horarias europeas abreviadas (CEST, CET, BST, WEST)', () => {
    const xml = `<rss><channel>
<item><title>A</title><link>https://m.es/a</link><pubDate>Sun, 11 Oct 2026 19:30:00 CEST</pubDate></item>
<item><title>B</title><link>https://m.es/b</link><pubDate>Sun, 11 Oct 2026 18:30:00 CET</pubDate></item>
<item><title>C</title><link>https://m.es/c</link><pubDate>Sun, 11 Oct 2026 18:30:00 BST</pubDate></item>
<item><title>D</title><link>https://m.es/d</link><pubDate>Sun, 11 Oct 2026 18:30:00 WEST</pubDate></item>
<item><title>E</title><link>https://m.es/e</link><pubDate>no es una fecha</pubDate></item>
</channel></rss>`;
    const dates = parseFeed(xml, source, { now }).map(a => a.publishedAt);
    assert.deepEqual(dates, [
        '2026-10-11T17:30:00.000Z',
        '2026-10-11T17:30:00.000Z',
        '2026-10-11T17:30:00.000Z',
        '2026-10-11T17:30:00.000Z',
        now.toISOString(),
    ]);
});

test('un guid que no es una URL absoluta no se convierte en enlace', () => {
    const xml = `<rss><channel>
<item><title>Solo guid numérico</title><guid>12345</guid></item>
<item><title>Guid URL</title><guid>https://m.es/guid-url</guid></item>
</channel></rss>`;
    assert.deepEqual(parseFeed(xml, source, { now }).map(a => a.url), ['https://m.es/guid-url']);
});
