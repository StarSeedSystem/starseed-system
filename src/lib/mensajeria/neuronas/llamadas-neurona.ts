"use client";

/**
 * Llamadas de voz y vídeo y pantalla compartida con una neurona (NEU1107A · 2026-11-07).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Reutiliza los dos motores que ya existen (no hay uno nuevo):
 *  · enlace LOCAL sin internet (`llamada-directa.ts`): timbre, contestar y colgar por el canal
 *    emparejado; audio/vídeo/pantalla sobre esa misma conexión. Sin servidores;
 *  · sistema de llamadas (`acciones.empezarLlamadaSinChat` → `MotorLlamada`): WebRTC señalizado
 *    por el servidor, con TURN si existe y los enlaces locales como canal directo si los hay. El
 *    timbre viaja como un mensaje URGENTE del chat de la neurona (por la malla o el canal de la
 *    cuenta): si no sale ya, la llamada no empieza y se dice por qué.
 * Cuál se usa lo decide `planLlamada` (pura) con los ajustes de medio del chat. Cada llamada deja
 * su burbuja en el historial local del chat (tipo, vía, sonando → en curso → duración).
 *
 * La pantalla se pide EN el gesto de la persona (el navegador solo la da ahí): la interfaz llama
 * a `pedirPantalla()` antes de cualquier espera y pasa la promesa.
 */

import { anunciarEnChatMalla, cambiarMensajeMalla, enviarANeurona, guardarMensajeMalla, hayInternetYSesion, mensajeMalla } from "./buzon";
import type { CuerpoNeurona, MensajeMalla } from "./bandeja";
import type { ConversacionNeurona } from "./agrupar";
import {
    avanzarRegistroLlamada,
    planLlamada,
    type EventoRegistroLlamada,
    type LlamadaNeurona,
    type PlanLlamada,
    type RegistroLlamada,
} from "./datos-neurona";
import { claveChat, preferenciasEfectivas } from "@/lib/mensajeria/medios/preferencias-store";
import { motivoSinPantalla, pedirPantalla } from "@/lib/llamadas/pantalla";
import type { AjustesMedios } from "@/lib/llamadas/permiso-medios";

export type TipoLlamadaNeurona = "audio" | "video" | "pantalla";

export interface ResultadoLlamadaNeurona {
    ok: boolean;
    motivo?: string;
    plan?: PlanLlamada;
    /** (MIC1108A) Qué ajustes del sistema abre «Abrir ajustes» si el fallo fue de permisos. */
    ajustes?: AjustesMedios | null;
}

/**
 * Pide la pantalla (o una ventana o pestaña) a compartir. Hay que llamarla SIN esperas antes, en
 * el mismo gesto. Devuelve la pista de vídeo, o null (y `motivoSinPantalla()` dice por qué).
 */
export { pedirPantalla };

/** (MIC1108A) Sin pantalla: por qué (cancelada, sin permiso del sistema o motor sin getDisplayMedia). */
async function sinPantalla(): Promise<ResultadoLlamadaNeurona> {
    const s = await motivoSinPantalla();
    return { ok: false, motivo: s.motivo, ajustes: s.ajustes };
}

function soltar(p: MediaStreamTrack | null): void {
    try {
        p?.stop();
    } catch {
        /* noop */
    }
}

/* ══════════════════════════ Registro en el chat ══════════════════════════ */

function avanzar(clave: string, id: string, ev: EventoRegistroLlamada): RegistroLlamada | null {
    const m = mensajeMalla(clave, id);
    if (!m) return null;
    const r = avanzarRegistroLlamada(m.registroLlamada ?? { fase: "sonando" }, ev);
    if (r !== m.registroLlamada) cambiarMensajeMalla(clave, id, { registroLlamada: r });
    return r;
}

const acabada = (r: RegistroLlamada | null) => !!r && r.fase !== "sonando" && r.fase !== "en-curso";

