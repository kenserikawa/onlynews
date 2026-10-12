// Elección determinista: mismos datos → mismos chistes, sin aleatoriedad.
export function hashString(text) {
    let h = 0x811c9dc5;
    for (const char of String(text)) {
        h ^= char.codePointAt(0);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

export function pick(options, seed) {
    return options[hashString(seed) % options.length];
}
