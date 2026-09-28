/**
 * Operaciones PURAS sobre una tabla (2026-09-28): cada una recibe una `Tabla` inmutable y un
 * `Ctx` (reloj + autor) y devuelve una tabla nueva — o LA MISMA referencia si no había nada que
 * cambiar (así el motor no guarda ni notifica en vano).
 *
 * Nada aquí toca la red ni React. Las escrituras siempre son registros con el `Ctx` recibido, y
 * lo borrado es una lápida, nunca un hueco.
 */
import {
    COLORES_OPCION,
    LIMITES,
    claveCelda,
    columnasVisibles,
    esUuid,
    estaVacio,
    fechaDesdeTexto,
    filasVisibles,
    nombreDeOpcion,
    normalizarNombre,
    nuevoId,
    numeroDesdeTexto,
    opcionesOrdenadas,
    reg,
    sanearNombreColumna,
    tablaVacia,
    type Celda,
    type Columna,
    type Ctx,
    type Fila,
    type OpcionDato,
    type Reg,
    type Tabla,
    type TipoColumna,
    type TotalFn,
    type ValorCelda,
} from "./modelo";

const ESPACIO = 1024;

// ───────────────────────────── valores por tipo ─────────────────────────────

const VERDADERO = new Set(["true", "verdadero", "si", "sí", "yes", "1", "x", "✓"]);
const FALSO = new Set(["false", "falso", "no", "0"]);

/**
 * Deja un valor listo para guardarse en una columna, o `undefined` si no vale para ese tipo.
 * (Las columnas calculadas no guardan valores.)
 */
export function sanearValor(col: Columna, valor: ValorCelda): ValorCelda | undefined {
    const tipo = col.tipo.v;
    switch (tipo) {
        case "texto":
        case "enlace": {
            if (valor === null) return null;
            const s = typeof valor === "string" ? valor : String(valor);
            return s === "" ? null : s.slice(0, LIMITES.textoCelda);
        }
        case "numero": {
            if (valor === null || valor === "") return null;
            if (typeof valor === "number") return Number.isFinite(valor) ? valor : undefined;
            if (typeof valor === "string") return numeroDesdeTexto(valor) ?? undefined;
            return undefined;
        }
        case "fecha": {
            if (valor === null || valor === "") return null;
            if (typeof valor !== "string") return undefined;
            return fechaDesdeTexto(valor) ?? undefined;
        }
        case "casilla": {
            if (valor === null) return null;
            if (typeof valor === "boolean") return valor;
            if (typeof valor === "string") {
                const k = valor.trim().toLowerCase();
                if (k === "") return null; // celda vacía: sin marcar y sin decidir
                if (VERDADERO.has(k)) return true;
                if (FALSO.has(k)) return false;
            }
            return undefined;
        }
        case "seleccion": {
            if (valor === null || valor === "") return null;
            return typeof valor === "string" && col.opciones?.[valor]?.v ? valor : undefined;
        }
        case "persona": {
            if (valor === null || valor === "") return null;
            return esUuid(valor) ? valor : undefined;
        }
        case "calculado":
            return undefined;
    }
}

/**
 * Texto (pegado, CSV) → valor de la columna. Para «Selección» busca la opción por nombre; si no
 * existe devuelve `undefined` (quien llama decide si crearla). `resolverPersona` traduce un
 * nombre escrito a la cuenta.
 */
export function coaccionarTexto(
    col: Columna,
    texto: string,
    resolverPersona?: (texto: string) => string | null,
): ValorCelda | undefined {
    const t = texto.trim();
    switch (col.tipo.v) {
        case "seleccion": {
            if (!t) return null;
            const clave = normalizarNombre(t);
            const hit = opcionesOrdenadas(col).find((o) => normalizarNombre(o.nombre) === clave);
            return hit?.id;
        }
        case "persona": {
            if (!t) return null;
            if (esUuid(t)) return t;
            return resolverPersona?.(t) ?? undefined;
        }
        case "texto":
        case "enlace":
            return sanearValor(col, texto);
        default:
            return sanearValor(col, t);
    }
}

function iguales(a: ValorCelda | undefined, b: ValorCelda | undefined): boolean {
    if (estaVacio(a) && estaVacio(b)) return true;
    return a === b;
}

// ───────────────────────────── orden (fracciones) ─────────────────────────────

