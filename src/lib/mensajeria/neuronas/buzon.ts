"use client";

/**
 * Buzón de la malla de Mensajería (MSJ1107A · 2026-11-07).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Una sola bandeja local (clave versionada `starseed.mensajeria.malla.v1`) para:
 *   · los chats con las NEURONAS de los cerebros de la cuenta (pestaña «Neuronas»): canal
 *     «neurona» del transporte universal + el canal de la cuenta en el servidor (`acct:<uid>`,
 *     evento «neurona-msg» con acuse «neurona-acuse», que mide la ida y vuelta);
 *   · los mensajes de chats y grupos que viajaron SOLO por la malla (canal «chat-malla»);
 *   · la vía medida de los mensajes del servidor enviados desde aquí.
 *
 * Cada envío respeta los ajustes de medio de su chat (`mediosParaEnviar`) y guarda por dónde
 * viajó. Lo que no tiene camino espera y se reintenta solo (cada 20 s, al volver internet o al
 * pulsar «Reintentar») o se avisa, según el ajuste. Funciona sin internet: todo vive en este aparato.
 *
 * `iniciarBuzonMalla()` engancha la recepción una vez por sesión (lo monta el arranque global de la
 * malla). Nada pesado se importa en la carga: transporte, sesión y canal de la cuenta, perezosos.
 * No toca `src/lib/malla/**`: usa el transporte universal tal cual (ver `medios/enviar.ts`).
 */

import { useMemo, useSyncExternalStore } from "react";
import {
    BANDEJA_VACIA,
    actualizarMensaje,
    anadirMensaje,
    claveEntrante,
    enEspera,
    guardarVia,
    leerBandeja,
    leerCuerpoChatMalla,
    leerCuerpoNeurona,
    marcarLeida,
    noLeidosNeuronas,
    quitarMensaje,
    type CuerpoNeurona,
    type EstadoBandeja,
    type MensajeMalla,
} from "./bandeja";
import { medioDeEnlace, mediosParaEnviar, servidorDeMedio, viaServidor } from "@/lib/mensajeria/medios/medios";
import {
    candidatoServidor,
    candidatosMalla,
    enviarPorPasoMalla,
    recorrerPlan,
    type DestinoMalla,
    type ResultadoPaso,
} from "@/lib/mensajeria/medios/enviar";
import { claveChat, preferenciasEfectivas } from "@/lib/mensajeria/medios/preferencias-store";
import type { CandidatoMedio, PasoEnvio, PlanEnvio, ViaMensaje } from "@/lib/mensajeria/medios/tipos";
import type { AdjuntoNeurona, FlujoNeuronaRef, LlamadaNeurona } from "@/lib/mensajeria/neuronas/datos-neurona";

export const CLAVE_BANDEJA_MALLA = "starseed.mensajeria.malla.v1";
export const CANAL_NEURONA = "neurona";
export const CANAL_CHAT_MALLA = "chat-malla";
const EVENTO_CUENTA_MSG = "neurona-msg";
const EVENTO_CUENTA_ACUSE = "neurona-acuse";
const ESPERA_ACUSE_CUENTA_MS = 4000;
const REINTENTO_MS = 20_000;

/* ══════════════════════════ Estado y persistencia ══════════════════════════ */

let estado: EstadoBandeja | null = null;
const oyentes = new Set<() => void>();

function cargar(): EstadoBandeja {
    if (estado) return estado;
    let crudo: string | null = null;
    try {
        crudo = typeof localStorage === "undefined" ? null : localStorage.getItem(CLAVE_BANDEJA_MALLA);
    } catch {
        crudo = null;
    }
    estado = leerBandeja(crudo);
    return estado;
}

function poner(nuevo: EstadoBandeja): void {
    if (nuevo === estado) return;
    estado = nuevo;
    try {
        localStorage.setItem(CLAVE_BANDEJA_MALLA, JSON.stringify(nuevo));
    } catch {
        /* sin espacio o sin almacenamiento: la sesión sigue con lo que tiene en memoria */
    }
    for (const cb of Array.from(oyentes)) {
        try {
            cb();
        } catch {
            /* un oyente roto no tumba a los demás */
        }
    }
}

let oyendoOtrasPestanas = false;
function suscribir(cb: () => void): () => void {
    oyentes.add(cb);
    if (!oyendoOtrasPestanas && typeof window !== "undefined") {
        oyendoOtrasPestanas = true;
        window.addEventListener("storage", (e) => {
            if (e.key !== CLAVE_BANDEJA_MALLA) return;
            estado = null;
            for (const o of Array.from(oyentes)) o();
        });
    }
    return () => {
        oyentes.delete(cb);
    };
}

export function bandejaMalla(): EstadoBandeja {
    return cargar();
}

const vacia = () => BANDEJA_VACIA;

