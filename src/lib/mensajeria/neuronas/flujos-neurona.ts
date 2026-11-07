"use client";

/**
 * Transmisiones de datos en vivo con una neurona (NEU1107A · 2026-11-07) — el motor.
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Protocolo y estado PUROS en `flujo-datos.ts` (abrir · trozos · cerrar · acuse del receptor).
 * Aquí: por dónde va (`planParaDatos`, clase «flujo», con los ajustes de medio del chat), el
 * envío sin esperar acuse por trozo (tiempo real) y la recepción global.
 *  · P2P: `abrirCanalDatos` del transporte universal (un enlace; relé y LoRa no llevan flujos);
 *  · servidor (solo tus neuronas): el canal de tu cuenta en tiempo real (evento «neurona-flujo»),
 *    que no guarda nada.
 * El anuncio es un mensaje URGENTE del chat (burbuja con su vía); lo vivo (texto actual,
 * registros, trozos binarios) vive en memoria de la pestaña: no se guarda en localStorage.
 */

import { useSyncExternalStore } from "react";
import { cambiarMensajeMalla, enviarANeurona, hayInternetYSesion, identidadesMalla, viaCuentaEntranteMalla } from "./buzon";
import { claveEntrante } from "./bandeja";
import type { ConversacionNeurona } from "./agrupar";
import { planParaDatos, viaDeEnlaces } from "./datos-neurona";
import {
    aplicarAcuse,
    aplicarTrozo,
    apuntarEnvio,
    CANAL_FLUJO,
    cerrarEstadoFlujo,
    leerMensajeFlujo,
    MAX_TROZO_FLUJO,
    nuevoEstadoFlujo,
    tocaAcuse,
    type EstadoFlujo,
    type FormatoFlujo,
    type MsgFlujo,
} from "./flujo-datos";
import { aplicarTrozoMedios, leerTrozoMedios, SEGMENTOS_VACIO, type EstadoSegmentos } from "./flujo-medios";
import { claveChat, preferenciasEfectivas } from "@/lib/mensajeria/medios/preferencias-store";
import type { ViaMensaje } from "@/lib/mensajeria/medios/tipos";

const EVENTO_CUENTA_FLUJO = "neurona-flujo";

/* ══════════════════════════ Estado en memoria ══════════════════════════ */

const flujos = new Map<string, EstadoFlujo>();
const oyentes = new Set<() => void>();

function poner(e: EstadoFlujo): void {
    flujos.set(e.id, e);
    for (const cb of Array.from(oyentes)) {
        try {
            cb();
        } catch {
            /* noop */
        }
    }
}

function suscribir(cb: () => void): () => void {
    oyentes.add(cb);
    return () => {
        oyentes.delete(cb);
    };
}

/** Estado vivo de una transmisión (null si esta pestaña no la vio: p. ej. tras recargar). */
export function useFlujoNeurona(id: string | undefined): EstadoFlujo | null {
    return useSyncExternalStore(
        suscribir,
        () => (id ? flujos.get(id) ?? null : null),
        () => null,
    );
}

/* ══════════════════════════ Salida ══════════════════════════ */

interface Salida {
    enviar(m: MsgFlujo): boolean;
    /** Bytes en la cola del enlace (si lo da). */
    enCola?(): number | null;
}

const salidas = new Map<string, Salida>();
const abiertos = new Map<string, FlujoAbierto>();

/** Cierra una transmisión que sale de esta pestaña (botón «Terminar» de su burbuja). */
export function cerrarFlujoNeurona(id: string, motivo?: string): void {
    abiertos.get(id)?.cerrar(motivo);
}

