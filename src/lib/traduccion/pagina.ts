/**
 * Traducción · página entera (TRD1020C, Ola 1020U) — §4 de architecture/repos-libreria-1020d.md.
 * `recogerTextos` da los nodos de texto visibles y no vacíos y también los atributos title,
 * alt, aria-label y placeholder, nunca dentro de script, style, noscript, code, pre,
 * textarea, input, select, [contenteditable], [translate=no], [data-no-traducir] ni
 * [hidden]; `aplicar` guarda cada original (WeakMap) y marca el elemento padre con lang y
 * data-traducido; `restaurar` lo devuelve todo como estaba; `observar` sigue los textos
 * nuevos (MutationObserver) sin avisar de nuevo de lo ya traducido. Puro: sin `node:*`,
 * sin red; el DOM de las pruebas corre en jsdom.
 */

const ETIQUETAS_PROHIBIDAS = new Set(["script", "style", "noscript", "code", "pre", "textarea", "input", "select"]);
const ATRIBUTOS_TRADUCIBLES = ["title", "alt", "aria-label", "placeholder"] as const;

/** Una pieza traducible: un nodo de texto («texto») o un valor de atributo («atributo»). */
export type TextoRecogido =
    | { clase: "texto"; nodo: Text; texto: string }
    | { clase: "atributo"; nodo: Element; atributo: string; texto: string };
interface OriginalElemento { lang: string | null; dataTraducido: string | null; atributos: Record<string, string> }
const ORIGINALES_TEXTO = new WeakMap<Text, string>();
const ORIGINALES_ELEMENTO = new WeakMap<Element, OriginalElemento>();

const zonaProhibida = (el: Element): boolean =>
    el.getAttribute("translate") === "no" || el.hasAttribute("data-no-traducir") || el.hasAttribute("hidden");
const excluido = (el: Element): boolean =>
    ETIQUETAS_PROHIBIDAS.has(el.tagName.toLowerCase()) || el.hasAttribute("contenteditable") || zonaProhibida(el);

/** ¿El nodo (o su elemento) y sus ancestros hasta el tope, sin contarla, caen bajo `regla`? */
function dentroDe(nodo: Node, tope: Node, regla: (el: Element) => boolean): boolean {
    let actual: Node | null = nodo.nodeType === Node.ELEMENT_NODE ? nodo : nodo.parentElement;
    while (actual && actual !== tope) {
        if (actual.nodeType === Node.ELEMENT_NODE && regla(actual as Element)) return true;
        actual = actual.parentNode;
    }
    return false;
}

/** Recoge los textos traducibles de toda la raíz (elemento, documento o fragmento). */
export function recogerTextos(raiz: ParentNode): TextoRecogido[] {
    if (raiz.nodeType === Node.ELEMENT_NODE && excluido(raiz as Element)) return [];
    const salida: TextoRecogido[] = [];
    const elementos = (raiz instanceof Element ? [raiz] : []).concat(Array.from(raiz.querySelectorAll("*")));
    for (const el of elementos) {
        for (const hijo of el.childNodes) {
            const texto = hijo instanceof Text ? hijo : null;
            if (texto?.data.trim() && !dentroDe(texto, raiz, excluido)) salida.push({ nodo: texto, clase: "texto", texto: texto.data });
        }
        for (const atributo of ATRIBUTOS_TRADUCIBLES) {
            const valor = el.getAttribute(atributo);
            if (valor?.trim() && !dentroDe(el, raiz, zonaProhibida)) salida.push({ nodo: el, clase: "atributo", atributo, texto: valor });
        }
    }
    return salida;
}

/** Registra el elemento como traducido (lang y data-traducido), conservando sus valores previos. */
function marcarElemento(el: Element, idioma: string): OriginalElemento {
    const registro = ORIGINALES_ELEMENTO.get(el) ?? { lang: el.getAttribute("lang"), dataTraducido: el.getAttribute("data-traducido"), atributos: {} };
    if (!ORIGINALES_ELEMENTO.has(el)) ORIGINALES_ELEMENTO.set(el, registro);
    el.setAttribute("lang", idioma);
    el.setAttribute("data-traducido", "true");
    return registro;
}

