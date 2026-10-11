// Agrupa artículos de un mismo mercado en historias.
// TF-IDF sobre raíces del título (peso doble) + entradilla, similitud coseno y un agrupado
// aglomerativo por average-link: se recorren las parejas de mayor a menor similitud y
// dos grupos se unen solo si la similitud media entre todos sus miembros supera el umbral.
import { stemTokens } from './text.js';

function vectorize(docs) {
    const df = new Map();
    for (const doc of docs) for (const word of new Set(doc)) df.set(word, (df.get(word) ?? 0) + 1);
    const n = docs.length;
    return docs.map(doc => {
        const tf = new Map();
        for (const word of doc) tf.set(word, (tf.get(word) ?? 0) + 1);
        const vector = new Map();
        let norm = 0;
        for (const [word, count] of tf) {
            const weight = count * (Math.log((n + 1) / (df.get(word) + 1)) + 1);
            vector.set(word, weight);
            norm += weight * weight;
        }
        norm = Math.sqrt(norm) || 1;
        for (const [word, weight] of vector) vector.set(word, weight / norm);
        return vector;
    });
}

function pairSimilarities(vectors) {
    const n = vectors.length;
    const index = new Map();
    vectors.forEach((vector, i) => {
        for (const word of vector.keys()) {
            if (!index.has(word)) index.set(word, []);
            index.get(word).push(i);
        }
    });
    const sims = new Map();
    for (let i = 0; i < n; i++) {
        const acc = new Map();
        for (const [word, weight] of vectors[i]) {
            for (const j of index.get(word)) {
                if (j > i) acc.set(j, (acc.get(j) ?? 0) + weight * vectors[j].get(word));
            }
        }
        for (const [j, sim] of acc) if (sim > 0) sims.set(i * n + j, sim);
    }
    return sims;
}

export function clusterArticles(articles, { lang, threshold = 0.32, maxSpanHours = 36, maxSize = 40 } = {}) {
    const items = [...articles].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const n = items.length;
    if (!n) return [];

    const docs = items.map(article => {
        const title = stemTokens(article.title, lang);
        return [...title, ...title, ...stemTokens(article.summary ?? '', lang)];
    });
    const sims = pairSimilarities(vectorize(docs));
    const sim = (i, j) => (i === j ? 1 : sims.get(i < j ? i * n + j : j * n + i) ?? 0);
    const time = items.map(article => Date.parse(article.publishedAt));
    const maxSpan = maxSpanHours * 3600e3;

    const clusters = items.map((_, i) => ({ members: [i], min: time[i], max: time[i] }));
    const owner = items.map((_, i) => i);
    const edges = [...sims]
        .filter(([, value]) => value >= threshold)
        .map(([key, value]) => [Math.floor(key / n), key % n, value])
        .sort((a, b) => b[2] - a[2] || a[0] - b[0] || a[1] - b[1]);

    for (const [i, j] of edges) {
        const a = owner[i];
        const b = owner[j];
        if (a === b) continue;
        const A = clusters[a];
        const B = clusters[b];
        if (A.members.length + B.members.length > maxSize) continue;
        if (Math.max(A.max, B.max) - Math.min(A.min, B.min) > maxSpan) continue;
        let total = 0;
        for (const x of A.members) for (const y of B.members) total += sim(x, y);
        if (total / (A.members.length * B.members.length) < threshold) continue;

        const [keep, drop] = a < b ? [a, b] : [b, a];
        const K = clusters[keep];
        const D = clusters[drop];
        K.members.push(...D.members);
        K.min = Math.min(K.min, D.min);
        K.max = Math.max(K.max, D.max);
        for (const member of D.members) owner[member] = keep;
        clusters[drop] = null;
    }

    return clusters.filter(Boolean).map(({ members }) => {
        const centrality = new Map(members.map(i => [
            i,
            members.length === 1 ? 1 : members.reduce((sum, j) => sum + (i === j ? 0 : sim(i, j)), 0) / (members.length - 1),
        ]));
        const ordered = [...members].sort((x, y) => centrality.get(y) - centrality.get(x) || time[y] - time[x] || x - y);
        return { articles: ordered.map(i => items[i]) };
    });
}
