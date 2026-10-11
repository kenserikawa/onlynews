// Utilidades del DOM y de formato. Las funciones puras (todas salvo h) se testean en Node.

export function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value == null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? '' : String(value));
    }
    node.append(...children.flat(Infinity).filter(child => child != null && child !== false));
    return node;
}

export function safeUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
    } catch {
        return null;
    }
}

export function timeAgo(iso, now = Date.now()) {
    const time = Date.parse(iso);
    if (Number.isNaN(time)) return '';
    const minutes = Math.round(Math.max(0, now - time) / 60000);
    if (minutes < 1) return 'ahora';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    return `hace ${Math.round(hours / 24)} d`;
}

export function fold(text) {
    return String(text ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

export function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many}`;
}