function ordenEntre(prev: number | undefined, next: number | undefined): number | null {
    if (prev === undefined && next === undefined) return ESPACIO;
    if (prev === undefined) return (next as number) - ESPACIO;
    if (next === undefined) return prev + ESPACIO;
    const mid = (prev + next) / 2;
    return mid > prev && mid < next ? mid : null;
}

type Ordenable = { id: string; orden: Reg<number> };

/**
 * Calcula el `orden` de algo que se coloca en la posición `idx` de `vivos` (que NO incluye a la
 * cosa colocada). Si ya no cabe una fracción entre los vecinos, renumera toda la lista.
 */
function colocar(
    t: Tabla,
    tipo: "filas" | "columnas",
    vivos: readonly Ordenable[],
    idx: number,
    c: Ctx,
): { tabla: Tabla; orden: number } {
    const i = Math.max(0, Math.min(vivos.length, idx));
    const o = ordenEntre(vivos[i - 1]?.orden.v, vivos[i]?.orden.v);
    if (o !== null) return { tabla: t, orden: o };
    const mapa: Record<string, Fila | Columna> = { ...t[tipo] };
    vivos.forEach((x, k) => {
        const nuevo = (k < i ? k + 1 : k + 2) * ESPACIO;
        if (x.orden.v !== nuevo) mapa[x.id] = { ...mapa[x.id], orden: reg(nuevo, c) } as Fila & Columna;
    });
    return { tabla: { ...t, [tipo]: mapa } as Tabla, orden: (i + 1) * ESPACIO };
}

// ───────────────────────────── celdas ─────────────────────────────

function columnaViva(t: Tabla, id: string): Columna | undefined {
    const c = t.columnas[id];
    return c && !c.borrada?.v ? c : undefined;
}
function filaViva(t: Tabla, id: string): Fila | undefined {
    const f = t.filas[id];
    return f && !f.borrada?.v ? f : undefined;
}

export interface CambioCelda {
    filaId: string;
    colId: string;
    valor: ValorCelda;
}

/** Aplica varias celdas de una vez (una sola copia del mapa). Ignora lo que no vale. */
export function aplicarCeldas(t: Tabla, cambios: readonly CambioCelda[], c: Ctx): Tabla {
    let celdas: Record<string, Celda> | null = null;
    for (const cambio of cambios) {
        const col = columnaViva(t, cambio.colId);
        if (!col || !filaViva(t, cambio.filaId)) continue;
        const valor = sanearValor(col, cambio.valor);
        if (valor === undefined) continue;
        const k = claveCelda(cambio.filaId, cambio.colId);
        const actual = (celdas ?? t.celdas)[k];
        if (iguales(actual?.v, valor)) continue;
        if (!celdas) celdas = { ...t.celdas };
        celdas[k] = reg(valor, c);
    }
    return celdas ? { ...t, celdas } : t;
}

export function establecerCelda(t: Tabla, filaId: string, colId: string, valor: ValorCelda, c: Ctx): Tabla {
    return aplicarCeldas(t, [{ filaId, colId, valor }], c);
}

export function limpiarCeldas(t: Tabla, filaIds: readonly string[], colIds: readonly string[], c: Ctx): Tabla {
    const cambios: CambioCelda[] = [];
    for (const f of filaIds) for (const k of colIds) cambios.push({ filaId: f, colId: k, valor: null });
    return aplicarCeldas(t, cambios, c);
}

// ───────────────────────────── filas ─────────────────────────────

export interface ResultadoFila {
    tabla: Tabla;
    filaId: string | null;
}

export function puedeAnadirFilas(t: Tabla, n = 1): boolean {
    return filasVisibles(t).length + n <= LIMITES.filas;
}

/** Añade una fila vacía: al final, o antes/después de otra (en el orden compartido). */
export function anadirFila(t: Tabla, c: Ctx, donde: { antesDe?: string | null; despuesDe?: string | null } = {}): ResultadoFila {
    if (!puedeAnadirFilas(t)) return { tabla: t, filaId: null };
    const vivas = filasVisibles(t);
    let idx = vivas.length;
    if (donde.antesDe) {
        const i = vivas.findIndex((f) => f.id === donde.antesDe);
        if (i >= 0) idx = i;
    } else if (donde.despuesDe) {
        const i = vivas.findIndex((f) => f.id === donde.despuesDe);
        if (i >= 0) idx = i + 1;
    }
    const { tabla, orden } = colocar(t, "filas", vivas, idx, c);
    const id = nuevoId("f");
    return { tabla: { ...tabla, filas: { ...tabla.filas, [id]: { id, orden: reg(orden, c) } } }, filaId: id };
}

