/**
 * Modelo de la TABLA DE DATOS compartida (2026-09-28).
 *
 * Una tabla vive dentro del `doc` de un espacio `os_spaces` (`doc.tabla`). Para que varias personas
 * la editen a la vez SIN pisarse, cada dato es un REGISTRO con reloj:
 *
 *   Reg<T> = { v: valor, t: actualizado (ms, reloj híbrido), a: autor (12 hex de su cuenta) }
 *
 * · Cada CELDA es su propio registro → dos personas que editan celdas distintas conservan ambas.
 * · Columnas y filas son entidades con sus propiedades en registros (nombre, tipo, ancho, orden…)
 *   y una LÁPIDA (`borrada`) en vez de desaparecer: así un borrado concurrente con una edición
 *   nunca resucita ni pierde datos, y se puede deshacer.
 * · La fusión (`fusion.ts`) es determinista, conmutativa e idempotente: gana el `t` mayor; a
 *   igualdad, el autor y por último el valor.
 *
 * Claves cortas (`v`, `t`, `a`) a propósito: un doc de 2 000 celdas debe caber cómodo en la fila
 * de `os_spaces` y en el mensaje de Realtime.
 *
 * Este archivo es PURO (sin React, sin red): tipos, límites, normalización defensiva de lo que
 * llega de la red, y lectura ordenada.
 */

export const FORMATO_TABLA = 1;

export const LIMITES = {
    columnas: 60,
    filas: 3000,
    textoCelda: 2000,
    nombreColumna: 60,
    opcionesPorColumna: 40,
    formula: 300,
    /** Tamaño aproximado del JSON de la tabla a partir del cual se avisa / se deja de crecer. */
    docAviso: 600_000,
    docMaximo: 900_000,
    anchoMin: 60,
    anchoMax: 800,
    anchoDefecto: 168,
} as const;

/** Un valor con su reloj: valor, actualizado (ms) y autor. */
export interface Reg<T> {
    v: T;
    t: number;
    a: string;
}

export const TIPOS_COLUMNA = ["texto", "numero", "fecha", "casilla", "seleccion", "enlace", "persona", "calculado"] as const;
export type TipoColumna = (typeof TIPOS_COLUMNA)[number];

export const TOTALES = ["ninguno", "suma", "promedio", "min", "max", "contar"] as const;
export type TotalFn = (typeof TOTALES)[number];

export const ETIQUETA_TIPO: Record<TipoColumna, string> = {
    texto: "Texto",
    numero: "Número",
    fecha: "Fecha",
    casilla: "Casilla",
    seleccion: "Selección",
    enlace: "Enlace",
    persona: "Persona",
    calculado: "Calculado",
};

export const ETIQUETA_TOTAL: Record<TotalFn, string> = {
    ninguno: "Sin total",
    suma: "Suma",
    promedio: "Promedio",
    min: "Mínimo",
    max: "Máximo",
    contar: "Contar",
};

/** Paleta de las opciones de «Selección» (acentos del OS). */
export const COLORES_OPCION = ["#7C5CFF", "#007FFF", "#10B981", "#39FF14", "#FFBF00", "#DC143C", "#14B8A6", "#EC4899"] as const;

/** Una opción de una columna de «Selección». `orden` la coloca en la lista. */
export interface OpcionDato {
    nombre: string;
    color: string;
    orden: number;
}

export interface Columna {
    id: string;
    nombre: Reg<string>;
    tipo: Reg<TipoColumna>;
    ancho: Reg<number>;
    orden: Reg<number>;
    /** Solo «seleccion»: opciones por id, cada una un registro (null = quitada). */
    opciones?: Record<string, Reg<OpcionDato | null>>;
    /** Solo «calculado»: fórmula canónica con ids (`[#c_ab12] * 2`). */
    formula?: Reg<string>;
    total?: Reg<TotalFn>;
    borrada?: Reg<boolean>;
}

export interface Fila {
    id: string;
    orden: Reg<number>;
    borrada?: Reg<boolean>;
}

export type ValorCelda = string | number | boolean | null;
export type Celda = Reg<ValorCelda>;

export interface Tabla {
    v: typeof FORMATO_TABLA;
    columnas: Record<string, Columna>;
    filas: Record<string, Fila>;
    /** Clave `${filaId}|${colId}`. */
    celdas: Record<string, Celda>;
}

/** Contexto de una escritura: el reloj y quién escribe. */
export interface Ctx {
    t: number;
    a: string;
}

// ───────────────────────────── ids y claves ─────────────────────────────

const RE_ID = /^[fco]_[a-z0-9]{2,24}$/;
export function esIdValido(id: unknown): id is string {
    return typeof id === "string" && RE_ID.test(id);
}

