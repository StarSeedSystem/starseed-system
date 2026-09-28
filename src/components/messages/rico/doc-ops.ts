/**
 * Operaciones del editor tipo Word sobre el MODELO (`DocRico`), no sobre el DOM.
 *
 * Aplicar negrita, color, enlace, títulos, listas… se decide aquí de forma determinista y el editor
 * repinta. Así el resultado no depende de cómo cada navegador implemente `execCommand`, y lo que se
 * ve es exactamente lo que se envía. Módulo puro (sin DOM).
 */
import type { AlineacionBloque, BloqueDoc, DocRico, MarcaTexto, TramoTexto } from "@/lib/mensajeria/formato-tipos";
import { formatoDe, normalizarTramos, tramoCon, type FormatoTramo, type PosDoc, type RangoDoc } from "./doc-dom";

// ───────────────────────────── Líneas ─────────────────────────────

/** Líneas editables de un bloque (ítems en listas; el código es una sola línea de texto). */
export function lineasDe(b: BloqueDoc): TramoTexto[][] {
    switch (b.tipo) {
        case "parrafo":
        case "titulo":
        case "cita":
            return [b.tramos];
        case "lista":
            return b.items;
        case "tareas":
            return b.items.map((i) => i.tramos);
        case "codigo":
            return [b.texto ? [{ texto: b.texto }] : []];
        case "separador":
            return [];
    }
}

function conLineas(b: BloqueDoc, lineas: TramoTexto[][]): BloqueDoc {
    switch (b.tipo) {
        case "parrafo":
            return { ...b, tramos: lineas[0] ?? [] };
        case "titulo":
            return { ...b, tramos: lineas[0] ?? [] };
        case "cita":
            return { ...b, tramos: lineas[0] ?? [] };
        case "lista":
            return { ...b, items: lineas };
        case "tareas":
            return { ...b, items: lineas.map((tramos, i) => ({ hecha: b.items[i]?.hecha ?? false, tramos })) };
        case "codigo":
            return { ...b, texto: (lineas[0] ?? []).map((t) => t.texto).join("") };
        case "separador":
            return b;
    }
}

export function largo(tramos: TramoTexto[]): number {
    return tramos.reduce((s, t) => s + t.texto.length, 0);
}

export function textoLinea(tramos: TramoTexto[]): string {
    return tramos.map((t) => t.texto).join("");
}

export function comparar(a: PosDoc, b: PosDoc): number {
    return a.bloque - b.bloque || a.item - b.item || a.off - b.off;
}

export function ordenar(r: RangoDoc): RangoDoc {
    return comparar(r.inicio, r.fin) <= 0 ? r : { inicio: r.fin, fin: r.inicio };
}

export function colapsado(r: RangoDoc): boolean {
    return comparar(r.inicio, r.fin) === 0;
}

/** Parte una lista de tramos en un carácter. */
export function partir(tramos: TramoTexto[], off: number): [TramoTexto[], TramoTexto[]] {
    const a: TramoTexto[] = [];
    const b: TramoTexto[] = [];
    let pos = 0;
    for (const t of tramos) {
        const fin = pos + t.texto.length;
        if (fin <= off) a.push(t);
        else if (pos >= off) b.push(t);
        else {
            const corte = off - pos;
            a.push({ ...t, texto: t.texto.slice(0, corte) });
            b.push({ ...t, texto: t.texto.slice(corte) });
        }
        pos = fin;
    }
    return [a, b];
}

function mapearTramos(tramos: TramoTexto[], desde: number, hasta: number, f: (fmt: FormatoTramo) => FormatoTramo): TramoTexto[] {
    const [a, resto] = partir(tramos, desde);
    const [b, c] = partir(resto, Math.max(0, hasta - desde));
    return normalizarTramos([...a, ...b.map((t) => tramoCon(t.texto, f(formatoDe(t)))), ...c]);
}