/** Añade `n` filas vacías al final. */
export function anadirFilasAlFinal(t: Tabla, n: number, c: Ctx): { tabla: Tabla; filaIds: string[] } {
    const espacio = Math.max(0, LIMITES.filas - filasVisibles(t).length);
    const cantidad = Math.min(n, espacio);
    if (cantidad <= 0) return { tabla: t, filaIds: [] };
    const vivas = filasVisibles(t);
    const base = vivas.length ? vivas[vivas.length - 1].orden.v : 0;
    const filas = { ...t.filas };
    const ids: string[] = [];
    for (let i = 0; i < cantidad; i++) {
        const id = nuevoId("f");
        filas[id] = { id, orden: reg(base + (i + 1) * ESPACIO, c) };
        ids.push(id);
    }
    return { tabla: { ...t, filas }, filaIds: ids };
}

export function borrarFilas(t: Tabla, ids: readonly string[], c: Ctx): Tabla {
    let filas: Record<string, Fila> | null = null;
    for (const id of ids) {
        const f = (filas ?? t.filas)[id];
        if (!f || f.borrada?.v) continue;
        if (!filas) filas = { ...t.filas };
        filas[id] = { ...f, borrada: reg(true, c) };
    }
    return filas ? { ...t, filas } : t;
}

export function restaurarFilas(t: Tabla, ids: readonly string[], c: Ctx): Tabla {
    let filas: Record<string, Fila> | null = null;
    for (const id of ids) {
        const f = (filas ?? t.filas)[id];
        if (!f || !f.borrada?.v) continue;
        if (!filas) filas = { ...t.filas };
        filas[id] = { ...f, borrada: reg(false, c) };
    }
    return filas ? { ...t, filas } : t;
}

/** Mueve una fila a la posición `haciaIndice` (contando sin ella) del orden compartido. */
export function moverFila(t: Tabla, filaId: string, haciaIndice: number, c: Ctx): Tabla {
    const fila = filaViva(t, filaId);
    if (!fila) return t;
    const todas = filasVisibles(t);
    const actual = todas.findIndex((f) => f.id === filaId);
    const resto = todas.filter((f) => f.id !== filaId);
    const idx = Math.max(0, Math.min(resto.length, haciaIndice));
    if (idx === actual) return t;
    const { tabla, orden } = colocar(t, "filas", resto, idx, c);
    return { ...tabla, filas: { ...tabla.filas, [filaId]: { ...tabla.filas[filaId], orden: reg(orden, c) } } };
}

/** Duplica una fila justo debajo, con sus valores. */
export function duplicarFila(t: Tabla, filaId: string, c: Ctx): ResultadoFila {
    if (!filaViva(t, filaId)) return { tabla: t, filaId: null };
    const r = anadirFila(t, c, { despuesDe: filaId });
    if (!r.filaId) return r;
    const celdas = { ...r.tabla.celdas };
    for (const col of columnasVisibles(t)) {
        if (col.tipo.v === "calculado") continue;
        const orig = t.celdas[claveCelda(filaId, col.id)];
        if (orig && !estaVacio(orig.v)) celdas[claveCelda(r.filaId, col.id)] = reg(orig.v, c);
    }
    return { tabla: { ...r.tabla, celdas }, filaId: r.filaId };
}

// ───────────────────────────── columnas ─────────────────────────────

export function puedeAnadirColumnas(t: Tabla, n = 1): boolean {
    return columnasVisibles(t).length + n <= LIMITES.columnas;
}

/** «Columna 3»: un nombre libre para una columna nueva. */
export function nombreLibre(t: Tabla, base = "Columna"): string {
    const usados = new Set(columnasVisibles(t).map((c) => normalizarNombre(c.nombre.v)));
    for (let i = columnasVisibles(t).length + 1; i < 10_000; i++) {
        const n = `${base} ${i}`;
        if (!usados.has(normalizarNombre(n))) return n;
    }
    return `${base} ${Date.now()}`;
}

export interface ResultadoColumna {
    tabla: Tabla;
    colId: string | null;
}

