# OnlyNews «grounded»: diseño

Fecha: 2026-10-12 · Estado: pendiente de revisión

## 1. Objetivo

Convertir la versión estática de OnlyNews (`site/`, hoy una lista de titulares de NewsAPI) en un agregador
al estilo Ground News:

- **Para qué**: (A) pieza de portfolio que se vea moderna y (B) herramienta de uso diario real.
- **Qué aporta**: agrupa la misma historia contada por muchos medios, muestra la cobertura por orientación
  (izquierda/centro/derecha), señala los *blindspots* y permite comparar cómo titula cada medio.
- **Mercados**: España (por defecto) e Internacional (en inglés), separados; nunca se agrupa entre idiomas.

### Criterios de éxito

1. En una ejecución normal, la portada de España muestra ≥ 15 historias con ≥ 3 medios.
2. Un muestreo manual de 20 historias multi-medio no tiene más de 2 agrupaciones erróneas (artículos de
   historias distintas mezclados).
3. La web funciona sin servidor en GitHub Pages, se actualiza sola cada hora y no necesita claves.
4. Se usa cómodamente en móvil y en escritorio, en modo claro y oscuro.

### Fuera de alcance (v1)

Login o cuentas, histórico más allá de lo que traen los feeds, seguir temas, notificaciones, resúmenes
generados, agrupación entre idiomas, la app PHP/Symfony (queda como legado sin cambios).

## 2. Arquitectura

```
GitHub Action (cron horario + push a master + manual)
  └─ node --test pipeline/        (si falla, no se despliega)
  └─ node pipeline/build.js
       sources.json → fetch → parse → cluster → refine → score → site/data/*.json
  └─ deploy site/ a GitHub Pages
```

Node 22, ESM, una sola dependencia de producción: `fast-xml-parser`. NewsAPI y `scripts/fetch-news.sh`
desaparecen.

### Módulos (`pipeline/`)

| Fichero | Responsabilidad | Interfaz |
|---|---|---|
| `sources.json` | Catálogo de medios | `[{id, name, market: "es"\|"intl", feeds: [url], bias: -2..2\|null, site}]` |
| `fetch.js` | Descarga feeds en paralelo (concurrencia 8, timeout 10 s, User-Agent propio) | `fetchFeeds(sources) → [{sourceId, url, ok, xml?, error?}]` |
| `parse.js` | RSS 2.0 / Atom / RDF → artículos normalizados | `parseFeed(xml, source) → Article[]` |
| `cluster.js` | Agrupa artículos de un mercado en historias | `clusterArticles(articles, opts) → Cluster[]` |
| `refine.js` | Punto de extensión para un modelo (hoy identidad) | `async refine(clusters, ctx) → clusters` |
| `score.js` | Cobertura, blindspot, relevancia, ids | `scoreStories(clusters, sourcesById, now) → Story[]` |
| `build.js` | Orquesta y escribe `site/data/` | CLI: `node pipeline/build.js [outDir]` |
| `text.js` | Normalización y tokenización compartida | `tokens(text, lang) → string[]` |

`Article = {id, url, title, summary, image, publishedAt, sourceId, market}`

- `id` = hash corto de la URL normalizada (sin `utm_*`, sin fragmento).
- `summary` = descripción sin HTML, recortada a 300 caracteres.
- `image` = `media:content`, `media:thumbnail`, `enclosure` de imagen o primera `<img>` de la descripción.
- `publishedAt` en ISO 8601; si falta o no se puede leer, se usa la hora de descarga.
- Se descartan los artículos de más de 48 h o sin título, y los duplicados por URL.

### Agrupado (`cluster.js`)

1. **Texto por artículo** = título ×2 + summary.
2. **Normalización**: minúsculas, sin acentos ni puntuación, palabras vacías ES/EN fuera, tokens < 3
   caracteres fuera salvo números. Sin *stemming* en v1; se mide y se añade un sufijo simple si hace falta.
3. **Vectores** TF-IDF por mercado y similitud coseno.
4. **Agrupado aglomerativo** por *average-link*: se unen grupos si la similitud media ≥ `threshold`
   (inicial 0.32, ajustable con los tests) y la diferencia de fechas ≤ 36 h.
5. **Restricciones**:
   - Dos artículos del mismo medio pueden estar en la misma historia.
   - Una historia no puede crecer más allá de 40 artículos.
   - El resultado es determinista: orden estable por `id`.

### Extensión para el modelo (`refine.js`)

