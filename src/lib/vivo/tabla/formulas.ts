/**
 * Fórmulas de las columnas «Calculado» (2026-09-28).
 *
 * Un evaluador PROPIO y mínimo: nunca `eval`, nunca `new Function`. Solo entiende esta gramática:
 *
 *   expresión = término { ("+" | "-") término }
 *   término   = unario  { ("*" | "/") unario }
 *   unario    = "-" unario | primario
 *   primario  = NÚMERO | "[" columna "]" | FUNCIÓN "(" "[" columna "]" ")" | "(" expresión ")"
 *   FUNCIÓN   = SUMA | PROMEDIO | MIN | MAX | CONTAR      (sobre TODAS las filas de una columna)
 *
 * · `[Precio] * [Cantidad]` opera con las celdas de LA MISMA FILA.
 * · `SUMA([Precio])`, `PROMEDIO([Nota])`… recorren la columna entera.
 * · CONTAR cuenta las celdas con algo escrito.
 * · Lo que quede fuera de la gramática se rechaza con un mensaje en español (posición incluida).
 *
 * La fórmula se ESCRIBE con nombres (`[Precio]`) y se GUARDA con ids (`[#c_ab12]`): así renombrar
 * una columna no rompe las fórmulas que la usan. `compilarFormula` traduce nombres → ids y
 * `mostrarFormula` ids → nombres.
 */
import {
    LIMITES,
    columnasVisibles,
    diasDesdeEpoch,
    esFechaIso,
    estaVacio,
    filasVisibles,
    formatearNumero,
    normalizarNombre,
    numeroDesdeTexto,
    valorCelda,
    type Tabla,
    type TotalFn,
} from "./modelo";

// ───────────────────────────── errores ─────────────────────────────

export type ErrorFormula = "SINTAXIS" | "DIV0" | "VALOR" | "NOMBRE" | "CICLO";

export const MENSAJE_ERROR: Record<ErrorFormula, string> = {
    SINTAXIS: "La fórmula no está bien escrita.",
    DIV0: "División entre cero (o promedio de una columna sin números).",
    VALOR: "Hay un texto donde se esperaba un número.",
    NOMBRE: "La fórmula usa una columna que ya no existe.",
    CICLO: "Las fórmulas se usan unas a otras en círculo.",
};

export const ETIQUETA_ERROR: Record<ErrorFormula, string> = {
    SINTAXIS: "#SINTAXIS",
    DIV0: "#DIV/0",
    VALOR: "#VALOR",
    NOMBRE: "#NOMBRE",
    CICLO: "#CICLO",
};

// ───────────────────────────── gramática ─────────────────────────────

export const FUNCIONES = ["SUMA", "PROMEDIO", "MIN", "MAX", "CONTAR"] as const;
export type FnAgg = (typeof FUNCIONES)[number];

export type Nodo =
    | { k: "num"; v: number }
    | { k: "ref"; col: string }
    | { k: "neg"; e: Nodo }
    | { k: "bin"; op: "+" | "-" | "*" | "/"; l: Nodo; r: Nodo }
    | { k: "agg"; fn: FnAgg; col: string };

type Tok =
    | { k: "num"; v: number; p: number }
    | { k: "ref"; v: string; p: number }
    | { k: "fn"; v: FnAgg; p: number }
    | { k: "op"; v: "+" | "-" | "*" | "/" | "(" | ")"; p: number }
    | { k: "fin"; p: number };

class ErrorSintaxis extends Error {
    constructor(mensaje: string, public pos: number) {
        super(mensaje);
    }
}

const MAX_TOKENS = 240;
const MAX_PROFUNDIDAD = 24;