/** Sigue la llamada directa (enlace local) y lo apunta en la burbuja. */
async function vigilarDirecta(clave: string, id: string): Promise<void> {
    const ld = await import("@/lib/malla/llamada-directa");
    const inicial = ld.estadoLlamadaDirecta();
    let previa = inicial.fase;
    // La burbuja pudo llegar con la llamada ya contestada.
    if (previa === "en-curso") avanzar(clave, id, { t: "contestada", en: inicial.desde ?? Date.now() });
    let baja: (() => void) | null = null;
    const alCambio = (e: ReturnType<typeof ld.estadoLlamadaDirecta>) => {
        const fase = e.fase;
        if (fase === previa) return;
        const antes = previa;
        previa = fase;
        let r: RegistroLlamada | null = null;
        if (fase === "en-curso") r = avanzar(clave, id, { t: "contestada", en: e.desde ?? Date.now() });
        else if (fase === "terminada" || fase === "inactiva") {
            const motivo = e.motivo ?? undefined;
            if (antes === "en-curso") r = avanzar(clave, id, { t: "colgada", en: Date.now(), motivo });
            else if (motivo && /contest/i.test(motivo)) r = avanzar(clave, id, { t: "sin-respuesta", en: Date.now() });
            else r = avanzar(clave, id, { t: "rechazada", en: Date.now(), motivo });
        }
        if ((acabada(r) || fase === "inactiva") && baja) {
            baja();
            baja = null;
        }
    };
    baja = ld.suscribirLlamadaDirecta(alCambio);
}

type Motor = import("@/lib/llamadas/motor").MotorLlamada;

/** Sigue una llamada del sistema de llamadas (por su sesión) y lo apunta en la burbuja. */
async function vigilarSistema(clave: string, id: string, sesionId: string): Promise<void> {
    const store = await import("@/lib/llamadas/store");
    let motorVisto: Motor | null = null;
    let bajaMotor: (() => void) | null = null;
    let bajaStore: (() => void) | null = null;
    const llegada = Date.now();
    const cerrar = () => {
        bajaMotor?.();
        bajaStore?.();
        bajaMotor = bajaStore = null;
    };
    const alMotor = (m: Motor) => {
        const s = m.estado();
        if (s.contestada) avanzar(clave, id, { t: "contestada", en: Date.now() });
        if (s.fase === "terminada" || s.fase === "error" || s.fase === "llena") {
            let r: RegistroLlamada | null;
            if (s.contestada) r = avanzar(clave, id, { t: "colgada", en: Date.now() });
            else if (s.rechazos?.length) r = avanzar(clave, id, { t: "rechazada", en: Date.now(), motivo: `${s.rechazos[0].nombre} no puede atender ahora` });
            else if (s.fase === "terminada") r = avanzar(clave, id, { t: "sin-respuesta", en: Date.now() });
            else r = avanzar(clave, id, { t: "fallo", en: Date.now(), motivo: s.motivoFin ?? "la llamada no pudo conectar" });
            if (acabada(r)) cerrar();
        }
    };
    const revisar = () => {
        const { activa, timbres } = store.leerLlamadas();
        if (activa && activa.sesionId === sesionId && activa.motor !== motorVisto) {
            motorVisto = activa.motor;
            bajaMotor?.();
            const mo = activa.motor;
            bajaMotor = mo.suscribir(() => alMotor(mo));
            alMotor(mo);
            return;
        }
        // Timbre entrante que se fue sin contestar (rechazado o perdido).
        if (!motorVisto && !timbres.some((t) => t.sesionId === sesionId) && Date.now() - llegada > 500) {
            if (acabada(avanzar(clave, id, { t: "sin-respuesta", en: Date.now() }))) cerrar();
        }
    };
    bajaStore = store.suscribirLlamadas(revisar);
    revisar();
}

/* ══════════════════════════ Llamar ══════════════════════════ */

/**
 * Llama a una neurona de voz, de vídeo o enseñándole la pantalla. `pantalla`: la promesa de
 * `pedirPantalla()` hecha en el gesto. Nunca lanza.
 */
