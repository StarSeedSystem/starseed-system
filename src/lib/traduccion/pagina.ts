/**
 * TRD1020C · Traducción de la página entera (architecture/repos-libreria-1020d.md §4).
 * Módulo PURO sobre el DOM: recoger → aplicar → restaurar → observar. Sin `node:*`
 * (también lo importa el cliente). Nada dentro de script, style, noscript, code, pre,
 * textarea, input, select, [contenteditable], [translate=no], [data-no-traducir],
 * [hidden] ni en lo ya traducido ([data-traducido]).
 */

const ETIQUETAS_EXCLUIDAS = new Set([
    "script", "style", "noscript", "code", "pre", "textarea", "input", "select",
]);

/** Campos editables: su contenido nunca se traduce, pero sí su title y placeholder. */
const CAMPOS = new Set(["input", "textarea", "select"]);

/** Atributos con texto traducible. */
const ATRIBUTOS = ["title", "alt", "aria-label", "placeholder"] as const;

/** Un texto con sitio donde aplicarlo: nodo de texto del DOM o atributo de un elemento. */
export type TextoRecogido =
    | { tipo: "texto"; texto: string; nodo: Text }
    | { tipo: "atributo"; texto: string; elemento: Element; nombreAtributo: string };

function excluido(e: Element, porAtributo = false): boolean {
    const etiqueta = e.tagName.toLowerCase();
    if (ETIQUETAS_EXCLUIDAS.has(etiqueta) && !(porAtributo && CAMPOS.has(etiqueta))) return true;
    const editable = e.getAttribute("contenteditable");
    if (editable !== null && editable !== "false") return true;
    if (e.getAttribute("translate") === "no") return true;
    if (e.hasAttribute("data-no-traducir")) return true;
    if (e.hasAttribute("hidden") || e.hasAttribute("data-traducido")) return true;
    return false;
}

/** ¿Está el nodo fuera de toda exclusión por su cadena de padres? (libre: el propio nodo es atributo). */
function visiblePorPadres(n: Node | null, libre = false): boolean {
    let actual: Node | null = n;
    let primero = true;
    while (actual) {
        if (actual instanceof Element && excluido(actual, libre && primero)) return false;
        primero = false;
        actual = actual.parentElement;
    }
    return true;
}

function recogerNodos(raiz: Node, filtro: number): Node[] {
    const lista: Node[] = [];
    const walker = document.createTreeWalker(raiz, filtro);
    let n: Node | null = walker.nextNode();
    while (n) {
        lista.push(n);
        n = walker.nextNode();
    }
    return lista;
}

/** Nodos de texto visibles y no vacíos, más los atributos title/alt/aria-label/placeholder. */
export function recogerTextos(raiz: Node): TextoRecogido[] {
    const salida: TextoRecogido[] = [];
    for (const n of recogerNodos(raiz, NodeFilter.SHOW_TEXT)) {
        const texto = (n as Text).nodeValue ?? "";
        if (texto.trim() && visiblePorPadres(n)) salida.push({ tipo: "texto", texto, nodo: n as Text });
    }
    for (const e of recogerNodos(raiz, NodeFilter.SHOW_ELEMENT)) {
        const el = e as Element;
        for (const nombre of ATRIBUTOS) {
            const valor = el.getAttribute(nombre);
            if (valor && valor.trim() && visiblePorPadres(el, true)) {
                salida.push({ tipo: "atributo", texto: valor, elemento: el, nombreAtributo: nombre });
            }
        }
    }
    return salida;
}

/** Originales guardados (WeakMap: si el nodo desaparece, se va con él). */
const originalesTexto = new WeakMap<Text, string>();
const originalesAtributo = new WeakMap<Element, Map<string, string>>();
const langPrevios = new WeakMap<Element, string | null>();

/** Marca el elemento padre antes de cambiar nada (el observador filtrará lo traducido). */
function marcar(e: Element, idioma: string): void {
    if (langPrevios.has(e)) return;
    langPrevios.set(e, e.getAttribute("lang"));
    e.setAttribute("lang", idioma);
    e.setAttribute("data-traducido", "");
}

/** Aplica las traducciones (original → traducción) a lo recogido; devuelve cuántas puso. */
export function aplicar(nodos: TextoRecogido[], traducciones: Map<string, string>, idioma: string): number {
    let aplicadas = 0;
    for (const item of nodos) {
        const traduccion = traducciones.get(item.texto);
        if (!traduccion) continue;
        if (item.tipo === "texto") {
            if (originalesTexto.has(item.nodo) || !visiblePorPadres(item.nodo)) continue;
            originalesTexto.set(item.nodo, item.nodo.nodeValue ?? "");
            const padre = item.nodo.parentElement;
            if (padre) marcar(padre, idioma);
            item.nodo.nodeValue = traduccion;
        } else {
            if (originalesAtributo.get(item.elemento)?.has(item.nombreAtributo)) continue;
            if (!visiblePorPadres(item.elemento, true)) continue;
            const previos = originalesAtributo.get(item.elemento) ?? new Map<string, string>();
            previos.set(item.nombreAtributo, item.elemento.getAttribute(item.nombreAtributo) ?? "");
            originalesAtributo.set(item.elemento, previos);
            marcar(item.elemento, idioma);
            item.elemento.setAttribute(item.nombreAtributo, traduccion);
        }
        aplicadas++;
    }
    return aplicadas;
}

/** Vuelve textos y atributos al original exacto; devuelve cuántos devolvió. */
export function restaurar(raiz: Node): number {
    let devueltos = 0;
    for (const n of recogerNodos(raiz, NodeFilter.SHOW_TEXT)) {
        const previo = originalesTexto.get(n as Text);
        if (previo === undefined) continue;
        (n as Text).nodeValue = previo;
        originalesTexto.delete(n as Text);
        devueltos++;
    }
    for (const e of recogerNodos(raiz, NodeFilter.SHOW_ELEMENT)) {
        const el = e as Element;
        const previos = originalesAtributo.get(el);
        if (previos) {
            for (const [nombre, valor] of previos) el.setAttribute(nombre, valor);
            originalesAtributo.delete(el);
            devueltos++;
        }
        if (langPrevios.has(el)) {
            const lang = langPrevios.get(el);
            if (lang === null) el.removeAttribute("lang");
            else el.setAttribute("lang", lang);
            el.removeAttribute("data-traducido");
            langPrevios.delete(el);
        }
    }
    return devueltos;
}

/** Sigue los textos NUEVOS bajo raíz con MutationObserver; devuelve parar(). */
export function observar(raiz: Node, alNuevo: (nuevos: TextoRecogido[]) => void): () => void {
    const yaVistos = new WeakSet<Text>();
    const observador = new MutationObserver((mutaciones) => {
        const nuevos: TextoRecogido[] = [];
        for (const m of mutaciones) {
            m.addedNodes.forEach((añadido) => {
                for (const item of recogerTextos(añadido)) {
                    if (item.tipo === "texto" && !yaVistos.has(item.nodo)) {
                        yaVistos.add(item.nodo);
                        nuevos.push(item);
                    }
                }
            });
            const objetivo = m.target;
            if (m.type === "characterData" && objetivo instanceof Text && !yaVistos.has(objetivo)
                && !originalesTexto.has(objetivo) && visiblePorPadres(objetivo)) {
                yaVistos.add(objetivo);
                nuevos.push({ tipo: "texto", texto: objetivo.nodeValue ?? "", nodo: objetivo });
            }
        }
        if (nuevos.length) alNuevo(nuevos);
    });
    observador.observe(raiz, { childList: true, characterData: true, subtree: true });
    return () => observador.disconnect();
}