function sinTildes(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function tokenizar(src: string): Tok[] {
    if (src.length > LIMITES.formula) throw new ErrorSintaxis(`La fórmula es demasiado larga (máximo ${LIMITES.formula} caracteres).`, 0);
    const out: Tok[] = [];
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === " " || c === "\t" || c === "\n" || c === "\r") {
            i += 1;
            continue;
        }
        if (out.length >= MAX_TOKENS) throw new ErrorSintaxis("La fórmula es demasiado larga.", i);
        const resto = src.slice(i);
        const num = /^(?:\d+(?:[.,]\d+)?|[.,]\d+)/.exec(resto);
        if (num) {
            out.push({ k: "num", v: Number(num[0].replace(",", ".")), p: i });
            i += num[0].length;
            continue;
        }
        if (c === "[") {
            const fin = src.indexOf("]", i + 1);
            if (fin < 0) throw new ErrorSintaxis("Falta cerrar un corchete «]».", i);
            const nombre = src.slice(i + 1, fin).trim();
            if (!nombre) throw new ErrorSintaxis("Hay un corchete vacío: escribe el nombre de la columna dentro.", i);
            if (nombre.includes("[") || nombre.length > LIMITES.nombreColumna + 1) throw new ErrorSintaxis("El nombre de la columna no es válido.", i);
            out.push({ k: "ref", v: nombre, p: i });
            i = fin + 1;
            continue;
        }
        const letras = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/.exec(resto);
        if (letras) {
            const nombre = sinTildes(letras[0]).toUpperCase();
            if (!(FUNCIONES as readonly string[]).includes(nombre)) {
                throw new ErrorSintaxis(`«${letras[0]}» no es una función. Puedes usar ${FUNCIONES.join(", ")}. Para una columna, escribe su nombre entre corchetes: [Nombre].`, i);
            }
            out.push({ k: "fn", v: nombre as FnAgg, p: i });
            i += letras[0].length;
            continue;
        }
        if (c === "+" || c === "-" || c === "*" || c === "/" || c === "(" || c === ")") {
            out.push({ k: "op", v: c, p: i });
            i += 1;
            continue;
        }
        throw new ErrorSintaxis(`«${c}» no se puede usar en una fórmula. Solo números, + − * /, paréntesis, [columnas] y ${FUNCIONES.join(", ")}.`, i);
    }
    out.push({ k: "fin", p: src.length });
    return out;
}

function parsear(src: string): Nodo {
    const toks = tokenizar(src);
    let i = 0;
    let profundidad = 0;
    const ver = (): Tok => toks[i];
    const esOp = (t: Tok, v: string): boolean => t.k === "op" && t.v === v;

    function expresion(): Nodo {
        let izq = termino();
        for (;;) {
            const t = ver();
            if (t.k === "op" && (t.v === "+" || t.v === "-")) {
                i += 1;
                izq = { k: "bin", op: t.v, l: izq, r: termino() };
            } else return izq;
        }
    }
    function termino(): Nodo {
        let izq = unario();
        for (;;) {
            const t = ver();
            if (t.k === "op" && (t.v === "*" || t.v === "/")) {
                i += 1;
                izq = { k: "bin", op: t.v, l: izq, r: unario() };
            } else return izq;
        }
    }
    function unario(): Nodo {
        const t = ver();
        if (t.k === "op" && t.v === "-") {
            i += 1;
            profundidad += 1;
            if (profundidad > MAX_PROFUNDIDAD) throw new ErrorSintaxis("La fórmula tiene demasiados niveles.", t.p);
            const e = unario();
            profundidad -= 1;
            return { k: "neg", e };
        }
        return primario();
    }
    function primario(): Nodo {
        const t = ver();
        if (t.k === "num") {
            i += 1;
            return { k: "num", v: t.v };
        }
        if (t.k === "ref") {
            i += 1;
            return { k: "ref", col: t.v };
        }
        if (t.k === "fn") {
            i += 1;
            if (!esOp(ver(), "(")) throw new ErrorSintaxis(`Después de ${t.v} va un paréntesis con una columna: ${t.v}([Columna]).`, t.p);
            i += 1;
            const arg = ver();
            if (arg.k !== "ref") throw new ErrorSintaxis(`${t.v} necesita el nombre de una columna entre corchetes: ${t.v}([Columna]).`, arg.p);
            i += 1;
            if (!esOp(ver(), ")")) throw new ErrorSintaxis(`Falta cerrar el paréntesis de ${t.v}.`, ver().p);
            i += 1;
            return { k: "agg", fn: t.v, col: arg.v };
        }
        if (esOp(t, "(")) {
            i += 1;
            profundidad += 1;
            if (profundidad > MAX_PROFUNDIDAD) throw new ErrorSintaxis("La fórmula tiene demasiados paréntesis anidados.", t.p);
            const e = expresion();
            if (!esOp(ver(), ")")) throw new ErrorSintaxis("Falta cerrar un paréntesis.", ver().p);
            i += 1;
            profundidad -= 1;
            return e;
        }
        if (t.k === "fin") throw new ErrorSintaxis("La fórmula termina antes de tiempo: falta un número o una columna.", t.p);
        throw new ErrorSintaxis("Aquí se esperaba un número, una [columna] o un paréntesis.", t.p);
    }

    const ast = expresion();
    const resto = ver();
    if (resto.k !== "fin") throw new ErrorSintaxis("Sobra algo al final de la fórmula.", resto.p);
    return ast;
}

