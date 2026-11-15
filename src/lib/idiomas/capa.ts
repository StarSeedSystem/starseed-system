/**
 * IDI1115N · La capa que aplica el idioma elegido a TODO lo que se pinta, sin tocar los
 * componentes: recorre el DOM (texto de nodos y los atributos que se leen o se escuchan), busca
 * cada texto en el catálogo y lo escribe; un MutationObserver sigue lo que React cambie después.
 *
 * Reutiliza `recogerTextos` de `src/lib/traduccion/pagina.ts` (mismas exclusiones: code, pre,
 * textarea, input, select, contenteditable, [translate=no], [data-no-traducir], [hidden]) pero no
 * su `aplicar`/`observar`: aquel observador salta los nodos ya traducidos, y React reescribe el
 * mismo nodo de texto cuando cambia un valor («3 neuronas» → «4 neuronas»), que aquí debe volver
 * a traducirse. Texto de personas: solo se toca lo que coincide EXACTO con un texto del código
 * (la clave del catálogo); lo demás —mensajes, nombres, publicaciones, red— nunca se traduce.
 * Sin red: el catálogo ya está en el paquete. Pura salvo el DOM que recibe.
 */
import { recogerTextos } from "@/lib/traduccion/pagina";
import { direccionDe, IDIOMA_FUENTE } from "./idiomas";
import { normalizarTexto, type Catalogo } from "./catalogo";

const ATRIBUTOS = ["title", "alt", "aria-label", "placeholder"] as const;
interface Marca { original: string; escrito: string }
const TEXTOS = new WeakMap<Text, Marca>();
const ATRIBUTOS_MARCADOS = new WeakMap<Element, Record<string, Marca>>();

/** Conserva los espacios de los extremos y cambia solo el núcleo. */
function conEspacios(original: string, nucleo: string): string {
    const ini = /^\s*/.exec(original)?.[0] ?? "";
    const fin = /\s*$/.exec(original)?.[0] ?? "";
    return ini + nucleo + fin;
}

function traducirTexto(nodo: Text, cat: Catalogo): boolean {
    const previo = TEXTOS.get(nodo);
    if (previo && nodo.data === previo.escrito) return false; // ya lo escribió esta capa
    const original = nodo.data; // texto español nuevo (o reescrito por React)
    const t = cat.traducir(normalizarTexto(original));
    if (t === null || t === normalizarTexto(original)) { if (previo) TEXTOS.delete(nodo); return false; }
    const escrito = conEspacios(original, t);
    TEXTOS.set(nodo, { original, escrito });
    nodo.data = escrito;
    return true;
}

function traducirAtributo(el: Element, nombre: string, cat: Catalogo): boolean {
    const valor = el.getAttribute(nombre);
    if (!valor?.trim()) return false;
    const registro = ATRIBUTOS_MARCADOS.get(el) ?? {};
    const previo = registro[nombre];
    if (previo && valor === previo.escrito) return false;
    const t = cat.traducir(normalizarTexto(valor));
    if (t === null || t === normalizarTexto(valor)) { if (previo) { delete registro[nombre]; } return false; }
    registro[nombre] = { original: valor, escrito: conEspacios(valor, t) };
    ATRIBUTOS_MARCADOS.set(el, registro);
    el.setAttribute(nombre, registro[nombre].escrito);
    return true;
}

/** Traduce todo lo que cuelga de `raiz` y devuelve cuántas piezas cambió. */
export function traducirArbol(raiz: ParentNode, cat: Catalogo): number {
    let n = 0;
    for (const item of recogerTextos(raiz)) {
        if (item.clase === "texto") { if (traducirTexto(item.nodo, cat)) n++; }
        else if (traducirAtributo(item.nodo, item.atributo, cat)) n++;
    }
    return n;
}

/** Devuelve el español original de todo lo que esta capa tradujo bajo `raiz`. */
export function restaurarArbol(raiz: ParentNode): void {
    const doc = (raiz as Node).ownerDocument ?? (raiz as Document);
    const caminante = doc.createTreeWalker(raiz as Node, NodeFilter.SHOW_TEXT);
    for (let n = caminante.nextNode(); n; n = caminante.nextNode()) {
        const marca = TEXTOS.get(n as Text);
        if (marca && (n as Text).data === marca.escrito) (n as Text).data = marca.original;
        TEXTOS.delete(n as Text);
    }
    const elementos = (raiz instanceof Element ? [raiz] : []).concat(Array.from(raiz.querySelectorAll("*")));
    for (const el of elementos) {
        const registro = ATRIBUTOS_MARCADOS.get(el);
        if (!registro) continue;
        for (const [nombre, marca] of Object.entries(registro)) if (el.getAttribute(nombre) === marca.escrito) el.setAttribute(nombre, marca.original);
        ATRIBUTOS_MARCADOS.delete(el);
    }
}

/** Idioma y dirección del documento; el idioma fuente deja `dir` como estaba (ltr). */
export function fijarDocumento(doc: Document, codigo: string): void {
    const raiz = doc.documentElement;
    raiz.setAttribute("lang", codigo);
    raiz.setAttribute("dir", direccionDe(codigo));
    raiz.removeAttribute("data-idioma-pendiente");
}

export interface CapaActiva { parar(): void; cambiar(cat: Catalogo | null, codigo: string): void }

/**
 * Aplica `cat` (o nada si es español/null) a `raiz` y sigue los cambios. `cambiar` pasa a otro
 * idioma en el mismo instante: restaura el español y vuelve a traducir, sin que se pinte a medias.
 */
export function iniciarCapa(raiz: HTMLElement, doc: Document, codigo: string, cat: Catalogo | null): CapaActiva {
    let actual = cat;
    const alCambiar = (mutaciones: MutationRecord[]): void => {
        if (!actual) return;
        for (const m of mutaciones) {
            if (m.type === "characterData" && m.target instanceof Text) {
                const padre = m.target.parentElement;
                if (padre && !padre.closest("[translate=no],[data-no-traducir],code,pre,textarea,[contenteditable]")) traducirTexto(m.target, actual);
            } else if (m.type === "attributes" && m.target instanceof Element && m.attributeName) {
                if (!m.target.closest("[translate=no],[data-no-traducir]")) traducirAtributo(m.target, m.attributeName, actual);
            } else {
                m.addedNodes.forEach((a) => {
                    if (a instanceof Text) { if (a.parentElement && !a.parentElement.closest("[translate=no],[data-no-traducir],code,pre,textarea,[contenteditable]")) traducirTexto(a, actual!); }
                    else if (a instanceof Element) traducirArbol(a, actual!);
                });
            }
        }
    };
    const observador = typeof MutationObserver === "undefined" ? null : new MutationObserver(alCambiar);
    observador?.observe(raiz, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: [...ATRIBUTOS] });
    const aplicar = (c: Catalogo | null, cod: string): void => {
        observador?.disconnect();
        restaurarArbol(raiz);
        actual = c;
        fijarDocumento(doc, cod);
        if (c) traducirArbol(raiz, c);
        observador?.observe(raiz, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: [...ATRIBUTOS] });
    };
    aplicar(cat, codigo);
    return {
        cambiar: aplicar,
        parar: () => { observador?.disconnect(); restaurarArbol(raiz); fijarDocumento(doc, IDIOMA_FUENTE); },
    };
}
