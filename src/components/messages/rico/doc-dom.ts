/**
 * Documento rico ⇄ DOM del editor (contentEditable estricto).
 *
 * Reglas:
 *  · `pintarDoc` construye el DOM SOLO con createElement/createTextNode (nunca innerHTML con datos).
 *  · `parsearDom` lee cualquier DOM que el navegador haya dejado al escribir (Intro, pegar, tildes…)
 *    y lo reduce a la lista blanca de `DocRico`: lo que no conoce lo ignora o lo aplana a texto.
 *    Nunca se guarda HTML.
 *  · Ida y vuelta estable: parsear(pintar(normalizarDoc(d))) === normalizarDoc(d).
 *  · Las posiciones (bloque, ítem, carácter) se calculan con los MISMOS «átomos» que el parseo, así
 *    que la selección sobrevive a cada repintado.
 *
 * Sin React. Depende solo del DOM estándar (funciona en jsdom).
 */
import {
    acotar,
    colorValido,
    enlaceSeguro,
    fuenteCss,
} from "@/lib/mensajeria/formato";
import {
    FUENTES_MENSAJE,
    LIMITES_FORMATO,
    type AlineacionBloque,
    type BloqueDoc,
    type DocRico,
    type FuenteMensaje,
    type MarcaTexto,
    type TramoTexto,
} from "@/lib/mensajeria/formato-tipos";

export const ORDEN_MARCAS: readonly MarcaTexto[] = ["negrita", "cursiva", "subrayado", "tachado", "codigo"];

const ETIQUETA_MARCA: Record<MarcaTexto, string> = {
    negrita: "strong",
    cursiva: "em",
    subrayado: "u",
    tachado: "s",
    codigo: "code",
};

const IDS_FUENTE = new Set<string>(FUENTES_MENSAJE.map((f) => f.id));
const ALINEACIONES = new Set<string>(["izquierda", "centro", "derecha", "justificado"]);
const CSS_ALINEACION: Record<AlineacionBloque, string> = { izquierda: "left", centro: "center", derecha: "right", justificado: "justify" };
const ALINEACION_DE_CSS: Record<string, AlineacionBloque> = { left: "izquierda", start: "izquierda", center: "centro", right: "derecha", end: "derecha", justify: "justificado" };

// ───────────────────────────── Normalización del modelo ─────────────────────────────

export interface FormatoTramo {
    marcas: MarcaTexto[];
    color?: string;
    resaltado?: string;
    enlace?: string;
    fuente?: FuenteMensaje;
    tamano?: number;
}

/** Formato de un tramo sin su texto. */
export function formatoDe(t: TramoTexto): FormatoTramo {
    const f: FormatoTramo = { marcas: ORDEN_MARCAS.filter((m) => t.marcas?.includes(m)) };
    if (t.color) f.color = t.color;
    if (t.resaltado) f.resaltado = t.resaltado;
    if (t.enlace) f.enlace = t.enlace;
    if (t.fuente) f.fuente = t.fuente;
    if (t.tamano) f.tamano = t.tamano;
    return f;
}

/** Tramo canónico (marcas en orden fijo, sin propiedades vacías). */
export function tramoCon(texto: string, f: FormatoTramo): TramoTexto {
    const t: TramoTexto = { texto };
    const marcas = ORDEN_MARCAS.filter((m) => f.marcas.includes(m));
    if (marcas.length) t.marcas = marcas;
    if (f.color) t.color = f.color;
    if (f.resaltado) t.resaltado = f.resaltado;
    if (f.enlace) t.enlace = f.enlace;
    if (f.fuente) t.fuente = f.fuente;
    if (f.tamano) t.tamano = f.tamano;
    return t;
}

export function mismoFormato(a: TramoTexto, b: TramoTexto): boolean {
    const fa = formatoDe(a);
    const fb = formatoDe(b);
    return (
        fa.marcas.join() === fb.marcas.join() &&
        fa.color === fb.color &&
        fa.resaltado === fb.resaltado &&
        fa.enlace === fb.enlace &&
        fa.fuente === fb.fuente &&
        fa.tamano === fb.tamano
    );
}