- **Cuándo se activa**: solo si existe `REFINE_ENDPOINT` (API compatible con OpenAI: vLLM, Ollama,
  llama.cpp server), con `REFINE_MODEL` y `REFINE_API_KEY` opcionales.
- **Qué hará**: fusionar o separar grupos dudosos y rellenar `story.title`/`story.summary` neutrales.
- **v1**: solo define la interfaz, el *no-op* y un test que garantiza que, sin endpoint, devuelve lo mismo.
- **Si falla el modelo**: se registra y se continúa con los grupos sin refinar. Nunca rompe el build.

### Puntuación (`score.js`)

- **Lado de cada medio**: `left` si bias ≤ −1, `center` si 0, `right` si ≥ +1, `unrated` si null.
- **`coverage`**: cuenta **medios distintos** por lado, no artículos.
- **`blindspot`**:
  - `"left"` si `sourceCount ≥ 3` y la izquierda aporta ≥ 80 % de los medios con orientación y ningún
    medio de la derecha la cubre; `"right"` en el caso simétrico.
  - El centro no cuenta como lado, pero sí entra en el denominador.
- **`title`/`image` de la historia**: los del artículo con mayor similitud media al resto (el más
  representativo); la imagen es la primera disponible siguiendo ese orden.
- **`id`**: `s-` + hash de la URL del artículo más antiguo. Es estable mientras ese artículo siga en la historia.
- **Relevancia**: `sourceCount × decay(lastSeen)`, con vida media de 12 h. Las historias se ordenan por relevancia.

### Salida (`site/data/`)

- `es.json`, `intl.json`: `{market, generatedAt, stories: Story[]}`.
- `Story = {id, title, summary: null, image, firstSeen, lastSeen, coverage: {left, center, right, unrated},
  sourceCount, blindspot: null|"left"|"right", articles: [{sourceId, title, summary, url, image, publishedAt}]}`.
- `sources.json`: catálogo público (sin URLs de feed).
- `meta.json`: `{generatedAt, feeds: [{sourceId, ok, count, error?}]}`.

### Errores del pipeline

- Un feed que falla (red, HTTP ≠ 200, XML inválido, 0 artículos) se registra en `meta.json` y se sigue.
- Si fallan más del 50 % de los feeds de un mercado, `build.js` sale con código ≠ 0. No se despliega y
  sigue publicada la versión anterior.

## 3. Catálogo inicial de medios y sesgo (para revisar)

Clasificación **orientativa**: la línea editorial tal como suele describirse públicamente. En el
internacional, apoyada en AllSides / Ad Fontes. Se valida y ajusta antes de publicar. Los feeds concretos
se verifican durante la implementación; si un medio no ofrece RSS usable, se cae de la lista.

**España**

| Medio | Bias |
|---|---|
| Público, elDiario.es, infoLibre, El Salto | −2 |
| El País, Cadena SER, El Periódico | −1 |
| EFE, Europa Press, RTVE, 20minutos, La Vanguardia, Cinco Días | 0 |
| El Mundo, El Confidencial, El Español, Vozpópuli, Expansión | +1 |
| ABC, La Razón, El Debate, The Objective, Libertad Digital, OKDiario | +2 |
| Newtral, Maldita (verificadores) | null |

**Internacional**

| Medio | Bias |
|---|---|
| — | −2 (ninguno con RSS fiable en v1) |
| The Guardian, NYT, CNN, NPR, The Independent, Al Jazeera | −1 |
| BBC, Reuters\*, AP\*, Politico, The Hill, DW, France 24 | 0 |
| WSJ, The Telegraph | +1 |
| Fox News, New York Post, Daily Mail, Washington Examiner, Breitbart | +2 |

\* Reuters y AP no publican RSS oficial; solo entran si se encuentra una alternativa estable.

La web incluye una página «Cómo clasificamos» con esta tabla y el aviso de que es orientativa.

## 4. Interfaz (`site/`)

**Stack**: HTML + CSS moderno (variables, grid, `prefers-color-scheme`) + módulos ES. Sin compilación,
sin jQuery, Bootstrap ni d3. Fuentes: Newsreader (titulares) e Inter (interfaz), de Google Fonts.

### Estilo

- **Tono**: editorial y sobrio. Se mantiene la marca ONLY|NEWS; el rojo de marca pasa a ser solo acento.
- **Colores de sesgo**: izquierda azul, centro gris, derecha rojo apagado (distinto del rojo de marca),
  sin clasificar en gris claro. Contraste AA en ambos temas.
