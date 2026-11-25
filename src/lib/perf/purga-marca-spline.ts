/**
 * DIR1125A · purga de la marca de agua de Spline, BARATA. Sin React; lo usa `SplineWatermarkCover` (montado en toda la app).
 *
 * Por qué existe (medido el 24-11-2026 en la neurona Linux «Maggabox», Core i5 de 2011): la versión anterior corría en CADA mutación
 * del DOM de todo el documento y cada 2,5 s, y en cada pasada leía `textContent` de TODOS los a/div/span/button/p/small. Cada
 * contenedor vuelve a juntar todo el texto que tiene debajo, así que el coste crecía con (elementos × texto): el hilo principal
 * de la página quedó al 97–110 % de CPU de forma permanente y todo lo demás (órdenes del control entre neuronas, cuadros, la
 * propia interfaz) esperaba 1–2 s. Aquí la misma tarea cuesta lo que cuesta recorrer los nodos de TEXTO una vez, y las
 * mutaciones se agrupan.
 */

export const SELECTORES_MARCA: readonly string[] = [
    'a[href*="spline.design" i]',
    'a[href*="spline" i]',
    '[aria-label*="spline" i]',
    '[aria-label*="built" i]',
    '[class*="spline-watermark" i]',
    "#spline-watermark",
];
const ETIQUETAS = new Set(["A", "DIV", "SPAN", "BUTTON", "P", "SMALL"]);
/** El rótulo entero no pasa de esto (la regla de siempre). */
export const TEXTO_MAX = 60;
/** Las mutaciones se agrupan: como mucho una pasada cada tanto. */
export const ESPERA_PURGA_MS = 600;
/** Respaldo lento (antes 2,5 s), y solo si hay algún `<canvas>` en la página. */
export const RESPALDO_MS = 30_000;
/** Más raíces nuevas que esto en una tanda: se hace una sola pasada lineal al documento. */
export const TOPE_RAICES = 40;

