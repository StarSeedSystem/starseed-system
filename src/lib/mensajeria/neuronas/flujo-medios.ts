/**
 * Audio y vídeo en vivo por CANAL DE DATOS (GRP1107A · 2026-11-07) — PURO.
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Cierra el pendiente «Flujos de audio/vídeo genéricos por canal de datos» de
 * `architecture/datos-por-la-malla.md` §5. Cuando con ese aparato no hay WebRTC de MEDIOS (la malla
 * de la cuenta y los vínculos entre cuentas son canales de datos; o el navegador no deja poner
 * pistas), el audio o el vídeo viaja por `abrirCanalDatos` como el formato «medios» del flujo
 * genérico (`flujo-datos.ts`):
 *
 *  · SEGMENTOS independientes de ~2 s (cada uno es un webm completo, con su cabecera), troceados
 *    en `fd.trozo` como `m1|<seg>|<parte>|<total>|<base64>`; un segmento que no llega entero se
 *    descarta entero (nunca se reproduce a medias) y se cuenta como perdido;
 *  · el RITMO se ajusta al tope MEDIDO: lo que el receptor confirma (sus acuses) frente a lo que se
 *    envía; si confirma menos del 75 %, eso es el tope y se usa como mucho su 80 %; sin saturar, se
 *    sube un escalón con cautela; sin medida, se empieza prudente y se dice «sin medir»;
 *  · si la cola del enlace crece, se baja un escalón; si no cabe un segmento, se descarta (es en
 *    vivo: mejor saltar que llegar tarde).
 * Módulo PURO: sin red, sin DOM, sin `node:*`.
 */

import { aBase64, MAX_TROZO_FLUJO } from "./flujo-datos";

export type TipoMedios = "audio" | "video";

/** Duración de cada segmento (ms): retraso mínimo de lo que se ve u oye al otro lado. */
export const SEGMENTO_MS = 2000;
/** Fracción del tope medido que se usa (el resto, margen para acuses y otros datos). */
export const TECHO_USO = 0.8;
export const ESCALONES_KBPS: Record<TipoMedios, number[]> = {
    video: [150, 300, 500, 800, 1200],
    audio: [16, 32, 64],
};
/** Sin medida todavía: prudente. */
export const KBPS_INICIO: Record<TipoMedios, number> = { video: 300, audio: 32 };
/** Lo que puede haber en la cola del enlace antes de descartar un segmento. */
export const MAX_EN_COLA_BYTES = 1_000_000;
/** Un segmento más grande que esto no se manda (algo va mal en la grabación). */
export const MAX_SEGMENTO_BYTES = 4_000_000;
/** Medidas de capacidad: la ventana y lo mínimo para fiarse. */
export const VENTANA_MEDIDA_MS = 6000;
const MIN_TRAMO_MEDIDA_MS = 1000;
/** Subidas seguidas con margen antes de subir un escalón (bajar es inmediato). */
export const SUBIDAS_PARA_SUBIR = 2;
const PREFIJO = "m1|";

/* ══════════════════════════ Trozos de un segmento ══════════════════════════ */

/** Parte un segmento en trozos `m1|seg|parte|total|base64` que caben en un `fd.trozo`. Pura. */
export function armarTrozosSegmento(seg: number, datos: Uint8Array, max = MAX_TROZO_FLUJO): string[] {
    const cabecera = 40; // «m1|123456|1234|1234|» de sobra
    const porTrozo = Math.max(3, Math.floor((max - cabecera) / 4) * 3);
    const total = Math.max(1, Math.ceil(datos.length / porTrozo));
    const out: string[] = [];
    for (let i = 0; i < total; i += 1) {
        const b64 = aBase64(datos.subarray(i * porTrozo, Math.min(datos.length, (i + 1) * porTrozo)));
        out.push(`${PREFIJO}${seg}|${i}|${total}|${b64}`);
    }
    return out;
}

export interface TrozoMedios {
    seg: number;
    parte: number;
    total: number;
    b64: string;
}

/** Lee un trozo de medios (lo que llega del otro aparato). Null si no lo es o está mal. Pura. */
export function leerTrozoMedios(d: string): TrozoMedios | null {
    if (typeof d !== "string" || !d.startsWith(PREFIJO)) return null;
    const partes = d.split("|");
    if (partes.length !== 5) return null;
    const [, s, p, t, b64] = partes;
    const ent = (x: string) => (/^\d{1,7}$/.test(x) ? Number(x) : null);
    const seg = ent(s);
    const parte = ent(p);
    const total = ent(t);
    if (seg === null || parte === null || total === null || total < 1 || total > 2000 || parte >= total) return null;
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return null;
    return { seg, parte, total, b64 };
}

/* ══════════════════════════ Reensamblar (receptor) ══════════════════════════ */

export interface EstadoSegmentos {
    /** Segmentos a medias: nº → partes recibidas. */
    pendientes: Record<number, { total: number; partes: Record<number, string>; recibidas: number }>;
    /** Siguiente segmento que se entrega. */
    siguiente: number;
    entregados: number;
    perdidos: number;
}