export function anadirColumna(
    t: Tabla,
    c: Ctx,
    opc: { nombre?: string; tipo?: TipoColumna; despuesDe?: string | null; opciones?: string[] } = {},
): ResultadoColumna {
    if (!puedeAnadirColumnas(t)) return { tabla: t, colId: null };
    const vivas = columnasVisibles(t);
    let idx = vivas.length;
    if (opc.despuesDe) {
        const i = vivas.findIndex((x) => x.id === opc.despuesDe);
        if (i >= 0) idx = i + 1;
    }
    const { tabla, orden } = colocar(t, "columnas", vivas, idx, c);
    const id = nuevoId("c");
    const tipo = opc.tipo ?? "texto";
    const col: Columna = {
        id,
        nombre: reg(sanearNombreColumna(opc.nombre ?? "") || nombreLibre(t), c),
        tipo: reg(tipo, c),
        ancho: reg(LIMITES.anchoDefecto, c),
        orden: reg(orden, c),
    };
    if (tipo === "seleccion") {
        col.opciones = {};
        (opc.opciones ?? []).slice(0, LIMITES.opcionesPorColumna).forEach((nombre, i) => {
            col.opciones![nuevoId("o")] = reg({ nombre: nombre.slice(0, 60), color: COLORES_OPCION[i % COLORES_OPCION.length], orden: (i + 1) * ESPACIO }, c);
        });
    }
    if (tipo === "calculado") col.formula = reg("", c);
    return { tabla: { ...tabla, columnas: { ...tabla.columnas, [id]: col } }, colId: id };
}

function conColumna(t: Tabla, colId: string, cambio: (c: Columna) => Columna): Tabla {
    const col = t.columnas[colId];
    if (!col) return t;
    const nueva = cambio(col);
    return nueva === col ? t : { ...t, columnas: { ...t.columnas, [colId]: nueva } };
}

export function renombrarColumna(t: Tabla, colId: string, nombre: string, c: Ctx): Tabla {
    const limpio = sanearNombreColumna(nombre);
    if (!limpio || !columnaViva(t, colId)) return t;
    return conColumna(t, colId, (col) => (col.nombre.v === limpio ? col : { ...col, nombre: reg(limpio, c) }));
}

export function redimensionarColumna(t: Tabla, colId: string, ancho: number, c: Ctx): Tabla {
    if (!Number.isFinite(ancho) || !columnaViva(t, colId)) return t;
    const a = Math.min(LIMITES.anchoMax, Math.max(LIMITES.anchoMin, Math.round(ancho)));
    return conColumna(t, colId, (col) => (col.ancho.v === a ? col : { ...col, ancho: reg(a, c) }));
}

export function moverColumna(t: Tabla, colId: string, haciaIndice: number, c: Ctx): Tabla {
    if (!columnaViva(t, colId)) return t;
    const todas = columnasVisibles(t);
    const actual = todas.findIndex((x) => x.id === colId);
    const resto = todas.filter((x) => x.id !== colId);
    const idx = Math.max(0, Math.min(resto.length, haciaIndice));
    if (idx === actual) return t;
    const { tabla, orden } = colocar(t, "columnas", resto, idx, c);
    return conColumna(tabla, colId, (col) => ({ ...col, orden: reg(orden, c) }));
}

export function borrarColumna(t: Tabla, colId: string, c: Ctx): Tabla {
    if (!columnaViva(t, colId)) return t;
    return conColumna(t, colId, (col) => ({ ...col, borrada: reg(true, c) }));
}

export function restaurarColumna(t: Tabla, colId: string, c: Ctx): Tabla {
    const col = t.columnas[colId];
    if (!col?.borrada?.v) return t;
    return conColumna(t, colId, (x) => ({ ...x, borrada: reg(false, c) }));
}

export function establecerTotal(t: Tabla, colId: string, total: TotalFn, c: Ctx): Tabla {
    if (!columnaViva(t, colId)) return t;
    return conColumna(t, colId, (col) => ((col.total?.v ?? "ninguno") === total ? col : { ...col, total: reg(total, c) }));
}

export function establecerFormula(t: Tabla, colId: string, almacenada: string, c: Ctx): Tabla {
    const col = columnaViva(t, colId);
    if (!col || col.tipo.v !== "calculado") return t;
    if (almacenada.length > LIMITES.formula) return t;
    return conColumna(t, colId, (x) => (x.formula?.v === almacenada ? x : { ...x, formula: reg(almacenada, c) }));
}

// ───────────────────────────── opciones de «Selección» ─────────────────────────────

