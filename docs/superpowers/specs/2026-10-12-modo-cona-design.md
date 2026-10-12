# OnlyNews «modo coña»: diseño

Fecha: 2026-10-12 · Estado: pendiente de revisión

## 1. Objetivo

Añadir a OnlyNews un **modo satírico activable** al estilo El Mundo Today. No inventa noticias: narra
con retranca lo que los datos agregados dicen de cómo cubre la prensa cada historia.

- **Principio:** todo dato es real y verificable (cada chiste enlaza a los titulares reales que lo
  justifican). La diana es la prensa como ecosistema, nunca las personas ni las tragedias.
- **Tono:** retranca seca, impasible, sin tacos. El chiste está en el dato y en el giro final.
- **Alcance v1:** titulares meta (antetítulos), Premios del día, Bingo del titular, y voz y marca en coña.

### Criterios de éxito

1. Con el modo apagado, la web es idéntica a la actual: las baterías de pruebas existentes pasan sin cambios.
2. Con el modo activo, ninguna historia sensible (§3) recibe antetítulo, premio ni casilla de bingo.
3. Mismos datos → mismos chistes: sin aleatoriedad, estable al recargar.
4. Activar y desactivar el modo cambia la vista al instante, sin recargar.
5. Premios y bingo se pintan con datos reales, con contraste AA en claro y oscuro, en móvil y escritorio.

### Fuera de alcance (v1)

Generación con modelo de lenguaje (fase 2 vía `refine.js`), compartir imágenes de premios,
histórico de premios entre días, cambios en el pipeline.

## 2. Arquitectura

Todo se calcula **en el navegador** a partir de los JSON que ya genera el pipeline (`es.json`,
`intl.json`, `sources.json`). El pipeline no cambia. Así respeta los medios que el usuario oculta
y el cambio de modo es instantáneo.

Módulos nuevos en `site/js/satire/`, **puros y sin DOM** (se testean en Node, como `coverage.js`):

| Módulo | Interfaz | Responsabilidad |
|---|---|---|
| `guard.js` | `isSensitive(story): boolean` | Línea roja: historias con víctimas o sucesos. |
| `kickers.js` | `kickerFor(story, sourcesById): string \| null` | Antetítulo satírico de una historia. |
| `awards.js` | `awardsFor(stories, sourcesById): Award[]` | Premios del día. |
| `bingo.js` | `bingoFor(stories, sourcesById, date): Bingo` | Cartón de clichés del día. |
| `voice.js` | `VOICE: {key: {normal, cona}}`, `say(key, mode, vars)` | Textos de interfaz en las dos voces. |
| `pick.js` | `pick(options, seed): option` | Elección determinista por hash (reutiliza `hash` de FNV-1a). |

Tipos:

```
Award = { id, emoji, title, winner: string, figure: string, blurb: string,
          evidence: [{ sourceId, title, url }] }   // hasta 3 titulares reales
Bingo = { cells: [{ phrase, hit: null | { sourceId, title, url, publishedAt } }] (16, fila a fila),
          lines: [{ cells: [i…], sourceId, at }] }  // filas, columnas y diagonales completas
```

Estado y rutas (en `prefs.js` y `main.js`):

- `onlynews:satire` (`true|false`) en localStorage, con el mismo fallback en memoria que el resto.
- Rutas nuevas `#/{mercado}/premios` y `#/{mercado}/bingo`. Si se abren con el modo apagado, lo activan.
- Al cambiar de modo se vuelve a pintar la vista actual (misma ruta) sin recargar.

## 3. Línea roja: `isSensitive`

Una historia es sensible si **algún titular** de sus artículos (normalizado sin acentos y en minúsculas)
contiene alguna de estas raíces **al principio de una palabra** (prefijo):

`muert, muere, mueren, murio, fallec, asesin, apunal, mata a, matan a, homicid, feminicid, viol (violación/violada…),
abus, agresion sexual, atentado, terroris, naufrag, ahogad, accidente, siniestro, atropell (salvo «atropello» político, ver abajo),
victima, desaparecid, secuestr, tiroteo, herido, incendio, explosion, suicid, cadaver`

y estas **como palabra completa**: `bomba, bombas, disparo, disparos` (para que «bombazo», cliché del bingo, no cuente).

- Excepción explícita: «atropello» como metáfora política («el atropello de Feijóo») **no** es sensible
  si no aparecen otras raíces; «atropellado/atropella a» sí.