function nuevoId(): string {
    try {
        return crypto.randomUUID();
    } catch {
        return `fd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
}

export interface FlujoAbierto {
    id: string;
    /** Manda un trozo: texto (el texto ENTERO actual en «texto»), un registro JSON o base64. */
    enviar(d: string): boolean;
    cerrar(motivo?: string): void;
    /** (GRP1107A) Bytes en la cola del enlace (null si no se sabe), para frenar. */
    enCola(): number | null;
    /** (GRP1107A) Vía por la que sale («Mesh · …»). */
    via: string;
}

/** (GRP1107A) Estado vivo de una transmisión (fuera de React). */
export function leerFlujoNeurona(id: string): EstadoFlujo | null {
    return flujos.get(id) ?? null;
}

/**
 * Abre una transmisión en vivo hacia una neurona. Si ningún medio permitido puede llevarla ahora,
 * lo dice (un flujo no espera). Nunca lanza.
 */
export async function abrirFlujoNeurona(o: {
    conversacion: Pick<ConversacionNeurona, "clave" | "destino" | "propia">;
    nombre: string;
    formato: FormatoFlujo;
    mime?: string;
    /** (GRP1107A) Solo por la malla P2P (audio/vídeo por canal de datos: el canal de la cuenta no los lleva). */
    soloP2P?: boolean;
}): Promise<{ ok: true; flujo: FlujoAbierto } | { ok: false; motivo: string }> {
    const conv = o.conversacion;
    const destino = conv.destino;
    const propia = !destino.uid;
    try {
        const archivos = await import("./archivos-neurona");
        const [candidatos, red, yo] = await Promise.all([archivos.candidatosParaDatos(destino), hayInternetYSesion(), identidadesMalla()]);
        const plan = planParaDatos(preferenciasEfectivas(claveChat("neurona", conv.clave)), candidatos, {
            clase: "flujo",
            tipo: "neurona",
            servidor: {
                abierto: red.internet && !!red.uid,
                llega: propia,
                motivoNoLlega: "el canal de tu cuenta solo llega a tus propias neuronas",
                etiqueta: "Canal de tu cuenta (tiempo real)",
            },
        });
        if (plan.sinCamino || !plan.pasos.length) return { ok: false, motivo: plan.aviso ?? "Ningún medio permitido puede llevar una transmisión en vivo ahora." };
        const paso = o.soloP2P ? plan.pasos.find((x) => x.medio !== "servidor") : plan.pasos[0];
        if (!paso) return { ok: false, motivo: "El audio y el vídeo por canal de datos van solo por la malla P2P y no hay ningún enlace con esa neurona ahora (con internet, usa la llamada)." };
        let salida: Salida;
        let via: ViaMensaje | null;
        let viaTexto = "Canal de tu cuenta (tiempo real)";
        if (paso.medio === "servidor") {
            const rs = await import("@/lib/sync/realtime-sync");
            salida = {
                enviar: (m) => {
                    void rs.sendAccountBroadcast(EVENTO_CUENTA_FLUJO, m).catch(() => undefined);
                    return true;
                },
            };
            via = { ...viaCuentaEntranteMalla(), direccion: "sale", enlace: "Canal de tu cuenta", enlaceId: "servidor", motivo: "transmisión por el canal de tu cuenta en tiempo real (no se guarda)", descartados: plan.descartados };
        } else {
            const tu = await import("@/lib/malla/transporte-universal");
            const r = await tu.abrirCanalDatos({ ...destino, enlaceId: paso.enlaceId }, CANAL_FLUJO);
            if (!r.ok) return { ok: false, motivo: r.motivo };
            salida = { enviar: (m) => r.canal.enviar(m), enCola: () => r.canal.enCola() };
            viaTexto = `${r.canal.enlace.etiqueta}${r.canal.enlace.rttMs !== null ? ` · ${Math.max(1, Math.round(r.canal.enlace.rttMs))} ms` : ""}`;
            via = viaDeEnlaces([r.canal.enlace], { clase: "flujo", descartados: plan.descartados, en: Date.now() });
        }
        const id = nuevoId();
        const nombre = o.nombre.trim().slice(0, 80) || "Transmisión en vivo";
        // El anuncio (burbuja en los dos lados) y luego la apertura por el canal del flujo.
        const anuncio = await enviarANeurona({ clave: conv.clave, destino, texto: "", flujo: { id, nombre, formato: o.formato }, urgente: true });
        if (anuncio.estado === "fallido") return { ok: false, motivo: anuncio.aviso ?? "No se pudo avisar a la neurona." };
        if (via) cambiarMensajeMalla(anuncio.clave, anuncio.id, { via: { ...via, confirmado: anuncio.via?.confirmado ?? false, confirmadoPor: anuncio.via?.confirmado ? "destino" : null } });
        salidas.set(id, salida);
        poner(nuevoEstadoFlujo({ id, nombre, formato: o.formato, mime: o.mime }, conv.clave, "sale", Date.now()));
        salida.enviar({
            t: "fd.abrir",
            id,
            nombre,
            formato: o.formato,
            ...(o.mime ? { mime: o.mime } : {}),
            de: { n: yo.neurona || undefined, u: yo.uid ?? undefined },
            para: { n: destino.neuronDeviceId, u: destino.uid },
            at: Date.now(),
        });
        let n = 0;
        const flujo: FlujoAbierto = {
            id,
            via: viaTexto,
            enCola() {
                try {
                    return salida.enCola?.() ?? null;
                } catch {
                    return null;
                }
            },
            enviar(d: string) {
                const e = flujos.get(id);
                if (!e?.abierto) return false;
                const trozo = d.slice(0, MAX_TROZO_FLUJO);
                const ok = salida.enviar({ t: "fd.trozo", id, n, d: trozo });
                if (ok) {
                    n += 1;
                    poner(apuntarEnvio(e, trozo, Date.now()));
                }
                return ok;
            },
            cerrar(motivo?: string) {
                const e = flujos.get(id);
                if (!e?.abierto) return;
                salida.enviar({ t: "fd.cerrar", id, total: n, ...(motivo ? { motivo } : {}) });
                poner(cerrarEstadoFlujo(e, Date.now(), n, motivo));
                salidas.delete(id);
                abiertos.delete(id);
            },
        };
        abiertos.set(id, flujo);
        return { ok: true, flujo };
    } catch {
        return { ok: false, motivo: "No se pudo abrir la transmisión." };
    }
}

/* ══════════════════════════ Entrada ══════════════════════════ */

const ultimoAcuse = new Map<string, { trozos: number; en: number }>();
const respuestas = new Map<string, (m: MsgFlujo) => void>();

/* ── (GRP1107A) Audio/vídeo por canal de datos: segmentos completos para reproducir ── */

type SegmentoListo = { seg: number; partes: string[] };
const segmentos = new Map<string, EstadoSegmentos>();
const oyentesSegmentos = new Map<string, Set<(s: SegmentoListo) => void>>();
/** Los últimos segmentos de cada flujo, para quien se suscribe tarde (abre la burbuja después). */
const ultimosSegmentos = new Map<string, SegmentoListo[]>();
const GUARDAR_SEGMENTOS = 2;

/** Se entera de cada segmento completo de una transmisión de audio/vídeo que llega. Devuelve la baja. */
export function alSegmentosMedios(id: string, cb: (s: SegmentoListo) => void): () => void {
    let set = oyentesSegmentos.get(id);
    if (!set) {
        set = new Set();
        oyentesSegmentos.set(id, set);
    }
    set.add(cb);
    for (const s of ultimosSegmentos.get(id) ?? []) {
        try {
            cb(s);
        } catch {
            /* noop */
        }
    }
    return () => {
        set?.delete(cb);
    };
}

/** Lo que se perdió y se reprodujo de una transmisión de audio/vídeo que llega. */
export function segmentosDeFlujo(id: string): Pick<EstadoSegmentos, "entregados" | "perdidos"> | null {
    const e = segmentos.get(id);
    return e ? { entregados: e.entregados, perdidos: e.perdidos } : null;
}

function apuntarSegmento(id: string, d: string): void {
    const t = leerTrozoMedios(d);
    if (!t) return;
    const r = aplicarTrozoMedios(segmentos.get(id) ?? SEGMENTOS_VACIO, t);
    segmentos.set(id, r.estado);
    for (const s of r.listos) {
        ultimosSegmentos.set(id, [...(ultimosSegmentos.get(id) ?? []), s].slice(-GUARDAR_SEGMENTOS));
        for (const cb of Array.from(oyentesSegmentos.get(id) ?? [])) {
            try {
                cb(s);
            } catch {
                /* un reproductor roto no para la recepción */
            }
        }
    }
}

async function recibir(cuerpo: unknown, origen: { tipo: "p2p"; enlaceId: string } | { tipo: "cuenta" }): Promise<void> {
    const msg = leerMensajeFlujo(cuerpo);
    if (!msg) return;
    const ahora = Date.now();
    if (msg.t === "fd.acuse") {
        const e = flujos.get(msg.id);
        if (e) poner(aplicarAcuse(e, msg, ahora));
        return;
    }
    if (msg.t === "fd.abrir") {
        if (flujos.has(msg.id)) return;
        const yo = await identidadesMalla();
        if (msg.para.n && yo.neurona && msg.para.n !== yo.neurona) return; // es para otra neurona
        if (msg.de.n && yo.neurona && msg.de.n === yo.neurona) return; // eco
        const clave = claveEntrante({ v: 1, mid: msg.id, txt: "", de: msg.de, para: msg.para }, yo.uid);
        if (!clave) return;
        poner(nuevoEstadoFlujo({ ...msg, deNombre: msg.de.nom }, clave, "entra", ahora));
        // El acuse vuelve por donde vino.
        if (origen.tipo === "cuenta") {
            respuestas.set(msg.id, (m) => {
                void import("@/lib/sync/realtime-sync").then((rs) => rs.sendAccountBroadcast(EVENTO_CUENTA_FLUJO, m)).catch(() => undefined);
            });
        } else {
            const tu = await import("@/lib/malla/transporte-universal");
            const r = await tu.abrirCanalDatos({ enlaceId: origen.enlaceId }, CANAL_FLUJO);
            if (r.ok) respuestas.set(msg.id, (m) => void r.canal.enviar(m));
        }
        ultimoAcuse.set(msg.id, { trozos: 0, en: ahora });
        return;
    }
    const e = flujos.get(msg.id);
    if (!e || e.dir !== "entra") return;
    const sig = msg.t === "fd.trozo" ? aplicarTrozo(e, msg, ahora) : cerrarEstadoFlujo(e, ahora, msg.total, msg.motivo);
    if (sig === e) return;
    poner(sig);
    if (msg.t === "fd.trozo" && sig.formato === "medios") apuntarSegmento(msg.id, msg.d);
    const ultimo = ultimoAcuse.get(msg.id) ?? { trozos: 0, en: 0 };
    if (tocaAcuse(sig, ultimo, ahora)) {
        ultimoAcuse.set(msg.id, { trozos: sig.trozos, en: ahora });
        respuestas.get(msg.id)?.({ t: "fd.acuse", id: msg.id, recibidos: sig.trozos, perdidos: sig.perdidos });
    }
    if (!sig.abierto) {
        respuestas.delete(msg.id);
        ultimoAcuse.delete(msg.id);
    }
}

/** Engancha la recepción (canal «neurona-flujo» de la malla y el evento del canal de la cuenta). */
export function iniciarFlujosNeurona(): () => void {
    let activo = true;
    const bajas: Array<() => void> = [];
    void import("@/lib/malla/transporte-universal")
        .then((t) => {
            if (activo) bajas.push(t.alRecibirMensaje(CANAL_FLUJO, (m) => void recibir(m.cuerpo, { tipo: "p2p", enlaceId: m.origen.enlaceId })));
        })
        .catch(() => undefined);
    void import("@/lib/sync/realtime-sync")
        .then((rs) => {
            if (activo) bajas.push(rs.onAccountBroadcast(EVENTO_CUENTA_FLUJO, (p) => void recibir(p, { tipo: "cuenta" })));
        })
        .catch(() => undefined);
    return () => {
        activo = false;
        for (const b of bajas.splice(0)) {
            try {
                b();
            } catch {
                /* noop */
            }
        }
    };
}

/** Solo para pruebas: vacía lo que hay en memoria. */
export function __vaciarFlujosNeurona(): void {
    flujos.clear();
    salidas.clear();
    abiertos.clear();
    respuestas.clear();
    ultimoAcuse.clear();
    segmentos.clear();
    oyentesSegmentos.clear();
    ultimosSegmentos.clear();
}