export async function llamarANeurona(o: {
    conversacion: Pick<ConversacionNeurona, "clave" | "destino" | "nombre" | "propia">;
    tipo: TipoLlamadaNeurona;
    pantalla?: Promise<MediaStreamTrack | null>;
}): Promise<ResultadoLlamadaNeurona> {
    const { conversacion: conv, tipo } = o;
    const pista = tipo === "pantalla" ? await (o.pantalla ?? pedirPantalla()) : null;
    if (tipo === "pantalla" && !pista) return sinPantalla();
    try {
        const prefs = preferenciasEfectivas(claveChat("neurona", conv.clave));
        const tu = await import("@/lib/malla/transporte-universal");
        const local = tu.enlaceLocalHacia(conv.destino);
        const red = await hayInternetYSesion();
        const plan = planLlamada({
            preferencias: prefs,
            enlaceLocal: local ? { id: local.id, etiqueta: local.par.nombre || "Aparato vinculado" } : null,
            internet: red.internet,
            sesion: !!red.uid,
        });
        if (!plan.via) {
            soltar(pista);
            return { ok: false, motivo: plan.aviso, plan };
        }
        const llamada: LlamadaNeurona = { tipo: tipo === "audio" ? "audio" : "video", via: plan.via, ...(tipo === "pantalla" ? { pantalla: true } : {}) };

        if (plan.via === "enlace-local" && plan.enlaceId) {
            const ld = await import("@/lib/malla/llamada-directa");
            const r = await ld.llamarPorEnlace(plan.enlaceId, tipo === "video", { pistaPantalla: pista });
            if (!r.ok) return { ok: false, motivo: r.motivo, plan, ajustes: r.ajustes ?? null };
            // La burbuja de los dos lados (el timbre ya suena por el propio enlace).
            const m = await enviarANeurona({ clave: conv.clave, destino: conv.destino, texto: "", llamada, urgente: true });
            cambiarMensajeMalla(m.clave, m.id, { registroLlamada: { fase: "sonando" } });
            void vigilarDirecta(m.clave, m.id);
            return { ok: true, plan };
        }

        const acciones = await import("@/lib/llamadas/acciones");
        let aviso: MensajeMalla | null = null;
        const r = await acciones.empezarLlamadaSinChat({
            tipo: llamada.tipo,
            titulo: conv.nombre,
            invitados: conv.propia || !conv.destino.uid ? [] : [conv.destino.uid],
            pistaPantalla: pista,
            avisar: async (sesion) => {
                aviso = await enviarANeurona({ clave: conv.clave, destino: conv.destino, texto: "", llamada: { ...llamada, sesion }, urgente: true });
                return aviso.estado === "enviado" || aviso.estado === "confirmado";
            },
        });
        const m = aviso as MensajeMalla | null;
        if (!r.ok) {
            if (m) cambiarMensajeMalla(m.clave, m.id, { registroLlamada: { fase: "fallida", fin: Date.now(), motivo: r.motivo } });
            return { ok: false, motivo: m?.aviso ?? r.motivo, plan, ajustes: m?.aviso ? null : (r.ajustes ?? null) };
        }
        if (m && r.sesionId) {
            cambiarMensajeMalla(m.clave, m.id, { registroLlamada: { fase: "sonando" } });
            void vigilarSistema(m.clave, m.id, r.sesionId);
        }
        return { ok: true, plan };
    } catch {
        soltar(pista);
        return { ok: false, motivo: "No se pudo empezar la llamada." };
    }
}

/**
 * En un chat 1:1 cuyo medio elegido es la malla (o sin internet): llamada DIRECTA por el enlace sin
 * internet con el aparato de la otra persona; la burbuja va por «chat-malla». Con internet y
 * servidor, el chat ya tiene sus botones de llamada de siempre. Nunca lanza.
 */