- **Accesibilidad**: la barra de cobertura siempre muestra números (`L 4 · C 3 · D 1`) y tiene
  `aria-label`; no depende solo del color.
- **Fuera**: fondo animado, temblor y desenfoque. Las transiciones respetan `prefers-reduced-motion`.

### Rutas (por hash)

| Ruta | Vista |
|---|---|
| `#/es`, `#/intl` | Portada del mercado (`#/` redirige al último mercado usado, por defecto `es`) |
| `#/es/s-<id>` | Ficha de historia |
| `#/es/buscar?q=` | Resultados de búsqueda |
| `#/es/guardadas` | Historias guardadas |
| `#/fuentes` | Cómo clasificamos + lista de medios con opción de ocultarlos |

### Portada

1. **Cabecera**: logo, pestañas España/Internacional, buscador, tema y ajustes.
2. **Historia principal**: la de mayor relevancia con ≥ 3 medios, con imagen grande, titular, barra,
   nº de medios y antigüedad.
3. **Rejilla**: las siguientes ~6 historias multi-medio, en tarjetas con imagen.
4. **Más historias**: lista compacta con barra.
5. **Solo en un medio**: lista mínima, colapsada por defecto.
6. **Lateral** (debajo en móvil): Blindspots (izq./der.) y Guardadas.
7. **Pie**: «N/M fuentes actualizadas · hace X min» y enlace a «Cómo clasificamos».

### Ficha de historia

- Titular, barra grande, «Cubierta por» (chips con el nombre de cada medio) y antigüedad.
- Columnas Izquierda | Centro | Derecha (+ «Sin clasificar» si hay). Cada artículo muestra: medio,
  titular, entradilla, hora y enlace externo (`rel="noopener"`). En móvil, las columnas pasan a pestañas.
- Si un lado está vacío: «Ningún medio de este lado ha cubierto la historia».
- Acciones: guardar y copiar enlace (a la ficha).

### Personalización (localStorage, con try/catch)

- `onlynews:saved`: ids guardados con un *snapshot* mínimo (título, fecha), para mostrarlos aunque la
  historia ya no esté en los datos.
- `onlynews:hiddenSources`: medios ocultos. Se excluyen al pintar; la cobertura se recalcula en cliente.
- `onlynews:theme` (`auto|light|dark`) y `onlynews:market`.
- Si el almacenamiento falla, todo funciona sin recordar.

### Búsqueda

Filtra las historias del mercado actual por título de historia, titulares de sus artículos y nombre de
medio, sin distinguir acentos. Aviso fijo: «Busca en las historias de las últimas 48 h».

### Seguridad

Todo contenido de feeds se inserta con `textContent`. Las URLs de artículo e imagen se validan
(`http:`/`https:`). Sin `innerHTML` con datos externos.

## 5. Pruebas

- **`node --test pipeline/`**:
  - `parse`: fixtures reales guardados (RSS 2.0, Atom, `media:*`, `enclosure`, entidades, CDATA, fechas
    inválidas).
  - `text`: normalización y palabras vacías.
  - `cluster`: conjuntos etiquetados a mano de mismas historias y de falsos amigos («Gobierno», «Sánchez»,
    «Trump»), determinismo.
  - `score`: cobertura por medio, blindspots en los bordes (79 %/80 %, centro), ids estables, orden.
  - `refine`: no-op sin endpoint.
- **Calibración**: script `pipeline/tools/inspect.js` que imprime las historias de una ejecución real para
  revisar a mano el criterio de éxito 2 y ajustar el umbral.
- **Web (Playwright, desde el scratchpad, no en el repo)**: contra JSON de ejemplo, portada, ficha, cambio
  de mercado, búsqueda, guardar, ocultar medio y tema, a 1280 px y 390 px, sin errores de consola.

## 6. Despliegue

- **`pages.yml`**: cron `17 * * * *`, `actions/setup-node` con Node 22, `npm ci`, `node --test`,
  `node pipeline/build.js site/data`, subida y despliegue.
- **Limpieza**: se elimina `scripts/fetch-news.sh` y el paso de NewsAPI. El secret `NEWS_API_KEY` deja
  de usarse y se puede borrar.
- **Ficheros**: `package.json` en la raíz solo para el pipeline (convive con el `composer.json` de la app
  PHP); `node_modules/` va a `.gitignore`.
- **README**: se actualiza la sección de la versión estática.