export function anadirOpcion(
    t: Tabla,
    colId: string,
    nombre: string,
    c: Ctx,
    color?: string,
): { tabla: Tabla; opcionId: string | null } {
    const col = columnaViva(t, colId);
    const limpio = nombre.trim().slice(0, 60);
    if (!col || !limpio) return { tabla: t, opcionId: null };
    const existentes = opcionesOrdenadas(col);
    const repetida = existentes.find((o) => normalizarNombre(o.nombre) === normalizarNombre(limpio));
    if (repetida) return { tabla: t, opcionId: repetida.id };
    if (existentes.length >= LIMITES.opcionesPorColumna) return { tabla: t, opcionId: null };
    const ultimo = Math.max(0, ...Object.values(col.opciones ?? {}).map((o) => o.v?.orden ?? 0));
    const id = nuevoId("o");
    const dato: OpcionDato = { nombre: limpio, color: color ?? COLORES_OPCION[existentes.length % COLORES_OPCION.length], orden: ultimo + ESPACIO };
    const tabla = conColumna(t, colId, (x) => ({ ...x, opciones: { ...(x.opciones ?? {}), [id]: reg<OpcionDato | null>(dato, c) } }));
    return { tabla, opcionId: id };
}

/** Cambia nombre y/o color de una opción. */
export function editarOpcion(t: Tabla, colId: string, opcionId: string, cambio: { nombre?: string; color?: string }, c: Ctx): Tabla {
    const col = columnaViva(t, colId);
    const actual = col?.opciones?.[opcionId]?.v;
    if (!col || !actual) return t;
    const nombre = cambio.nombre !== undefined ? cambio.nombre.trim().slice(0, 60) : actual.nombre;
    if (!nombre) return t;
    const color = cambio.color && /^#[0-9a-f]{6}$/i.test(cambio.color) ? cambio.color : actual.color;
    if (nombre === actual.nombre && color === actual.color) return t;
    return conColumna(t, colId, (x) => ({
        ...x,
        opciones: { ...(x.opciones ?? {}), [opcionId]: reg<OpcionDato | null>({ ...actual, nombre, color }, c) },
    }));
}

/** Quita una opción; las celdas que la usaban quedan vacías. */
export function quitarOpcion(t: Tabla, colId: string, opcionId: string, c: Ctx): Tabla {
    const col = columnaViva(t, colId);
    if (!col?.opciones?.[opcionId]?.v) return t;
    let tabla = conColumna(t, colId, (x) => ({ ...x, opciones: { ...(x.opciones ?? {}), [opcionId]: reg<OpcionDato | null>(null, c) } }));
    const afectadas: CambioCelda[] = [];
    for (const f of filasVisibles(t)) {
        if (t.celdas[claveCelda(f.id, colId)]?.v === opcionId) afectadas.push({ filaId: f.id, colId, valor: null });
    }
    if (afectadas.length) tabla = aplicarCeldas(tabla, afectadas, c);
    return tabla;
}

/** Sube o baja una opción en la lista. */
export function moverOpcion(t: Tabla, colId: string, opcionId: string, delta: -1 | 1, c: Ctx): Tabla {
    const col = columnaViva(t, colId);
    if (!col) return t;
    const lista = opcionesOrdenadas(col);
    const i = lista.findIndex((o) => o.id === opcionId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= lista.length) return t;
    const a = col.opciones![lista[i].id].v!;
    const b = col.opciones![lista[j].id].v!;
    return conColumna(t, colId, (x) => ({
        ...x,
        opciones: {
            ...(x.opciones ?? {}),
            [lista[i].id]: reg<OpcionDato | null>({ ...a, orden: b.orden }, c),
            [lista[j].id]: reg<OpcionDato | null>({ ...b, orden: a.orden }, c),
        },
    }));
}

// ───────────────────────────── cambio de tipo ─────────────────────────────

function textoDeValor(col: Columna, v: ValorCelda): string | null {
    if (estaVacio(v)) return null;
    if (col.tipo.v === "seleccion") return nombreDeOpcion(col, v);
    if (typeof v === "boolean") return v ? "Sí" : "No";
    return String(v);
}

/**
 * Cambia el tipo de una columna CONVIRTIENDO sus valores cuando se puede (texto ⇄ número,
 * texto ⇄ selección…) para no perder nada. Lo que no se puede convertir queda vacío.
 */