export const SEGMENTOS_VACIO: EstadoSegmentos = { pendientes: {}, siguiente: 0, entregados: 0, perdidos: 0 };

/**
 * Apunta un trozo y devuelve los segmentos COMPLETOS que ya se pueden reproducir, en orden. El
 * canal llega en orden: si se completa un segmento posterior, los anteriores a medias ya no
 * llegarán (se descartan enteros y se cuentan como perdidos). Pura.
 */
export function aplicarTrozoMedios(e: EstadoSegmentos, t: TrozoMedios): { estado: EstadoSegmentos; listos: Array<{ seg: number; partes: string[] }> } {
    if (t.seg < e.siguiente) return { estado: e, listos: [] };
    const previo = e.pendientes[t.seg];
    if (previo && (previo.total !== t.total || previo.partes[t.parte] !== undefined)) return { estado: e, listos: [] };
    const entrada = previo ?? { total: t.total, partes: {}, recibidas: 0 };
    const nueva = { total: entrada.total, partes: { ...entrada.partes, [t.parte]: t.b64 }, recibidas: entrada.recibidas + 1 };
    const pendientes = { ...e.pendientes, [t.seg]: nueva };
    if (nueva.recibidas < nueva.total) return { estado: { ...e, pendientes }, listos: [] };
    // Completo: los anteriores a medias se pierden; este se entrega.
    let perdidos = e.perdidos;
    const restantes: EstadoSegmentos["pendientes"] = {};
    for (const [k, v] of Object.entries(pendientes)) {
        const n = Number(k);
        if (n > t.seg) restantes[n] = v;
    }
    perdidos += t.seg - e.siguiente;
    const partes = Array.from({ length: nueva.total }, (_, i) => nueva.partes[i]);
    return {
        estado: { pendientes: restantes, siguiente: t.seg + 1, entregados: e.entregados + 1, perdidos },
        listos: [{ seg: t.seg, partes }],
    };
}

/* ══════════════════════════ Medir y ajustar el ritmo (emisor) ══════════════════════════ */

/** Bytes que el receptor confirmó: la suma de los primeros `recibidos` trozos enviados. Pura. */
export function bytesConfirmados(tamanos: number[], recibidos: number): number {
    let s = 0;
    for (let i = 0; i < Math.min(recibidos, tamanos.length); i += 1) s += tamanos[i];
    return s;
}

/** Lo que pesa en el enlace lo grabado (base64 dentro de JSON: 4 caracteres por cada 3 bytes). */
export const SOBRECARGA_ENLACE = 4 / 3;
/** Si el otro confirma menos de esta fracción de lo enviado, el enlace está saturado. */
export const UMBRAL_SATURADO = 0.75;

export interface MuestraAcuse {
    en: number;
    /** Bytes enviados acumulados en ese instante. */
    enviados: number;
    /** Bytes que el otro confirmó (sus acuses), acumulados. */
    confirmados: number;
}

export interface MedidaEnlace {
    enviadoKbps: number;
    confirmadoKbps: number;
}

/** Lo enviado y lo confirmado (kbps del enlace) en la ventana reciente; null sin base para fiarse. Pura. */
export function medirEnlace(muestras: MuestraAcuse[], ahora: number, ventanaMs = VENTANA_MEDIDA_MS): MedidaEnlace | null {
    const recientes = muestras.filter((m) => ahora - m.en <= ventanaMs).sort((a, b) => a.en - b.en);
    if (recientes.length < 2) return null;
    const a = recientes[0];
    const b = recientes[recientes.length - 1];
    const dt = b.en - a.en;
    if (dt < MIN_TRAMO_MEDIDA_MS || b.enviados < a.enviados || b.confirmados < a.confirmados) return null;
    return { enviadoKbps: Math.round(((b.enviados - a.enviados) * 8) / dt), confirmadoKbps: Math.round(((b.confirmados - a.confirmados) * 8) / dt) };
}

export interface EstadoRitmo {
    tipo: TipoMedios;
    /** Ritmo de grabación del siguiente segmento (kbps). */
    kbps: number;
    /** Tope MEDIDO del enlace (kbps en el enlace): lo que confirmó el otro cuando se saturó. */
    topeKbps: number | null;
    /** Lo que el enlace llevó sin saturarse (cota inferior, kbps en el enlace). */
    llevaKbps: number | null;
    subidas: number;
    motivo: string;
}

export function ritmoInicial(tipo: TipoMedios): EstadoRitmo {
    return { tipo, kbps: KBPS_INICIO[tipo], topeKbps: null, llevaKbps: null, subidas: 0, motivo: "empieza prudente: aún sin medir" };
}

function escalonBajo(tipo: TipoMedios, techo: number): number {
    const esc = ESCALONES_KBPS[tipo];
    let mejor = esc[0];
    for (const k of esc) if (k <= techo) mejor = k;
    return mejor;
}

