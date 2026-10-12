// Preferencias del lector en localStorage. Si el almacenamiento no está disponible
// (modo privado, bloqueado), se guardan en memoria y la web funciona igual sin recordar.
const PREFIX = 'onlynews:';
const memory = new Map();

function read(key, fallback) {
    try {
        const raw = localStorage.getItem(PREFIX + key);
        if (raw != null) return JSON.parse(raw);
    } catch { /* se usa la copia en memoria */ }
    return memory.has(key) ? memory.get(key) : fallback;
}

function write(key, value) {
    memory.set(key, value);
    try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch { /* sin almacenamiento persistente */ }
}

export const prefs = {
    get theme() {
        const theme = read('theme', 'auto');
        return ['auto', 'light', 'dark'].includes(theme) ? theme : 'auto';
    },
    set theme(value) { write('theme', value); },

    get satire() { return read('satire', false) === true; },
    set satire(value) { write('satire', Boolean(value)); },

    get market() { return read('market', 'es'); },
    set market(value) { write('market', value); },

    saved() {
        const saved = read('saved', {});
        return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    },
    isSaved(id) { return Object.hasOwn(this.saved(), id); },
    toggleSaved(story, market) {
        const saved = this.saved();
        if (Object.hasOwn(saved, story.id)) delete saved[story.id];
        else saved[story.id] = { title: story.title, market, savedAt: new Date().toISOString() };
        write('saved', saved);
        return Object.hasOwn(saved, story.id);
    },
    removeSaved(id) {
        const saved = this.saved();
        delete saved[id];
        write('saved', saved);
    },

    hiddenSources() {
        const hidden = read('hiddenSources', []);
        return new Set(Array.isArray(hidden) ? hidden : []);
    },
    setSourceHidden(id, hidden) {
        const set = this.hiddenSources();
        if (hidden) set.add(id);
        else set.delete(id);
        write('hiddenSources', [...set]);
    },
};
