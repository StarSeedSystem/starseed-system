/**
 * IDI1115N · Dónde se guarda el idioma y cómo se sugiere la primera vez.
 *  · Por neurona: `starseed.idioma.neurona.v1` (localStorage de este aparato; nunca viaja).
 *  · Con la cuenta, como valor por defecto de los aparatos siguientes: el mapa `starseed.traduccion.v1`
 *    que ya viaja con la cuenta (perfil «_cuenta», campo `idioma`; src/lib/traduccion/preferencias.ts).
 *  · La sugerencia sale de `navigator.languages` y de lo que informe el lado nativo
 *    (`window.__STARSEED_IDIOMAS_NATIVOS__`, lista de códigos); NUNCA se aplica sola:
 *    solo se ofrece, y una elección ya hecha no se pisa.
 * Módulo PURO salvo `localStorage`/`window`, siempre protegidos.
 */
import { CLAVE_TRADUCCION, guardar as guardarPrefs, leer as leerPrefs } from "@/lib/traduccion/preferencias";
import { aIdiomaElegible, IDIOMA_FUENTE } from "./idiomas";

/** Local por diseño: no está en SYNCED_KEYS (no sube a la cuenta) y no es secreto ni sesión, así que migra como «normal» (sin NEVER_SYNCED). */
export const CLAVE_IDIOMA_NEURONA = "starseed.idioma.neurona.v1";
export const PERFIL_CUENTA = "_cuenta";
export const EVENTO_IDIOMA = "starseed:idioma";

export interface EleccionIdioma { codigo: string; origen: "persona" | "cuenta"; elegidoEn?: string }
export interface AlmacenIdioma { getItem(k: string): string | null; setItem(k: string, v: string): void }

const almacen = (a?: AlmacenIdioma | null): AlmacenIdioma | null => {
    if (a !== undefined) return a;
    try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
};

/** Códigos del aparato en orden de preferencia, sin repetir: lo nativo primero, luego el navegador. */
export function idiomasDelAparato(entorno?: { languages?: readonly string[]; language?: string; nativos?: readonly string[] }): string[] {
    const nav = typeof navigator === "undefined" ? undefined : navigator;
    const win = typeof window === "undefined" ? undefined : (window as unknown as { __STARSEED_IDIOMAS_NATIVOS__?: unknown });
    const nativos = entorno?.nativos ?? (Array.isArray(win?.__STARSEED_IDIOMAS_NATIVOS__) ? (win!.__STARSEED_IDIOMAS_NATIVOS__ as string[]) : []);
    const lista = [...nativos, ...(entorno?.languages ?? nav?.languages ?? []), entorno?.language ?? nav?.language ?? ""];
    const salida: string[] = [];
    for (const v of lista) { const c = aIdiomaElegible(v); if (c && !salida.includes(c)) salida.push(c); }
    return salida;
}

/** El idioma que se sugiere en este aparato (el primero que el aparato dice y StarSeed sabe); español si ninguno. */
export function sugerirIdioma(entorno?: Parameters<typeof idiomasDelAparato>[0]): string {
    return idiomasDelAparato(entorno)[0] ?? IDIOMA_FUENTE;
}

/** Lo que decidió esta neurona; null si nunca se eligió aquí. */
export function leerEleccionNeurona(a?: AlmacenIdioma | null): EleccionIdioma | null {
    try {
        const s = almacen(a);
        const bruto = s ? JSON.parse(s.getItem(CLAVE_IDIOMA_NEURONA) ?? "null") as Partial<EleccionIdioma> | null : null;
        const codigo = aIdiomaElegible(bruto?.codigo);
        return codigo ? { codigo, origen: "persona", elegidoEn: typeof bruto?.elegidoEn === "string" ? bruto.elegidoEn : undefined } : null;
    } catch { return null; }
}

/** Lo que la cuenta tiene como idioma por defecto (solo si la persona lo guardó alguna vez); null si no. */
export function leerDefectoCuenta(a?: AlmacenIdioma | null): string | null {
    try {
        const s = almacen(a);
        const mapa = s ? JSON.parse(s.getItem(CLAVE_TRADUCCION) ?? "null") as Record<string, { idioma?: unknown }> | null : null;
        return aIdiomaElegible(mapa?.[PERFIL_CUENTA]?.idioma);
    } catch { return null; }
}

/** El idioma que rige hoy: la elección de esta neurona › el valor de la cuenta › español. Nunca el del aparato. */
export function idiomaEfectivo(a?: AlmacenIdioma | null): EleccionIdioma {
    return leerEleccionNeurona(a) ?? (() => { const c = leerDefectoCuenta(a); return c ? { codigo: c, origen: "cuenta" as const } : { codigo: IDIOMA_FUENTE, origen: "cuenta" as const }; })();
}

/** Guarda la elección en esta neurona y como valor por defecto de la cuenta; avisa a la capa. */
export function elegirIdioma(codigo: string, a?: AlmacenIdioma | null): boolean {
    const c = aIdiomaElegible(codigo);
    const s = almacen(a);
    if (!c || !s) return false;
    try {
        s.setItem(CLAVE_IDIOMA_NEURONA, JSON.stringify({ codigo: c, elegidoEn: new Date().toISOString() }));
        guardarPrefs(PERFIL_CUENTA, { ...leerPrefs(PERFIL_CUENTA, c, s), idioma: c }, s);
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENTO_IDIOMA, { detail: { codigo: c } }));
        return true;
    } catch { return false; }
}