export function useBandejaMalla(): EstadoBandeja {
    return useSyncExternalStore(suscribir, cargar, vacia);
}

export function useNoLeidosNeuronas(): number {
    const e = useBandejaMalla();
    return useMemo(() => noLeidosNeuronas(e), [e]);
}

export function marcarConversacionLeida(clave: string): void {
    const e = cargar();
    const ms = e.conv[clave]?.mensajes;
    const ultimo = ms && ms.length ? ms[ms.length - 1].at : 0;
    if (ultimo) poner(marcarLeida(e, clave, ultimo));
}

export function registrarViaMensaje(mensajeId: string, via: ViaMensaje): void {
    poner(guardarVia(cargar(), mensajeId, via));
}

export function quitarMensajeMalla(clave: string, id: string): void {
    poner(quitarMensaje(cargar(), clave, id));
}

/* ══════════════════════════ Identidad (perezosa) ══════════════════════════ */

let nombreEstaNeurona: string | undefined;
/** El panel avisa del nombre de esta neurona para que el otro lado lo vea. */
export function fijarNombreEstaNeurona(nombre: string | undefined): void {
    nombreEstaNeurona = nombre?.slice(0, 60) || undefined;
}

async function miUid(): Promise<string | null> {
    try {
        const m = await import("@/lib/consumo/usuario");
        return (await m.uidActual()) ?? null;
    } catch {
        return null;
    }
}

async function miNeurona(): Promise<string> {
    try {
        const m = await import("@/lib/neurons/neurons");
        return m.thisDeviceId() || "";
    } catch {
        return "";
    }
}

