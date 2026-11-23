/**
 * CTL1118M · la pantalla por la malla cuando no hay WebRTC. Módulo PURO (sin red, sin DOM).
 *
 * Quien manda pide los cuadros con la orden `pantalla-cuadro` (nivel «ver», dentro de la sesión verificada, firmada y sellada como las demás):
 * un cuadro (JPEG) en vuelo como mucho; viaja en partes de `PARTE_CUADRO_MAX` bytes (en base64) porque la orden firmada no pasa de 4 KB
 * pero la respuesta sí admite más. Tamaño y calidad siguen a lo que el enlace de verdad da (`ritmo-pantalla`, con umbrales de malla).
 */

import type { Args } from "./niveles";
import { type NivelCuadro, NIVELES_CUADRO } from "./ritmo-pantalla";

export const PARTE_CUADRO_MAX = 9000; // bytes binarios por parte (12 000 caracteres base64)
export const PARTE_CUADRO_DIRECTO = 48_000; // bytes binarios por parte en enlace directo LAN (64 KB base64)
export const MAX_PARTES_CUADRO = 40;
export const MAX_CUADRO_BYTES = PARTE_CUADRO_MAX * MAX_PARTES_CUADRO;
export const RE_B64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Umbrales del ritmo por la malla: se apunta a 4-10 cuadros/s, no a los 15-30 de WebRTC. */
export const UMBRALES_MALLA = { alto: 250, bajo: 100 } as const;
/** En enlace directo LAN (Wi-Fi/cable): más tolerante para conservar resolución y calidad en cuadros multiparte. */
export const UMBRALES_MALLA_DIRECTO = { alto: 500, bajo: 180 } as const;
/** Por un relevo, TURN o servidor: nivel mínimo y como mucho 2 cuadros/s (el dato de otra neurona no se gasta de más). */
export const PAUSA_CAPA_MS = 500;

export interface ParteCuadro {
    num: number;
    i: number;
    n: number;
    total: number;
    datos: string;
}

export function aBase64(b: Uint8Array): string {
    let s = "";
    for (let i = 0; i < b.length; i += 0x2000) s += String.fromCharCode(...b.subarray(i, i + 0x2000));
    return btoa(s);
}

export function deBase64(t: string): Uint8Array | null {
    if (!RE_B64.test(t) || t.length % 4 !== 0) return null;
    try {
        const s = atob(t);
        const o = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
        return o;
    } catch {
        return null;
    }
}

/** Parte un JPEG; lanza «demasiado-grande» si pasa del tope. */
export function partirCuadro(jpeg: Uint8Array, num: number, maxParte = PARTE_CUADRO_MAX): ParteCuadro[] {
    if (jpeg.length === 0 || jpeg.length > MAX_CUADRO_BYTES) throw new Error("demasiado-grande");
    const tam = Math.max(1000, Math.min(64_000, Math.floor(maxParte)));
    const n = Math.ceil(jpeg.length / tam);
    return Array.from({ length: n }, (_, i) => ({ num, i, n, total: jpeg.length, datos: aBase64(jpeg.subarray(i * tam, (i + 1) * tam)) }));
}

/** Valida una parte recibida (lo que contesta el aparato). null si no vale. */
export function leerParteCuadro(x: unknown, maxParte = PARTE_CUADRO_MAX): ParteCuadro | null {
    if (!x || typeof x !== "object") return null;
    const a = x as Record<string, unknown>;
    const tam = Math.max(1000, Math.min(64_000, Math.floor(maxParte)));
    const maxPartes = Math.max(MAX_PARTES_CUADRO, Math.ceil(MAX_CUADRO_BYTES / tam));
    const ent = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
    if (!ent(a.num, 0, 0xffffffff) || !ent(a.n, 1, maxPartes) || !ent(a.i, 0, maxPartes - 1) || a.i >= a.n || !ent(a.total, 1, MAX_CUADRO_BYTES)) return null;
    if (typeof a.datos !== "string" || a.datos.length === 0) return null;
    if (a.total > a.n * tam || a.total <= (a.n - 1) * tam) return null;
    const esperado = a.i < a.n - 1 ? tam : a.total - (a.n - 1) * tam;
    const b = deBase64(a.datos);
    if (!b || b.length !== esperado) return null;
    return { num: a.num, i: a.i, n: a.n, total: a.total, datos: a.datos };
}

/** Junta las partes de UN cuadro. `meter` devuelve el JPEG al completarse; lanza con un motivo corto si algo no casa. */
export class ReensambladorCuadro {
    private num = -1;
    private n = 0;
    private total = 0;
    private partes: (Uint8Array | undefined)[] = [];

