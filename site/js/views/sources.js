import { h } from '../dom.js';

export async function renderSources() {
    return h('p', { class: 'loading' }, 'Vista sources en construcción');
}
