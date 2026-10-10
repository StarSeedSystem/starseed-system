/**
 * StarSeed XR · saneo de valores sueltos de un MundoSpec. Nunca lanza: cada ayuda devuelve un valor seguro y
 * anota el problema con el modo de arreglarlo. Reutiliza `pareceCodigo` del núcleo intocable (sólo lectura).
 */
import { pareceCodigo } from "@/lib/nucleo/ui-spec";
import type { Vec3 } from "./tipos";

export interface ProblemaMundo {
    gravedad: "error" | "aviso";
    ruta: string;
    mensaje: string;
    arreglo: string;
}

export class Acta {
    problemas: ProblemaMundo[] = [];
    error(ruta: string, mensaje: string, arreglo: string): void { this.problemas.push({ gravedad: "error", ruta, mensaje, arreglo }); }
    aviso(ruta: string, mensaje: string, arreglo: string): void { this.problemas.push({ gravedad: "aviso", ruta, mensaje, arreglo }); }
    get hayErrores(): boolean { return this.problemas.some((p) => p.gravedad === "error"); }
}

export const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const PATRON_ID = /^[a-z0-9][a-z0-9._:-]{0,63}$/i;
const PATRON_COLOR = /^#[0-9a-f]{6}$/i;

export function num(v: unknown, min: number, max: number, def: number, ruta: string, a: Acta): number {
    if (v === undefined) return def;
    if (typeof v !== "number" || !Number.isFinite(v)) {
        a.aviso(ruta, "Se esperaba un número.", `Pon un número entre ${min} y ${max}; se usó ${def}.`);
        return def;
    }
    if (v < min || v > max) {
        a.aviso(ruta, `Valor ${v} fuera de rango.`, `Debe estar entre ${min} y ${max}; se acotó.`);
        return Math.min(max, Math.max(min, v));
    }
    return v;
}

export function vec(v: unknown, min: number, max: number, def: Vec3, ruta: string, a: Acta): Vec3 {
    if (v === undefined) return def;
    if (!Array.isArray(v) || v.length !== 3) {
        a.aviso(ruta, "Se esperaba [x, y, z].", `Se usó ${JSON.stringify(def)}.`);
        return def;
    }
    return [num(v[0], min, max, def[0], ruta, a), num(v[1], min, max, def[1], ruta, a), num(v[2], min, max, def[2], ruta, a)];
}

export function cad(v: unknown, largo: number, def: string, ruta: string, a: Acta): string {
    if (v === undefined) return def;
    if (typeof v !== "string") { a.aviso(ruta, "Se esperaba texto.", "Escribe un texto corto."); return def; }
    const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    if (pareceCodigo(t)) { a.error(ruta, "El texto parece código: un mundo es dato, no programa.", "Quita etiquetas, `javascript:` o manejadores; describe la intención en palabras."); return def; }
    if (t.length > largo) { a.aviso(ruta, `Texto de ${t.length} caracteres.`, `Máximo ${largo}; se recortó.`); return t.slice(0, largo); }
    return t;
}

export function ident(v: unknown, ruta: string, a: Acta): string | null {
    if (typeof v === "string" && PATRON_ID.test(v)) return v;
    a.error(ruta, "Identificador inválido o ausente.", "Usa letras, números y . _ : - (máximo 64), sin espacios.");
    return null;
}

export function color(v: unknown, def: string, ruta: string, a: Acta): string {
    if (v === undefined) return def;
    if (typeof v === "string" && PATRON_COLOR.test(v)) return v.toLowerCase();
    a.aviso(ruta, "Color no válido.", `Usa #rrggbb; se usó ${def}.`);
    return def;
}

/** Sólo https, sin usuario ni contraseña, sin `javascript:`/`data:`/`blob:`. */
export function urlHttps(v: unknown, ruta: string, a: Acta): string | null {
    try {
        const u = new URL(String(v));
        if (u.protocol === "https:" && !u.username && !u.password && String(v).length <= 2048) return u.toString();
    } catch { /* cae al error */ }
    a.error(ruta, "Dirección no permitida.", "Sólo https:// sin usuario ni contraseña; o una referencia de la Biblioteca.");
    return null;
}

export function elegir<T extends string>(v: unknown, lista: readonly T[], def: T, ruta: string, a: Acta): T {
    if (v === undefined) return def;
    if (typeof v === "string" && (lista as readonly string[]).includes(v)) return v as T;
    a.error(ruta, `«${String(v)}» no está en el vocabulario.`, `Valores admitidos: ${lista.join(", ")}.`);
    return def;
}