export function cambiarTipoColumna(t: Tabla, colId: string, tipo: TipoColumna, c: Ctx): Tabla {
    const col = columnaViva(t, colId);
    if (!col || col.tipo.v === tipo) return t;
    let tabla = conColumna(t, colId, (x) => {
        const n: Columna = { ...x, tipo: reg(tipo, c) };
        if (tipo === "calculado" && !n.formula) n.formula = reg("", c);
        return n;
    });
    if (tipo === "calculado") return tabla;

    const filas = filasVisibles(t);
    const cambios: CambioCelda[] = [];

    if (tipo === "seleccion") {
        // Una opción por cada valor distinto que ya hubiera (hasta el límite).
        const porNombre = new Map<string, string>();
        for (const f of filas) {
            const s = textoDeValor(col, t.celdas[claveCelda(f.id, colId)]?.v ?? null);
            if (!s) continue;
            const clave = normalizarNombre(s);
            if (porNombre.has(clave)) continue;
            const r = anadirOpcion(tabla, colId, s, c);
            tabla = r.tabla;
            if (r.opcionId) porNombre.set(clave, r.opcionId);
        }
        for (const f of filas) {
            const s = textoDeValor(col, t.celdas[claveCelda(f.id, colId)]?.v ?? null);
            const id = s ? porNombre.get(normalizarNombre(s)) : undefined;
            cambios.push({ filaId: f.id, colId, valor: id ?? null });
        }
        return aplicarCeldas(tabla, cambios, c);
    }

    const nueva = columnaViva(tabla, colId)!;
    for (const f of filas) {
        const v = t.celdas[claveCelda(f.id, colId)]?.v ?? null;
        if (estaVacio(v)) continue;
        const s = textoDeValor(col, v);
        const convertido = s === null ? null : sanearValor(nueva, tipo === "casilla" && typeof v === "boolean" ? v : s);
        cambios.push({ filaId: f.id, colId, valor: convertido ?? null });
    }
    return aplicarCeldas(tabla, cambios, c);
}

// ───────────────────────────── pegado ─────────────────────────────

export interface ResultadoPegado {
    tabla: Tabla;
    escritas: number;
    omitidas: number;
    filasNuevas: number;
}

/**
 * Pega una matriz de texto (TSV) a partir de la fila/columna indicadas de la VISTA. Si el pegado
 * se sale por abajo, crea filas nuevas al final; por la derecha, lo que sobra se descarta. Las
 * columnas calculadas se saltan. En «Selección», un nombre desconocido crea la opción.
 */
export function aplicarPegado(
    t: Tabla,
    matriz: readonly (readonly string[])[],
    destino: { filaIds: readonly string[]; desdeFila: number; colIds: readonly string[]; desdeCol: number },
    c: Ctx,
    resolverPersona?: (texto: string) => string | null,
): ResultadoPegado {
    let tabla = t;
    let omitidas = 0;
    let filasNuevas = 0;
    const filaIds = [...destino.filaIds];
    const necesarias = destino.desdeFila + matriz.length - filaIds.length;
    if (necesarias > 0) {
        const r = anadirFilasAlFinal(tabla, necesarias, c);
        tabla = r.tabla;
        filaIds.push(...r.filaIds);
        filasNuevas = r.filaIds.length;
    }
    const cambios: CambioCelda[] = [];
    matriz.forEach((fila, i) => {
        const filaId = filaIds[destino.desdeFila + i];
        if (!filaId) {
            omitidas += fila.length;
            return;
        }
        fila.forEach((texto, j) => {
            const colId = destino.colIds[destino.desdeCol + j];
            const col = colId ? columnaViva(tabla, colId) : undefined;
            if (!col || col.tipo.v === "calculado") {
                if (colId) omitidas += 1;
                return;
            }
            let valor = coaccionarTexto(col, texto, resolverPersona);
            if (valor === undefined && col.tipo.v === "seleccion") {
                const r = anadirOpcion(tabla, colId, texto, c);
                tabla = r.tabla;
                valor = r.opcionId ?? undefined;
            }
            if (valor === undefined) {
                omitidas += 1;
                return;
            }
            cambios.push({ filaId, colId, valor });
        });
    });
    const final = aplicarCeldas(tabla, cambios, c);
    return { tabla: final, escritas: cambios.length, omitidas, filasNuevas };
}

// ───────────────────────────── utilidades ─────────────────────────────

/** Una tabla nueva con unas columnas y filas de arranque (para «Nueva tabla»). */
export function tablaInicial(c: Ctx, columnas = 3, filas = 5): Tabla {
    let t = tablaVacia();
    const nombres = ["Nombre", "Notas", "Fecha"];
    const tipos: TipoColumna[] = ["texto", "texto", "fecha"];
    for (let i = 0; i < columnas; i++) {
        t = anadirColumna(t, c, { nombre: nombres[i] ?? undefined, tipo: tipos[i] ?? "texto" }).tabla;
    }
    t = anadirFilasAlFinal(t, filas, c).tabla;
    return t;
}

