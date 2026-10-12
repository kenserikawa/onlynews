// Textos de interfaz en dos voces. {variable} se rellena con say().
export const VOICE = {
    tagline: { normal: '', cona: 'Leemos la prensa para que tú no tengas que sufrirla' },
    monitor: { normal: 'Monitor · {market} · {n} medios', cona: 'Termómetro de crispación · {market}' },
    topSection: { normal: 'Más cubiertas', cona: 'Lo que copia todo el mundo' },
    moreSection: { normal: 'Más historias', cona: 'Relleno' },
    singles: { normal: 'Solo en un medio', cona: 'Exclusivas que no interesan a nadie' },
    blindspots: { normal: 'Blindspots', cona: 'Puntos ciegos (cada uno los suyos)' },
    blindspotsHint: { normal: 'Historias que cubre casi solo un lado.', cona: 'Lo que cada bando prefiere no ver.' },
    saved: { normal: 'Guardadas', cona: 'Para leer nunca' },
    savedEmpty: { normal: 'Guarda historias desde su ficha para leerlas luego.', cona: 'Guarda aquí lo que nunca vas a leer.' },
    footerFeeds: { normal: '{ok}/{n} fuentes actualizadas', cona: '{ok}/{n} fuentes actualizadas. Las otras {rest}, en el café' },
    searchEmpty: { normal: 'No hay historias que coincidan.', cona: 'Nada. Ni siquiera un clickbait.' },
    awardsTitle: { normal: 'Premios del día', cona: 'Premios del día' },
    awardsIntro: { normal: 'Rankings calculados con los titulares de hoy.', cona: 'La prensa española, evaluada con datos. Que no se enfade nadie: son sus propios titulares.' },
    awardsEmpty: { normal: 'Hoy no hay premios.', cona: 'Hoy la prensa se ha portado bien. Vuelva mañana.' },
    bingoTitle: { normal: 'Bingo del titular', cona: 'Bingo del titular' },
    bingoIntro: { normal: 'Clichés de hoy en los titulares.', cona: 'Un cartón de clichés que se marca solo. Gana el medio que antes cante línea.' },
    bingoEmpty: { normal: 'Ningún cliché hoy.', cona: 'Ni un cliché. Sospechoso.' },
    bingoLine: { normal: 'Línea: {source} a las {time}', cona: '¡LÍNEA! La cantó {source} a las {time}' },
};

export function say(key, mode, vars = {}) {
    const entry = VOICE[key];
    if (!entry) throw new Error(`Texto desconocido: ${key}`);
    const text = (mode === 'cona' && entry.cona) || entry.normal;
    return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

export function scoreLine({ left, right }) {
    if (left === right) return 'Empate técnico en la liga de publicar. Nadie pide el VAR';
    const [winner, a, b] = right > left ? ['La derecha', right, left] : ['La izquierda', left, right];
    return `${winner} gana ${a}–${b} en la liga de publicar. El centro pide el VAR`;
}