// ───────────────────────────── serialización ─────────────────────────────

function literal(n: number): string {
    const s = String(n);
    if (!/e/i.test(s)) return s;
    return n.toFixed(20).replace(/0+$/, "").replace(/\.$/, "");
}

function precedencia(n: Nodo): number {
    if (n.k === "bin") return n.op === "+" || n.op === "-" ? 1 : 2;
    if (n.k === "neg") return 3;
    return 4;
}

function serializar(n: Nodo, refTexto: (col: string) => string): string {
    switch (n.k) {
        case "num":
            return literal(n.v);
        case "ref":
            return `[${refTexto(n.col)}]`;
        case "agg":
            return `${n.fn}([${refTexto(n.col)}])`;
        case "neg": {
            const e = serializar(n.e, refTexto);
            return precedencia(n.e) < 3 ? `-(${e})` : `-${e}`;
        }
        case "bin": {
            const p = precedencia(n);
            let l = serializar(n.l, refTexto);
            let r = serializar(n.r, refTexto);
            if (precedencia(n.l) < p) l = `(${l})`;
            const pr = precedencia(n.r);
            if (pr < p || (pr === p && (n.op === "-" || n.op === "/"))) r = `(${r})`;
            return `${l} ${n.op} ${r}`;
        }
    }
}

// ───────────────────────────── compilar / mostrar ─────────────────────────────

export interface ColumnaRef {
    id: string;
    nombre: string;
}

export type ResultadoCompilar =
    | { ok: true; almacenada: string; ast: Nodo }
    | { ok: false; error: string; pos?: number };

function mapear(n: Nodo, f: (col: string) => string): Nodo {
    switch (n.k) {
        case "num":
            return n;
        case "ref":
            return { k: "ref", col: f(n.col) };
        case "agg":
            return { k: "agg", fn: n.fn, col: f(n.col) };
        case "neg":
            return { k: "neg", e: mapear(n.e, f) };
        case "bin":
            return { k: "bin", op: n.op, l: mapear(n.l, f), r: mapear(n.r, f) };
    }
}

class ErrorResolver extends Error {}

/**
 * Traduce lo que escribe la persona (`[Precio] * 2`) a la forma que se guarda (`[#c_ab12] * 2`),
 * validando que cada columna exista y sea única. `excluirId` = la propia columna (no puede citarse).
 */
export function compilarFormula(entrada: string, columnas: readonly ColumnaRef[], excluirId?: string): ResultadoCompilar {
    let ast: Nodo;
    try {
        ast = parsear(entrada);
    } catch (e) {
        if (e instanceof ErrorSintaxis) return { ok: false, error: e.message, pos: e.pos };
        return { ok: false, error: MENSAJE_ERROR.SINTAXIS };
    }
    const porNombre = new Map<string, string[]>();
    for (const c of columnas) {
        const k = normalizarNombre(c.nombre);
        porNombre.set(k, [...(porNombre.get(k) ?? []), c.id]);
    }
    const ids = new Set(columnas.map((c) => c.id));
    try {
        const resuelto = mapear(ast, (raw) => {
            let id: string;
            if (raw.startsWith("#")) {
                id = raw.slice(1);
                if (!ids.has(id)) throw new ErrorResolver(`La columna «${raw}» ya no existe.`);
            } else {
                const hit = porNombre.get(normalizarNombre(raw));
                if (!hit) throw new ErrorResolver(`No existe ninguna columna llamada «${raw}».`);
                if (hit.length > 1) throw new ErrorResolver(`Hay varias columnas llamadas «${raw}»: renombra una para poder usarla.`);
                id = hit[0];
            }
            if (id === excluirId) throw new ErrorResolver("Una columna calculada no puede usarse a sí misma.");
            return `#${id}`;
        });
        return { ok: true, almacenada: serializar(resuelto, (c) => c), ast: resuelto };
    } catch (e) {
        if (e instanceof ErrorResolver) return { ok: false, error: e.message };
        return { ok: false, error: MENSAJE_ERROR.SINTAXIS };
    }
}