/**
 * Aplica traducciones (mapa de texto original → traducción, clave exacta) y dice cuántas
 * entraron; las sin clave no se tocan ni se marcan. El original queda en el WeakMap ANTES
 * de escribir, para que la propia traducción no vuelva al observador como texto nuevo.
 */
export function aplicar(nodos: TextoRecogido[], traducciones: Record<string, string>, idioma: string): number {
    let aplicados = 0;
    for (const item of nodos) {
        const traduccion = traducciones[item.texto];
        if (!traduccion || traduccion === item.texto) continue;
        if (item.clase === "texto") {
            if (!ORIGINALES_TEXTO.has(item.nodo)) ORIGINALES_TEXTO.set(item.nodo, item.nodo.data);
            item.nodo.data = traduccion;
            if (item.nodo.parentElement) marcarElemento(item.nodo.parentElement, idioma);
        } else {
            const registro = marcarElemento(item.nodo, idioma);
            if (!(item.atributo in registro.atributos)) registro.atributos[item.atributo] = item.nodo.getAttribute(item.atributo) ?? "";
            item.nodo.setAttribute(item.atributo, traduccion);
        }
        aplicados += 1;
    }
    return aplicados;
}

/** Vuelve todo al original (textos, atributos y marcas) y suelta los registros. */
export function restaurar(raiz: ParentNode): void {
    const elementos = (raiz instanceof Element ? [raiz] : []).concat(Array.from(raiz.querySelectorAll("*")));
    for (const el of elementos) {
        for (const hijo of el.childNodes) {
            if (!(hijo instanceof Text)) continue;
            const original = ORIGINALES_TEXTO.get(hijo);
            if (original !== undefined) { hijo.data = original; ORIGINALES_TEXTO.delete(hijo); }
        }
        const registro = ORIGINALES_ELEMENTO.get(el);
        if (!registro) continue;
        for (const [atributo, valor] of Object.entries(registro.atributos)) el.setAttribute(atributo, valor);
        if (registro.lang === null) el.removeAttribute("lang"); else el.setAttribute("lang", registro.lang);
        if (registro.dataTraducido === null) el.removeAttribute("data-traducido"); else el.setAttribute("data-traducido", registro.dataTraducido);
        ORIGINALES_ELEMENTO.delete(el);
    }
}

/** Sigue la raíz con MutationObserver y avisa de cada texto nuevo; devuelve cómo parar. */
export function observar(raiz: ParentNode, alNuevo: (nodos: TextoRecogido[]) => void): () => void {
    if (typeof MutationObserver === "undefined") return () => undefined;
    const observador = new MutationObserver((mutaciones) => {
        const nuevos = textosNuevos(raiz, mutaciones);
        if (nuevos.length > 0) alNuevo(nuevos);
    });
    observador.observe(raiz, { childList: true, characterData: true, subtree: true });
    return () => observador.disconnect();
}

/**
 * Registros del observador → textos y atributos nuevos: salta lo ya traducido (los cambios
 * que provocó aplicar caen aquí filtrados), lo excluido y lo vacío.
 */
function textosNuevos(raiz: ParentNode, mutaciones: MutationRecord[]): TextoRecogido[] {
    const salida: TextoRecogido[] = [];
    const avisa = (texto: Text): void => {
        if (!ORIGINALES_TEXTO.has(texto) && texto.data.trim() && !dentroDe(texto, raiz, excluido)) {
            salida.push({ nodo: texto, clase: "texto", texto: texto.data });
        }
    };
    for (const mutacion of mutaciones) {
        if (mutacion.type === "characterData" && mutacion.target instanceof Text) avisa(mutacion.target);
        for (const añadido of mutacion.addedNodes) {
            if (añadido instanceof Text) avisa(añadido);
            else if (añadido instanceof Element && !dentroDe(añadido, raiz, excluido) && !dentroDe(añadido, raiz, zonaProhibida)) {
                salida.push(...recogerTextos(añadido).filter((item) =>
                    item.clase === "texto" ? !ORIGINALES_TEXTO.has(item.nodo) : true));
            }
        }
    }
    return salida;
}