- Falsos positivos aceptados: preferimos dejar sin chiste una noticia neutra que bromear con una tragedia.
- Tests con casos reales: «Muere un joven apuñalado en Granada» → sensible; «Al menos 12 muertos en Riad»
  → sensible; «Sánchez pide frenar el atropello de Feijóo» → no.
- **Enfermedades** (decisión del 2026-10-12): también son sensibles las noticias sobre la salud de personas
  (enfermedades, diagnósticos, operaciones, hospitalizaciones, salud mental, brotes). «El Papa será operado de un
  nódulo» → sensible.
- La lista vigente (más amplia: ataques, guerras, catástrofes, rescates; castellano e inglés; también entradillas)
  está en `site/js/satire/guard.js`. La sensibilidad se calcula con todos los medios, antes de aplicar los ocultos.

## 4. Titulares meta (`kickerFor`)

Se evalúan en orden; gana la primera regla que encaja. Si ninguna encaja → `null`. Historias sensibles → `null`.
Cada regla tiene 2–3 variantes; se elige con `pick(variantes, story.id)`. `{lado}` usa «la izquierda»,
«el centro», «la derecha».

| # | Regla | Condición | Variantes (ejemplos) |
|---|---|---|---|
| 1 | Blindspot | `story.blindspot` | «Solo se enteran {n} medios de {lado}. {Otro lado}, de puente» · «{Otro lado} sigue sin confirmar que esto haya pasado» |
| 2 | Copia y pega | ≥3 medios con el mismo titular normalizado | «{n} medios llegan a la misma frase a la vez. La nota de agencia, orgullosa» · «Récord de originalidad: {n} titulares idénticos» |
| 3 | Guerra de palabras | ≥2 términos distintos de un mismo grupo del diccionario en los titulares | «Es {t1}, {t2} o {t3}, según a quién preguntes» |
| 4 | Consenso | `sourceCount ≥ 6` y los tres lados ≥1 | «Milagro: {n} medios de izquierda, centro y derecha se ponen de acuerdo en algo» · «Se suspende la polarización durante una noticia» |
| 5 | Lado mayoritario | un lado ≥75 % de los medios con orientación, `sourceCount ≥ 3`, no blindspot | «{Lado}, muy pendiente. {Otro lado}, mirando el móvil» |
| 6 | Exclusiva solitaria | `sourceCount === 1` | «Exclusiva de {medio}: el resto de la prensa ha decidido que esto no ha pasado» · «{medio} se entera; los demás, no» |

Diccionario de guerra de palabras (grupos de términos rivales, sin acentos):

- tregua · alto el fuego · pacto · acuerdo · armisticio
- detenido · arrestado · capturado
- dimite · cesa · sale · abandona · destituido
- recorte · ajuste · reforma · tijeretazo
- okupa · ocupacion · allanamiento
- inmigrante · migrante · ilegal · irregular
- subida · aumento · incremento · sablazo
- crisis · tension · choque · guerra

Los términos se muestran entrecomillados tal como aparecen («tregua», «alto el fuego»), máximo 3.

## 5. Premios del día (`awardsFor`)

Sobre las historias del mercado, **excluyendo las sensibles** y los medios ocultos. Los premios por
porcentaje exigen **≥10 artículos** del medio. Empate → gana el de más artículos; si persiste, orden alfabético de id.
Cada premio adjunta hasta 3 titulares reales que lo justifican. Un premio sin candidato válido no aparece.

| id | Premio | Cálculo | Texto |
|---|---|---|---|
| `adjetivometro` | 🏆 Adjetivómetro | % de titulares con lenguaje de combate | «{medio}: {x} % de titulares en pie de guerra» |
| `clickbait` | 🎣 Clickbaitómetro | % de titulares que son pregunta o empiezan por «así», «esto es lo que», «lo que se sabe», «por qué», «qué es», «quién es», «las claves» | «{medio} pregunta, tú haces clic» |
| `solo-yo` | 🕵️ Solo yo me he enterado | nº de historias con `sourceCount === 1` | «{n} exclusivas que no quiso nadie más» |
| `copia-pega` | 📋 Copia y pega de oro | historia con más titulares idénticos (≥3) | «{n} medios, una sola frase» |
| `grito` | 📢 Grito del día | % de titulares con «¡», «!» o una palabra de ≥4 letras en MAYÚSCULAS (no siglas conocidas de ≤5) | «{medio} no habla: grita» |
| `consenso` | 🤝 Consenso del día | historia con más medios y los tres lados presentes | «Lo único en lo que hoy está de acuerdo la prensa» |