function nuevoId(): string {
    try {
        return crypto.randomUUID();
    } catch {
        return `mm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
}

function ahora(): number {
    try {
        return performance.now();
    } catch {
        return Date.now();
    }
}

/* ══════════════════════════ Canal de la cuenta (servidor) ══════════════════════════ */

const esperasCuenta = new Map<string, (ok: boolean) => void>();
let oyentesCuenta: Array<() => void> = [];

async function asegurarOyentesCuenta(): Promise<void> {
    if (oyentesCuenta.length) return;
    try {
        const rs = await import("@/lib/sync/realtime-sync");
        if (oyentesCuenta.length) return;
        oyentesCuenta = [
            rs.onAccountBroadcast(EVENTO_CUENTA_ACUSE, (p) => {
                const mid = (p as { mid?: unknown } | null)?.mid;
                if (typeof mid === "string") esperasCuenta.get(mid)?.(true);
            }),
            rs.onAccountBroadcast(EVENTO_CUENTA_MSG, (p) => {
                void recibirNeurona(p, viaCuentaEntrante(), async (mid) => {
                    await rs.sendAccountBroadcast(EVENTO_CUENTA_ACUSE, { mid, de: await miNeurona() });
                });
            }),
        ];
    } catch {
        oyentesCuenta = [];
    }
}

function viaCuentaEntrante(): ViaMensaje {
    return { ...viaServidor("entra", null, Date.now()), servidor: "Supabase en tiempo real (canal de tu cuenta)" };
}

function esperarAcuseCuenta(mid: string, ms: number): Promise<boolean> {
    return new Promise((resolver) => {
        const t = setTimeout(() => {
            esperasCuenta.delete(mid);
            resolver(false);
        }, ms);
        esperasCuenta.set(mid, (ok) => {
            clearTimeout(t);
            esperasCuenta.delete(mid);
            resolver(ok);
        });
    });
}

/**
 * Manda por el canal de la cuenta (servidor en tiempo real) y espera el acuse de la neurona. Un
 * mensaje por este canal no se guarda en el servidor: sin acuse cuenta como NO entregado (la
 * neurona puede estar apagada) y el plan sigue con el siguiente medio o espera.
 */
async function enviarPorCuenta(cuerpo: CuerpoNeurona): Promise<ResultadoPaso> {
    try {
        await asegurarOyentesCuenta();
        const rs = await import("@/lib/sync/realtime-sync");
        const t0 = ahora();
        const espera = esperarAcuseCuenta(cuerpo.mid, ESPERA_ACUSE_CUENTA_MS);
        await rs.sendAccountBroadcast(EVENTO_CUENTA_MSG, cuerpo);
        const ok = await espera;
        if (!ok) return { ok: false, confirmado: false, detalle: "la neurona no respondió por el canal de tu cuenta (¿apagada o sin conexión?)" };
        const dt = ahora() - t0;
        return {
            ok: true,
            confirmado: true,
            detalle: "entregado y confirmado",
            via: {
                medio: "servidor",
                direccion: "sale",
                enlace: "Canal de tu cuenta",
                enlaceId: "servidor",
                servidor: "Supabase en tiempo real (canal de tu cuenta)",
                latenciaMs: dt,
                latenciaFuente: "acuse",
                confirmado: true,
                confirmadoPor: "destino",
                motivo: "la neurona confirmó la llegada",
                en: Date.now(),
            },
        };
    } catch {
        return { ok: false, confirmado: false, detalle: "el canal de tu cuenta no está disponible" };
    }
}

/* ══════════════════════════ Envío a una neurona ══════════════════════════ */

export interface EnvioNeurona {
    clave: string;
    destino: DestinoMalla;
    texto: string;
    /** (NEU1107A) Archivo, llamada o flujo que acompaña al mensaje (el texto puede ir vacío). */
    adjunto?: AdjuntoNeurona;
    llamada?: LlamadaNeurona;
    flujo?: FlujoNeuronaRef;
    /** No espera un medio: si no sale ya, falla (timbres y anuncios de flujos). */
    urgente?: boolean;
    /** Id fijo (para que el archivo y su anuncio compartan identidad). */
    id?: string;
}

/** (NEU1107A) Cuerpo que viaja por la malla o por el canal de la cuenta para un mensaje de neurona. */
export async function cuerpoNeuronaDe(m: MensajeMalla): Promise<CuerpoNeurona> {
    const destino = m.destino ?? {};
    const [uid, neurona] = await Promise.all([miUid(), miNeurona()]);
    return {
        v: 1,
        mid: m.id,
        txt: m.texto,
        at: m.at,
        de: { n: neurona || undefined, nom: nombreEstaNeurona, u: uid ?? undefined },
        para: { n: destino.neuronDeviceId, u: destino.uid },
        ...(m.adjunto ? { adj: m.adjunto } : {}),
        ...(m.llamada ? { ll: m.llamada } : {}),
        ...(m.flujo ? { fd: m.flujo } : {}),
    };
}

/** (NEU1107A) Guarda (o completa) un mensaje en la bandeja. */
export function guardarMensajeMalla(m: MensajeMalla): void {
    poner(anadirMensaje(cargar(), m));
}

/** (NEU1107A) Cambia campos de un mensaje de la bandeja. */
export function cambiarMensajeMalla(clave: string, id: string, cambio: Partial<MensajeMalla>): void {
    poner(actualizarMensaje(cargar(), clave, id, cambio));
}

/** (NEU1107A) Lee un mensaje de la bandeja. */
export function mensajeMalla(clave: string, id: string): MensajeMalla | null {
    return cargar().conv[clave]?.mensajes.find((x) => x.id === id) ?? null;
}

/** (NEU1107A) ¿Hay internet y sesión? (para decidir llamadas y el almacenamiento de la cuenta). */
export async function hayInternetYSesion(): Promise<{ internet: boolean; uid: string | null }> {
    const internet = typeof navigator === "undefined" ? true : navigator.onLine !== false;
    return { internet, uid: await miUid() };
}

function cerrarSinCamino(m: MensajeMalla, plan: PlanEnvio, motivo: string | undefined, intentos: number, esPrimero: boolean): MensajeMalla {
    const espera = plan.siNinguno === "esperar";
    const cambio: Partial<MensajeMalla> = {
        estado: espera ? "en-espera" : "fallido",
        aviso: motivo ?? plan.aviso,
        descartados: plan.descartados,
        intentos,
    };
    // «Avisar» en el primer intento de un chat: no se queda como basura (el texto sigue en el compositor).
    if (!espera && esPrimero && m.clave.startsWith("dm:")) {
        poner(quitarMensaje(cargar(), m.clave, m.id));
        return { ...m, ...cambio };
    }
    poner(actualizarMensaje(anadirMensaje(cargar(), m), m.clave, m.id, cambio));
    return { ...m, ...cambio };
}

async function procesarNeurona(m: MensajeMalla): Promise<MensajeMalla> {
    const destino = m.destino ?? {};
    const propia = !destino.uid;
    const uid = await miUid();
    const cuerpo = await cuerpoNeuronaDe(m);
    const candidatos: CandidatoMedio[] = [
        ...(await candidatosMalla(destino)),
        candidatoServidor(
            propia && !!uid,
            !propia ? "el canal de tu cuenta en el servidor solo llega a tus propias neuronas" : "inicia sesión para usar el servidor",
        ),
    ];
    const plan0 = mediosParaEnviar(preferenciasEfectivas(m.clavePrefs), candidatos, { tipo: "neurona" });
    // Un timbre o el anuncio de un flujo no esperan: si no salen ya, fallan (y se dice).
    const plan: PlanEnvio = m.urgente
        ? { ...plan0, siNinguno: "avisar", ...(plan0.sinCamino ? { aviso: "Ningún medio permitido está disponible ahora." } : {}) }
        : plan0;
    const intentos = (m.intentos ?? 0) + 1;
    if (plan.sinCamino) return cerrarSinCamino(m, plan, undefined, intentos, intentos === 1);
    poner(actualizarMensaje(cargar(), m.clave, m.id, { estado: "enviando", aviso: undefined }));
    const r = await recorrerPlan(
        plan,
        (paso) => (paso.medio === "servidor" ? enviarPorCuenta(cuerpo) : enviarPorPasoMalla(paso, destino, CANAL_NEURONA, cuerpo)),
        { seguirSinAcuse: true },
    );
    if (!r.ok) return cerrarSinCamino(m, plan, r.motivo, intentos, intentos === 1);
    const cambio: Partial<MensajeMalla> = {
        estado: r.via?.confirmado ? "confirmado" : "enviado",
        via: r.via ?? undefined,
        aviso: r.via?.confirmado ? undefined : r.motivo,
        descartados: undefined,
        intentos,
    };
    poner(actualizarMensaje(cargar(), m.clave, m.id, cambio));
    return { ...m, ...cambio };
}

/** Escribe a una neurona (o a las neuronas de otra cuenta) según los ajustes de medio de ese chat. */
export async function enviarANeurona(e: EnvioNeurona): Promise<MensajeMalla> {
    const texto = e.texto.trim().slice(0, 4000);
    const m: MensajeMalla = {
        id: e.id ?? nuevoId(),
        clave: e.clave,
        dir: "sale",
        texto,
        at: Date.now(),
        estado: "enviando",
        destino: e.destino,
        clavePrefs: claveChat("neurona", e.clave),
        intentos: 0,
        ...(e.adjunto ? { adjunto: e.adjunto } : {}),
        ...(e.llamada ? { llamada: e.llamada } : {}),
        ...(e.flujo ? { flujo: e.flujo } : {}),
        ...(e.urgente ? { urgente: true } : {}),
    };
    poner(anadirMensaje(cargar(), m));
    return procesarNeurona(m);
}

/** (NEU1107A) Vuelve a pasar por el plan de medios un mensaje de neurona ya guardado. */
export function reenviarMensajeNeurona(m: MensajeMalla): Promise<MensajeMalla> {
    return procesarNeurona(m);
}

/** Un archivo por la malla que aún no salió necesita el archivo en memoria (lo lleva su motor). */
function esArchivoSinSalir(m: MensajeMalla): boolean {
    return !!m.adjunto && m.adjunto.modo === "p2p" && !m.via;
}

/* ══════════════════════════ Chats y grupos ══════════════════════════ */

export interface EnvioChat {
    hiloId: string;
    tipo: "dm" | "grupo";
    /** Las otras personas del chat (uid). */
    otros: string[];
    texto: string;
    /** Adjuntos, formato o respuesta citada: solo viajan por el servidor. */
    soloServidor?: boolean;
    /** Guarda en el servidor de siempre (devuelve el id del mensaje guardado). */
    enviarServidor: () => Promise<{ id: string } | null>;
}

export interface ResultadoChat {
    ok: boolean;
    /** Salió por el servidor: id del mensaje guardado. */
    servidorId?: string;
    /** Salió por la malla o quedó en espera: el mensaje local. */
    local?: MensajeMalla;
    via?: ViaMensaje | null;
    enEspera?: boolean;
    aviso?: string;
}

async function candidatosChat(otros: string[], soloServidor: boolean): Promise<{ candidatos: CandidatoMedio[]; alcance: Map<string, string[]> }> {
    const alcance = new Map<string, string[]>();
    const porId = new Map<string, CandidatoMedio>();
    porId.set("servidor", candidatoServidor(true));
    if (!soloServidor) {
        for (const u of otros) {
            for (const c of await candidatosMalla({ uid: u })) {
                const previo = porId.get(c.enlaceId);
                if (c.llega) alcance.set(c.enlaceId, [...(alcance.get(c.enlaceId) ?? []), u]);
                if (!previo || (!previo.llega && c.llega)) porId.set(c.enlaceId, c);
            }
        }
    }
    return { candidatos: Array.from(porId.values()), alcance };
}

async function procesarChat(
    m: MensajeMalla,
    extra: { enviarServidor?: EnvioChat["enviarServidor"]; soloServidor?: boolean; esPrimero: boolean },
): Promise<ResultadoChat> {
    const hiloId = m.clave.slice(3);
    const tipo = m.clavePrefs?.startsWith("grupo:") ? "grupo" : "dm";
    const otros = m.destinatarios ?? [];
    const soloServidor = !!extra.soloServidor;
    const enviarServidor =
        extra.enviarServidor ??
        (async () => {
            const { sendMessage } = await import("@/lib/messages/dm");
            const s = await sendMessage(hiloId, { body: m.texto });
            return s ? { id: s.id } : null;
        });
    const prefs = preferenciasEfectivas(m.clavePrefs);
    // En automático y con internet, el servidor va primero: la malla solo se mira si él falla
    // (así un envío normal no despierta el transporte de la malla).
    const servidorPrimero = !soloServidor && prefs.modo === "auto" && candidatoServidor().abierto;
    let { candidatos, alcance } = await candidatosChat(otros, soloServidor || servidorPrimero);
    let plan = mediosParaEnviar(prefs, candidatos, { tipo });
    if (soloServidor && plan.pasos.every((p) => p.medio !== "servidor")) {
        plan = {
            ...plan,
            pasos: [],
            sinCamino: true,
            aviso: "Los adjuntos, el formato y las respuestas citadas solo viajan por el servidor, y no está entre los medios permitidos o no hay internet.",
        };
    }
    const intentos = (m.intentos ?? 0) + 1;
    // Lo que no puede esperar (adjuntos) se avisa siempre.
    if (plan.sinCamino && soloServidor) plan = { ...plan, siNinguno: "avisar" };
    if (plan.sinCamino) {
        const fin = cerrarSinCamino(m, plan, undefined, intentos, extra.esPrimero);
        return { ok: fin.estado === "en-espera", enEspera: fin.estado === "en-espera", local: fin, aviso: fin.aviso };
    }

    const guardado: { id: string | null } = { id: null };
    const cuerpo = { v: 1, mid: m.id, h: hiloId, txt: m.texto, at: m.at, de: { u: (await miUid()) ?? undefined } };
    const enviarPaso = async (paso: PasoEnvio): Promise<ResultadoPaso> => {
        if (paso.medio === "servidor") {
            const t0 = ahora();
            const s = await enviarServidor();
            if (!s) return { ok: false, confirmado: false, detalle: "el servidor no lo guardó" };
            guardado.id = s.id;
            return { ok: true, confirmado: true, detalle: "guardado en el servidor", via: viaServidor("sale", ahora() - t0, Date.now()) };
        }
        const uids = alcance.get(paso.enlaceId) ?? [];
        let via: ViaMensaje | undefined;
        let llegaron = 0;
        let confirmados = 0;
        for (const u of uids) {
            const rp = await enviarPorPasoMalla(paso, { uid: u }, CANAL_CHAT_MALLA, cuerpo);
            if (!rp.ok) continue;
            llegaron += 1;
            if (rp.confirmado) confirmados += 1;
            via ??= rp.via;
        }
        if (!llegaron || !via) return { ok: false, confirmado: false, detalle: "no salió por este enlace" };
        const resumen = tipo === "grupo" ? `llegó por la malla a ${llegaron} de ${otros.length} miembros` : via.motivo;
        return { ok: true, confirmado: confirmados > 0, detalle: resumen ?? "enviado", via: { ...via, motivo: resumen } };
    };
    let r = await recorrerPlan(plan, enviarPaso);
    if (!r.ok && servidorPrimero) {
        // El servidor falló con internet «a la vista»: ahora sí, la malla (sin volver a probar el servidor).
        ({ candidatos, alcance } = await candidatosChat(otros, false));
        const deMalla = mediosParaEnviar(prefs, candidatos.filter((c) => c.medio !== "servidor"), { tipo });
        plan = { ...deMalla, descartados: [...plan.descartados, ...deMalla.descartados] };
        if (deMalla.pasos.length) {
            const r2 = await recorrerPlan(plan, enviarPaso);
            r = { ...r2, intentos: [...r.intentos, ...r2.intentos] };
        }
    }

    if (!r.ok) {
        const fin = cerrarSinCamino(m, plan, r.motivo, intentos, extra.esPrimero);
        return { ok: fin.estado === "en-espera", enEspera: fin.estado === "en-espera", local: fin, aviso: fin.aviso };
    }
    if (guardado.id && r.via) {
        // Por el servidor: el mensaje de verdad llega por el tiempo real; aquí solo su vía medida.
        let e = guardarVia(cargar(), guardado.id, r.via);
        e = quitarMensaje(e, m.clave, m.id);
        poner(e);
        return { ok: true, servidorId: guardado.id, via: r.via };
    }
    const cambio: Partial<MensajeMalla> = {
        estado: r.via?.confirmado ? "confirmado" : "enviado",
        via: r.via ?? undefined,
        aviso: undefined,
        descartados: undefined,
        intentos,
    };
    poner(actualizarMensaje(anadirMensaje(cargar(), m), m.clave, m.id, cambio));
    return { ok: true, local: { ...m, ...cambio }, via: r.via };
}

/**
 * Envía un mensaje de chat o grupo según los ajustes de medio del chat: por el servidor de siempre
 * (guarda el historial compartido) o, si así se eligió o no hay internet, por la malla. Nunca lanza.
 */
export async function enviarMensajeChat(e: EnvioChat): Promise<ResultadoChat> {
    const m: MensajeMalla = {
        id: nuevoId(),
        clave: `dm:${e.hiloId}`,
        dir: "sale",
        texto: e.texto.slice(0, 4000),
        at: Date.now(),
        estado: "enviando",
        destinatarios: e.otros.slice(0, 64),
        clavePrefs: claveChat(e.tipo, e.hiloId),
        intentos: 0,
    };
    try {
        return await procesarChat(m, { enviarServidor: e.enviarServidor, soloServidor: e.soloServidor, esPrimero: true });
    } catch {
        return { ok: false, aviso: "No se pudo enviar el mensaje." };
    }
}

/* ══════════════════════════ Reintentos ══════════════════════════ */

let reintentando = false;

/** Reintenta lo que espera un medio. Devuelve cuántos salieron. */
export async function reintentarPendientes(): Promise<number> {
    if (reintentando) return 0;
    reintentando = true;
    let salieron = 0;
    try {
        for (const m of enEspera(cargar())) {
            // (NEU1107A) Un archivo que espera (de una neurona o de un chat por la malla) lo lleva su motor.
            if (esArchivoSinSalir(m)) {
                const a = await import("./archivos-neurona");
                const r = await a.reintentarArchivoNeurona(m);
                if (r.estado === "enviado" || r.estado === "confirmado") salieron += 1;
            } else if (m.clave.startsWith("dm:")) {
                const r = await procesarChat(m, { esPrimero: false });
                if (r.ok && !r.enEspera) salieron += 1;
            } else {
                const r = await procesarNeurona(m);
                if (r.estado === "enviado" || r.estado === "confirmado") salieron += 1;
            }
        }
    } finally {
        reintentando = false;
    }
    return salieron;
}

/** Vuelve a mandar un mensaje que falló (botón «Reintentar»). */
export async function reintentarMensaje(clave: string, id: string): Promise<void> {
    const m = cargar().conv[clave]?.mensajes.find((x) => x.id === id);
    if (!m || m.dir !== "sale") return;
    if (esArchivoSinSalir(m)) await (await import("./archivos-neurona")).reintentarArchivoNeurona(m);
    else if (m.clave.startsWith("dm:")) await (m.llamada ? anunciarEnChatMalla(m) : procesarChat(m, { esPrimero: false }));
    else await procesarNeurona(m);
}

/* ══════════════════════════ Recepción ══════════════════════════ */

/** (NEU1107A) Vía de algo que llegó por un enlace del transporte universal (también la usan los flujos). */
export function viaDeOrigenMalla(origen: { tipo: string; enlaceId: string; etiqueta: string }): Promise<ViaMensaje> {
    return viaDeOrigen(origen);
}

/** (NEU1107A) Vía de algo que llegó por el canal de la cuenta en el servidor. */
export function viaCuentaEntranteMalla(): ViaMensaje {
    return viaCuentaEntrante();
}

/** (NEU1107A) Ids de esta cuenta y esta neurona (para filtrar lo que no es para aquí). */
export async function identidadesMalla(): Promise<{ uid: string | null; neurona: string }> {
    const [uid, neurona] = await Promise.all([miUid(), miNeurona()]);
    return { uid, neurona };
}

async function viaDeOrigen(origen: { tipo: string; enlaceId: string; etiqueta: string }): Promise<ViaMensaje> {
    let ruta: string | null = null;
    let rtt: number | null = null;
    try {
        const t = await import("@/lib/malla/transporte-universal");
        const e = (await t.enlacesDisponibles()).find((x) => x.id === origen.enlaceId);
        ruta = e?.ruta ?? null;
        rtt = typeof e?.rttMs === "number" && Number.isFinite(e.rttMs) ? e.rttMs : null;
    } catch {
        /* sin transporte: la vía va sin medidas */
    }
    const medio = medioDeEnlace({ tipo: origen.tipo, ruta }) ?? "p2p-internet";
    return {
        medio,
        direccion: "entra",
        enlace: origen.etiqueta,
        enlaceId: origen.enlaceId,
        servidor: servidorDeMedio(medio),
        ruta,
        latenciaMs: rtt,
        latenciaFuente: rtt !== null ? "enlace" : null,
        confirmado: false,
        en: Date.now(),
    };
}

async function recibirNeurona(cuerpo: unknown, via: ViaMensaje | Promise<ViaMensaje>, acusar?: (mid: string) => Promise<void>): Promise<void> {
    const c = leerCuerpoNeurona(cuerpo);
    if (!c) return;
    const [uid, neurona] = await Promise.all([miUid(), miNeurona()]);
    if (c.para?.n && neurona && c.para.n !== neurona) return; // es para otra neurona
    if (!c.para?.n && c.para?.u && uid && c.para.u !== uid) return; // es para otra cuenta
    if (c.de.n && neurona && c.de.n === neurona) return; // eco de esta misma neurona
    const clave = claveEntrante(c, uid);
    if (!clave) return;
    if (acusar) void acusar(c.mid).catch(() => undefined);
    const nuevo = !cargar().conv[clave]?.mensajes.some((x) => x.id === c.mid);
    poner(
        anadirMensaje(cargar(), {
            id: c.mid,
            clave,
            dir: "entra",
            texto: c.txt,
            at: Date.now(),
            estado: "recibido",
            via: await via,
            deNombre: c.de.nom,
            ...(c.adj ? { adjunto: c.adj } : {}),
            ...(c.ll ? { llamada: c.ll } : {}),
            ...(c.fd ? { flujo: c.fd } : {}),
        }),
    );
    // (NEU1107A) Una llamada por internet suena aquí (una sola vez, aunque llegue por dos caminos).
    if (nuevo && c.ll?.via === "sistema-llamadas" && c.ll.sesion) {
        void import("./llamadas-neurona")
            .then((m) => m.timbreDeNeurona({ clave, cuerpo: c }))
            .catch(() => undefined);
    }
    // (NEU1107A) La burbuja de una llamada directa (su timbre suena por el propio enlace local).
    if (nuevo && c.ll?.via === "enlace-local") {
        void import("./llamadas-neurona")
            .then((m) => m.registroLlamadaDirectaEntrante(clave, c.mid))
            .catch(() => undefined);
    }
    // (NEU1107A) Un archivo: se sigue su transferencia (y se guarda aquí cuando se verifique).
    if (c.adj) {
        void import("./archivos-neurona")
            .then((a) => a.alAnunciarArchivo(clave, c.mid))
            .catch(() => undefined);
    }
    // (NEU1107A) Aviso aunque el chat no esté abierto. Las llamadas ya tienen su timbre global
    // (sistema de llamadas o llamada directa); los archivos por la malla, además, su tarjeta de aceptar.
    if (nuevo && hiloAbierto !== clave && (c.adj || c.fd)) {
        const quien = c.de.nom || "Una neurona";
        const que = c.adj ? `te manda «${c.adj.nombre}»` : `empezó una transmisión en vivo («${c.fd?.nombre ?? "sin nombre"}»)`;
        void import("sonner")
            .then(({ toast }) => toast.message(`${quien} ${que}`, { description: "Pestaña «Neuronas» de Mensajes." }))
            .catch(() => undefined);
    }
}

/** (NEU1107A) Chat de neurona a la vista (sus avisos no salen como notificación). */
let hiloAbierto: string | null = null;
export function fijarHiloAbierto(clave: string | null): void {
    hiloAbierto = clave;
}

async function recibirChat(cuerpo: unknown, via: Promise<ViaMensaje>): Promise<void> {
    const c = leerCuerpoChatMalla(cuerpo);
    if (!c) return;
    const uid = await miUid();
    if (c.de.u && uid && c.de.u === uid) return; // eco de mi propia cuenta
    const clave = `dm:${c.h}`;
    const nuevo = !cargar().conv[clave]?.mensajes.some((x) => x.id === c.mid);
    poner(
        anadirMensaje(cargar(), {
            id: c.mid,
            clave,
            dir: "entra",
            texto: c.txt,
            at: Date.now(),
            estado: "recibido",
            via: await via,
            deUid: c.de.u,
            ...(c.adj ? { adjunto: c.adj } : {}),
            ...(c.ll ? { llamada: c.ll } : {}),
        }),
    );
    // (NEU1107A) Lo mismo que en los chats de neuronas: el archivo se sigue y se guarda aquí, y la
    // llamada directa apunta su registro.
    if (c.adj) {
        void import("./archivos-neurona")
            .then((a) => a.alAnunciarArchivo(clave, c.mid))
            .catch(() => undefined);
    }
    if (nuevo && c.ll?.via === "enlace-local") {
        void import("./llamadas-neurona")
            .then((m) => m.registroLlamadaDirectaEntrante(clave, c.mid))
            .catch(() => undefined);
    }
}

/**
 * (NEU1107A) Anuncia por la MALLA en un chat o grupo (canal «chat-malla») un archivo o una llamada
 * directa: el mensaje lleva `destino.uid` (una persona del chat) y sale por los enlaces que le
 * llegan y permiten los ajustes de medio del chat. Nunca por el servidor: con internet y servidor,
 * los adjuntos y las llamadas siguen por el sistema de siempre del chat.
 */
export async function anunciarEnChatMalla(m: MensajeMalla): Promise<MensajeMalla> {
    const uid = m.destino?.uid;
    const tipo = m.clavePrefs?.startsWith("grupo:") ? "grupo" : "dm";
    const candidatos = uid ? await candidatosMalla({ uid }) : [];
    const plan0 = mediosParaEnviar(preferenciasEfectivas(m.clavePrefs), candidatos, { tipo });
    // La burbuja de una llamada no espera: si no sale ya, falla (y se dice).
    const plan: PlanEnvio = m.urgente
        ? { ...plan0, siNinguno: "avisar", ...(plan0.sinCamino ? { aviso: "Ningún medio permitido está disponible ahora." } : {}) }
        : plan0;
    const intentos = (m.intentos ?? 0) + 1;
    if (plan.sinCamino) return cerrarSinCamino(m, plan, undefined, intentos, false);
    poner(actualizarMensaje(cargar(), m.clave, m.id, { estado: "enviando", aviso: undefined }));
    const cuerpo = {
        v: 1,
        mid: m.id,
        h: m.clave.slice(3),
        txt: m.texto,
        at: m.at,
        de: { u: (await miUid()) ?? undefined },
        ...(m.adjunto ? { adj: m.adjunto } : {}),
        ...(m.llamada ? { ll: m.llamada } : {}),
    };
    const r = await recorrerPlan(plan, (paso) => enviarPorPasoMalla(paso, { uid }, CANAL_CHAT_MALLA, cuerpo), { seguirSinAcuse: true });
    if (!r.ok) return cerrarSinCamino(m, plan, r.motivo, intentos, false);
    const cambio: Partial<MensajeMalla> = {
        estado: r.via?.confirmado ? "confirmado" : "enviado",
        via: r.via ?? undefined,
        aviso: r.via?.confirmado ? undefined : r.motivo,
        descartados: undefined,
        intentos,
    };
    poner(actualizarMensaje(cargar(), m.clave, m.id, cambio));
    return { ...m, ...cambio };
}

let arrancado = 0;
let parada: (() => void) | null = null;

/**
 * Engancha la recepción (canales «neurona» y «chat-malla» del transporte universal y el canal de
 * la cuenta) y los reintentos. Cuenta referencias: arranca con la primera y para con la última.
 */
export function iniciarBuzonMalla(): () => void {
    arrancado += 1;
    if (arrancado > 1 || typeof window === "undefined") {
        return () => {
            arrancado = Math.max(0, arrancado - 1);
        };
    }
    let activo = true;
    const bajas: Array<() => void> = [];
    void import("@/lib/malla/transporte-universal")
        .then((t) => {
            if (!activo) return;
            bajas.push(
                t.alRecibirMensaje(CANAL_NEURONA, (m) => void recibirNeurona(m.cuerpo, viaDeOrigen(m.origen))),
                t.alRecibirMensaje(CANAL_CHAT_MALLA, (m) => void recibirChat(m.cuerpo, viaDeOrigen(m.origen))),
            );
        })
        .catch(() => undefined);
    // (NEU1107A) Transmisiones en vivo (canal «neurona-flujo» y su evento en el canal de la cuenta)
    // y archivos (el motor de la malla, para guardar aquí lo que llegue verificado).
    void import("./flujos-neurona")
        .then((f) => {
            if (activo) bajas.push(f.iniciarFlujosNeurona());
        })
        .catch(() => undefined);
    void import("./archivos-neurona")
        .then((a) => {
            if (activo) bajas.push(a.iniciarArchivosNeurona());
        })
        .catch(() => undefined);
    // (GRP1107A) Timbres de llamadas de grupo sin internet (por cada enlace) y correos por la malla
    // (guardar y reenviar: recibir, acusar, subir al buzón al volver la red).
    void import("@/lib/llamadas/grupo-malla-motor")
        .then((g) => {
            if (activo) bajas.push(g.iniciarGrupoMalla());
        })
        .catch(() => undefined);
    void import("@/lib/mail/correo-malla-motor")
        .then((c) => {
            if (activo) bajas.push(c.iniciarCorreoMalla());
        })
        .catch(() => undefined);
    void asegurarOyentesCuenta();
    const tic = () => {
        if (enEspera(cargar()).length) void reintentarPendientes();
    };
    const intervalo = setInterval(tic, REINTENTO_MS);
    window.addEventListener("online", tic);
    bajas.push(
        () => clearInterval(intervalo),
        () => window.removeEventListener("online", tic),
    );
    parada = () => {
        activo = false;
        for (const b of bajas.splice(0)) {
            try {
                b();
            } catch {
                /* noop */
            }
        }
        for (const o of oyentesCuenta.splice(0)) o();
    };
    return () => {
        arrancado = Math.max(0, arrancado - 1);
        if (arrancado === 0 && parada) {
            parada();
            parada = null;
        }
    };
}

/** ¿Está escuchando el buzón? (para que la interfaz lo diga con honestidad). */
export function buzonEscuchando(): boolean {
    return arrancado > 0;
}