export async function llamarEnChatMalla(o: {
    hiloId: string;
    tipoChat: "dm" | "grupo";
    otroUid: string;
    tipo: TipoLlamadaNeurona;
    pantalla?: Promise<MediaStreamTrack | null>;
}): Promise<ResultadoLlamadaNeurona> {
    const pista = o.tipo === "pantalla" ? await (o.pantalla ?? pedirPantalla()) : null;
    if (o.tipo === "pantalla" && !pista) return sinPantalla();
    try {
        const clavePrefs = claveChat(o.tipoChat, o.hiloId);
        const tu = await import("@/lib/malla/transporte-universal");
        const local = tu.enlaceLocalHacia({ uid: o.otroUid });
        // Por la malla solo cuenta el enlace sin internet (el sistema de llamadas es el del chat).
        const plan = planLlamada({
            preferencias: preferenciasEfectivas(clavePrefs),
            enlaceLocal: local ? { id: local.id, etiqueta: local.par.nombre || "Aparato vinculado" } : null,
            internet: false,
            sesion: false,
        });
        if (plan.via !== "enlace-local" || !plan.enlaceId) {
            soltar(pista);
            return {
                ok: false,
                plan,
                motivo: local
                    ? "El enlace sin internet no está entre los medios elegidos de este chat."
                    : "Por la malla, la llamada va por un enlace sin internet con su aparato: vinculadlos con «Vincular sin internet». Con internet, usa los botones de llamada del chat.",
            };
        }
        const ld = await import("@/lib/malla/llamada-directa");
        const r = await ld.llamarPorEnlace(plan.enlaceId, o.tipo === "video", { pistaPantalla: pista });
        if (!r.ok) return { ok: false, motivo: r.motivo, plan, ajustes: r.ajustes ?? null };
        const m: MensajeMalla = {
            id: (() => {
                try {
                    return crypto.randomUUID();
                } catch {
                    return `ll-${Date.now().toString(36)}`;
                }
            })(),
            clave: `dm:${o.hiloId}`,
            dir: "sale",
            texto: "",
            at: Date.now(),
            estado: "enviando",
            destino: { uid: o.otroUid },
            destinatarios: [o.otroUid],
            clavePrefs,
            urgente: true,
            llamada: { tipo: o.tipo === "audio" ? "audio" : "video", via: "enlace-local", ...(o.tipo === "pantalla" ? { pantalla: true } : {}) },
            registroLlamada: { fase: "sonando" },
        };
        guardarMensajeMalla(m);
        void vigilarDirecta(m.clave, m.id);
        void anunciarEnChatMalla(m);
        return { ok: true, plan };
    } catch {
        soltar(pista);
        return { ok: false, motivo: "No se pudo empezar la llamada." };
    }
}

/* ══════════════════════════ Recibir ══════════════════════════ */

/**
 * Llegó el timbre de una llamada por internet en un chat de neurona (lo llama el buzón, una vez):
 * suena con la tarjeta global de llamadas entrantes (Aceptar / Solo voz / Rechazar), aunque el
 * chat no esté abierto. La persona decide: nada se contesta solo.
 */
export async function timbreDeNeurona(o: { clave: string; cuerpo: CuerpoNeurona }): Promise<void> {
    const ll = o.cuerpo.ll;
    if (!ll || ll.via !== "sistema-llamadas" || !ll.sesion) return;
    try {
        const store = await import("@/lib/llamadas/store");
        if (store.leerLlamadas().timbres.some((t) => t.sesionId === ll.sesion)) return;
        cambiarMensajeMalla(o.clave, o.cuerpo.mid, { registroLlamada: { fase: "sonando" } });
        store.agregarTimbre({
            sesionId: ll.sesion,
            tipo: ll.tipo,
            // Sin chat del servidor: la ventana de la llamada no lleva a ningún hilo.
            hiloId: "",
            tipoHilo: "dm",
            tituloHilo: null,
            mensajeId: o.cuerpo.mid,
            llamante: { uid: o.cuerpo.de.u ?? "", nombre: o.cuerpo.de.nom || "Una neurona", avatar: null },
            silenciado: false,
            llegada: Date.now(),
        });
        void vigilarSistema(o.clave, o.cuerpo.mid, ll.sesion);
    } catch {
        /* sin sistema de llamadas: la burbuja dice que sonó */
    }
}

/** Llegó la burbuja de una llamada directa (el timbre suena por el propio enlace): se sigue aquí. */
export function registroLlamadaDirectaEntrante(clave: string, id: string): void {
    cambiarMensajeMalla(clave, id, { registroLlamada: { fase: "sonando" } });
    void vigilarDirecta(clave, id);
}