/** Quita tramos vacíos, ordena marcas y une los contiguos con el mismo formato. */
export function normalizarTramos(tramos: TramoTexto[]): TramoTexto[] {
    const out: TramoTexto[] = [];
    for (const t of tramos) {
        if (!t || typeof t.texto !== "string" || !t.texto) continue;
        const c = tramoCon(t.texto, formatoDe(t));
        const prev = out[out.length - 1];
        if (prev && mismoFormato(prev, c)) prev.texto += c.texto;
        else out.push(c);
    }
    return out;
}

function normalizarBloque(b: BloqueDoc): BloqueDoc {
    switch (b.tipo) {
        case "parrafo":
        case "titulo": {
            const n: BloqueDoc =
                b.tipo === "titulo"
                    ? { tipo: "titulo", nivel: b.nivel === 2 || b.nivel === 3 ? b.nivel : 1, tramos: normalizarTramos(b.tramos) }
                    : { tipo: "parrafo", tramos: normalizarTramos(b.tramos) };
            if (b.alineacion && b.alineacion !== "izquierda" && ALINEACIONES.has(b.alineacion)) n.alineacion = b.alineacion;
            return n;
        }
        case "lista":
            return { tipo: "lista", ordenada: !!b.ordenada, items: (b.items.length ? b.items : [[]]).map(normalizarTramos) };
        case "tareas":
            return {
                tipo: "tareas",
                items: (b.items.length ? b.items : [{ hecha: false, tramos: [] }]).map((it) => ({ hecha: !!it.hecha, tramos: normalizarTramos(it.tramos) })),
            };
        case "cita":
            return { tipo: "cita", tramos: normalizarTramos(b.tramos) };
        case "codigo": {
            const c: BloqueDoc = { tipo: "codigo", texto: b.texto.replace(/\r\n?/g, "\n").replace(/\n+$/, "") };
            if (b.lenguaje) c.lenguaje = b.lenguaje;
            return c;
        }
        case "separador":
            return { tipo: "separador" };
    }
}

/** Documento canónico para el editor (siempre con al menos un bloque). */
export function normalizarDoc(doc: DocRico | null | undefined): DocRico {
    const bloques = (doc?.bloques ?? []).map(normalizarBloque);
    if (!bloques.length) bloques.push({ tipo: "parrafo", tramos: [] });
    return { bloques };
}

/** Quita párrafos vacíos al principio y al final (al enviar). */
export function recortarDoc(doc: DocRico): DocRico {
    const vacio = (b: BloqueDoc) => (b.tipo === "parrafo" || b.tipo === "titulo" || b.tipo === "cita") && !b.tramos.some((t) => t.texto.trim());
    const bloques = [...doc.bloques];
    while (bloques.length && vacio(bloques[0])) bloques.shift();
    while (bloques.length && vacio(bloques[bloques.length - 1])) bloques.pop();
    return { bloques };
}

// ───────────────────────────── Modelo → DOM ─────────────────────────────

function nodosDeTexto(d: Document, texto: string): Node[] {
    const out: Node[] = [];
    texto.split("\n").forEach((parte, i) => {
        if (i > 0) out.push(d.createElement("br"));
        if (parte) out.push(d.createTextNode(parte));
    });
    return out;
}

function crearTramo(d: Document, t: TramoTexto): Node[] {
    let nodos = nodosDeTexto(d, t.texto);
    const marcas = new Set(t.marcas ?? []);
    for (const m of [...ORDEN_MARCAS].reverse()) {
        if (!marcas.has(m)) continue;
        const el = d.createElement(ETIQUETA_MARCA[m]);
        el.append(...nodos);
        nodos = [el];
    }
    if (t.color || t.resaltado || t.fuente || t.tamano) {
        const span = d.createElement("span");
        span.setAttribute("data-estilo", "");
        if (t.color) {
            span.setAttribute("data-color", t.color);
            span.style.color = t.color;
        }
        if (t.resaltado) {
            span.setAttribute("data-resaltado", t.resaltado);
            span.style.backgroundColor = t.resaltado;
        }
        if (t.fuente) {
            span.setAttribute("data-fuente", t.fuente);
            const familia = fuenteCss(t.fuente);
            if (familia) span.style.fontFamily = familia;
        }
        if (t.tamano) {
            span.setAttribute("data-tamano", String(t.tamano));
            span.style.fontSize = `${t.tamano}px`;
        }
        span.append(...nodos);
        nodos = [span];
    }
    if (t.enlace) {
        const enlace = enlaceSeguro(t.enlace);
        if (enlace) {
            const a = d.createElement("a");
            a.setAttribute("href", enlace);
            a.setAttribute("data-enlace", "");
            a.setAttribute("rel", "noopener noreferrer");
            a.append(...nodos);
            nodos = [a];
        }
    }
    return nodos;
}