/** La fórmula guardada (con ids) tal como se enseña al editarla (con nombres). */
export function mostrarFormula(almacenada: string, columnas: readonly ColumnaRef[]): string {
    try {
        const ast = parsear(almacenada);
        const nombres = new Map(columnas.map((c) => [c.id, c.nombre]));
        return serializar(ast, (raw) => (raw.startsWith("#") ? nombres.get(raw.slice(1)) ?? raw : raw));
    } catch {
        return almacenada;
    }
}

// ───────────────────────────── evaluación ─────────────────────────────

export type ValorCalc = { ok: true; n: number } | { ok: false; e: ErrorFormula };
export type NumeroCelda = { k: "vacio" } | { k: "n"; n: number } | { k: "texto" } | { k: "error"; e: ErrorFormula };

export interface Calculadora {
    /** Valor de una celda de columna «calculado»; null si la columna no es calculada o no tiene fórmula. */
    calculada(filaId: string, colId: string): ValorCalc | null;
    /** La celda vista como número (para operar con ella). */
    numero(filaId: string, colId: string): NumeroCelda;
    /** SUMA/PROMEDIO/MIN/MAX/CONTAR de una columna (todas las filas vivas, o las indicadas). */
    agregar(colId: string, fn: FnAgg, filaIds?: readonly string[]): ValorCalc;
}

const CACHE_PARSEO = new Map<string, { ast: Nodo } | { error: string }>();

function parsearCacheado(src: string): { ast: Nodo } | { error: string } {
    const hit = CACHE_PARSEO.get(src);
    if (hit) return hit;
    let r: { ast: Nodo } | { error: string };
    try {
        r = { ast: parsear(src) };
    } catch (e) {
        r = { error: e instanceof Error ? e.message : MENSAJE_ERROR.SINTAXIS };
    }
    if (CACHE_PARSEO.size > 400) CACHE_PARSEO.clear();
    CACHE_PARSEO.set(src, r);
    return r;
}

export const FN_DE_TOTAL: Record<Exclude<TotalFn, "ninguno">, FnAgg> = {
    suma: "SUMA",
    promedio: "PROMEDIO",
    min: "MIN",
    max: "MAX",
    contar: "CONTAR",
};