/**
 * Siguiente ritmo con lo medido. Saturado (el otro confirma < 75 % de lo enviado): ese es el tope
 * medido y se baja a lo que cabe en su 80 %. Sin saturar: se sube un escalón tras
 * `SUBIDAS_PARA_SUBIR` medidas seguidas, sin pasar del 80 % de un tope ya medido (que se olvida si
 * pasa el doble de medidas sin saturar: la red pudo mejorar). Si la cola crece, un escalón menos.
 * Determinista. Pura.
 */
export function ajustarRitmo(r: EstadoRitmo, medida: MedidaEnlace | null, enColaBytes: number | null): EstadoRitmo {
    const esc = ESCALONES_KBPS[r.tipo];
    const i = Math.max(0, esc.indexOf(r.kbps));
    if (enColaBytes !== null && enColaBytes > MAX_EN_COLA_BYTES / 2) {
        return { ...r, kbps: esc[Math.max(0, i - 1)], subidas: 0, motivo: "la cola del enlace crece: un escalón menos" };
    }
    if (!medida || medida.enviadoKbps <= 0) return { ...r, subidas: 0, motivo: r.topeKbps === null && r.llevaKbps === null ? "sin medir todavía" : r.motivo };
    if (medida.confirmadoKbps < medida.enviadoKbps * UMBRAL_SATURADO) {
        const tope = medida.confirmadoKbps;
        const k = escalonBajo(r.tipo, (tope / SOBRECARGA_ENLACE) * TECHO_USO);
        return { ...r, kbps: k, topeKbps: tope, subidas: 0, motivo: `saturado: el otro confirmó ${tope} de ${medida.enviadoKbps} kbps; bajo al ${Math.round(TECHO_USO * 100)} % del tope` };
    }
    const lleva = Math.max(r.llevaKbps ?? 0, medida.confirmadoKbps);
    const subidas = r.subidas + 1;
    const olvidar = r.topeKbps !== null && subidas >= SUBIDAS_PARA_SUBIR * 2;
    const tope = olvidar ? null : r.topeKbps;
    const arriba = esc[i + 1];
    const cabe = arriba !== undefined && (tope === null || arriba <= (tope / SOBRECARGA_ENLACE) * TECHO_USO);
    if (cabe && subidas >= SUBIDAS_PARA_SUBIR) {
        return { ...r, kbps: arriba, topeKbps: tope, llevaKbps: lleva, subidas: 0, motivo: "sin saturar: un escalón más" };
    }
    return { ...r, topeKbps: tope, llevaKbps: lleva, subidas, motivo: arriba === undefined ? "en el ritmo más alto" : cabe ? "sin saturar; se confirma antes de subir" : "dentro del tope medido" };
}

/** ¿Se descarta este segmento? (en vivo: si no cabe en la cola, mejor saltarlo). Pura. */
export function debeDescartarSegmento(enColaBytes: number | null, bytesSegmento: number): { descartar: boolean; motivo?: string } {
    if (bytesSegmento <= 0) return { descartar: true, motivo: "segmento vacío" };
    if (bytesSegmento > MAX_SEGMENTO_BYTES) return { descartar: true, motivo: "segmento demasiado grande" };
    if (enColaBytes !== null && enColaBytes + bytesSegmento > MAX_EN_COLA_BYTES) return { descartar: true, motivo: "la cola del enlace está llena" };
    return { descartar: false };
}

/** Bits por segundo para MediaRecorder (vídeo: casi todo a la imagen; audio aparte). Pura. */
export function bitsGrabacion(r: Pick<EstadoRitmo, "tipo" | "kbps">): { audioBitsPerSecond: number; videoBitsPerSecond?: number } {
    if (r.tipo === "audio") return { audioBitsPerSecond: r.kbps * 1000 };
    const audio = r.kbps >= 300 ? 32 : 16;
    return { audioBitsPerSecond: audio * 1000, videoBitsPerSecond: Math.max(50, r.kbps - audio) * 1000 };
}

/** «≈ 300 kbps · tope medido 512 kbps» / «≈ 300 kbps · el enlace lleva ≥ 410 kbps» / «sin medir». Pura. */
export function textoRitmo(r: Pick<EstadoRitmo, "kbps" | "topeKbps" | "llevaKbps">): string {
    const medida = r.topeKbps !== null ? `tope medido ${r.topeKbps} kbps` : r.llevaKbps !== null ? `el enlace lleva ≥ ${r.llevaKbps} kbps (sin tope aún)` : "sin medir";
    return `≈ ${r.kbps} kbps · ${medida}`;
}

/** El primer formato de grabación que el navegador admite (o null). Pura (recibe la comprobación). */
export function elegirMime(tipo: TipoMedios, admite: (m: string) => boolean): string | null {
    const candidatos = tipo === "video" ? ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm", "video/mp4"] : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    for (const m of candidatos) {
        try {
            if (admite(m)) return m;
        } catch {
            /* sigue */
        }
    }
    return null;
}
