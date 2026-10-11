// Punto de extensión para un modelo de lenguaje pequeño (servido con una API compatible
// con OpenAI: vLLM, Ollama, llama.cpp). Su trabajo futuro será fusionar o separar grupos
// dudosos y escribir un titular y un resumen neutrales. En v1 no cambia nada.
//
// Variables: REFINE_ENDPOINT (activa el paso), REFINE_MODEL, REFINE_API_KEY.
export async function refine(clusters, { env = process.env, log = console, market = '' } = {}) {
    if (!env.REFINE_ENDPOINT) return clusters;
    log.warn(`REFINE_ENDPOINT definido, pero el refinado aún no está implementado; ${market || 'mercado'} sin refinar.`);
    return clusters;
}