/** Colapsa espacios y pasa a minúsculas. */
export function normalizar(s: string | null | undefined): string {
    return (s || "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** ¿Es el rótulo «Built with Spline» (también partido en nodos)? */
export function esTextoDeMarca(t: string): boolean {
    if (!t) return false;
    return t.includes("built with spline") || (t.includes("spline") && t.includes("built"));
}

export function ocultar(el: Element | null): void {
    if (!el) return;
    const h = el as HTMLElement;
    try {
        h.style.setProperty("display", "none", "important");
        h.style.setProperty("opacity", "0", "important");
        h.style.setProperty("visibility", "hidden", "important");
        h.style.setProperty("pointer-events", "none", "important");
    } catch {
        /* noop */
    }
    try {
        h.parentNode?.removeChild(h);
    } catch {
        /* noop */
    }
}

/** El texto del elemento si es corto; null si es largo (y entonces sus ancestros también lo son). Solo se llama con candidatos. */
function textoCorto(el: Element): string | null {
    const crudo = el.textContent;
    if (!crudo || crudo.length > 400) return null;
    const t = normalizar(crudo);
    return t.length > TEXTO_MAX ? null : t;
}

/**
 * Una pasada LINEAL sobre `raiz` (documento, subárbol o shadow root): los selectores directos y, para el texto, solo los nodos
 * de texto cortos que mencionan «spline» o «built». Devuelve cuántos elementos ocultó.
 */
export function purgarRaiz(raiz: ParentNode): number {
    let n = 0;
    for (const sel of SELECTORES_MARCA) {
        try {
            raiz.querySelectorAll(sel).forEach((el) => {
                ocultar(el);
                n += 1;
            });
        } catch {
            /* selector no soportado */
        }
    }
    const nodoRaiz = raiz as unknown as Node;
    const doc: Document | null = nodoRaiz.nodeType === 9 ? (nodoRaiz as Document) : nodoRaiz.ownerDocument;
    if (!doc || typeof doc.createTreeWalker !== "function") return n;
    const candidatos: Element[] = [];
    try {
        const caminante = doc.createTreeWalker(nodoRaiz, 4 /* NodeFilter.SHOW_TEXT */);
        for (let nodo = caminante.nextNode(); nodo; nodo = caminante.nextNode()) {
            const v = nodo.nodeValue;
            if (!v || v.length > 200) continue;
            const t = v.toLowerCase();
            if (!t.includes("spline") && !t.includes("built")) continue;
            const padre = nodo.parentElement;
            if (padre) candidatos.push(padre);
        }
    } catch {
        /* noop */
    }
    for (const origen of candidatos) {
        if (!origen.isConnected) continue;
        let el: Element | null = origen;
        let hallado: HTMLElement | null = null;
        for (let i = 0; i < 3 && el; i++) {
            if (ETIQUETAS.has(el.tagName)) {
                const t = textoCorto(el);
                if (t === null) break;
                if (esTextoDeMarca(t)) {
                    hallado = el as HTMLElement;
                    break;
                }
            }
            el = el.parentElement;
        }
        if (!hallado) continue;
        // Sube al ancestro «píldora» (pocos hijos y el mismo rótulo) para retirar también su fondo redondeado.
        let objetivo: HTMLElement = hallado;
        for (let i = 0; i < 4; i++) {
            const p: HTMLElement | null = objetivo.parentElement;
            if (!p) break;
            const crudo = p.textContent ?? "";
            if (crudo.length > 200) break;
            const pt = normalizar(crudo);
            if (esTextoDeMarca(pt) && pt.length < 40 && p.childElementCount <= 3) objetivo = p;
            else break;
        }
        ocultar(objetivo);
        n += 1;
    }
    return n;
}

/** Un subárbol recién añadido: él mismo, lo que cuelga y sus shadow roots. Cuesta lo que mide el subárbol. */
export function purgarSubarbol(el: Element): number {
    let n = 0;
    for (const sel of SELECTORES_MARCA) {
        try {
            if (el.matches(sel)) {
                ocultar(el);
                return 1;
            }
        } catch {
            /* selector no soportado */
        }
    }
    n += purgarRaiz(el);
    try {
        const propia = (el as HTMLElement).shadowRoot;
        if (propia) n += purgarRaiz(propia);
        const todos = el.querySelectorAll("*");
        for (let i = 0; i < todos.length; i++) {
            const sr = (todos[i] as HTMLElement).shadowRoot;
            if (sr) n += purgarRaiz(sr);
        }
    } catch {
        /* noop */
    }
    return n;
}

/** El documento entero y sus shadow roots abiertos (al montar y en el respaldo lento). */
export function purgarProfundo(doc: Document): number {
    let n = purgarRaiz(doc);
    try {
        const todos = doc.querySelectorAll("*");
        for (let i = 0; i < todos.length; i++) {
            const sr = (todos[i] as HTMLElement).shadowRoot;
            if (sr) n += purgarRaiz(sr);
        }
    } catch {
        /* noop */
    }
    return n;
}

export interface RelojPurga {
    programar(fn: () => void, ms: number): unknown;
    cancelar(id: unknown): void;
}

const relojReal: RelojPurga = {
    programar: (fn, ms) => setTimeout(fn, ms),
    cancelar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export interface Purgador {
    /** Lo que entrega el MutationObserver: se apuntan las raíces nuevas y se agrupa. */
    alMutar(registros: ArrayLike<{ addedNodes: ArrayLike<Node> }>): void;
    /** Pasada completa (documento y shadow roots), ahora. */
    completa(): number;
    /** Pasadas agrupadas hechas (para el registro y las pruebas). */
    pasadas(): number;
    parar(): void;
}

/** Agrupa las mutaciones: como mucho una pasada cada `ESPERA_PURGA_MS`, y solo sobre lo que se añadió. */
export function crearPurgador(doc: Document, reloj: RelojPurga = relojReal): Purgador {
    let pendiente: unknown = null;
    let todo = false;
    let raices: Element[] = [];
    let pasadas = 0;
    const correr = () => {
        pendiente = null;
        const entero = todo;
        const lote = raices;
        todo = false;
        raices = [];
        pasadas += 1;
        if (entero) {
            purgarRaiz(doc);
            return;
        }
        for (const r of lote) if (r.isConnected) purgarSubarbol(r);
    };
    return {
        alMutar(registros) {
            for (let i = 0; i < registros.length && !todo; i++) {
                const nuevos = registros[i].addedNodes;
                for (let j = 0; j < nuevos.length; j++) {
                    const nodo = nuevos[j];
                    if (nodo.nodeType === 1) raices.push(nodo as Element);
                    else if (nodo.nodeType === 3 && nodo.parentElement) raices.push(nodo.parentElement);
                    if (raices.length > TOPE_RAICES) {
                        todo = true;
                        raices = [];
                        break;
                    }
                }
            }
            if ((todo || raices.length > 0) && pendiente === null) pendiente = reloj.programar(correr, ESPERA_PURGA_MS);
        },
        completa: () => purgarProfundo(doc),
        pasadas: () => pasadas,
        parar() {
            if (pendiente !== null) reloj.cancelar(pendiente);
            pendiente = null;
            raices = [];
            todo = false;
        },
    };
}