/** Calculadora ligada a UNA versión de la tabla (memoiza celdas y agregados). */
export function crearCalculadora(t: Tabla): Calculadora {
    const memo = new Map<string, ValorCalc | null>();
    const memoAgg = new Map<string, ValorCalc>();
    const enCurso = new Set<string>();

    const idDeColumna = (raw: string): string => (raw.startsWith("#") ? raw.slice(1) : raw);

    function numero(filaId: string, colId: string): NumeroCelda {
        const col = t.columnas[colId];
        if (!col || col.borrada?.v) return { k: "error", e: "NOMBRE" };
        const tipo = col.tipo.v;
        if (tipo === "calculado") {
            const r = calculada(filaId, colId);
            if (r === null) return { k: "vacio" };
            return r.ok ? { k: "n", n: r.n } : { k: "error", e: r.e };
        }
        const v = valorCelda(t, filaId, colId);
        if (estaVacio(v)) return { k: "vacio" };
        if (typeof v === "number") return { k: "n", n: v };
        if (typeof v === "boolean") return { k: "n", n: v ? 1 : 0 };
        if (tipo === "fecha") return esFechaIso(v) ? { k: "n", n: diasDesdeEpoch(v) } : { k: "texto" };
        if (tipo === "seleccion" || tipo === "enlace" || tipo === "persona") return { k: "texto" };
        const n = numeroDesdeTexto(String(v));
        return n === null ? { k: "texto" } : { k: "n", n };
    }

    function calculada(filaId: string, colId: string): ValorCalc | null {
        const col = t.columnas[colId];
        if (!col || col.borrada?.v || col.tipo.v !== "calculado") return null;
        const src = col.formula?.v;
        if (!src || !src.trim()) return null;
        const clave = `${filaId}|${colId}`;
        if (memo.has(clave)) return memo.get(clave) ?? null;
        if (enCurso.has(clave)) return { ok: false, e: "CICLO" };
        enCurso.add(clave);
        let r: ValorCalc;
        try {
            const p = parsearCacheado(src);
            r = "ast" in p ? evaluar(p.ast, filaId) : { ok: false, e: "SINTAXIS" };
        } finally {
            enCurso.delete(clave);
        }
        memo.set(clave, r);
        return r;
    }

    function evaluar(n: Nodo, filaId: string): ValorCalc {
        switch (n.k) {
            case "num":
                return { ok: true, n: n.v };
            case "ref": {
                const c = numero(filaId, idDeColumna(n.col));
                if (c.k === "vacio") return { ok: true, n: 0 };
                if (c.k === "n") return { ok: true, n: c.n };
                if (c.k === "texto") return { ok: false, e: "VALOR" };
                return { ok: false, e: c.e };
            }
            case "neg": {
                const e = evaluar(n.e, filaId);
                return e.ok ? { ok: true, n: -e.n } : e;
            }
            case "agg":
                return agregar(idDeColumna(n.col), n.fn);
            case "bin": {
                const l = evaluar(n.l, filaId);
                if (!l.ok) return l;
                const r = evaluar(n.r, filaId);
                if (!r.ok) return r;
                let v: number;
                if (n.op === "+") v = l.n + r.n;
                else if (n.op === "-") v = l.n - r.n;
                else if (n.op === "*") v = l.n * r.n;
                else {
                    if (r.n === 0) return { ok: false, e: "DIV0" };
                    v = l.n / r.n;
                }
                return Number.isFinite(v) ? { ok: true, n: v } : { ok: false, e: "VALOR" };
            }
        }
    }

    function agregar(colId: string, fn: FnAgg, filaIds?: readonly string[]): ValorCalc {
        const col = t.columnas[colId];
        if (!col || col.borrada?.v) return { ok: false, e: "NOMBRE" };
        const clave = `agg|${fn}|${colId}`;
        if (!filaIds) {
            const hit = memoAgg.get(clave);
            if (hit) return hit;
            if (enCurso.has(clave)) return { ok: false, e: "CICLO" };
            enCurso.add(clave);
        }
        try {
            const filas = filaIds ?? filasVisibles(t).map((f) => f.id);
            let suma = 0;
            let n = 0;
            let min = Infinity;
            let max = -Infinity;
            let llenas = 0;
            for (const f of filas) {
                const c = numero(f, colId);
                if (c.k === "error") return finalizar(clave, filaIds, { ok: false, e: c.e });
                if (c.k === "vacio") continue;
                llenas += 1;
                if (c.k === "n") {
                    suma += c.n;
                    n += 1;
                    if (c.n < min) min = c.n;
                    if (c.n > max) max = c.n;
                }
            }
            let r: ValorCalc;
            if (fn === "SUMA") r = { ok: true, n: suma };
            else if (fn === "PROMEDIO") r = n === 0 ? { ok: false, e: "DIV0" } : { ok: true, n: suma / n };
            else if (fn === "MIN") r = { ok: true, n: n === 0 ? 0 : min };
            else if (fn === "MAX") r = { ok: true, n: n === 0 ? 0 : max };
            else r = { ok: true, n: llenas };
            return finalizar(clave, filaIds, r);
        } finally {
            if (!filaIds) enCurso.delete(clave);
        }
    }

    function finalizar(clave: string, filaIds: readonly string[] | undefined, r: ValorCalc): ValorCalc {
        if (!filaIds) memoAgg.set(clave, r);
        return r;
    }

    return { calculada, numero, agregar };
}

/** Texto de un valor calculado tal como se enseña. */
export function textoCalculado(v: ValorCalc): string {
    return v.ok ? formatearNumero(v.n) : ETIQUETA_ERROR[v.e];
}

/** Ids de las columnas que una fórmula guardada usa (para avisar al borrar una columna). */
export function columnasUsadas(almacenada: string): string[] {
    const p = parsearCacheado(almacenada);
    if (!("ast" in p)) return [];
    const ids = new Set<string>();
    const visitar = (n: Nodo): void => {
        if (n.k === "ref" || n.k === "agg") ids.add(idDeColumna2(n.col));
        else if (n.k === "neg") visitar(n.e);
        else if (n.k === "bin") {
            visitar(n.l);
            visitar(n.r);
        }
    };
    visitar(p.ast);
    return [...ids];
}
function idDeColumna2(raw: string): string {
    return raw.startsWith("#") ? raw.slice(1) : raw;
}

/** Columnas vivas que se pueden citar en la fórmula de `colId` (todas menos ella). */
export function columnasCitables(t: Tabla, colId: string): ColumnaRef[] {
    return columnasVisibles(t)
        .filter((c) => c.id !== colId)
        .map((c) => ({ id: c.id, nombre: c.nombre.v }));
}
