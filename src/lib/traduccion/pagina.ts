/**
 * Traducción · página entera (TRD1020C, Ola 1020U).
 * Recoge los textos traducibles de una página (nodos de texto visibles y los
 * atributos `title`, `alt`, `aria-label` y `placeholder`), aplica traducciones
 * cambiando el DOM, restaura lo original exacto y observa los textos nuevos
 * que vayan apareciendo.
 * Módulo del navegador: sin `node:*`; el DOM solo se toca dentro de las funciones.
 */

export const ATRIBUTOS_TRADUCIBLES = ["title", "alt", "aria-label", "placeholder"] as const;
export type AtributoTraducible = (typeof ATRIBUTOS_TRADUCIBLES)[number];

/** Un texto recogido: nodo de texto con su padre (atributo null) o un atributo del elemento. */
export interface TextoPagina {
    /** Nodo de texto recogido; null cuando lo traducible es un atributo. */
    nodo: Text | null;
    /** Elemento que muestra el texto: padre del nodo o dueño del atributo. */
    padre: Element;
    /** Atributo traducible, o null si es un nodo de texto. */
    atributo: AtributoTraducible | null;
    /** Texto original completo, sin recortar (para la vuelta exacta). */
    original: string;
}

const ETIQUETAS_OCULTAS = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);
const ETIQUETAS_TEXTO_EXCLUIDAS = new Set([...ETIQUETAS_OCULTAS, "CODE", "PRE", "TEXTAREA", "INPUT", "SELECT"]);

/** Los originales viven aquí, no en el HTML: WeakMap de nodo → texto original. */
const originalesTexto = new WeakMap<Text, string>();
/** WeakMap de elemento → (atributo → valor original) para title/alt/aria-label/placeholder. */
const originalesAtributo = new WeakMap<Element, Map<string, string>>();
/** WeakMap de elemento → valor de `lang` que tenía antes de traducirlo. */
const langPrevios = new WeakMap<Element, string | null>();

/** ¿Se salta este elemento? Con `paraAtributos`, los campos de formulario cuentan solo para texto. */
function excluido(el: Element, paraAtributos: boolean): boolean {
    return (paraAtributos ? ETIQUETAS_OCULTAS : ETIQUETAS_TEXTO_EXCLUIDAS).has(el.tagName)
        || el.hasAttribute("contenteditable")
        || (el.getAttribute("translate") ?? "").toLowerCase() === "no"
        || el.hasAttribute("data-no-traducir")
        || el.hasAttribute("hidden");
}

/** ¿Hay un elemento excluido en la cadena de padres de este nodo? */
function enArbolExcluido(nodo: Node): boolean {
    for (let actual: Node | null = nodo; actual; actual = actual.parentNode) {
        if (actual instanceof Element && excluido(actual, false)) return true;
    }
    return false;
}

/** Devuelve los textos visibles y no vacíos de la raíz: sus nodos de texto y atributos. */
export function recogerTextos(raiz: Element): TextoPagina[] {
    const salida: TextoPagina[] = [];
    const visitar = (nodo: Node): void => {
        if (nodo instanceof Element) {
            if (excluido(nodo, true)) return;
            for (const atributo of ATRIBUTOS_TRADUCIBLES) {
                const valor = nodo.getAttribute(atributo);
                if (valor && valor.trim() !== "") {
                    salida.push({ nodo: null, padre: nodo, atributo, original: valor });
                }
            }
            if (excluido(nodo, false)) return;
        } else if (nodo instanceof Text) {
            const texto = nodo.nodeValue ?? "";
            if (texto.trim() !== "" && !enArbolExcluido(nodo)) {
                salida.push({ nodo, padre: nodo.parentElement ?? raiz, atributo: null, original: texto });
            }
        }
        nodo.childNodes.forEach(visitar);
    };
    visitar(raiz);
    return salida;
}

/**
 * Aplica traducciones (texto original recortado → traducción) cambiando el DOM:
 * guarda cada original en el WeakMap y marca el elemento padre con `lang` y
 * `data-traducido`. Devuelve cuántas traducciones cambió de verdad.
 */
export function aplicar(nodos: readonly TextoPagina[], traducciones: ReadonlyMap<string, string>, idioma: string): number {
    let aplicados = 0;
    for (const recibo of nodos) {
        const traduccion = traducciones.get(recibo.original.trim());
        if (traduccion === undefined || yaTraducido(recibo)) continue;
        marcarPadre(recibo.padre, idioma);
        if (recibo.nodo && !recibo.atributo) {
            originalesTexto.set(recibo.nodo, recibo.original);
            recibo.nodo.nodeValue = traduccion;
        } else if (recibo.atributo) {
            const registro = originalesAtributo.get(recibo.padre) ?? new Map<string, string>();
            originalesAtributo.set(recibo.padre, registro);
            registro.set(recibo.atributo, recibo.original);
            recibo.padre.setAttribute(recibo.atributo, traduccion);
        }
        aplicados++;
    }
    return aplicados;
}

/** Guarda el `lang` previo una sola vez y marca el elemento como traducido. */
function marcarPadre(padre: Element, idioma: string): void {
    if (!langPrevios.has(padre)) langPrevios.set(padre, padre.getAttribute("lang"));
    padre.setAttribute("lang", idioma);
    padre.setAttribute("data-traducido", idioma);
}

/** ¿Ya guardó este módulo una traducción para ese nodo de texto o ese atributo? */
function yaTraducido(recibo: TextoPagina): boolean {
    if (recibo.nodo && !recibo.atributo) return originalesTexto.has(recibo.nodo);
    if (recibo.atributo) return originalesAtributo.get(recibo.padre)?.has(recibo.atributo) ?? false;
    return false;
}

/** Devuelve la raíz a como estaba: textos, atributos, `lang` y la marca `data-traducido` fuera. */
export function restaurar(raiz: Element): void {
    for (const el of [raiz, ...Array.from(raiz.querySelectorAll("*"))]) {
        const registro = originalesAtributo.get(el);
        if (registro) {
            for (const [atributo, valor] of Array.from(registro)) {
                if (valor === "") el.removeAttribute(atributo);
                else el.setAttribute(atributo, valor);
            }
            originalesAtributo.delete(el);
        }
        if (el.hasAttribute("data-traducido")) {
            const previo = langPrevios.get(el) ?? null;
            if (previo === null) el.removeAttribute("lang");
            else el.setAttribute("lang", previo);
            el.removeAttribute("data-traducido");
            langPrevios.delete(el);
        }
    }
    const caminante = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    for (let actual = caminante.nextNode(); actual; actual = caminante.nextNode()) {
        if (actual instanceof Text) {
            const original = originalesTexto.get(actual);
            if (original !== undefined) {
                actual.nodeValue = original;
                originalesTexto.delete(actual);
            }
        }
    }
}

/** Encuentra los textos nuevos (los ya traducidos no vuelven). Devuelve la función para parar. */
export function observar(raiz: Element, alNuevo: (nuevos: TextoPagina[]) => void): () => void {
    const observador = new MutationObserver(() => {
        const nuevos = recogerTextos(raiz).filter((recibo) => !yaTraducido(recibo));
        if (nuevos.length > 0) alNuevo(nuevos);
    });
    observador.observe(raiz, { childList: true, subtree: true });
    return () => observador.disconnect();
}