Lenguaje de combate (raíces): `atropello, nerviosismo, dinamita, estalla, zasca, escandal, bochorn, humill,
demoledor, brutal, polemic, indign, vergonz, furia, desat, arrasa, hunde, caos, revienta, fulmina, aplasta, ridicul, golpe`.

## 6. Bingo del titular (`bingoFor`)

- Bolsa fija de 24 clichés (sin acentos al comparar): «última hora», «en directo», «lo que se sabe», «las claves»,
  «zasca», «estalla», «polémica», «vídeo», «viral», «insólito», «así es», «esto es lo que», «atención»,
  «sorpresa», «histórico», «brutal», «revienta», «arrasa», «hilo», «exclusiva», «confirmado», «alerta», «bombazo», «por qué».
- Cartón del día: 16 frases elegidas de forma determinista con la fecha (`YYYY-MM-DD` del `generatedAt`).
- Cada casilla se marca con el **primer** artículo (menor `publishedAt`) no sensible cuyo titular contiene la frase.
- Líneas: filas, columnas y las dos diagonales completas; cada línea indica el medio de su casilla marcada más tarde
  («la cantó») y la hora.

## 7. Voz y marca (`voice.js`)

Cada texto de interfaz existe en `normal` y `cona`. Claves mínimas:

| Clave | Normal | Coña |
|---|---|---|
| `tagline` | — | «Leemos la prensa para que tú no tengas que sufrirla» |
| `monitor` | «Monitor · {mercado} · {n} medios» | «Termómetro de crispación · {mercado}» |
| `monitorScore` | IZQ/CENTRO/DER % | «La {ganador} gana {a}–{b} en la liga de publicar. El centro pide el VAR» (si izquierda y derecha empatan: «Empate técnico en la liga de publicar. Nadie pide el VAR») |
| `topSection` | «Más cubiertas» | «Lo que copia todo el mundo» |
| `moreSection` | «Más historias» | «Relleno» |
| `singles` | «Solo en un medio» | «Exclusivas que no interesan a nadie» |
| `blindspots` | «Blindspots» | «Puntos ciegos (cada uno los suyos)» |
| `saved` | «Guardadas» | «Para leer nunca» |
| `footerFeeds` | «{ok}/{n} fuentes actualizadas» | «{ok}/{n} fuentes actualizadas. Las otras {n-ok}, en el café» |
| `searchEmpty` | «No hay historias que coincidan.» | «Nada. Ni siquiera un clickbait.» |
| `awardsEmpty` | — | «Hoy la prensa se ha portado bien. Vuelva mañana.» |
| `bingoEmpty` | — | «Ni un cliché. Sospechoso.» |

Marca: con el modo activo, el logo lleva una pegatina amarilla «COÑA» ladeada y el lema aparece bajo la cabecera.

## 8. Interfaz

- **Interruptor** en la cabecera, junto a tema y ajustes: botón con texto «COÑA», `aria-pressed`;
  apagado en gris, encendido en amarillo y ladeado.
- **Antetítulo**: banda amarilla en mono mayúsculas encima del título, en portada (historia principal,
  tarjetas, filas), búsqueda (todas las plantillas) y ficha. Va dentro del enlace, antes del título.
- **Navegación**: con el modo activo, la franja monitor y el lateral de la portada enlazan a Premios y Bingo.
- **Premios**: página con una tarjeta por premio (emoji, título, ganador, cifra, texto y titulares de prueba enlazados).
- **Bingo**: cuadrícula 4×4 también en móvil, con texto compacto; casillas marcadas en amarillo con el
  medio y la hora; líneas destacadas y un aviso «¡LÍNEA!» por cada una.
- La ficha de historia no cambia salvo el antetítulo.

## 9. Pruebas

- **Unitarias (Node)**: `guard` (sucesos reales frente a metáforas), `kickers` (cada regla, prioridad,
  determinismo, nunca en sensibles), `awards` (mínimo de muestra, empates, evidencias), `bingo` (cartón
  estable por fecha, primer medio en cantar, detección de líneas), `voice` (toda clave normal tiene versión coña),
  `pick` (determinista y repartido).
- **Navegador**: activar/desactivar sin recargar; rutas compartidas activan el modo; premios y bingo con datos
  reales; ningún antetítulo sobre historia sensible; sin scroll horizontal; contraste AA en claro y oscuro.
- **Regresión**: todas las baterías actuales en verde con el modo apagado.
