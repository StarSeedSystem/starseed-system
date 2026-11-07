/**
 * Transmisión de datos en tiempo real con una neurona (NEU1107A · 2026-11-07) — protocolo PURO.
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Un canal de flujo GENÉRICO para cualquier formato (texto en vivo, lecturas de sensores en JSON,
 * un archivo que se emite mientras se lee…), con un modelo simple: ABRIR, ENVIAR TROZOS, CERRAR.
 * Viaja por la misma vía que decide `planParaDatos` (enlace sin internet, malla de la cuenta,
 * vínculo entre cuentas o el canal de la cuenta en el servidor) dentro de sobres del transporte
 * universal (canal «neurona-flujo»), sin esperar acuse por cada trozo: es tiempo real.
 *
 *   fd.abrir  { id, nombre, formato, mime?, de, para, at }
 *   fd.trozo  { id, n, d }                 n = nº de orden (0, 1, 2…); d = texto, JSON o base64
 *   fd.cerrar { id, total, motivo? }       total = trozos enviados
 *
 * Formatos: «texto» (cada trozo es el texto ENTERO actual: el receptor ve el último), «json» (cada
 * trozo es un registro; se guardan los últimos), «binario» (trozos base64 que se juntan para
 * guardarlos al cerrar). Los huecos de numeración se cuentan como «perdidos» (nunca se inventan).
 * Módulo PURO (sin red, sin DOM): lo usan el motor (`flujos-neurona.ts`), la interfaz y las pruebas.
 */

export type FormatoFlujo = "texto" | "json" | "binario";

export const CANAL_FLUJO = "neurona-flujo";
/** Caracteres por trozo (con margen bajo el ~16 KB de un mensaje SCTP o de tiempo real). */
export const MAX_TROZO_FLUJO = 12_000;
/** Lo que se guarda en memoria de un flujo binario recibido (base64) antes de dejar de juntar. */
export const MAX_BINARIO_FLUJO = 64 * 1024 * 1024;
/** Registros JSON que se guardan para enseñar (los últimos). */
export const MAX_REGISTROS_FLUJO = 30;
/** Sin trozos durante este tiempo, el receptor lo dice («sin noticias»). */
export const SILENCIO_FLUJO_MS = 30_000;

export interface PartesFlujo {
    n?: string;
    nom?: string;
    u?: string;
}

export interface MsgFlujoAbrir {
    t: "fd.abrir";
    id: string;
    nombre: string;
    formato: FormatoFlujo;
    mime?: string;
    de: PartesFlujo;
    para: { n?: string; u?: string };
    at: number;
}

export interface MsgFlujoTrozo {
    t: "fd.trozo";
    id: string;
    n: number;
    d: string;
}

export interface MsgFlujoCerrar {
    t: "fd.cerrar";
    id: string;
    total: number;
    motivo?: string;
}

/** Acuse del receptor (cada pocos trozos): cuántos le llegaron y cuántos perdió. */
export interface MsgFlujoAcuse {
    t: "fd.acuse";
    id: string;
    /** Trozos recibidos hasta ahora. */
    recibidos: number;
    perdidos: number;
}

export type MsgFlujo = MsgFlujoAbrir | MsgFlujoTrozo | MsgFlujoCerrar | MsgFlujoAcuse;

/** Cada cuántos trozos (o milisegundos) acusa el receptor. */
export const ACUSE_CADA_TROZOS = 10;
export const ACUSE_CADA_MS = 2000;

/** ¿Toca mandar acuse? (cada `ACUSE_CADA_TROZOS` trozos o `ACUSE_CADA_MS`, y siempre al cerrar). Pura. */
export function tocaAcuse(e: Pick<EstadoFlujo, "trozos" | "abierto">, ultimo: { trozos: number; en: number }, ahora: number): boolean {
    if (e.trozos === ultimo.trozos) return false;
    return !e.abierto || e.trozos - ultimo.trozos >= ACUSE_CADA_TROZOS || ahora - ultimo.en >= ACUSE_CADA_MS;
}

function corto(v: unknown, max: number): string | undefined {
    return typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined;
}