/** Recorre cada línea que toca el rango, con su tramo [desde, hasta). El código no admite formato. */
function recorrerRango(doc: DocRico, r: RangoDoc, cb: (bloque: number, item: number, desde: number, hasta: number, tramos: TramoTexto[]) => void) {
    const { inicio, fin } = ordenar(r);
    for (let b = inicio.bloque; b <= fin.bloque && b < doc.bloques.length; b++) {
        const bl = doc.bloques[b];
        if (!bl || bl.tipo === "codigo" || bl.tipo === "separador") continue;
        const lineas = lineasDe(bl);
        for (let i = 0; i < lineas.length; i++) {
            if (b === inicio.bloque && i < inicio.item) continue;
            if (b === fin.bloque && i > fin.item) continue;
            const len = largo(lineas[i]);
            const desde = b === inicio.bloque && i === inicio.item ? Math.min(inicio.off, len) : 0;
            const hasta = b === fin.bloque && i === fin.item ? Math.min(fin.off, len) : len;
            cb(b, i, desde, Math.max(desde, hasta), lineas[i]);
        }
    }
}

// ───────────────────────────── Formato de texto ─────────────────────────────

/** Aplica una transformación de formato a todo el texto del rango. */
export function formatearRango(doc: DocRico, r: RangoDoc, f: (fmt: FormatoTramo) => FormatoTramo): DocRico {
    const cambios = new Map<number, TramoTexto[][]>();
    recorrerRango(doc, r, (b, i, desde, hasta, tramos) => {
        if (hasta <= desde) return;
        const lineas = cambios.get(b) ?? [...lineasDe(doc.bloques[b])];
        lineas[i] = mapearTramos(tramos, desde, hasta, f);
        cambios.set(b, lineas);
    });
    if (!cambios.size) return doc;
    return { bloques: doc.bloques.map((bl, k) => (cambios.has(k) ? conLineas(bl, cambios.get(k)!) : bl)) };
}

/** Formato del carácter anterior a la posición (o del siguiente al principio de línea). */
export function formatoEn(doc: DocRico, pos: PosDoc): FormatoTramo {
    const bl = doc.bloques[pos.bloque];
    if (!bl || bl.tipo === "codigo" || bl.tipo === "separador") return { marcas: [] };
    const tramos = lineasDe(bl)[pos.item] ?? [];
    let acumulado = 0;
    for (const t of tramos) {
        const fin = acumulado + t.texto.length;
        if (pos.off > acumulado && pos.off <= fin) return formatoDe(t);
        if (pos.off === 0 && acumulado === 0) return formatoDe(t);
        acumulado = fin;
    }
    return tramos.length ? formatoDe(tramos[tramos.length - 1]) : { marcas: [] };
}

/** ¿Todo el texto del rango cumple la condición? (colapsado: el formato en el cursor) */
export function todoTiene(doc: DocRico, r: RangoDoc, pred: (f: FormatoTramo) => boolean): boolean {
    if (colapsado(r)) return pred(formatoEn(doc, r.inicio));
    let alguno = false;
    let todos = true;
    recorrerRango(doc, r, (_b, _i, desde, hasta, tramos) => {
        if (hasta <= desde) return;
        const [, resto] = partir(tramos, desde);
        const [medio] = partir(resto, hasta - desde);
        for (const t of medio) {
            if (!t.texto) continue;
            alguno = true;
            if (!pred(formatoDe(t))) todos = false;
        }
    });
    return alguno && todos;
}

export function alternarMarca(doc: DocRico, r: RangoDoc, marca: MarcaTexto): DocRico {
    const tiene = todoTiene(doc, r, (f) => f.marcas.includes(marca));
    return formatearRango(doc, r, (f) => ({
        ...f,
        marcas: tiene ? f.marcas.filter((m) => m !== marca) : [...f.marcas, marca],
    }));
}

export type PropiedadTramo = "color" | "resaltado" | "enlace" | "fuente" | "tamano";

export function fijarPropiedad<K extends PropiedadTramo>(doc: DocRico, r: RangoDoc, prop: K, valor: FormatoTramo[K] | undefined): DocRico {
    return formatearRango(doc, r, (f) => {
        const g: FormatoTramo = { ...f, marcas: [...f.marcas] };
        if (valor === undefined || valor === null || valor === "") delete g[prop];
        else g[prop] = valor;
        return g;
    });
}

