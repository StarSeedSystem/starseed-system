/**
 * Ajustes remotos completos (REM1126A · contrato `architecture/terminal-entre-neuronas.md` §«Ajustes remotos»).
 * Órdenes tipadas «leer-ajustes», «poner-ajuste» y «deshacer-ajuste» por el canal sellado del control.
 * Puro, sin `node:*`, nunca lanza. Permiso «configurar a distancia»: apagado de fábrica, solo lo enciende la
 * persona dueña EN ese aparato. Lo que toca la seguridad del aparato jamás se cambia a distancia.
 */

import type { Args } from "./niveles";

export const ORDENES_AJUSTES = ["leer-ajustes", "poner-ajuste", "deshacer-ajuste"] as const;
export type OrdenAjuste = (typeof ORDENES_AJUSTES)[number];
export type AmbitoAjuste = "permiso" | "ajuste" | "apariencia";
export type ValorAjuste = boolean | number | string;

/** Claves de seguridad del aparato: se ven, pero no se cambian a distancia. */
export const CLAVES_SEGURIDAD: readonly string[] = ["agent", "terminal", "configurarADistancia", "aceptarControladores", "alcance", "claves", "firma"];
const AMBITOS: readonly AmbitoAjuste[] = ["permiso", "ajuste", "apariencia"];
const RE_CLAVE = /^[A-Za-z][A-Za-z0-9_.-]{0,59}$/;
const RE_ID = /^[A-Za-z0-9-]{1,60}$/;
const MAX_REGISTRO = 200;

export interface EntradaRegistroAjuste {
    id: string;
    t: number;
    de: string;
    clave: string;
    ambito: AmbitoAjuste;
    anterior: ValorAjuste | null;
    nuevo: ValorAjuste;
    deshecho: boolean;
}

export interface EstadoAjustesAparato {
    /** Apagado de fábrica; lo enciende la persona dueña en este aparato. */
    configurarADistancia: boolean;
    valores: Record<string, ValorAjuste>;
    registro: EntradaRegistroAjuste[];
}

export type ResultadoAjuste =
    | { ok: true; estado: EstadoAjustesAparato; entrada?: EntradaRegistroAjuste; ajustes?: Record<string, ValorAjuste> }
    | { ok: false; motivo: "permiso-apagado" | "seguridad" | "argumentos" | "no-existe" | "ya-deshecho" };

export const ESTADO_AJUSTES_DEFECTO: EstadoAjustesAparato = { configurarADistancia: false, valores: {}, registro: [] };

function esValor(v: unknown): v is ValorAjuste {
    return typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.length <= 200);
}

/** Forma estricta de los argumentos de cada orden, o null. */
export function validarArgsAjusteRemoto(nombre: string, a: Args): Args | null {
    const ks = Object.keys(a);
    if (nombre === "leer-ajustes") return ks.length === 0 ? {} : null;
    if (nombre === "deshacer-ajuste") return ks.length === 1 && typeof a.id === "string" && RE_ID.test(a.id) ? { id: a.id } : null;
    if (nombre !== "poner-ajuste") return null;
    if (ks.length !== 3 || typeof a.clave !== "string" || !RE_CLAVE.test(a.clave)) return null;
    if (!AMBITOS.includes(a.ambito as AmbitoAjuste) || !esValor(a.valor)) return null;
    return { clave: a.clave, valor: a.valor, ambito: a.ambito };
}

function conEntrada(estado: EstadoAjustesAparato, e: EntradaRegistroAjuste): EstadoAjustesAparato {
    return { ...estado, registro: [e, ...estado.registro].slice(0, MAX_REGISTRO) };
}

/** Lee todos los ajustes. Con el permiso apagado no sale nada. */
export function resolverLeerAjustes(estado: EstadoAjustesAparato): ResultadoAjuste {
    if (!estado.configurarADistancia) return { ok: false, motivo: "permiso-apagado" };
    return { ok: true, estado, ajustes: { ...estado.valores } };
}

export function resolverPonerAjuste(estado: EstadoAjustesAparato, args: Args, de: string, ahora: number): ResultadoAjuste {
    if (!estado.configurarADistancia) return { ok: false, motivo: "permiso-apagado" };
    const v = validarArgsAjusteRemoto("poner-ajuste", args);
    if (!v) return { ok: false, motivo: "argumentos" };
    const clave = v.clave as string;
    if (CLAVES_SEGURIDAD.includes(clave)) return { ok: false, motivo: "seguridad" };
    const e: EntradaRegistroAjuste = {
        id: ahora.toString(36) + "-" + estado.registro.length,
        t: ahora,
        de,
        clave,
        ambito: v.ambito as AmbitoAjuste,
        anterior: clave in estado.valores ? estado.valores[clave] : null,
        nuevo: v.valor as ValorAjuste,
        deshecho: false,
    };
    return { ok: true, estado: conEntrada({ ...estado, valores: { ...estado.valores, [clave]: e.nuevo } }, e), entrada: e };
}

/** Devuelve el valor anterior. Sigue exigiendo el permiso: deshacer también es configurar. */
export function resolverDeshacerAjuste(estado: EstadoAjustesAparato, id: string, de: string, ahora: number): ResultadoAjuste {
    if (!estado.configurarADistancia) return { ok: false, motivo: "permiso-apagado" };
    const orig = estado.registro.find((r) => r.id === id);
    if (!orig) return { ok: false, motivo: "no-existe" };
    if (orig.deshecho) return { ok: false, motivo: "ya-deshecho" };
    const valores = { ...estado.valores };
    if (orig.anterior === null) delete valores[orig.clave];
    else valores[orig.clave] = orig.anterior;
    const e: EntradaRegistroAjuste = {
        id: ahora.toString(36) + "-u" + estado.registro.length,
        t: ahora,
        de,
        clave: orig.clave,
        ambito: orig.ambito,
        anterior: orig.nuevo,
        nuevo: orig.anterior ?? "",
        deshecho: true,
    };
    const registro = estado.registro.map((r) => (r.id === id ? { ...r, deshecho: true } : r));
    return { ok: true, estado: conEntrada({ ...estado, valores, registro }, e), entrada: e };
}

/** Solo la persona dueña, en este aparato (nunca una orden remota ni un voto), cambia el permiso. */
export function ponerPermisoConfigurarADistancia(estado: EstadoAjustesAparato, encendido: boolean): EstadoAjustesAparato {
    return { ...estado, configurarADistancia: encendido };
}