function anexarTramos(d: Document, cont: HTMLElement, tramos: TramoTexto[]) {
    const limpios = tramos.filter((t) => t.texto);
    if (!limpios.length) {
        cont.appendChild(d.createElement("br"));
        return;
    }
    for (const t of limpios) cont.append(...crearTramo(d, t));
    // Un salto final no se ve sin un <br> de relleno detrás (y el parseo lo descarta).
    if (limpios[limpios.length - 1].texto.endsWith("\n")) cont.appendChild(d.createElement("br"));
}

function alinear(el: HTMLElement, al?: AlineacionBloque) {
    if (!al || al === "izquierda") return;
    el.setAttribute("data-alinear", al);
    el.style.textAlign = CSS_ALINEACION[al];
}

function crearBloque(d: Document, b: BloqueDoc): HTMLElement {
    switch (b.tipo) {
        case "parrafo": {
            const p = d.createElement("p");
            alinear(p, b.alineacion);
            anexarTramos(d, p, b.tramos);
            return p;
        }
        case "titulo": {
            const h = d.createElement(`h${b.nivel}`);
            alinear(h, b.alineacion);
            anexarTramos(d, h, b.tramos);
            return h;
        }
        case "lista": {
            const l = d.createElement(b.ordenada ? "ol" : "ul");
            for (const it of b.items) {
                const li = d.createElement("li");
                anexarTramos(d, li, it);
                l.appendChild(li);
            }
            return l;
        }
        case "tareas": {
            const l = d.createElement("ul");
            l.setAttribute("data-tareas", "1");
            for (const it of b.items) {
                const li = d.createElement("li");
                li.setAttribute("data-hecha", it.hecha ? "1" : "0");
                anexarTramos(d, li, it.tramos);
                l.appendChild(li);
            }
            return l;
        }
        case "cita": {
            const q = d.createElement("blockquote");
            anexarTramos(d, q, b.tramos);
            return q;
        }
        case "codigo": {
            const pre = d.createElement("pre");
            if (b.lenguaje) pre.setAttribute("data-lenguaje", b.lenguaje);
            if (b.texto) pre.appendChild(d.createTextNode(b.texto));
            else pre.appendChild(d.createElement("br"));
            return pre;
        }
        case "separador": {
            const hr = d.createElement("hr");
            hr.setAttribute("contenteditable", "false");
            return hr;
        }
    }
}

/** Nodos DOM canónicos de un documento. */
export function crearNodosDoc(d: Document, doc: DocRico): HTMLElement[] {
    const n = normalizarDoc(doc);
    return n.bloques.map((b) => crearBloque(d, b));
}

/** Sustituye el contenido del editor por el documento. */
export function pintarDoc(raiz: HTMLElement, doc: DocRico): void {
    const d = raiz.ownerDocument;
    raiz.replaceChildren(...crearNodosDoc(d, doc));
}

// ───────────────────────────── DOM → modelo ─────────────────────────────

export interface Atomo {
    tipo: "texto" | "salto";
    texto: string;
    fmt: FormatoTramo;
    nodo: Node;
    inicio: number;
    /** Salto creado al aplanar un bloque anidado (no hay <br> real). */
    sintetico?: boolean;
}

export interface LineaParseada {
    atomos: Atomo[];
    longitud: number;
    /** Nodos que contienen la línea (el <p>, el <li>… o el grupo de nodos sueltos). */
    contenedores: Node[];
}

