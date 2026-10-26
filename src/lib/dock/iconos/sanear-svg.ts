/**
 * Saneador de SVG para los iconos del dock (Ola 1025U · V1b).
 *
 * POR QUÉ UNO PROPIO: el único saneador que había en el repo (`sanitizeHtmlFragment` en
 * `components/aurora/message-renderer.tsx`) está pensado para HTML de chat y no sirve aquí: compara
 * nombres en minúsculas contra una lista con camelCase (`linearGradient`, `viewBox`), así que borra
 * los degradados y el `viewBox`, y deja pasar `href` externos y el elemento `use`. Un icono llega
 * de una IA, de un archivo importado o de la Librería pública: es entrada NO confiable.
 *
 * CÓMO: no se «limpia» el texto, se RECONSTRUYE. Un tokenizador mínimo lee las etiquetas; solo lo que
 * está en la lista blanca de elementos y de atributos sobrevive, cada valor de atributo se valida con
 * una forma estricta (números, colores, `url(#id)` local, ruta de trazo…) y el SVG se vuelve a escribir
 * desde cero. No depende del DOM (funciona igual en servidor, en pruebas y en el navegador).
 *
 * SE QUITA SIEMPRE: scripts, `style`, `foreignObject`, `use`, `image`, `a`, animaciones (`animate`,
 * `set`: pueden reescribir `href`), filtros (coste y `feImage`), manejadores `on*`, `style=`, `class=`,
 * cualquier `href` que no sea `#id` de un degradado, `url(...)` que no sea `url(#id)`, `data:`,
 * `javascript:`, entidades que lo disfracen, comentarios, CDATA y texto.
 * TOPES: tamaño de entrada, de salida, nº de elementos y profundidad.
 *
 * Además el dock pinta el resultado con `<img src="data:image/svg+xml…">`, donde el navegador no ejecuta
 * scripts ni carga recursos: dos defensas, no una.
 */

/** Tamaño máximo del SVG de un glifo ya saneado, en caracteres. */
export const MAX_SVG_CARACTERES = 6000;
/** Entrada más grande que esto ni se intenta leer. */
const MAX_ENTRADA = 80_000;
const MAX_ETIQUETAS = 4000;
const MAX_ELEMENTOS = 120;
const MAX_PROFUNDIDAD = 8;
/** Viewbox por defecto cuando el SVG no trae uno utilizable (lienzo de las variaciones de la IA). */
const VIEWBOX_DEFECTO = "0 0 64 64";

export interface ResultadoSaneado {
    ok: boolean;
    /** El SVG reconstruido (vacío si `ok` es false). */
    svg: string;
    /** Lo que se quitó o por qué se rechazó, en español y sin repetidos. */
    motivos: string[];
    /** Cuántas piezas (elementos o atributos) se quitaron. */
    quitados: number;
}

export interface OpcionesSaneado {
    /** Prefijo de los `id` internos (para que dos iconos en la misma página no choquen). */
    prefijoId?: string;
    /** Tope de salida; por defecto `MAX_SVG_CARACTERES`. */
    maxCaracteres?: number;
}

/* ─────────────────────────── Listas blancas ─────────────────────────── */

/** minúsculas → nombre canónico (el SVG distingue mayúsculas). */
const ELEMENTOS: Record<string, string> = {
    svg: "svg", g: "g", path: "path", circle: "circle", ellipse: "ellipse", rect: "rect",
    line: "line", polyline: "polyline", polygon: "polygon", defs: "defs",
    lineargradient: "linearGradient", radialgradient: "radialGradient", stop: "stop",
    clippath: "clipPath", mask: "mask",
};

/** Elementos cuyo contenido es texto crudo: se saltan enteros hasta su cierre. */
const CRUDOS = new Set(["script", "style", "textarea", "title", "xmp", "noscript"]);

type TipoAtributo =
    | "num" | "numlista" | "ruta" | "transformacion" | "pintura" | "refurl" | "id" | "href"
    | "dasharray" | "preserve" | "vector"
    | { enum: readonly string[] };

const UNIDADES: readonly string[] = ["userSpaceOnUse", "objectBoundingBox"];