const RE_PALABRA = /[\p{L}\p{N}_'’-]/u;

/** Rango de la palabra bajo el cursor (o el propio cursor si no hay palabra). */
export function rangoPalabra(doc: DocRico, pos: PosDoc): RangoDoc {
    const bl = doc.bloques[pos.bloque];
    const colapsadoEn = { inicio: pos, fin: pos };
    if (!bl || bl.tipo === "codigo" || bl.tipo === "separador") return colapsadoEn;
    const texto = textoLinea(lineasDe(bl)[pos.item] ?? []);
    const letras = Array.from(texto);
    // Trabajamos en unidades UTF-16 (las del modelo).
    let ini = Math.min(pos.off, texto.length);
    let fin = ini;
    while (ini > 0 && RE_PALABRA.test(texto[ini - 1])) ini--;
    while (fin < texto.length && RE_PALABRA.test(texto[fin])) fin++;
    if (ini === fin || !letras.length) return colapsadoEn;
    return { inicio: { ...pos, off: ini }, fin: { ...pos, off: fin } };
}

/** Inserta texto con un formato en una posición. Devuelve el rango de lo insertado. */
export function insertarTexto(doc: DocRico, pos: PosDoc, texto: string, fmt: FormatoTramo): { doc: DocRico; rango: RangoDoc } {
    const bl = doc.bloques[pos.bloque];
    if (!bl || bl.tipo === "separador") return { doc, rango: { inicio: pos, fin: pos } };
    const lineas = [...lineasDe(bl)];
    const tramos = lineas[pos.item] ?? [];
    const [a, c] = partir(tramos, pos.off);
    lineas[pos.item] = bl.tipo === "codigo" ? [{ texto: textoLinea(a) + texto + textoLinea(c) }] : normalizarTramos([...a, tramoCon(texto, fmt), ...c]);
    const bloques = [...doc.bloques];
    bloques[pos.bloque] = conLineas(bl, lineas);
    return { doc: { bloques }, rango: { inicio: pos, fin: { ...pos, off: pos.off + texto.length } } };
}

// ───────────────────────────── Bloques ─────────────────────────────

export type TipoBloqueEditor = "parrafo" | "titulo1" | "titulo2" | "titulo3" | "lista" | "listaNumerada" | "tareas" | "cita" | "codigo";

export function tipoDeBloque(b: BloqueDoc | undefined): TipoBloqueEditor | "separador" {
    if (!b) return "parrafo";
    switch (b.tipo) {
        case "parrafo":
            return "parrafo";
        case "titulo":
            return `titulo${b.nivel}` as TipoBloqueEditor;
        case "lista":
            return b.ordenada ? "listaNumerada" : "lista";
        case "tareas":
            return "tareas";
        case "cita":
            return "cita";
        case "codigo":
            return "codigo";
        case "separador":
            return "separador";
    }
}

interface LineaOrigen {
    tramos: TramoTexto[];
    hecha: boolean;
    alineacion?: AlineacionBloque;
    bloque: number;
    item: number;
    /** Para líneas sacadas de un bloque de código: desplazamiento dentro de su texto. */
    base: number;
}

function esMultiItem(b: BloqueDoc): b is Extract<BloqueDoc, { tipo: "lista" | "tareas" }> {
    return b.tipo === "lista" || b.tipo === "tareas";
}

function cortarItems(b: Extract<BloqueDoc, { tipo: "lista" | "tareas" }>, desde: number, hasta: number): BloqueDoc | null {
    if (b.tipo === "lista") {
        const items = b.items.slice(desde, hasta);
        return items.length ? { tipo: "lista", ordenada: b.ordenada, items } : null;
    }
    const items = b.items.slice(desde, hasta);
    return items.length ? { tipo: "tareas", items } : null;
}

function mismaLista(a: BloqueDoc, b: BloqueDoc): boolean {
    if (a.tipo === "lista" && b.tipo === "lista") return a.ordenada === b.ordenada;
    return a.tipo === "tareas" && b.tipo === "tareas";
}

/**
 * Convierte los bloques del rango en otro tipo (título, lista, tareas, cita, código…). Si todos ya
 * eran de ese tipo, vuelven a párrafo (como un botón de Word). En listas solo cambian los ítems
 * tocados. Devuelve también el rango trasladado.
 */
export function convertirBloques(doc: DocRico, r: RangoDoc, destino: TipoBloqueEditor): { doc: DocRico; rango: RangoDoc } {
    const { inicio, fin } = ordenar(r);
    const bIni = Math.max(0, Math.min(inicio.bloque, doc.bloques.length - 1));
    const bFin = Math.max(bIni, Math.min(fin.bloque, doc.bloques.length - 1));
    const afectados = doc.bloques.slice(bIni, bFin + 1).filter((b) => b.tipo !== "separador");
    const dest: TipoBloqueEditor = afectados.length && afectados.every((b) => tipoDeBloque(b) === destino) && destino !== "parrafo" ? "parrafo" : destino;

    const salida: BloqueDoc[] = doc.bloques.slice(0, bIni);
    const mapa: { linea: LineaOrigen; bloque: number; item: number; desplaza: number }[] = [];
    let grupo: LineaOrigen[] = [];

    const volcarGrupo = () => {
        if (!grupo.length) return;
        if (dest === "lista" || dest === "listaNumerada" || dest === "tareas") {
            const idx = salida.length;
            salida.push(
                dest === "tareas"
                    ? { tipo: "tareas", items: grupo.map((l) => ({ hecha: l.hecha, tramos: l.tramos })) }
                    : { tipo: "lista", ordenada: dest === "listaNumerada", items: grupo.map((l) => l.tramos) },
            );
            grupo.forEach((l, i) => mapa.push({ linea: l, bloque: idx, item: i, desplaza: 0 }));
        } else if (dest === "codigo") {
            const idx = salida.length;
            let acumulado = 0;
            grupo.forEach((l) => {
                mapa.push({ linea: l, bloque: idx, item: 0, desplaza: acumulado });
                acumulado += largo(l.tramos) + 1;
            });
            salida.push({ tipo: "codigo", texto: grupo.map((l) => textoLinea(l.tramos)).join("\n") });
        } else {
            for (const l of grupo) {
                const idx = salida.length;
                let b: BloqueDoc;
                if (dest === "cita") b = { tipo: "cita", tramos: l.tramos };
                else if (dest === "parrafo") b = { tipo: "parrafo", tramos: l.tramos };
                else b = { tipo: "titulo", nivel: Number(dest.slice(-1)) as 1 | 2 | 3, tramos: l.tramos };
                if (l.alineacion && (b.tipo === "parrafo" || b.tipo === "titulo")) b.alineacion = l.alineacion;
                salida.push(b);
                mapa.push({ linea: l, bloque: idx, item: 0, desplaza: 0 });
            }
        }
        grupo = [];
    };

    for (let k = bIni; k <= bFin; k++) {
        const b = doc.bloques[k];
        if (b.tipo === "separador") {
            volcarGrupo();
            salida.push(b);
            continue;
        }
        const alineacion = b.tipo === "parrafo" || b.tipo === "titulo" ? b.alineacion : undefined;
        if (esMultiItem(b)) {
            const lineas = lineasDe(b);
            const desde = k === bIni ? Math.min(inicio.item, lineas.length - 1) : 0;
            const hasta = k === bFin ? Math.min(fin.item, lineas.length - 1) : lineas.length - 1;
            if (k === bIni && desde > 0) {
                const previo = cortarItems(b, 0, desde);
                if (previo) salida.push(previo);
            }
            for (let i = desde; i <= hasta; i++) {
                grupo.push({ tramos: lineas[i], hecha: b.tipo === "tareas" ? b.items[i].hecha : false, bloque: k, item: i, base: 0 });
            }
            if (k === bFin && hasta < lineas.length - 1) {
                volcarGrupo();
                const resto = cortarItems(b, hasta + 1, lineas.length);
                if (resto) salida.push(resto);
            }
        } else if (b.tipo === "codigo") {
            let base = 0;
            for (const texto of b.texto.split("\n")) {
                grupo.push({ tramos: texto ? [{ texto }] : [], hecha: false, bloque: k, item: 0, base });
                base += texto.length + 1;
            }
        } else {
            grupo.push({ tramos: lineasDe(b)[0], hecha: false, alineacion, bloque: k, item: 0, base: 0 });
        }
    }
    volcarGrupo();
    const tras = doc.bloques.slice(bFin + 1);
    const delta = salida.length - (bFin + 1);
    salida.push(...tras);

    const trasladar = (p: PosDoc): PosDoc => {
        if (p.bloque < bIni) return p;
        if (p.bloque > bFin) return { ...p, bloque: p.bloque + delta };
        const candidatas = mapa.filter((m) => m.linea.bloque === p.bloque && m.linea.item === p.item);
        const m = [...candidatas].reverse().find((c) => p.off >= c.linea.base) ?? candidatas[0];
        if (!m) return { bloque: Math.min(p.bloque, salida.length - 1), item: 0, off: 0 };
        return { bloque: m.bloque, item: m.item, off: m.desplaza + Math.min(largo(m.linea.tramos), p.off - m.linea.base) };
    };

    let resultado: DocRico = { bloques: salida };
    let rango: RangoDoc = { inicio: trasladar(inicio), fin: trasladar(fin) };
    ({ doc: resultado, rango } = fusionarListas(resultado, rango));
    return { doc: resultado, rango };
}

/** Une listas contiguas del mismo tipo (y traslada el rango). */
export function fusionarListas(doc: DocRico, r: RangoDoc): { doc: DocRico; rango: RangoDoc } {
    const bloques: BloqueDoc[] = [];
    // origen de cada bloque viejo → (bloque nuevo, desplazamiento de ítems)
    const destino: { bloque: number; items: number }[] = [];
    for (const b of doc.bloques) {
        const prev = bloques[bloques.length - 1];
        if (prev && mismaLista(prev, b)) {
            const offset = prev.tipo === "lista" ? prev.items.length : prev.tipo === "tareas" ? prev.items.length : 0;
            if (prev.tipo === "lista" && b.tipo === "lista") bloques[bloques.length - 1] = { ...prev, items: [...prev.items, ...b.items] };
            if (prev.tipo === "tareas" && b.tipo === "tareas") bloques[bloques.length - 1] = { ...prev, items: [...prev.items, ...b.items] };
            destino.push({ bloque: bloques.length - 1, items: offset });
        } else {
            bloques.push(b);
            destino.push({ bloque: bloques.length - 1, items: 0 });
        }
    }
    const mover = (p: PosDoc): PosDoc => {
        const d = destino[p.bloque];
        return d ? { bloque: d.bloque, item: p.item + d.items, off: p.off } : p;
    };
    return { doc: { bloques }, rango: { inicio: mover(r.inicio), fin: mover(r.fin) } };
}

export function alinearBloques(doc: DocRico, r: RangoDoc, al: AlineacionBloque): DocRico {
    const { inicio, fin } = ordenar(r);
    return {
        bloques: doc.bloques.map((b, k) => {
            if (k < inicio.bloque || k > fin.bloque) return b;
            if (b.tipo !== "parrafo" && b.tipo !== "titulo") return b;
            const n = { ...b };
            if (al === "izquierda") delete n.alineacion;
            else n.alineacion = al;
            return n;
        }),
    };
}

/** Inserta un separador después del bloque del cursor (o en su lugar si es un párrafo vacío). */
export function insertarSeparador(doc: DocRico, pos: PosDoc): { doc: DocRico; pos: PosDoc } {
    const bloques = [...doc.bloques];
    const b = bloques[pos.bloque];
    const vacio = b && b.tipo === "parrafo" && !largo(b.tramos);
    if (vacio) {
        bloques.splice(pos.bloque, 1, { tipo: "separador" }, { tipo: "parrafo", tramos: [] });
        return { doc: { bloques }, pos: { bloque: pos.bloque + 1, item: 0, off: 0 } };
    }
    const siguiente = bloques[pos.bloque + 1];
    const nuevos: BloqueDoc[] = [{ tipo: "separador" }];
    if (!siguiente || siguiente.tipo !== "parrafo") nuevos.push({ tipo: "parrafo", tramos: [] });
    bloques.splice(pos.bloque + 1, 0, ...nuevos);
    return { doc: { bloques }, pos: { bloque: pos.bloque + 2, item: 0, off: 0 } };
}

export function alternarTarea(doc: DocRico, bloque: number, item: number): DocRico {
    const b = doc.bloques[bloque];
    if (!b || b.tipo !== "tareas" || !b.items[item]) return doc;
    const bloques = [...doc.bloques];
    bloques[bloque] = { tipo: "tareas", items: b.items.map((it, i) => (i === item ? { ...it, hecha: !it.hecha } : it)) };
    return { bloques };
}
