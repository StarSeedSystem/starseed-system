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
// (INT1108C) Sin camino para la llamada y la neurona al lado por Bluetooth: enlace Wi-Fi directo.
import { avisarEnvioPesado } from "@/lib/malla/puente-ble-wifi";

export type TipoLlamadaNeurona = "audio" | "video" | "pantalla";

/** (LLA1108A) Lo que se espera a que se abra el enlace WebRTC por el canal TCP antes de llamar. */
const ESPERA_ENLACE_LLAMAR_MS = 8_000;

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

/**
 * Sigue la llamada directa (enlace local) y lo apunta en la burbuja. (LLA1108A) `llamadaId`: solo esa
 * llamada (no la siguiente) y el final se apunta por `fin` (sin respuesta, rechazada, colgada o fallo),
 * no adivinando por el texto del motivo: «quien llamaba colgó» ya no sale como «Rechazada».
 */
async function vigilarDirecta(clave: string, id: string, llamadaId?: string | null): Promise<void> {
    const ld = await import("@/lib/malla/llamada-directa");
    const esta = (e: ReturnType<typeof ld.estadoLlamadaDirecta>) => !llamadaId || !e.id || e.id === llamadaId;
    const inicial = ld.estadoLlamadaDirecta();
    let previa = esta(inicial) ? inicial.fase : "inactiva";
    // La burbuja pudo llegar con la llamada ya contestada.
    if (previa === "en-curso") avanzar(clave, id, { t: "contestada", en: inicial.desde ?? Date.now() });
    let baja: (() => void) | null = null;
    const alCambio = (e: ReturnType<typeof ld.estadoLlamadaDirecta>) => {
        if (!esta(e)) return;
        const fase = e.fase;
        if (fase === previa) return;
        const antes = previa;
        previa = fase;
        let r: RegistroLlamada | null = null;
        if (fase === "en-curso") r = avanzar(clave, id, { t: "contestada", en: e.desde ?? Date.now() });
        else if (fase === "terminada" || (fase === "inactiva" && antes !== "terminada")) {
            const motivo = e.motivo ?? undefined;
            const en = Date.now();
            if (antes === "en-curso") r = avanzar(clave, id, e.fin === "fallo" ? { t: "fallo", en, motivo: motivo ?? "se perdió el enlace" } : { t: "colgada", en, motivo });
            else if (e.fin === "sin-respuesta") r = avanzar(clave, id, { t: "sin-respuesta", en });
            else if (e.fin === "fallo") r = avanzar(clave, id, { t: "fallo", en, motivo: motivo ?? "la llamada no pudo conectar" });
            else if (e.fin === "colgada") r = avanzar(clave, id, { t: "colgada", en, motivo });
            else r = avanzar(clave, id, { t: "rechazada", en, ...(motivo ? { motivo } : {}) });
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
        let local = tu.enlaceLocalHacia(conv.destino);
        // (LLA1108A) Solo hay el canal TCP 47071 con esa neurona (no lleva audio): primero se abre el enlace
        // WebRTC por él (MLT1107A) y la llamada va por ese, sin internet.
        const neurona = conv.destino.neuronDeviceId;
        const permiteLocal = prefs.modo !== "elegidos" || (prefs.elegidos ?? []).includes("local");
        if (!local && neurona && permiteLocal) {
            const nativo = (await tu.enlacesDisponibles()).some((e) => e.tipo === "nativo" && e.abierto && e.alcanza.neuronDeviceId === neurona);
            if (nativo) {
                const r = await import("@/lib/malla/llamada-directa-respaldo");
                local = await r.asegurarEnlaceCon(neurona, ESPERA_ENLACE_LLAMAR_MS);
            }
        }
        const red = await hayInternetYSesion();
        const plan = planLlamada({
            preferencias: prefs,
            enlaceLocal: local ? { id: local.id, etiqueta: local.par.nombre || "Aparato vinculado" } : null,
            internet: red.internet,
            sesion: !!red.uid,
        });
        // (LLA1110D) Sin internet y sin enlace WebRTC local, pero con un enlace directo de datos con esa neurona (Bluetooth…):
        // la llamada va por él, sin servidor (id local; la voz por el enlace de datos y WebRTC cuando aparezca una ruta IP).
        // Antes aquí acababa: la tableta con el Wi-Fi apagado nunca llegaba a llamar (prueba 33).
        let sinServidor = false;
        // LLA1112A — con el enlace WebRTC local Y un enlace de datos sin IP (Bluetooth) con esa neurona, la llamada va por el
        // motor de llamadas (carriles por flujo): si la red se va a mitad, la voz sigue por Bluetooth sin colgar (prueba 39).
        // Ver `src/lib/llamadas/ruta-llamada-neurona.ts`.
        let porCarriles = false;
        if (plan.via === "enlace-local" && neurona) {
            try {
                const [vt, rl] = await Promise.all([import("@/lib/llamadas/voz-datos/transporte"), import("@/lib/llamadas/ruta-llamada-neurona")]);
                await vt.precargarTransporteVoz();
                const r = rl.rutaLlamadaNeurona({ via: plan.via, permiteLocal, enlacesSinIp: vt.enlacesDatosHacia(neurona).filter((x) => !x.ip).length });
                if (r.cambiada) {
                    porCarriles = true;
                    sinServidor = !(red.internet && red.uid);
                }
            } catch {
                porCarriles = false;
            }
        }
        // LLA1112A — fin
        if (!plan.via && neurona && permiteLocal) {
            try {
                const vt = await import("@/lib/llamadas/voz-datos/transporte");
                sinServidor = await vt.hayEnlaceDirectoCon(neurona);
            } catch {
                sinServidor = false;
            }
        }
        if (!plan.via && !sinServidor) {
            soltar(pista);
            // (INT1108C) Por Bluetooth no caben llamadas: si la neurona está al lado, se abre o se propone
            // el enlace Wi-Fi directo (según el ajuste) y la siguiente llamada ya va por él.
            avisarEnvioPesado({ destino: conv.destino, clase: tipo === "pantalla" ? "pantalla" : "llamada" });
            return { ok: false, motivo: plan.aviso, plan };
        }
        const planEfectivo: PlanLlamada = porCarriles // LLA1112A
            ? { via: "sistema-llamadas", motivo: "llamada con carriles: WebRTC por la red y la voz por Bluetooth si la red se va (sin colgar)", descartados: plan.descartados }
            : plan.via ? plan : { via: "sistema-llamadas", motivo: "llamada por el enlace directo con la neurona (sin internet ni servidor)", descartados: plan.descartados };
        const llamada: LlamadaNeurona = { tipo: tipo === "audio" ? "audio" : "video", via: planEfectivo.via!, ...(tipo === "pantalla" ? { pantalla: true } : {}) };

        if (planEfectivo.via === "enlace-local" && plan.enlaceId) {
            const ld = await import("@/lib/malla/llamada-directa");
            const r = await ld.llamarPorEnlace(plan.enlaceId, tipo === "video", { pistaPantalla: pista });
            if (!r.ok) return { ok: false, motivo: r.motivo, plan, ajustes: r.ajustes ?? null };
            // La burbuja de los dos lados. (LLA1108A) Lleva el id de la llamada: en el otro aparato también
            // hace sonar (con «Contestar»), aunque el timbre del enlace no llegue.
            const llamadaId = ld.estadoLlamadaDirecta().id;
            const m = await enviarANeurona({
                clave: conv.clave,
                destino: conv.destino,
                texto: "",
                llamada: { ...llamada, ...(llamadaId ? { sesion: llamadaId } : {}) },
                urgente: true,
            });
            cambiarMensajeMalla(m.clave, m.id, { registroLlamada: { fase: "sonando" } });
            void vigilarDirecta(m.clave, m.id, llamadaId);
            return { ok: true, plan };
        }

        const acciones = await import("@/lib/llamadas/acciones");
        let aviso: MensajeMalla | null = null;
        const r = await acciones.empezarLlamadaSinChat({
            tipo: llamada.tipo,
            titulo: conv.nombre,
            invitados: conv.propia || !conv.destino.uid ? [] : [conv.destino.uid],
            pistaPantalla: pista,
            neurona: conv.destino.neuronDeviceId ?? null,
            // (LLA1110D) Sin internet: id local y solo el enlace directo.
            sinServidor: sinServidor || !red.internet,
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
        return { ok: true, plan: planEfectivo };
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
        void vigilarDirecta(m.clave, m.id, ld.estadoLlamadaDirecta().id);
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
            ...(o.cuerpo.de.n ? { neurona: o.cuerpo.de.n } : {}),
        });
        void vigilarSistema(o.clave, o.cuerpo.mid, ll.sesion);
    } catch {
        /* sin sistema de llamadas: la burbuja dice que sonó */
    }
}

/**
 * Llegó la burbuja de una llamada directa: se sigue aquí. (LLA1108A) La burbuja también HACE SONAR (con
 * «Contestar» y «Rechazar» en la tarjeta global y en la propia burbuja): antes solo decía «Sonando» y el
 * timbre dependía de un único `ll.sonar` por el enlace WebRTC, que se perdía si ese enlace estaba medio
 * abierto. Solo si es reciente (una burbuja que llega tarde no suena) y de una neurona conocida.
 */
export function registroLlamadaDirectaEntrante(
    clave: string,
    id: string,
    timbre?: { ll: LlamadaNeurona; neurona?: string; nombre?: string; at?: number },
): void {
    cambiarMensajeMalla(clave, id, { registroLlamada: { fase: "sonando" } });
    const llamadaId = timbre?.ll.sesion ?? null;
    void (async () => {
        const ld = await import("@/lib/malla/llamada-directa");
        ld.asegurarEscuchaLlamadas();
        // Holgura amplia: los relojes de los dos aparatos no tienen por qué coincidir (el timbre caduca solo).
        const reciente = typeof timbre?.at !== "number" || Math.abs(Date.now() - timbre.at) < 5 * 60_000;
        if (timbre && llamadaId && timbre.neurona && reciente) {
            ld.recibirSenalLlamada(
                { neurona: timbre.neurona, nombre: timbre.nombre },
                { t: "ll.sonar", id: llamadaId, video: timbre.ll.tipo === "video", ...(timbre.ll.pantalla ? { pantalla: true } : {}) },
            );
        } else if (!reciente) {
            // Ya no suena: la burbuja se queda como no contestada.
            avanzar(clave, id, { t: "sin-respuesta", en: Date.now() });
            return;
        }
        await vigilarDirecta(clave, id, llamadaId);
    })().catch(() => undefined);
}