/** Valida lo que llega de otro aparato. Null si no es de este protocolo o está mal formado. */
export function leerMensajeFlujo(x: unknown): MsgFlujo | null {
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    const id = corto(o.id, 80);
    if (!id) return null;
    if (o.t === "fd.abrir") {
        const formato = o.formato === "texto" || o.formato === "json" || o.formato === "binario" ? o.formato : null;
        if (!formato) return null;
        const de = (o.de && typeof o.de === "object" ? o.de : {}) as Record<string, unknown>;
        const para = (o.para && typeof o.para === "object" ? o.para : {}) as Record<string, unknown>;
        // eslint-disable-next-line no-control-regex
        const nombre = (corto(o.nombre, 80) ?? "Transmisión").replace(/[\u0000-\u001f\u007f]/g, "") || "Transmisión";
        return {
            t: "fd.abrir",
            id,
            nombre,
            formato,
            ...(corto(o.mime, 120) ? { mime: (o.mime as string).toLowerCase() } : {}),
            de: { n: corto(de.n, 80), nom: corto(de.nom, 60), u: corto(de.u, 80) },
            para: { n: corto(para.n, 80), u: corto(para.u, 80) },
            at: typeof o.at === "number" && Number.isFinite(o.at) ? o.at : 0,
        };
    }
    if (o.t === "fd.trozo") {
        const n = typeof o.n === "number" && Number.isInteger(o.n) && o.n >= 0 ? o.n : null;
        if (n === null || typeof o.d !== "string" || o.d.length > MAX_TROZO_FLUJO * 2) return null;
        return { t: "fd.trozo", id, n, d: o.d };
    }
    if (o.t === "fd.cerrar") {
        const total = typeof o.total === "number" && Number.isInteger(o.total) && o.total >= 0 ? o.total : 0;
        const motivo = corto(o.motivo, 200);
        return { t: "fd.cerrar", id, total, ...(motivo ? { motivo } : {}) };
    }
    if (o.t === "fd.acuse") {
        const entero = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
        const recibidos = entero(o.recibidos);
        const perdidos = entero(o.perdidos) ?? 0;
        if (recibidos === null) return null;
        return { t: "fd.acuse", id, recibidos, perdidos };
    }
    return null;
}

/** El emisor apunta el acuse del receptor (nunca baja: los acuses pueden llegar desordenados). Pura. */
export function aplicarAcuse(e: EstadoFlujo, msg: MsgFlujoAcuse, ahora: number): EstadoFlujo {
    if (msg.id !== e.id || e.dir !== "sale") return e;
    const recibidosOtro = Math.max(e.recibidosOtro ?? 0, msg.recibidos);
    if (recibidosOtro === e.recibidosOtro && msg.perdidos === e.perdidosOtro) return e;
    return { ...e, recibidosOtro, perdidosOtro: msg.perdidos, acuseEn: ahora };
}

/* ══════════════════════════ Estado de un flujo (reductor puro) ══════════════════════════ */

export interface EstadoFlujo {
    id: string;
    clave: string;
    dir: "sale" | "entra";
    nombre: string;
    formato: FormatoFlujo;
    mime?: string;
    deNombre?: string;
    abierto: boolean;
    desde: number;
    actualizado: number;
    trozos: number;
    /** Caracteres (texto/JSON) o bytes (binario) recibidos o enviados. */
    bytes: number;
    /** Huecos en la numeración (trozos que no llegaron). */
    perdidos: number;
    /** Siguiente nº de orden esperado. */
    siguiente: number;
    /** «texto»: el texto actual. */
    texto?: string;
    /** «json»: los últimos registros (el más nuevo al final). */
    registros?: unknown[];
    /** «binario»: trozos base64 en orden de llegada (hasta `MAX_BINARIO_FLUJO`). */
    partes?: string[];
    /** «binario»: se dejó de juntar por tamaño. */
    recortado?: boolean;
    totalAnunciado?: number;
    motivoCierre?: string;
    /** Solo «sale»: trozos que el otro aparato dice haber recibido (su acuse). */
    recibidosOtro?: number;
    perdidosOtro?: number;
    acuseEn?: number;
}

/** Envía un trozo en el emisor (cuenta lo que sale; el texto actual se queda para enseñarlo). Pura. */
export function apuntarEnvio(e: EstadoFlujo, d: string, ahora: number): EstadoFlujo {
    if (!e.abierto || e.dir !== "sale") return e;
    return {
        ...e,
        trozos: e.trozos + 1,
        siguiente: e.siguiente + 1,
        bytes: e.bytes + d.length,
        actualizado: ahora,
        ...(e.formato === "texto" ? { texto: d } : {}),
        ...(e.formato === "json" ? { registros: [...(e.registros ?? []), d].slice(-MAX_REGISTROS_FLUJO) } : {}),
    };
}

export function nuevoEstadoFlujo(
    msg: Pick<MsgFlujoAbrir, "id" | "nombre" | "formato" | "mime"> & { deNombre?: string },
    clave: string,
    dir: "sale" | "entra",
    ahora: number,
): EstadoFlujo {
    return {
        id: msg.id,
        clave,
        dir,
        nombre: msg.nombre,
        formato: msg.formato,
        ...(msg.mime ? { mime: msg.mime } : {}),
        ...(msg.deNombre ? { deNombre: msg.deNombre } : {}),
        abierto: true,
        desde: ahora,
        actualizado: ahora,
        trozos: 0,
        bytes: 0,
        perdidos: 0,
        siguiente: 0,
        ...(msg.formato === "texto" ? { texto: "" } : msg.formato === "json" ? { registros: [] } : { partes: [] }),
    };
}

function bytesDeBase64(b64: string): number {
    const sinRelleno = b64.replace(/=+$/, "");
    return Math.floor((sinRelleno.length * 3) / 4);
}