/** minúsculas → [nombre canónico, tipo]. */
const ATRIBUTOS: Record<string, [string, TipoAtributo]> = {
    viewbox: ["viewBox", "numlista"],
    x: ["x", "num"], y: ["y", "num"], width: ["width", "num"], height: ["height", "num"],
    cx: ["cx", "num"], cy: ["cy", "num"], r: ["r", "num"], rx: ["rx", "num"], ry: ["ry", "num"],
    x1: ["x1", "num"], y1: ["y1", "num"], x2: ["x2", "num"], y2: ["y2", "num"],
    fx: ["fx", "num"], fy: ["fy", "num"], fr: ["fr", "num"], offset: ["offset", "num"],
    d: ["d", "ruta"], points: ["points", "numlista"],
    fill: ["fill", "pintura"], stroke: ["stroke", "pintura"], "stop-color": ["stop-color", "pintura"],
    "fill-opacity": ["fill-opacity", "num"], "stroke-opacity": ["stroke-opacity", "num"],
    opacity: ["opacity", "num"], "stop-opacity": ["stop-opacity", "num"],
    "stroke-width": ["stroke-width", "num"], "stroke-miterlimit": ["stroke-miterlimit", "num"],
    "stroke-dashoffset": ["stroke-dashoffset", "num"], "stroke-dasharray": ["stroke-dasharray", "dasharray"],
    "stroke-linecap": ["stroke-linecap", { enum: ["butt", "round", "square"] }],
    "stroke-linejoin": ["stroke-linejoin", { enum: ["miter", "round", "bevel", "arcs", "miter-clip"] }],
    "fill-rule": ["fill-rule", { enum: ["nonzero", "evenodd"] }],
    "clip-rule": ["clip-rule", { enum: ["nonzero", "evenodd"] }],
    transform: ["transform", "transformacion"], gradienttransform: ["gradientTransform", "transformacion"],
    gradientunits: ["gradientUnits", { enum: UNIDADES }],
    clippathunits: ["clipPathUnits", { enum: UNIDADES }],
    maskunits: ["maskUnits", { enum: UNIDADES }],
    maskcontentunits: ["maskContentUnits", { enum: UNIDADES }],
    spreadmethod: ["spreadMethod", { enum: ["pad", "reflect", "repeat"] }],
    "clip-path": ["clip-path", "refurl"], mask: ["mask", "refurl"],
    id: ["id", "id"],
    href: ["href", "href"], "xlink:href": ["href", "href"],
    preserveaspectratio: ["preserveAspectRatio", "preserve"],
    "vector-effect": ["vector-effect", "vector"],
};

/** Atributos de «papeleo» de la raíz que se descartan sin avisar (no son contenido ni riesgo). */
const IGNORADOS = new Set(["xmlns", "xmlns:xlink", "version", "baseprofile", "xml:space", "xml:lang", "role", "focusable", "aria-hidden"]);

/* ─────────────────────────── Validadores de valor ─────────────────────────── */

const RE_NUM = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?(?:px|%|em|rem|deg|pt)?$/i;
const RE_NUMLISTA = /^[\d\s.,eE+\-%]*$/;
const RE_RUTA = /^[MmLlHhVvCcSsQqTtAaZz\d\s.,eE+-]*$/;
const RE_TRANSFORM = /^(?:\s*(?:translate|scale|rotate|skewX|skewY|matrix)\s*\([\d\s.,eE+-]*\)\s*)*$/;
const RE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const RE_REF_LOCAL = /^url\(\s*#([A-Za-z][A-Za-z0-9_-]{0,31})\s*\)$/;
const RE_HREF_LOCAL = /^#([A-Za-z][A-Za-z0-9_-]{0,31})$/;
const RE_COLOR_HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RE_COLOR_FUNC = /^(?:rgb|rgba|hsl|hsla)\(\s*[\d\s.,%/-]{1,60}\)$/i;
const RE_COLOR_NOMBRE = /^[a-zA-Z]{3,20}$/;
const RE_PRESERVE = /^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max))(?:\s+(?:meet|slice))?$/;

