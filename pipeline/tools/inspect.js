// Imprime las historias de una ejecución para revisarlas a mano y calibrar el agrupado.
// Uso: node pipeline/tools/inspect.js [es|intl] [site/data]
import { readFile } from 'node:fs/promises';

const market = process.argv[2] ?? 'es';
const dir = process.argv[3] ?? 'site/data';
const data = JSON.parse(await readFile(`${dir}/${market}.json`, 'utf8'));
const multi = data.stories.filter(story => story.sourceCount > 1);

console.log(`${market}: ${data.stories.length} historias · ${multi.length} con ≥2 medios · ${data.stories.filter(s => s.sourceCount >= 3).length} con ≥3`);
for (const story of multi) {
    const { left, center, right, unrated } = story.coverage;
    const blind = story.blindspot ? `  BLINDSPOT ${story.blindspot}` : '';
    console.log(`\n[${story.sourceCount}] ${story.title}  (I${left} C${center} D${right} ?${unrated})${blind}`);
    for (const article of story.articles) console.log(`    - ${article.sourceId.padEnd(16)} ${article.title}`);
}