/** Aplica un trozo. Duplicados y trozos atrasados no cuentan dos veces. Pura. */
export function aplicarTrozo(e: EstadoFlujo, msg: MsgFlujoTrozo, ahora: number): EstadoFlujo {
    if (!e.abierto || msg.id !== e.id) return e;
    if (msg.n < e.siguiente) {
        // Atrasado: si era un hueco contado como perdido, ya llegó (deja de serlo); el texto no retrocede.
        return e.perdidos > 0 ? { ...e, perdidos: e.perdidos - 1, actualizado: ahora } : e;
    }
    const perdidos = e.perdidos + (msg.n - e.siguiente);
    const base: EstadoFlujo = { ...e, trozos: e.trozos + 1, siguiente: msg.n + 1, perdidos, actualizado: ahora };
    if (e.formato === "texto") return { ...base, texto: msg.d, bytes: e.bytes + msg.d.length };
    if (e.formato === "json") {
        let registro: unknown = msg.d;
        try {
            registro = JSON.parse(msg.d);
        } catch {
            /* no es JSON: se guarda el texto tal cual */
        }
        const registros = [...(e.registros ?? []), registro];
        return { ...base, registros: registros.slice(-MAX_REGISTROS_FLUJO), bytes: e.bytes + msg.d.length };
    }
    const n = bytesDeBase64(msg.d);
    if (e.recortado || e.bytes + n > MAX_BINARIO_FLUJO) return { ...base, recortado: true, bytes: e.bytes + n };
    return { ...base, partes: [...(e.partes ?? []), msg.d], bytes: e.bytes + n };
}

/** Cierra el flujo (por el otro lado o por aquí). Cuenta como perdidos los trozos anunciados que faltan. */
export function cerrarEstadoFlujo(e: EstadoFlujo, ahora: number, total?: number, motivo?: string): EstadoFlujo {
    if (!e.abierto) return e;
    const faltan = typeof total === "number" && total > e.siguiente ? total - e.siguiente : 0;
    return {
        ...e,
        abierto: false,
        actualizado: ahora,
        perdidos: e.perdidos + faltan,
        ...(typeof total === "number" ? { totalAnunciado: total } : {}),
        ...(motivo ? { motivoCierre: motivo } : {}),
    };
}

/** ¿Lleva demasiado sin noticias? (para decirlo; no se cierra solo). */
export function flujoEnSilencio(e: EstadoFlujo, ahora: number, umbral = SILENCIO_FLUJO_MS): boolean {
    return e.abierto && ahora - e.actualizado > umbral;
}

/* ══════════════════════════ Trocear (puro) ══════════════════════════ */

/** Parte un texto en trozos de como mucho `max` caracteres (sin romper pares sustitutos). */
export function trocearTexto(texto: string, max = MAX_TROZO_FLUJO): string[] {
    if (texto.length <= max) return [texto];
    const out: string[] = [];
    let i = 0;
    while (i < texto.length) {
        let fin = Math.min(texto.length, i + max);
        const c = texto.charCodeAt(fin - 1);
        if (fin < texto.length && c >= 0xd800 && c <= 0xdbff) fin -= 1;
        out.push(texto.slice(i, fin));
        i = fin;
    }
    return out;
}

/** Bytes → base64 en trozos que caben en un mensaje (cada trozo decodifica por separado). */
export function trocearBinario(datos: Uint8Array, maxCaracteres = MAX_TROZO_FLUJO): string[] {
    // 3 bytes → 4 caracteres: múltiplo de 3 para que cada trozo no lleve relleno intermedio.
    const porTrozo = Math.max(3, Math.floor(maxCaracteres / 4) * 3);
    const out: string[] = [];
    for (let i = 0; i < datos.length; i += porTrozo) out.push(aBase64(datos.subarray(i, Math.min(datos.length, i + porTrozo))));
    return out;
}

export function aBase64(datos: Uint8Array): string {
    let bin = "";
    const paso = 0x8000;
    for (let i = 0; i < datos.length; i += paso) bin += String.fromCharCode(...Array.from(datos.subarray(i, i + paso)));
    return btoa(bin);
}

export function deBase64(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
}

/** Junta las partes base64 de un flujo binario recibido (cada parte se decodifica por separado). */
export function juntarBinario(partes: string[]): Uint8Array<ArrayBuffer> {
    const trozos = partes.map(deBase64);
    const total = trozos.reduce((s, t) => s + t.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const t of trozos) {
        out.set(t, o);
        o += t.length;
    }
    return out;
}

/** «12 trozos · 3 KB · 1 perdido». */
export function resumenFlujo(e: EstadoFlujo): string {
    const partes = [`${e.trozos} ${e.trozos === 1 ? "trozo" : "trozos"}`];
    const b = e.bytes;
    partes.push(b < 1024 ? `${b} ${e.formato === "binario" ? "B" : "car."}` : `${Math.round(b / 1024)} KB`);
    if (e.perdidos > 0) partes.push(`${e.perdidos} ${e.perdidos === 1 ? "perdido" : "perdidos"}`);
    if (e.recortado) partes.push("demasiado grande para guardarlo entero");
    return partes.join(" · ");
}