let contador = 0;
function azar(n: number): string {
    let s = "";
    try {
        const c = (globalThis as { crypto?: Crypto }).crypto;
        if (c?.getRandomValues) {
            const b = new Uint8Array(n);
            c.getRandomValues(b);
            for (const x of b) s += (x % 36).toString(36);
            return s;
        }
    } catch {
        /* cae al azar simple */
    }
    while (s.length < n) s += Math.floor(Math.random() * 36).toString(36);
    return s;
}

/** Id nuevo: `f_` fila · `c_` columna · `o_` opción. */
export function nuevoId(prefijo: "f" | "c" | "o"): string {
    contador = (contador + 1) % 46656;
    return `${prefijo}_${azar(6)}${contador.toString(36)}`;
}

export function claveCelda(filaId: string, colId: string): string {
    return `${filaId}|${colId}`;
}

/** Autor abreviado: 12 hex de la cuenta (basta para desempatar y para reconocer a la persona). */
export function autorCorto(uid: string | null | undefined): string {
    const limpio = (uid ?? "").replace(/-/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return limpio.slice(0, 12) || "anonimo";
}

// ───────────────────────────── construcción ─────────────────────────────

export function reg<T>(v: T, c: Ctx): Reg<T> {
    return { v, t: c.t, a: c.a };
}

export function tablaVacia(): Tabla {
    return { v: FORMATO_TABLA, columnas: {}, filas: {}, celdas: {} };
}

/** Sanea el nombre de una columna: sin corchetes (los usan las fórmulas), sin saltos, acotado. */
export function sanearNombreColumna(nombre: string): string {
    const limpio = nombre.replace(/\[/g, "(").replace(/\]/g, ")").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
    return limpio.slice(0, LIMITES.nombreColumna);
}

/** Texto comparable de un nombre: sin tildes, en minúsculas, espacios colapsados. */
export function normalizarNombre(nombre: string): string {
    return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// ───────────────────────────── lectura ordenada ─────────────────────────────

function porOrden<T extends { id: string; orden: Reg<number> }>(a: T, b: T): number {
    return a.orden.v - b.orden.v || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

const cacheColumnas = new WeakMap<Tabla, Columna[]>();
const cacheFilas = new WeakMap<Tabla, Fila[]>();

/** Columnas vivas, en orden. Memoizado por tabla (las tablas son inmutables). */
export function columnasVisibles(t: Tabla): Columna[] {
    const hit = cacheColumnas.get(t);
    if (hit) return hit;
    const lista = Object.values(t.columnas).filter((c) => !c.borrada?.v).sort(porOrden);
    cacheColumnas.set(t, lista);
    return lista;
}

/** Filas vivas, en el orden COMPARTIDO (las vistas por persona se aplican encima). */
export function filasVisibles(t: Tabla): Fila[] {
    const hit = cacheFilas.get(t);
    if (hit) return hit;
    const lista = Object.values(t.filas).filter((f) => !f.borrada?.v).sort(porOrden);
    cacheFilas.set(t, lista);
    return lista;
}

export function valorCelda(t: Tabla, filaId: string, colId: string): ValorCelda {
    return t.celdas[claveCelda(filaId, colId)]?.v ?? null;
}

export function opcionesOrdenadas(col: Columna): { id: string; nombre: string; color: string }[] {
    const lista: { id: string; nombre: string; color: string; orden: number }[] = [];
    for (const [id, r] of Object.entries(col.opciones ?? {})) {
        if (r.v) lista.push({ id, nombre: r.v.nombre, color: r.v.color, orden: r.v.orden });
    }
    return lista.sort((a, b) => a.orden - b.orden || (a.id < b.id ? -1 : 1)).map(({ id, nombre, color }) => ({ id, nombre, color }));
}

export function nombreDeOpcion(col: Columna, opcionId: unknown): string | null {
    if (typeof opcionId !== "string") return null;
    return col.opciones?.[opcionId]?.v?.nombre ?? null;
}

/** ¿Está vacío este valor (nada escrito)? */
export function estaVacio(v: ValorCelda | undefined): boolean {
    return v === null || v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v));
}

// ───────────────────────────── fechas ─────────────────────────────

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ¿Es una fecha ISO (AAAA-MM-DD) que existe de verdad? */
export function esFechaIso(s: unknown): s is string {
    if (typeof s !== "string") return false;
    const m = RE_ISO.exec(s);
    if (!m) return false;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const f = new Date(Date.UTC(y, mo - 1, d));
    return f.getUTCFullYear() === y && f.getUTCMonth() === mo - 1 && f.getUTCDate() === d;
}

/** Días desde 1970-01-01 (para restar fechas en fórmulas). */
export function diasDesdeEpoch(iso: string): number {
    const m = RE_ISO.exec(iso);
    if (!m) return Number.NaN;
    return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

/** 2026-09-28 → 28/09/2026. */
export function fechaLegible(iso: string): string {
    const m = RE_ISO.exec(iso);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Acepta 28/09/2026, 28-9-2026 o 2026-09-28 y devuelve ISO, o null. */
export function fechaDesdeTexto(texto: string): string | null {
    const t = texto.trim();
    if (esFechaIso(t)) return t;
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
    if (!m) return null;
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return esFechaIso(iso) ? iso : null;
}

// ───────────────────────────── números ─────────────────────────────

/**
 * Número desde texto escrito por una persona: acepta coma o punto decimal, espacios y puntos de
 * millar cuando hay varios (`1.234.567,5`). Un único punto se toma como decimal (`1.234` = 1,234).
 * null si no es un número.
 */
export function numeroDesdeTexto(texto: string): number | null {
    let s = texto.trim().replace(/\s/g, "");
    if (!s || !/^[+-]?[\d.,]+$/.test(s)) return null;
    // Un separador de millares solo vale si parte los dígitos en grupos de tres («1.234.567»).
    const millaresValidos = (entero: string, sep: string): boolean => {
        const grupos = entero.replace(/^[+-]/, "").split(sep);
        return grupos.length > 1 && grupos[0].length >= 1 && grupos[0].length <= 3 && grupos.slice(1).every((g) => g.length === 3);
    };
    const puntos = (s.match(/\./g) ?? []).length;
    const comas = (s.match(/,/g) ?? []).length;
    if (puntos && comas) {
        const decimal = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
        const millar = decimal === "," ? "." : ",";
        const partes = s.split(decimal);
        if (partes.length > 2 || !millaresValidos(partes[0], millar)) return null;
        s = s.split(millar).join("").replace(decimal, ".");
    } else if (comas > 1) {
        if (!millaresValidos(s, ",")) return null;
        s = s.split(",").join("");
    } else if (comas === 1) {
        s = s.replace(",", ".");
    } else if (puntos > 1) {
        if (!millaresValidos(s, ".")) return null;
        s = s.split(".").join("");
    }
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

const FORMATO_NUM = (() => {
    try {
        return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 6 });
    } catch {
        return null;
    }
})();

/** 1234.5 → «1234,5» (es-ES). */
export function formatearNumero(n: number): string {
    if (Object.is(n, -0)) n = 0;
    return FORMATO_NUM ? FORMATO_NUM.format(n) : String(n);
}

/** Cómo se enseña el número en el editor: el mismo que verá la persona, sin agrupar millares. */
export function numeroParaEditar(n: number): string {
    return String(n).replace(".", ",");
}

// ───────────────────────────── enlaces y personas ─────────────────────────────

/** Solo http(s) y mailto. Devuelve la dirección normalizada o null. */
export function enlaceSeguro(texto: string): string | null {
    const t = texto.trim();
    if (!t || /\s/.test(t) || t.length > 2000) return null;
    if (/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(t)) return t;
    const conEsquema = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : /^[^\s/]+\.[a-z]{2,}([/?#].*)?$/i.test(t) ? `https://${t}` : null;
    if (!conEsquema) return null;
    try {
        const u = new URL(conEsquema);
        if (u.protocol !== "https:" && u.protocol !== "http:") return null;
        if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
        return u.toString();
    } catch {
        return null;
    }
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function esUuid(s: unknown): s is string {
    return typeof s === "string" && RE_UUID.test(s);
}

// ───────────────────────────── normalización defensiva ─────────────────────────────
// Todo lo que llega de la red (o de un borrador local) pasa por aquí: se conserva solo lo bien
// formado y se acota. Un doc corrupto o malicioso no debe poder romper la interfaz.

function esObjeto(x: unknown): x is Record<string, unknown> {
    return typeof x === "object" && x !== null && !Array.isArray(x);
}

function leerReg<T>(x: unknown, validar: (v: unknown) => T | undefined): Reg<T> | undefined {
    if (!esObjeto(x)) return undefined;
    const { v, t, a } = x;
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0 || t > 8.64e15) return undefined;
    if (typeof a !== "string" || a.length > 24) return undefined;
    const valor = validar(v);
    return valor === undefined ? undefined : { v: valor, t, a };
}

const vTexto = (max: number) => (v: unknown): string | undefined => (typeof v === "string" ? v.slice(0, max) : undefined);
const vNumero = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const vBool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
const vTipo = (v: unknown): TipoColumna | undefined => ((TIPOS_COLUMNA as readonly unknown[]).includes(v) ? (v as TipoColumna) : undefined);
const vTotal = (v: unknown): TotalFn | undefined => ((TOTALES as readonly unknown[]).includes(v) ? (v as TotalFn) : undefined);
const vAncho = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(LIMITES.anchoMax, Math.max(LIMITES.anchoMin, Math.round(v))) : undefined;
const vValorCelda = (v: unknown): ValorCelda | undefined => {
    if (v === null) return null;
    if (typeof v === "string") return v.slice(0, LIMITES.textoCelda);
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "boolean") return v;
    return undefined;
};
const RE_COLOR = /^#[0-9a-f]{6}$/i;
const vOpcion = (v: unknown): OpcionDato | null | undefined => {
    if (v === null) return null;
    if (!esObjeto(v)) return undefined;
    const nombre = typeof v.nombre === "string" ? v.nombre.slice(0, 60) : undefined;
    const orden = typeof v.orden === "number" && Number.isFinite(v.orden) ? v.orden : undefined;
    if (nombre === undefined || orden === undefined) return undefined;
    const color = typeof v.color === "string" && RE_COLOR.test(v.color) ? v.color : COLORES_OPCION[0];
    return { nombre, color, orden };
};

/** Devuelve una `Tabla` segura a partir de cualquier cosa. Nunca lanza. */
export function normalizarTabla(raw: unknown): Tabla {
    const out = tablaVacia();
    if (!esObjeto(raw)) return out;

    if (esObjeto(raw.columnas)) {
        for (const [id, c] of Object.entries(raw.columnas)) {
            if (!esIdValido(id) || !esObjeto(c)) continue;
            const nombre = leerReg(c.nombre, vTexto(LIMITES.nombreColumna));
            const tipo = leerReg(c.tipo, vTipo);
            const ancho = leerReg(c.ancho, vAncho);
            const orden = leerReg(c.orden, vNumero);
            if (!nombre || !tipo || !orden) continue;
            const col: Columna = { id, nombre, tipo, ancho: ancho ?? { v: LIMITES.anchoDefecto, t: 0, a: "" }, orden };
            if (esObjeto(c.opciones)) {
                const ops: Record<string, Reg<OpcionDato | null>> = {};
                let n = 0;
                for (const [oid, o] of Object.entries(c.opciones)) {
                    if (!esIdValido(oid) || n >= LIMITES.opcionesPorColumna * 2) continue;
                    const r = leerReg(o, vOpcion);
                    if (r) {
                        ops[oid] = r;
                        n += 1;
                    }
                }
                col.opciones = ops;
            }
            const formula = leerReg(c.formula, vTexto(LIMITES.formula));
            if (formula) col.formula = formula;
            const total = leerReg(c.total, vTotal);
            if (total) col.total = total;
            const borrada = leerReg(c.borrada, vBool);
            if (borrada) col.borrada = borrada;
            out.columnas[id] = col;
        }
    }

    if (esObjeto(raw.filas)) {
        for (const [id, f] of Object.entries(raw.filas)) {
            if (!esIdValido(id) || !esObjeto(f)) continue;
            const orden = leerReg(f.orden, vNumero);
            if (!orden) continue;
            const fila: Fila = { id, orden };
            const borrada = leerReg(f.borrada, vBool);
            if (borrada) fila.borrada = borrada;
            out.filas[id] = fila;
        }
    }

    if (esObjeto(raw.celdas)) {
        for (const [clave, c] of Object.entries(raw.celdas)) {
            const i = clave.indexOf("|");
            if (i < 0) continue;
            const filaId = clave.slice(0, i);
            const colId = clave.slice(i + 1);
            if (!esIdValido(filaId) || !esIdValido(colId)) continue;
            const r = leerReg(c, vValorCelda);
            if (r) out.celdas[clave] = r;
        }
    }
    return out;
}

/** Tamaño aproximado (bytes) del JSON de la tabla. */
export function estimarTamano(t: Tabla): number {
    try {
        return JSON.stringify(t).length;
    } catch {
        return 0;
    }
}

/** Mayor `t` de toda la tabla: alimenta el reloj híbrido para que una edición nueva siempre gane. */
export function maxTiempo(t: Tabla): number {
    let max = 0;
    const ver = (r: { t: number } | undefined) => {
        if (r && r.t > max) max = r.t;
    };
    for (const c of Object.values(t.columnas)) {
        ver(c.nombre);
        ver(c.tipo);
        ver(c.ancho);
        ver(c.orden);
        ver(c.formula);
        ver(c.total);
        ver(c.borrada);
        for (const o of Object.values(c.opciones ?? {})) ver(o);
    }
    for (const f of Object.values(t.filas)) {
        ver(f.orden);
        ver(f.borrada);
    }
    for (const c of Object.values(t.celdas)) ver(c);
    return max;
}

/** Cuántas celdas con contenido hay (para avisos de tamaño). */
export function contarCeldas(t: Tabla): number {
    let n = 0;
    for (const c of Object.values(t.celdas)) if (!estaVacio(c.v)) n += 1;
    return n;
}