/** Magnitud razonable: un `r="999999"` no dibuja nada útil y complica el rasterizado. */
const MAX_MAGNITUD = 5000;

function numeroSeguro(t: string): boolean {
    if (!RE_NUM.test(t)) return false;
    const n = parseFloat(t);
    if (!Number.isFinite(n)) return false;
    return /%$/.test(t) ? Math.abs(n) <= 1000 : Math.abs(n) <= MAX_MAGNITUD;
}

function listaNumerosSegura(t: string, maxCaracteres: number): boolean {
    if (t.length > maxCaracteres || !RE_NUMLISTA.test(t)) return false;
    return t.split(/[\s,]+/).filter(Boolean).every((n) => {
        const v = parseFloat(n);
        return Number.isFinite(v) && Math.abs(v) <= MAX_MAGNITUD;
    });
}

/** Colores y `url(#id)` local (con un color de respaldo opcional). */
function pinturaSegura(t: string): { ok: boolean; ref?: string } {
    const v = t.trim();
    if (!v || v.length > 80) return { ok: false };
    if (/^(?:none|currentColor|transparent|inherit)$/i.test(v)) return { ok: true };
    if (RE_COLOR_HEX.test(v) || RE_COLOR_FUNC.test(v)) return { ok: true };
    const ref = v.match(/^(url\(\s*#[A-Za-z][A-Za-z0-9_-]{0,31}\s*\))(?:\s+(.+))?$/);
    if (ref) {
        const respaldo = ref[2]?.trim();
        if (respaldo && !pinturaSegura(respaldo).ok) return { ok: false };
        const id = ref[1].match(RE_REF_LOCAL);
        return id ? { ok: true, ref: id[1] } : { ok: false };
    }
    if (RE_COLOR_NOMBRE.test(v)) return { ok: true };
    return { ok: false };
}

/** Quita lo que podría disfrazar un esquema peligroso antes de validar (nunca se escribe esto). */
function decodificarEntidades(valor: string): string | null {
    let fuera = "";
    let i = 0;
    while (i < valor.length) {
        const c = valor[i];
        if (c !== "&") { fuera += c; i++; continue; }
        const fin = valor.indexOf(";", i);
        if (fin === -1 || fin - i > 10) return null;
        const ent = valor.slice(i + 1, fin);
        let ch: string | null = null;
        if (ent[0] === "#") {
            const n = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
            if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return null;
            ch = String.fromCodePoint(n);
        } else {
            const mapa: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
            ch = mapa[ent] ?? null;
        }
        if (ch === null) return null;
        fuera += ch;
        i = fin + 1;
    }
    return fuera;
}

/* ─────────────────────────── Tokenizador ─────────────────────────── */

interface Atributo { nombre: string; valor: string }

type Token =
    | { t: "abre"; nombre: string; attrs: Atributo[]; autocierre: boolean }
    | { t: "cierra"; nombre: string };

/** Lee las etiquetas del texto. Descarta texto, comentarios, CDATA, instrucciones y doctype. */
function tokenizar(src: string): { tokens: Token[]; truncado: boolean } {
    const tokens: Token[] = [];
    let i = 0;
    let crudos = 0;
    const n = src.length;
    while (i < n) {
        const lt = src.indexOf("<", i);
        if (lt === -1) break;
        i = lt;
        if (tokens.length >= MAX_ETIQUETAS) return { tokens, truncado: true };

        if (src.startsWith("<!--", i)) {
            const fin = src.indexOf("-->", i + 4);
            if (fin === -1) break;
            i = fin + 3;
            continue;
        }
        if (src.startsWith("<![CDATA[", i)) {
            const fin = src.indexOf("]]>", i + 9);
            if (fin === -1) break;
            i = fin + 3;
            continue;
        }
        if (src[i + 1] === "!" || src[i + 1] === "?") {
            const fin = src.indexOf(">", i + 2);
            if (fin === -1) break;
            i = fin + 1;
            continue;
        }
        if (src[i + 1] === "/") {
            const m = /^<\/\s*([A-Za-z][\w:.-]*)[^>]*>/.exec(src.slice(i, i + 200));
            if (!m) { i += 2; continue; }
            tokens.push({ t: "cierra", nombre: m[1].toLowerCase() });
            i += m[0].length;
            continue;
        }
        const mNombre = /^<([A-Za-z][\w:.-]*)/.exec(src.slice(i, i + 80));
        if (!mNombre) { i += 1; continue; } // un «<» suelto es texto
        const nombre = mNombre[1].toLowerCase();
        let j = i + mNombre[0].length;
        const attrs: Atributo[] = [];
        let autocierre = false;
        let cerrado = false;
        while (j < n) {
            // espacios y «/» sueltos hacen de separador (`<svg/onload=…>` es válido para un navegador)
            while (j < n && /[\s/]/.test(src[j])) {
                if (src[j] === "/" && src[j + 1] === ">") { autocierre = true; }
                j++;
            }
            if (j >= n) break;
            if (src[j] === ">") { j++; cerrado = true; break; }
            const mAttr = /^[^\s=/>"'<]+/.exec(src.slice(j, j + 120));
            if (!mAttr) { j++; continue; }
            const an = mAttr[0];
            j += an.length;
            while (j < n && /\s/.test(src[j])) j++;
            let valor = "";
            if (src[j] === "=") {
                j++;
                while (j < n && /\s/.test(src[j])) j++;
                const q = src[j];
                if (q === '"' || q === "'") {
                    const fin = src.indexOf(q, j + 1);
                    if (fin === -1) { return { tokens, truncado: true }; } // comilla sin cerrar: se corta aquí
                    valor = src.slice(j + 1, fin);
                    j = fin + 1;
                } else {
                    const mVal = /^[^\s>]*/.exec(src.slice(j, j + 400));
                    const crudo = mVal?.[0] ?? "";
                    if (crudo.endsWith("/") && src[j + crudo.length] === ">") autocierre = true;
                    valor = crudo.replace(/\/$/, "");
                    j += crudo.length;
                }
            }
            if (attrs.length < 60) attrs.push({ nombre: an, valor });
        }
        if (!cerrado) break;
        tokens.push({ t: "abre", nombre, attrs, autocierre });
        i = j;
        if (!autocierre && CRUDOS.has(nombre)) {
            if (++crudos > 20) return { tokens, truncado: true };
            // salta su contenido crudo hasta el cierre (puede traer «<» que no son etiquetas)
            const re = new RegExp(`</\\s*${nombre}\\b[^>]*>`, "i");
            const m = re.exec(src.slice(i));
            if (!m) break;
            i += m.index + m[0].length;
            tokens.push({ t: "cierra", nombre });
        }
    }
    return { tokens, truncado: false };
}

/* ─────────────────────────── Árbol ─────────────────────────── */

interface Nodo {
    nombre: string;       // canónico si es de la lista blanca; si no, tal cual (minúsculas)
    /** Nombre tal como se leyó, en minúsculas (para emparejar con la etiqueta de cierre). */
    etiqueta: string;
    permitido: boolean;
    attrs: Atributo[];
    hijos: Nodo[];
}

function construirArbol(tokens: Token[]): { raiz: Nodo | null; descartados: string[] } {
    const descartados: string[] = [];
    let raiz: Nodo | null = null;
    const pila: Nodo[] = [];
    for (const tk of tokens) {
        if (tk.t === "abre") {
            const canon = ELEMENTOS[tk.nombre];
            const padre = pila[pila.length - 1];
            // La raíz es el primer <svg>; un <svg> anidado se descarta (no se necesita).
            const esRaiz = !raiz && tk.nombre === "svg";
            if (!raiz && !esRaiz) { descartados.push(tk.nombre); continue; }
            const nodo: Nodo = {
                nombre: canon ?? tk.nombre,
                etiqueta: tk.nombre,
                permitido: !!canon && (esRaiz || tk.nombre !== "svg") && (esRaiz || (!!padre && padre.permitido)),
                attrs: tk.attrs,
                hijos: [],
            };
            if (!nodo.permitido) descartados.push(tk.nombre);
            if (esRaiz) raiz = nodo;
            else if (padre) padre.hijos.push(nodo);
            if (!tk.autocierre) pila.push(nodo);
        } else {
            // cierra el elemento abierto más cercano con ese nombre (lectura tolerante)
            for (let k = pila.length - 1; k >= 0; k--) {
                if (pila[k].etiqueta === tk.nombre) { pila.length = k; break; }
            }
            if (raiz && pila.length === 0) break; // el <svg> raíz se cerró: lo demás no cuenta
        }
    }
    return { raiz, descartados };
}

/* ─────────────────────────── Reescritura ─────────────────────────── */

function escapar(v: string): string {
    return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface Contexto {
    motivos: Set<string>;
    quitados: number;
    elementos: number;
    prefijo: string;
    idsViejos: Set<string>;
    mapaIds: Map<string, string>;
}

function recogerIds(nodo: Nodo, ids: Set<string>, prof: number): void {
    if (!nodo.permitido || prof > MAX_PROFUNDIDAD) return;
    for (const a of nodo.attrs) {
        if (a.nombre.toLowerCase() === "id") {
            const v = decodificarEntidades(a.valor);
            if (v !== null && RE_ID.test(v)) ids.add(v);
        }
    }
    for (const h of nodo.hijos) recogerIds(h, ids, prof + 1);
}

/** Valida un atributo; devuelve el valor a escribir o null si se quita. */
function validarAtributo(
    nombreMin: string, tipo: TipoAtributo, valorCrudo: string, elemento: string, ctx: Contexto,
): { nombre: string; valor: string } | null {
    const nombreCanon = ATRIBUTOS[nombreMin][0];
    const dec = decodificarEntidades(valorCrudo);
    if (dec === null) return null;
    const v = dec.trim();
    if (v.length > 4000) return null;

    const remapear = (idViejo: string): string | null => {
        if (!ctx.idsViejos.has(idViejo)) return null; // referencia a algo que no existe
        let nuevo = ctx.mapaIds.get(idViejo);
        if (!nuevo) { nuevo = `${ctx.prefijo}${ctx.mapaIds.size + 1}`; ctx.mapaIds.set(idViejo, nuevo); }
        return nuevo;
    };

    if (typeof tipo === "object") {
        const ok = tipo.enum.some((e) => e === v);
        return ok ? { nombre: nombreCanon, valor: v } : null;
    }
    switch (tipo) {
        case "num": return numeroSeguro(v) ? { nombre: nombreCanon, valor: v } : null;
        case "numlista": return listaNumerosSegura(v, nombreMin === "points" ? 2000 : 80) ? { nombre: nombreCanon, valor: v } : null;
        case "dasharray": return v === "none" || listaNumerosSegura(v, 80) ? { nombre: nombreCanon, valor: v } : null;
        case "ruta": return v.length <= 4000 && RE_RUTA.test(v) ? { nombre: nombreCanon, valor: v } : null;
        case "transformacion": return v.length <= 200 && RE_TRANSFORM.test(v) ? { nombre: nombreCanon, valor: v } : null;
        case "preserve": return RE_PRESERVE.test(v) ? { nombre: nombreCanon, valor: v } : null;
        case "vector": return v === "none" || v === "non-scaling-stroke" ? { nombre: nombreCanon, valor: v } : null;
        case "id": {
            if (!RE_ID.test(v)) return null;
            const nuevo = remapear(v);
            return nuevo ? { nombre: "id", valor: nuevo } : null;
        }
        case "href": {
            // Solo el degradado que hereda de otro (`href="#otro"`); jamás una URL.
            if (elemento !== "linearGradient" && elemento !== "radialGradient") return null;
            const m = v.match(RE_HREF_LOCAL);
            if (!m) return null;
            const nuevo = remapear(m[1]);
            return nuevo ? { nombre: "href", valor: `#${nuevo}` } : null;
        }
        case "refurl": {
            if (v === "none") return { nombre: nombreCanon, valor: "none" };
            const m = v.match(RE_REF_LOCAL);
            if (!m) return null;
            const nuevo = remapear(m[1]);
            return nuevo ? { nombre: nombreCanon, valor: `url(#${nuevo})` } : null;
        }
        case "pintura": {
            const p = pinturaSegura(v);
            if (!p.ok) return null;
            if (!p.ref) return { nombre: nombreCanon, valor: v };
            const nuevo = remapear(p.ref);
            if (!nuevo) {
                // referencia colgante: con respaldo se queda el color; sin él, no se pinta
                const respaldo = v.replace(/^url\([^)]*\)\s*/i, "").trim();
                return respaldo ? { nombre: nombreCanon, valor: respaldo } : null;
            }
            return { nombre: nombreCanon, valor: v.replace(/^url\([^)]*\)/i, `url(#${nuevo})`) };
        }
    }
}

function escribir(nodo: Nodo, ctx: Contexto, prof: number, esRaiz: boolean): string {
    if (!nodo.permitido) {
        ctx.quitados++;
        ctx.motivos.add(motivoElemento(nodo.nombre));
        return "";
    }
    if (prof > MAX_PROFUNDIDAD || ctx.elementos >= MAX_ELEMENTOS) {
        ctx.quitados++;
        ctx.motivos.add("Se recortó el SVG por tener demasiados elementos o niveles");
        return "";
    }
    ctx.elementos++;

    const partes: string[] = [];
    const vistos = new Set<string>();
    for (const a of nodo.attrs) {
        const min = a.nombre.toLowerCase();
        const def = ATRIBUTOS[min];
        if (IGNORADOS.has(min)) continue;
        if (!def || vistos.has(def[0])) {
            if (!def) {
                ctx.quitados++;
                ctx.motivos.add(motivoAtributo(min, a.valor));
            }
            continue;
        }
        if (esRaiz && (min === "width" || min === "height" || min === "viewbox")) continue; // la raíz se escribe aparte
        const r = validarAtributo(min, def[1], a.valor, nodo.nombre, ctx);
        if (!r) {
            ctx.quitados++;
            ctx.motivos.add(motivoAtributo(min, a.valor));
            continue;
        }
        vistos.add(r.nombre);
        partes.push(`${r.nombre}="${escapar(r.valor)}"`);
    }

    const dentro = nodo.hijos.map((h) => escribir(h, ctx, prof + 1, false)).join("");
    const attrs = partes.length ? " " + partes.join(" ") : "";
    return dentro ? `<${nodo.nombre}${attrs}>${dentro}</${nodo.nombre}>` : `<${nodo.nombre}${attrs}/>`;
}

function motivoElemento(nombre: string): string {
    const n = nombre.toLowerCase();
    if (n === "script") return "Se quitó un <script>";
    if (n === "style") return "Se quitó un <style>";
    if (n === "foreignobject") return "Se quitó <foreignObject>";
    if (n === "use") return "Se quitó <use> (referencias externas)";
    if (n === "image") return "Se quitó <image> (imágenes externas)";
    if (n === "a") return "Se quitó un enlace <a>";
    if (n === "animate" || n === "set" || n === "animatetransform" || n === "animatemotion") return "Se quitaron animaciones del SVG";
    if (n === "filter" || n.startsWith("fe")) return "Se quitaron filtros del SVG";
    if (n === "svg") return "Se quitó un <svg> anidado";
    if (n === "text" || n === "tspan") return "Se quitó el texto del SVG";
    return `Se quitó el elemento <${n.slice(0, 20)}>`;
}

function motivoAtributo(nombreMin: string, valor: string): string {
    if (nombreMin.startsWith("on")) return "Se quitó un manejador de eventos (on…)";
    if (nombreMin === "style") return "Se quitó el atributo style";
    if (nombreMin === "href" || nombreMin === "xlink:href") return "Se quitó un enlace externo (href)";
    if (/javascript|data:|https?:|\/\//i.test(valor)) return "Se quitó un valor con enlace o esquema no permitido";
    return `Se quitó el atributo ${nombreMin.slice(0, 24)}`;
}

/** viewBox válido de la raíz, o el derivado de width/height, o el de defecto. */
function viewBoxDe(raiz: Nodo): string {
    const buscar = (nombre: string): string | null => {
        const a = raiz.attrs.find((x) => x.nombre.toLowerCase() === nombre);
        if (!a) return null;
        const d = decodificarEntidades(a.valor);
        return d === null ? null : d.trim();
    };
    const vb = buscar("viewbox");
    if (vb && listaNumerosSegura(vb, 80)) {
        const n = vb.split(/[\s,]+/).filter(Boolean).map(Number);
        if (n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0) return n.join(" ");
    }
    const w = buscar("width");
    const h = buscar("height");
    if (w && h && numeroSeguro(w) && numeroSeguro(h) && !/%$/.test(w) && !/%$/.test(h)) {
        const wn = parseFloat(w);
        const hn = parseFloat(h);
        if (wn > 0 && hn > 0) return `0 0 ${wn} ${hn}`;
    }
    return VIEWBOX_DEFECTO;
}

const FORMAS_DIBUJABLES = /<(?:path|circle|ellipse|rect|line|polyline|polygon)\b/;

/**
 * Sanea un SVG no confiable. Nunca lanza. Si `ok` es true, `svg` es seguro para pintar y para guardar.
 */
export function sanearSvg(entrada: unknown, opciones: OpcionesSaneado = {}): ResultadoSaneado {
    const falla = (motivo: string, extra: string[] = [], quitados = 0): ResultadoSaneado =>
        ({ ok: false, svg: "", motivos: [motivo, ...extra], quitados });
    try {
        if (typeof entrada !== "string") return falla("El SVG no es texto");
        const texto = entrada.replace(/^﻿/, "").trim();
        if (!texto) return falla("El SVG está vacío");
        if (texto.length > MAX_ENTRADA) return falla(`El SVG es demasiado grande (más de ${MAX_ENTRADA / 1000} mil caracteres)`);
        const inicio = texto.search(/<svg[\s/>]/i);
        if (inicio === -1) return falla("No encontré ningún elemento <svg>");

        const { tokens, truncado } = tokenizar(texto.slice(inicio));
        const { raiz, descartados } = construirArbol(tokens);
        if (!raiz) return falla("No pude leer el elemento <svg>");

        const ids = new Set<string>();
        recogerIds(raiz, ids, 0);
        const ctx: Contexto = {
            motivos: new Set(), quitados: 0, elementos: 0,
            prefijo: (opciones.prefijoId ?? "i").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 12) || "i",
            idsViejos: ids, mapaIds: new Map(),
        };
        if (!/^[A-Za-z]/.test(ctx.prefijo)) ctx.prefijo = `i${ctx.prefijo}`;
        // Atributos de la raíz que NO son viewBox/width/height (fill, stroke…) se validan igual.
        const attrsRaiz = escribir({ ...raiz, hijos: [] }, ctx, 0, true)
            .replace(/^<svg/, "").replace(/\/>$/, "").trim();
        const interior = raiz.hijos.map((h) => escribir(h, ctx, 1, false)).join("");
        void descartados;

        const cuerpo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxDe(raiz)}"${attrsRaiz ? " " + attrsRaiz : ""}>${interior}</svg>`;
        const motivos = [...ctx.motivos];
        if (truncado) motivos.push("El SVG estaba cortado o mal cerrado: se usó lo que se pudo leer");

        const tope = Math.min(opciones.maxCaracteres ?? MAX_SVG_CARACTERES, MAX_SVG_CARACTERES * 4);
        if (cuerpo.length > tope) {
            return falla(`El SVG limpio pesa ${cuerpo.length} caracteres y el máximo es ${tope}: simplifícalo`, motivos, ctx.quitados);
        }
        if (!FORMAS_DIBUJABLES.test(interior)) {
            return falla("El SVG no dibuja nada que sea seguro mostrar", motivos, ctx.quitados);
        }
        return { ok: true, svg: cuerpo, motivos, quitados: ctx.quitados };
    } catch {
        return falla("No pude leer ese SVG");
    }
}

/** El SVG ya saneado como `data:` URL (para `<img src>`: el navegador no ejecuta nada ahí). */
export function svgADataUrl(svgSaneado: string): string {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgSaneado)}`;
}

/** Sustituye `currentColor` por un color fijo (un `<img>` no hereda el color del texto). */
export function colorearSvg(svgSaneado: string, colorHex: string): string {
    return svgSaneado.replace(/currentColor/gi, colorHex);
}