export interface BloqueParseado {
    bloque: BloqueDoc;
    /** Una por ítem en listas y tareas; una en el resto; ninguna en el separador. */
    lineas: LineaParseada[];
}

export interface DomParseado {
    doc: DocRico;
    bloques: BloqueParseado[];
}

const BLOQUES = new Set([
    "P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "HR", "SECTION", "ARTICLE",
    "HEADER", "FOOTER", "ASIDE", "NAV", "MAIN", "FIGURE", "FIGCAPTION", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "DL", "DT", "DD", "ADDRESS", "DETAILS", "SUMMARY",
]);
const IGNORAR = new Set([
    "SCRIPT", "STYLE", "TEMPLATE", "IFRAME", "OBJECT", "EMBED", "SVG", "CANVAS", "VIDEO", "AUDIO", "IMG", "PICTURE", "INPUT", "TEXTAREA",
    "SELECT", "BUTTON", "NOSCRIPT", "HEAD", "META", "LINK", "TITLE", "MATH",
]);

function esElemento(n: Node): n is HTMLElement {
    return n.nodeType === 1;
}

function esBloque(n: Node): boolean {
    return esElemento(n) && BLOQUES.has(n.tagName.toUpperCase());
}

/** rgb()/rgba()/hex CSS → hex; transparente → undefined. */
export function cssAHex(valor: string | null | undefined): string | undefined {
    if (!valor) return undefined;
    const v = valor.trim().toLowerCase();
    if (!v || v === "transparent" || v === "inherit" || v === "initial" || v === "currentcolor") return undefined;
    const hex = colorValido(v);
    if (hex) return hex;
    const m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
    if (!m) return undefined;
    const c = [m[1], m[2], m[3]].map((x) => Math.max(0, Math.min(255, parseInt(x, 10))).toString(16).padStart(2, "0")).join("");
    if (m[4] !== undefined) {
        const a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        if (!Number.isFinite(a) || a <= 0) return undefined;
        if (a < 1) return `#${c}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
    }
    return `#${c}`;
}

function fmtDe(el: HTMLElement, base: FormatoTramo): FormatoTramo {
    const marcas = new Set(base.marcas);
    const f: FormatoTramo = { ...base, marcas: [] };
    const tag = el.tagName.toUpperCase();
    if (tag === "STRONG" || tag === "B") marcas.add("negrita");
    if (tag === "EM" || tag === "I") marcas.add("cursiva");
    if (tag === "U" || tag === "INS") marcas.add("subrayado");
    if (tag === "S" || tag === "STRIKE" || tag === "DEL") marcas.add("tachado");
    if (tag === "CODE" || tag === "KBD" || tag === "SAMP" || tag === "TT") marcas.add("codigo");
    if (tag === "A") {
        const enlace = enlaceSeguro(el.getAttribute("href"));
        if (enlace) f.enlace = enlace;
    }
    if (tag === "MARK" && !f.resaltado) f.resaltado = "#fde047";
    if (tag === "FONT") {
        const c = cssAHex(el.getAttribute("color"));
        if (c) f.color = c;
    }
    const st = el.style;
    const color = colorValido(el.getAttribute("data-color")) ?? cssAHex(st?.color);
    if (color) f.color = color;
    const resaltado = colorValido(el.getAttribute("data-resaltado")) ?? cssAHex(st?.backgroundColor);
    if (resaltado) f.resaltado = resaltado;
    const fuente = el.getAttribute("data-fuente");
    if (fuente && IDS_FUENTE.has(fuente)) f.fuente = fuente as FuenteMensaje;
    const tamAttr = el.getAttribute("data-tamano");
    const tamCss = st?.fontSize && /^\d+(\.\d+)?px$/.test(st.fontSize) ? parseFloat(st.fontSize) : undefined;
    const tam = acotar(tamAttr !== null ? Number(tamAttr) : tamCss, LIMITES_FORMATO.tamanoMin, LIMITES_FORMATO.tamanoMax);
    if (tam !== undefined) f.tamano = tam;
    const peso = st?.fontWeight;
    if (peso) {
        if (peso === "bold" || peso === "bolder" || Number(peso) >= 600) marcas.add("negrita");
        else if (peso === "normal" || peso === "lighter" || Number(peso) < 600) marcas.delete("negrita");
    }
    if (st?.fontStyle === "italic" || st?.fontStyle === "oblique") marcas.add("cursiva");
    else if (st?.fontStyle === "normal") marcas.delete("cursiva");
    const deco = `${st?.textDecorationLine ?? ""} ${st?.textDecoration ?? ""}`;
    if (deco.includes("underline")) marcas.add("subrayado");
    if (deco.includes("line-through")) marcas.add("tachado");
    f.marcas = ORDEN_MARCAS.filter((m) => marcas.has(m));
    return f;
}

const FMT_VACIO: FormatoTramo = { marcas: [] };

/** Aplana nodos a átomos de texto/salto con su formato, con la regla del <br> de relleno final. */
function lineaDe(nodos: Node[], contenedores: Node[]): LineaParseada {
    const atomos: Atomo[] = [];
    const visitar = (n: Node, fmt: FormatoTramo) => {
        if (n.nodeType === 3) {
            const texto = (n as Text).data.replace(/ /g, " ");
            if (texto) atomos.push({ tipo: "texto", texto, fmt, nodo: n, inicio: 0 });
            return;
        }
        if (!esElemento(n)) return;
        const tag = n.tagName.toUpperCase();
        if (IGNORAR.has(tag)) return;
        if (tag === "BR") {
            atomos.push({ tipo: "salto", texto: "\n", fmt, nodo: n, inicio: 0 });
            return;
        }
        if (tag === "HR") return;
        if (esBloque(n)) {
            // Bloque anidado (div dentro de un <li> o de una cita): empieza en línea nueva.
            if (atomos.length && atomos[atomos.length - 1].tipo !== "salto") {
                atomos.push({ tipo: "salto", texto: "\n", fmt, nodo: n, inicio: 0, sintetico: true });
            }
            const desde = atomos.length;
            for (const h of Array.from(n.childNodes)) visitar(h, fmt);
            const ultimo = atomos[atomos.length - 1];
            if (atomos.length > desde && ultimo.tipo === "salto" && !ultimo.sintetico) atomos.pop();
            return;
        }
        const f = fmtDe(n, fmt);
        for (const h of Array.from(n.childNodes)) visitar(h, f);
    };
    for (const n of nodos) visitar(n, FMT_VACIO);
    const ultimo = atomos[atomos.length - 1];
    if (ultimo && ultimo.tipo === "salto") atomos.pop();
    let pos = 0;
    for (const a of atomos) {
        a.inicio = pos;
        pos += a.texto.length;
    }
    return { atomos, longitud: pos, contenedores };
}

function tramosDeLinea(l: LineaParseada): TramoTexto[] {
    return normalizarTramos(l.atomos.map((a) => tramoCon(a.texto, a.fmt)));
}

function alineacionDe(el: HTMLElement): AlineacionBloque | undefined {
    const attr = el.getAttribute("data-alinear");
    if (attr && ALINEACIONES.has(attr)) return attr as AlineacionBloque;
    const css = el.style?.textAlign;
    return css ? ALINEACION_DE_CSS[css] : undefined;
}

function textoPlanoDeLinea(l: LineaParseada): string {
    return l.atomos.map((a) => a.texto).join("");
}

/** Lee el DOM del editor y lo reduce a `DocRico` (más el mapa de átomos para la selección). */
export function parsearDom(raiz: HTMLElement): DomParseado {
    const bloques: BloqueParseado[] = [];
    const conAlineacion = (b: BloqueDoc, el: HTMLElement): BloqueDoc => {
        const al = alineacionDe(el);
        if (al && al !== "izquierda" && (b.tipo === "parrafo" || b.tipo === "titulo")) b.alineacion = al;
        return b;
    };
    const parrafoDe = (nodos: Node[]) => {
        const l = lineaDe(nodos, nodos);
        bloques.push({ bloque: { tipo: "parrafo", tramos: tramosDeLinea(l) }, lineas: [l] });
    };

    const procesarLista = (lista: HTMLElement) => {
        const tareas = lista.hasAttribute("data-tareas");
        const lineas: LineaParseada[] = [];
        const hechas: boolean[] = [];
        const recorrer = (cont: HTMLElement, hechaPadre: boolean) => {
            let sueltos: Node[] = [];
            const vaciar = () => {
                if (sueltos.length) {
                    const l = lineaDe(sueltos, sueltos);
                    if (l.longitud || lineas.length === 0) {
                        lineas.push(l);
                        hechas.push(hechaPadre);
                    }
                    sueltos = [];
                }
            };
            for (const h of Array.from(cont.childNodes)) {
                if (esElemento(h) && h.tagName.toUpperCase() === "LI") {
                    vaciar();
                    // Sublistas dentro del <li>: sus ítems se aplanan detrás (no hay anidación).
                    const propios = Array.from(h.childNodes).filter((x) => !(esElemento(x) && /^(UL|OL)$/i.test(x.tagName)));
                    const sub = Array.from(h.childNodes).filter((x): x is HTMLElement => esElemento(x) && /^(UL|OL)$/i.test(x.tagName));
                    lineas.push(lineaDe(propios, [h]));
                    hechas.push(h.getAttribute("data-hecha") === "1");
                    for (const s of sub) recorrer(s, false);
                } else if (esElemento(h) && /^(UL|OL)$/i.test(h.tagName)) {
                    vaciar();
                    recorrer(h, false);
                } else if (h.nodeType === 3 && !(h as Text).data.trim()) {
                    continue;
                } else {
                    sueltos.push(h);
                }
            }
            vaciar();
        };
        recorrer(lista, false);
        if (!lineas.length) lineas.push({ atomos: [], longitud: 0, contenedores: [lista] });
        const bloque: BloqueDoc = tareas
            ? { tipo: "tareas", items: lineas.map((l, i) => ({ hecha: !!hechas[i], tramos: tramosDeLinea(l) })) }
            : { tipo: "lista", ordenada: lista.tagName.toUpperCase() === "OL", items: lineas.map(tramosDeLinea) };
        bloques.push({ bloque, lineas });
    };

    const procesarBloque = (el: HTMLElement) => {
        const tag = el.tagName.toUpperCase();
        if (IGNORAR.has(tag)) return;
        if (tag === "HR") {
            bloques.push({ bloque: { tipo: "separador" }, lineas: [] });
            return;
        }
        if (/^H[1-6]$/.test(tag)) {
            const nivel = Math.min(3, Number(tag[1])) as 1 | 2 | 3;
            const l = lineaDe(Array.from(el.childNodes), [el]);
            bloques.push({ bloque: conAlineacion({ tipo: "titulo", nivel, tramos: tramosDeLinea(l) }, el), lineas: [l] });
            return;
        }
        if (tag === "UL" || tag === "OL") {
            procesarLista(el);
            return;
        }
        if (tag === "BLOCKQUOTE") {
            const l = lineaDe(Array.from(el.childNodes), [el]);
            bloques.push({ bloque: { tipo: "cita", tramos: tramosDeLinea(l) }, lineas: [l] });
            return;
        }
        if (tag === "PRE") {
            const l = lineaDe(Array.from(el.childNodes), [el]);
            const bloque: BloqueDoc = { tipo: "codigo", texto: textoPlanoDeLinea(l).replace(/\n+$/, "") };
            const lenguaje = el.getAttribute("data-lenguaje");
            if (lenguaje && /^[a-z0-9+#._-]{1,24}$/i.test(lenguaje)) bloque.lenguaje = lenguaje.toLowerCase();
            bloques.push({ bloque, lineas: [l] });
            return;
        }
        if (tag === "P" || tag === "LI" || tag === "DT" || tag === "DD" || tag === "FIGCAPTION" || tag === "SUMMARY" || tag === "ADDRESS") {
            const l = lineaDe(Array.from(el.childNodes), [el]);
            bloques.push({ bloque: conAlineacion({ tipo: "parrafo", tramos: tramosDeLinea(l) }, el), lineas: [l] });
            return;
        }
        // Contenedor genérico (div, section…): si lleva bloques dentro, se recorre como la raíz.
        if (Array.from(el.childNodes).some(esBloque)) {
            recorrerNivel(el);
            return;
        }
        const l = lineaDe(Array.from(el.childNodes), [el]);
        bloques.push({ bloque: conAlineacion({ tipo: "parrafo", tramos: tramosDeLinea(l) }, el), lineas: [l] });
    };

    const recorrerNivel = (cont: HTMLElement) => {
        let sueltos: Node[] = [];
        const vaciar = () => {
            if (sueltos.length) {
                const soloEspacio = sueltos.every((n) => n.nodeType === 3 && !/\S/.test((n as Text).data) && /\n/.test((n as Text).data));
                if (!soloEspacio) parrafoDe(sueltos);
                sueltos = [];
            }
        };
        for (const n of Array.from(cont.childNodes)) {
            if (esBloque(n)) {
                vaciar();
                procesarBloque(n as HTMLElement);
            } else if (esElemento(n) && IGNORAR.has(n.tagName.toUpperCase())) {
                continue;
            } else if (esElemento(n) && n.tagName.toUpperCase() === "BR" && !sueltos.length) {
                // <br> suelto en la raíz (el navegador lo deja al borrarlo todo): párrafo vacío.
                parrafoDe([n]);
            } else {
                sueltos.push(n);
            }
        }
        vaciar();
    };

    recorrerNivel(raiz);
    if (!bloques.length) bloques.push({ bloque: { tipo: "parrafo", tramos: [] }, lineas: [{ atomos: [], longitud: 0, contenedores: [raiz] }] });
    return { doc: { bloques: bloques.map((b) => b.bloque) }, bloques };
}

/** Atajo: solo el documento. */
export function domADoc(raiz: HTMLElement): DocRico {
    return parsearDom(raiz).doc;
}

// ───────────────────────────── Selección ⇄ posiciones ─────────────────────────────

export interface PosDoc {
    bloque: number;
    item: number;
    off: number;
}

export interface RangoDoc {
    inicio: PosDoc;
    fin: PosDoc;
}

function contiene(c: Node, n: Node): boolean {
    return c === n || c.contains(n);
}

/** ¿El punto (nodo, offset) queda antes del inicio de `a`? */
function puntoAntesDe(nodo: Node, offset: number, a: Node): boolean {
    if (nodo.nodeType === 3) return nodo !== a && !!(nodo.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
    const ref = nodo.childNodes[offset];
    if (ref) return contiene(ref, a) || !!(ref.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
    return !contiene(nodo, a) && !!(nodo.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/** Posición del modelo de un punto del DOM. */
export function posDeDom(p: DomParseado, raiz: HTMLElement, nodo: Node, offset: number): PosDoc | null {
    if (!contiene(raiz, nodo)) return null;
    // Punto directamente en la raíz: principio del bloque que sigue, o final del último.
    if (nodo === raiz) {
        const ref = raiz.childNodes[offset];
        for (let b = 0; b < p.bloques.length; b++) {
            const lineas = p.bloques[b].lineas;
            for (let i = 0; i < lineas.length; i++) {
                if (ref && lineas[i].contenedores.some((c) => contiene(c, ref) || contiene(ref, c))) return { bloque: b, item: i, off: 0 };
            }
        }
        const ultimo = p.bloques.length - 1;
        const lineas = p.bloques[ultimo].lineas;
        return { bloque: ultimo, item: Math.max(0, lineas.length - 1), off: lineas[lineas.length - 1]?.longitud ?? 0 };
    }
    let hallado: { b: number; i: number } | null = null;
    for (let b = 0; b < p.bloques.length; b++) {
        const lineas = p.bloques[b].lineas;
        for (let i = 0; i < lineas.length; i++) {
            if (lineas[i].contenedores.some((c) => contiene(c, nodo))) hallado = { b, i }; // el último = el más profundo
        }
        if (!lineas.length && p.bloques[b].bloque.tipo === "separador") continue;
    }
    if (!hallado) {
        // Dentro de un separador u otro nodo sin líneas: principio del bloque siguiente.
        for (let b = 0; b < p.bloques.length; b++) {
            for (let i = 0; i < p.bloques[b].lineas.length; i++) {
                const primero = p.bloques[b].lineas[i].contenedores[0];
                if (primero && puntoAntesDe(nodo, offset, primero)) return { bloque: b, item: i, off: 0 };
            }
        }
        return null;
    }
    const linea = p.bloques[hallado.b].lineas[hallado.i];
    for (const a of linea.atomos) {
        if (a.nodo === nodo && a.tipo === "texto") return { bloque: hallado.b, item: hallado.i, off: a.inicio + Math.min(offset, a.texto.length) };
        if (puntoAntesDe(nodo, offset, a.nodo)) return { bloque: hallado.b, item: hallado.i, off: a.inicio };
    }
    return { bloque: hallado.b, item: hallado.i, off: linea.longitud };
}

/** Punto del DOM de una posición del modelo. */
export function domDePos(p: DomParseado, raiz: HTMLElement, pos: PosDoc): { nodo: Node; offset: number } {
    const bloque = p.bloques[Math.max(0, Math.min(pos.bloque, p.bloques.length - 1))];
    const linea = bloque?.lineas[Math.max(0, Math.min(pos.item, (bloque?.lineas.length ?? 1) - 1))];
    if (!linea) {
        // Separador: justo después del bloque en la raíz.
        const idx = Math.min(raiz.childNodes.length, Math.max(0, pos.bloque + 1));
        return { nodo: raiz, offset: idx };
    }
    const off = Math.max(0, Math.min(pos.off, linea.longitud));
    for (const a of linea.atomos) {
        const fin = a.inicio + a.texto.length;
        if (a.tipo === "texto" && off >= a.inicio && off <= fin) return { nodo: a.nodo, offset: off - a.inicio };
        if (a.tipo === "salto" && off === a.inicio) {
            if (a.sintetico) return { nodo: a.nodo, offset: 0 };
            const padre = a.nodo.parentNode as Node;
            return { nodo: padre, offset: Array.prototype.indexOf.call(padre.childNodes, a.nodo) };
        }
    }
    const ultimo = linea.atomos[linea.atomos.length - 1];
    if (ultimo && ultimo.tipo === "salto" && !ultimo.sintetico) {
        const padre = ultimo.nodo.parentNode as Node;
        return { nodo: padre, offset: Array.prototype.indexOf.call(padre.childNodes, ultimo.nodo) + 1 };
    }
    const cont = linea.contenedores[0];
    if (cont && cont !== raiz && esElemento(cont)) return { nodo: cont, offset: 0 };
    return { nodo: raiz, offset: 0 };
}

/** Rango del modelo de la selección actual (si está dentro del editor). */
export function leerRango(raiz: HTMLElement, p: DomParseado = parsearDom(raiz)): RangoDoc | null {
    const sel = raiz.ownerDocument.getSelection?.();
    if (!sel || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0);
    if (!contiene(raiz, r.startContainer) || !contiene(raiz, r.endContainer)) return null;
    const inicio = posDeDom(p, raiz, r.startContainer, r.startOffset);
    const fin = posDeDom(p, raiz, r.endContainer, r.endOffset);
    if (!inicio || !fin) return null;
    return { inicio, fin };
}

/** Coloca la selección del documento en un rango del modelo. */
export function aplicarRango(raiz: HTMLElement, rango: RangoDoc, p: DomParseado = parsearDom(raiz)): void {
    const d = raiz.ownerDocument;
    const sel = d.getSelection?.();
    if (!sel) return;
    try {
        const a = domDePos(p, raiz, rango.inicio);
        const b = domDePos(p, raiz, rango.fin);
        const r = d.createRange();
        r.setStart(a.nodo, a.offset);
        r.setEnd(b.nodo, b.offset);
        sel.removeAllRanges();
        sel.addRange(r);
    } catch {
        /* una posición imposible no rompe la edición */
    }
}
