// Sistema de plantillas para listas de resultados: reparte las historias, en su orden,
// en bloques con distintas formas de presentación. Sin DOM: se testea en Node.
//
//   hero  → 1 grande (siempre con foto) + hasta 3 pequeñas al lado (con o sin foto)
//   pair  → 2 en la misma fila, ambas con foto: se adelantan las siguientes que la tengan
//   row   → 1 por fila (todo lo que sobra tras recorrer el patrón, en su orden)

export const DEFAULT_PATTERN = ['hero', 'pair', 'pair'];
const HERO_SIDE = 3;

export function composeBlocks(stories, pattern = DEFAULT_PATTERN) {
    const rest = [...stories];
    const blocks = [];
    for (const template of pattern) {
        if (rest.length < 2) break;
        if (template === 'hero') {
            const leadIndex = rest.findIndex(story => story.image);
            if (leadIndex === -1) continue;
            const [lead] = rest.splice(leadIndex, 1);
            blocks.push({ template: 'hero', items: [lead, ...rest.splice(0, HERO_SIDE)] });
        } else if (template === 'pair') {
            const withPhoto = rest.filter(story => story.image).slice(0, 2);
            if (withPhoto.length < 2) continue;
            for (const story of withPhoto) rest.splice(rest.indexOf(story), 1);
            blocks.push({ template: 'pair', items: withPhoto });
        }
    }
    for (const story of rest) blocks.push({ template: 'row', items: [story] });
    return blocks;
}