    meter(p: ParteCuadro): Uint8Array | null {
        if (this.num !== p.num) {
            this.num = p.num;
            this.n = p.n;
            this.total = p.total;
            this.partes = Array.from({ length: p.n }, () => undefined);
        }
        if (p.n !== this.n || p.total !== this.total) throw new Error("cuadro-incoherente");
        const b = deBase64(p.datos);
        if (!b) throw new Error("cuadro-invalido");
        this.partes[p.i] = b;
        if (this.partes.some((x) => !x)) return null;
        const out = new Uint8Array(this.total);
        let k = 0;
        for (const x of this.partes) {
            out.set(x as Uint8Array, k);
            k += (x as Uint8Array).length;
        }
        if (k !== this.total) throw new Error("cuadro-incoherente");
        this.num = -1;
        this.partes = [];
        return out;
    }
}

/** Argumentos de `pantalla-cuadro`: `desde` (último número visto), `pide` (parte), `num` (obligatorio desde la parte 1), `nivel` (0..3, solo parte 0) y `maxParte` (opcional, solo parte 0). */
export function validarPideCuadro(a: Args): Args | null {
    const claves = Object.keys(a);
    if (!claves.every((k) => ["desde", "pide", "num", "nivel", "maxParte"].includes(k))) return null;
    const ent = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
    if (!ent(a.desde, 0, 0xffffffff) || !ent(a.pide, 0, MAX_PARTES_CUADRO - 1)) return null;
    const r: Args = { desde: a.desde, pide: a.pide };
    if (a.pide > 0) {
        if (!ent(a.num, 0, 0xffffffff)) return null;
        r.num = a.num;
    } else if (a.num !== undefined) return null;
    if (a.nivel !== undefined) {
        if (a.pide !== 0 || !ent(a.nivel, 0, NIVELES_CUADRO.length - 1)) return null;
        r.nivel = a.nivel;
    }
    if (a.maxParte !== undefined) {
        if (a.pide !== 0 || !ent(a.maxParte, 1000, 64_000)) return null;
        r.maxParte = a.maxParte;
    }
    return r;
}

export function nivelDe(n: unknown): NivelCuadro {
    const i = typeof n === "number" && Number.isInteger(n) && n >= 0 && n < NIVELES_CUADRO.length ? n : 0;
    return NIVELES_CUADRO[i];
}

/** Espera antes de preguntar otra vez cuando no hay cuadro nuevo (crece hasta 200 ms, no ocupa de más). */
export function esperaSinCuadro(vacios: number): number {
    return Math.min(200, 20 + vacios * 20);
}

/** Por un camino que no es directo (relevo por otra neurona, TURN, servidor) se va al nivel mínimo y con pausa. */
export function planPorCamino(camino: "directo" | "capa" | "sin-determinar", nivelPedido: number): { nivel: number; pausaMs: number } {
    if (camino === "capa") return { nivel: NIVELES_CUADRO.length - 1, pausaMs: PAUSA_CAPA_MS };
    return { nivel: nivelPedido, pausaMs: 0 };
}

/** `control-fuente ... via=webrtc|malla enlace=<medio> cuadros-s=N` */
export function lineaVia(p: { via: "webrtc" | "malla"; enlace: string | null; cuadrosS: number | null; causa?: string; kbps?: number | null; nivel?: number }): string {
    const n = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "sin-medir" : String(Math.round(v * 10) / 10));
    const enlace = p.enlace && /^[a-z0-9:-]{1,32}$/.test(p.enlace) ? p.enlace : "sin-determinar";
    return `control-fuente paso=via via=${p.via} enlace=${enlace} cuadros-s=${n(p.cuadrosS)}${p.causa ? ` causa=${/^[a-z0-9-]{1,40}$/.test(p.causa) ? p.causa : "otra"}` : ""}${p.kbps !== undefined ? ` kbps=${n(p.kbps)}` : ""}${p.nivel !== undefined ? ` nivel=${p.nivel}` : ""}`;
}

/** Texto de la ventana: la vía real y los cuadros/s medidos (nada de promesas). */
export function rotuloVia(via: "webrtc" | "malla", enlace: string | null, fps: number | undefined): string {
    const por = enlace ? ` · ${enlace}` : "";
    const f = fps === undefined ? "" : ` · ${String(Math.round(fps * 10) / 10).replace(".", ",")} cuadros/s`;
    return via === "malla" ? `Pantalla por la malla${por}${f}` : `Pantalla por WebRTC${por}${f}`;
}

/** ¿Hay que pasar la pantalla a la malla? Puro: sin WebRTC, oferta fallida o ICE que no llega. */
export function causaParaMalla(o: { hayWebRtc: boolean; fallo?: string | null; estado?: string; msConectando?: number; conexion?: string }): string | null {
    if (!o.hayWebRtc) return "sin-webrtc";
    if (o.fallo && /^senal-(oferta|respuesta)-/.test(o.fallo)) return "sin-oferta";
    if (o.conexion === "failed") return "ice-fallido";
    if (o.estado === "conectando" && (o.msConectando ?? 0) >= ESPERA_ICE_MS) return "ice-sin-conexion";
    return null;
}
export const ESPERA_ICE_MS = 12_000;
