"use client";

/**
 * Acciones de llamada: empezar desde un chat, aceptar/rechazar un timbre, unirse por enlace o
 * desde la tarjeta, y colgar. Todas empiezan por un gesto de la persona (un botón), que es
 * cuando se piden micro y cámara.
 *
 * Antes de entrar se resuelven, a la vez que los medios: los servidores ICE del OS
 * (`/api/llamadas/ice`, con TURN si está configurado) y el canal PRIVADO que toca
 * (`resolverTemaSesion`).
 */
import { toast } from "sonner";
import { sendMessage, type DmMessage } from "@/lib/messages/dm";
import { crearSesion, terminarSesion } from "@/lib/mensajeria/sesiones-vivas";
import type { TipoLlamada } from "@/lib/mensajeria/formato-tipos";
import { fetchProfilesByIds } from "@/lib/social/os-profiles";
import { createClient } from "@/utils/supabase/client";
import { MotorLlamada, type OpcionesVozDatos } from "@/lib/llamadas/motor";
import type { ConexionCanal } from "@/lib/llamadas/senalizacion";
import { motivoSinLlamadas, obtenerMedios, pararStream, soportaLlamadas } from "@/lib/llamadas/medios";
import { avisarFalloMedios } from "@/lib/llamadas/aviso-medios";
import type { AjustesMedios } from "@/lib/llamadas/permiso-medios";
import { clavePestana, miIdentidad, type Identidad } from "@/lib/llamadas/identidad";
import { crearAdjuntoLlamada, ESPERA_RESPUESTA_MS } from "@/lib/llamadas/adjunto";
import { TEXTO_TIPO } from "@/lib/llamadas/formato";
import { clasificarErrorSesion, MENSAJE_SESION } from "@/lib/llamadas/errores";
import { registrarFinLlamada } from "@/lib/llamadas/registro";
import { abrirCanalLlamada } from "@/lib/llamadas/senalizacion";
import { obtenerIceServidores, type FuenteIce } from "@/lib/llamadas/ice";
import { temaLlamada } from "@/lib/llamadas/temas";
import { enlacesLocalesVivos } from "@/lib/malla/registro-enlaces-locales";
import { abrirCanalLlamadaPorEnlace } from "@/lib/llamadas/canal-enlace-local";
import { canalesParaLlamada } from "@/lib/llamadas/canales-directos";
import { iceParaCanal, tipoCanalDirecto } from "@/lib/llamadas/decision-ice";
// (NEU1107A) Las llamadas del chat respetan su «Medio de transmisión» y usan el enlace sin internet.
import { enlacesDelChat, planLlamadaChat, type EnlaceLlamadaChat } from "@/lib/llamadas/medio-llamada-chat";
import { esSalaGrupoMalla, type PlanGrupoMalla } from "@/lib/llamadas/grupo-malla";
import { claveChat, preferenciasEfectivas } from "@/lib/mensajeria/medios/preferencias-store";
import type { EnlaceLocalVivo } from "@/lib/malla/registro-enlaces-locales";
import { olvidarTemaSesion, resolverTemaSesion } from "@/lib/llamadas/resolver-tema";
import { sanearNombre, urlAvatarSegura } from "@/lib/llamadas/presencia";
import {
    agregarTimbre,
    leerLlamadas,
    minimizarLlamada,
    ponerActiva,
    quitarActiva,
    quitarTimbre,
    type LlamadaActiva,
    type TimbreEntrante,
} from "@/lib/llamadas/store";
import { MAX_PARTICIPANTES, type AdjuntoLlamadaRegistro } from "@/lib/llamadas/tipos";

const PAUSA_RESUMEN_MS = 2400;

/* ── (LLA1108E) Señalización y voz por CUALQUIER enlace con la neurona (Bluetooth, red local nativa, Wi-Fi directo…) ── */

interface ExtrasNeurona {
    neurona: string;
    abrirCanal(sesionId: string, clave: string): ConexionCanal;
    voz: OpcionesVozDatos;
}

/**
 * Lo que hace falta para llamar a (o contestar a) una neurona con la que quizá solo haya un enlace de datos sin IP:
 * un canal de señalización por el transporte universal y la voz por enlace de datos como respaldo de WebRTC.
 * Sin neurona conocida, o sin app/enlaces, devuelve null y la llamada va como siempre. Nunca lanza.
 */
async function extrasDeNeurona(neurona: string | null | undefined): Promise<ExtrasNeurona | null> {
    if (!neurona) return null;
    try {
        const [ct, vt, aw] = await Promise.all([
            import("@/lib/llamadas/canal-enlace-transporte"),
            import("@/lib/llamadas/voz-datos/transporte"),
            import("@/lib/llamadas/voz-datos/audio-web"),
        ]);
        const [deps, codecs] = await Promise.all([ct.depsCanalTransporteReales(), aw.crearFabricaCodecsWeb()]);
        return {
            neurona,
            abrirCanal: (sesionId, clave) => ct.abrirCanalLlamadaPorTransporte(neurona, sesionId, clave, deps),
            voz: {
                neurona,
                transporteHacia: () => vt.crearTransporteVozHacia(neurona),
                hayRutaIp: () => vt.hayRutaIpHacia(neurona),
                crearAudio: (micro) => aw.crearAudioWeb(micro),
                codecs: () => codecs,
            },
        };
    } catch {
        return null;
    }
}

/** Junta los canales directos de siempre (enlaces WebRTC locales) con el de la neurona por el transporte universal. */
function unirCanales(
    locales: (() => ConexionCanal[]) | undefined,
    extra: ExtrasNeurona | null,
    enlaces: EnlaceLocalVivo[],
    sesionId: string,
    clave: string,
): (() => ConexionCanal[]) | undefined {
    // Si ya hay un enlace WebRTC local con esa neurona, ese canal ya llega: no se duplica la señalización.
    const yaLocal = !!extra && enlaces.some((e) => e.par.neuronDeviceId === extra.neurona);
    if (!extra || yaLocal) return locales;
    return () => [...(locales ? locales() : []), extra.abrirCanal(sesionId, clave)];
}

/** Para «Reintentar» tras una llamada sin audio (solo quien llamó). */
let ultimaSinChat: Parameters<typeof empezarLlamadaSinChat>[0] | null = null;

function llamadaEnCurso(): LlamadaActiva | null {
    const a = leerLlamadas().activa;
    return a && !a.motor.cerrada ? a : null;
}

/** Deja activa la llamada y vigila su final (registro, cierre de sesión, sin respuesta…). */
function activar(a: LlamadaActiva) {
    ponerActiva(a);
    let finalizada = false;
    const sinRespuesta = a.esCreador
        ? setTimeout(() => {
              const s = a.motor.estado();
              if (!s.contestada && !a.motor.cerrada) a.motor.colgar("Nadie ha contestado.");
          }, ESPERA_RESPUESTA_MS)
        : null;
    const baja = a.motor.suscribir((s) => {
        if (!finalizada && a.unoAUno && !s.contestada && s.rechazos.length && !a.motor.cerrada) {
            a.motor.colgar(`${s.rechazos[0].nombre} no puede atender ahora.`);
            return;
        }
        if (finalizada || (s.fase !== "terminada" && s.fase !== "llena" && s.fase !== "error")) return;
        finalizada = true;
        if (sinRespuesta) clearTimeout(sinRespuesta);
        baja();
        const res = a.motor.resumen();
        // Quien creó la llamada la da por cerrada al colgar solo, o si no pudo ni entrar (canal
        // privado denegado…): así la tarjeta del chat deja de escuchar y nadie entra a una vacía.
        if (a.esCreador && (s.fase === "terminada" || (s.fase === "error" && !res.contestada))) {
            if (a.mensajeId && a.adjunto) {
                void registrarFinLlamada(a.mensajeId, a.adjunto, { fin: new Date(), duracionMs: res.duracionMs, contestada: res.contestada });
            }
            // (GRP1107A) Una sala de grupo por la malla no existe en el servidor: no hay nada que cerrar.
            if (res.otrosDentro === 0 && !esSalaGrupoMalla(a.sesionId)) void terminarSesion(a.sesionId).catch(() => null);
        }
        // «Llena» y «error» esperan a que la persona lea el motivo y cierre.
        if (s.fase === "terminada") setTimeout(() => quitarActiva(a), PAUSA_RESUMEN_MS);
    });
}

/** (GRP1107A) Para la llamada de grupo por la malla (`grupo-malla-motor.ts`): misma vigilancia. */
export function activarLlamada(a: LlamadaActiva): void {
    activar(a);
}

/** (GRP1107A) ¿Hay una llamada en curso en esta pestaña? */
export function hayLlamadaEnCurso(): boolean {
    return !!llamadaEnCurso();
}

function mensajeCrear(error: string | null): string {
    const clase = clasificarErrorSesion(error, null);
    if (clase === "no-desplegada") return MENSAJE_SESION["no-desplegada"].titulo + ". " + MENSAJE_SESION["no-desplegada"].detalle;
    if (clase === "prohibida") return "No tienes permiso para abrir una llamada en este chat.";
    return "No se pudo abrir la llamada. Revisa tu conexión y vuelve a intentarlo.";
}

/** (NEU1107A) ¿Hay red? (`navigator.onLine`; sin navegador se da por buena). */
function enLinea(): boolean {
    return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** (NEU1107A) Los enlaces locales vivos, sin funciones, para la decisión pura. */
function enlacesParaDecidir(vivos: EnlaceLocalVivo[]): EnlaceLlamadaChat[] {
    return vivos.map((e) => {
        let abierto = false;
        try {
            abierto = e.abierto();
        } catch {
            abierto = false;
        }
        let capacidadKbps: number | null = null;
        let rttMs: number | null = null;
        try {
            capacidadKbps = e.capacidadKbps();
            rttMs = e.rttMs();
        } catch {
            /* sin medidas: «sin medir» */
        }
        return { id: e.id, nombre: e.par.nombre || "Aparato vinculado", abierto, ...(e.par.uid ? { uid: e.par.uid } : {}), capacidadKbps, rttMs };
    });
}

/** Empieza una llamada en un chat: sesión → aviso en el chat → ventana de llamada. */
export async function empezarLlamada(o: {
    hiloId: string;
    tipo: TipoLlamada;
    titulo: string;
    miembros: string[];
    /** (NEU1107A) Para leer los ajustes de medio del chat (por defecto: «dm» si sois dos). */
    tipoChat?: "dm" | "grupo";
}): Promise<boolean> {
    const actual = llamadaEnCurso();
    if (actual) {
        if (actual.hiloId === o.hiloId) {
            minimizarLlamada(false);
            return true;
        }
        toast.error("Ya estás en una llamada. Cuelga antes de empezar otra.");
        return false;
    }
    if (!soportaLlamadas()) {
        const s = await motivoSinLlamadas(o.tipo === "video");
        avisarFalloMedios(s.motivo, s.ajustes);
        return false;
    }
    const yo = await miIdentidad();
    // (NEU1107A) Por dónde va, con los ajustes de medio de ESTE chat: servidor (+ enlaces directos
    // con aparatos de este chat), llamada directa por el enlace sin internet, o el motivo de que no.
    const tipoChat = o.tipoChat ?? (new Set(o.miembros).size <= 2 ? "dm" : "grupo");
    const vivos = enlacesLocalesVivos();
    const plan = planLlamadaChat({
        preferencias: preferenciasEfectivas(claveChat(tipoChat, o.hiloId)),
        internet: enLinea(),
        sesion: !!yo,
        miembros: o.miembros,
        miUid: yo?.uid ?? null,
        enlaces: enlacesParaDecidir(vivos),
        tipoLlamada: o.tipo,
    });
    const directa = async (otroUid: string): Promise<boolean> => {
        // Sin servidor: llamada directa 1:1 (timbre, voz, vídeo) y su burbuja por la malla.
        try {
            const ln = await import("@/lib/mensajeria/neuronas/llamadas-neurona");
            const r = await ln.llamarEnChatMalla({ hiloId: o.hiloId, tipoChat, otroUid, tipo: o.tipo === "video" ? "video" : "audio" });
            if (!r.ok) toast.error(r.motivo ?? "No se pudo llamar por el enlace sin internet.");
            else toast.message("Llamada directa por el enlace sin internet (sin servidores).");
            return r.ok;
        } catch {
            toast.error("No se pudo llamar por el enlace sin internet.");
            return false;
        }
    };
    // (GRP1107A) Grupo sin servidor: malla completa por los enlaces sin internet de cada par.
    const grupal = async (g: PlanGrupoMalla): Promise<boolean> => {
        try {
            const m = await import("@/lib/llamadas/grupo-malla-motor");
            const r = await m.empezarLlamadaGrupoMalla({ hiloId: o.hiloId, tipoChat, tipo: o.tipo === "video" ? "video" : "audio", titulo: o.titulo, miembros: o.miembros, plan: g });
            if (!r.ok) toast.error(r.motivo ?? "No se pudo llamar al grupo por la malla.");
            else toast.message(g.texto);
            return r.ok;
        } catch {
            toast.error("No se pudo llamar al grupo por la malla.");
            return false;
        }
    };
    if (plan.via === "enlace-local" && plan.otroUid) return directa(plan.otroUid);
    if (plan.via === "malla-grupo" && plan.grupo) return grupal(plan.grupo);
    if (plan.via === null) {
        toast.error(plan.aviso ?? "No hay cómo llamar ahora.");
        return false;
    }
    if (!yo) {
        toast.error("Inicia sesión para llamar.");
        return false;
    }
    const conVideo = o.tipo === "video";
    const [medios, ice] = await Promise.all([obtenerMedios({ audio: true, video: conVideo }), obtenerIceServidores()]);
    if (!medios.stream) {
        avisarFalloMedios(medios.error ?? "No se pudo usar el micrófono.", medios.ajustes);
        return false;
    }
    const { sesion, error } = await crearSesion({
        tipo: `llamada:${o.tipo}`,
        hiloId: o.hiloId,
        titulo: o.titulo || TEXTO_TIPO[o.tipo].nombre,
        acceso: { modo: "chat", permiso: "editar" },
    });
    if (!sesion) {
        pararStream(medios.stream);
        // (NEU1107A) El servidor no responde (red cautiva, caída…): si hay enlace sin internet con
        // la otra persona y el chat lo permite, la llamada va directa por él.
        const sinServidor = planLlamadaChat({
            preferencias: preferenciasEfectivas(claveChat(tipoChat, o.hiloId)),
            internet: false,
            sesion: true,
            miembros: o.miembros,
            miUid: yo.uid ?? null,
            enlaces: enlacesParaDecidir(enlacesLocalesVivos()),
            tipoLlamada: o.tipo,
        });
        if (sinServidor.via === "enlace-local" && sinServidor.otroUid) return directa(sinServidor.otroUid);
        if (sinServidor.via === "malla-grupo" && sinServidor.grupo) return grupal(sinServidor.grupo);
        toast.error(mensajeCrear(error));
        return false;
    }
    // (NEU1107A) La sesión se acaba de crear en el servidor: HAY red hacia él, aunque no haya TURN
    // (antes se deducía de la fuente ICE y, sin TURN, se quitaba hasta el STUN). Solo los enlaces
    // que el plan permite (aparatos de este chat o de tu cuenta, y «local» entre los medios).
    const hayRedSupabase = true;
    const enlaces = vivos.filter((e) => plan.directos.includes(e.id));
    const decision = canalesParaLlamada({ hayRedSupabase, enlaces, tema: temaLlamada(sesion.id) });
    const adjunto = crearAdjuntoLlamada(o.tipo, sesion.id);
    const msg = await sendMessage(o.hiloId, { body: TEXTO_TIPO[o.tipo].nombre, attachments: [adjunto] });
    if (!msg) {
        pararStream(medios.stream);
        void terminarSesion(sesion.id).catch(() => null);
        toast.error("No se pudo avisar en el chat. Inténtalo de nuevo.");
        return false;
    }
    const miembros = Array.from(new Set(o.miembros));
    if (miembros.length > MAX_PARTICIPANTES) {
        toast.message(`En este chat sois ${miembros.length}; en la llamada caben ${MAX_PARTICIPANTES} a la vez.`);
    }
    const unoAUno = miembros.length <= 2;
    const sesionId = sesion.id;
    const tipoCanal = tipoCanalDirecto(decision, hayRedSupabase);
    const iceServidores = tipoCanal === "directo" ? [] : ice.iceServers;
    const motor = new MotorLlamada({
        sesionId,
        yo,
        colgarAlQuedarSolo: unoAUno,
        iceServers: iceServidores,
        hayTurn: ice.turn && tipoCanal !== "directo",
        tema: temaLlamada(sesionId),
        resolverTema: () => resolverTemaSesion("llamada", sesionId, { fresco: true }),
        canalesDirectos: decision.enlaces.length > 0
            ? () => decision.enlaces.map((e) => abrirCanalLlamadaPorEnlace(e, sesionId, clavePestana(yo.base)))
            : undefined,

    });
    await motor.prepararMedios({ audio: true, video: conVideo, stream: medios.stream });
    if (medios.aviso) motor.avisar(medios.aviso);
    activar({
        sesionId: sesion.id,
        tipo: o.tipo,
        hiloId: o.hiloId,
        titulo: o.titulo || TEXTO_TIPO[o.tipo].nombre,
        mensajeId: msg.id,
        adjunto,
        esCreador: true,
        token: null,
        unoAUno,
        motor,
        minimizada: false,
    });
    motor.entrar();
    return true;
}

/**
 * (NEU1107A) Llamada SIN chat: con una neurona (de tu cuenta o de otra que comparte un cerebro
 * contigo). Mismo motor y mismos canales que `empezarLlamada` (con los enlaces locales como canal
 * directo si los hay), pero la sesión no cuelga de ningún hilo y el timbre lo da quien llama con
 * `avisar` (por el chat de la neurona). `pistaPantalla`: la pantalla ya pedida con el gesto de la
 * persona (el navegador solo la da en el mismo gesto); va como la pista de vídeo de la llamada.
 */
export async function empezarLlamadaSinChat(o: {
    tipo: TipoLlamada;
    titulo: string;
    /** Otras cuentas que pueden entrar (vacío = solo tu cuenta). */
    invitados: string[];
    pistaPantalla?: MediaStreamTrack | null;
    avisar: (sesionId: string) => Promise<boolean>;
    /** (LLA1108E) Neurona a la que se llama: con ella, la señalización y la voz pueden ir por Bluetooth u otro enlace sin IP. */
    neurona?: string | null;
}): Promise<{ ok: boolean; sesionId?: string; motivo?: string; ajustes?: AjustesMedios | null }> {
    ultimaSinChat = { ...o, pistaPantalla: null };
    const soltarPantalla = () => {
        try {
            o.pistaPantalla?.stop();
        } catch {
            /* noop */
        }
    };
    if (llamadaEnCurso()) {
        soltarPantalla();
        return { ok: false, motivo: "Ya estás en una llamada. Cuelga antes de empezar otra." };
    }
    if (!soportaLlamadas()) {
        soltarPantalla();
        const s = await motivoSinLlamadas(o.tipo === "video");
        return { ok: false, motivo: s.motivo, ajustes: s.ajustes };
    }
    const yo = await miIdentidad();
    if (!yo) {
        soltarPantalla();
        return { ok: false, motivo: "Inicia sesión para llamar." };
    }
    const conVideo = o.tipo === "video" && !o.pistaPantalla;
    const [medios, ice] = await Promise.all([obtenerMedios({ audio: true, video: conVideo }), obtenerIceServidores()]);
    if (!medios.stream) {
        soltarPantalla();
        return { ok: false, motivo: medios.error ?? "No se pudo usar el micrófono.", ajustes: medios.ajustes ?? null };
    }
    if (o.pistaPantalla) {
        try {
            medios.stream.addTrack(o.pistaPantalla);
        } catch {
            /* sin pantalla: sigue como llamada de voz */
        }
    }
    const invitados = Array.from(new Set(o.invitados.filter(Boolean)));
    const { sesion, error } = await crearSesion({
        tipo: `llamada:${o.tipo}`,
        titulo: o.titulo || TEXTO_TIPO[o.tipo].nombre,
        invitados,
        ...(invitados.length ? { acceso: { modo: "invitados" as const, permiso: "editar" as const } } : {}),
    });
    if (!sesion) {
        pararStream(medios.stream);
        return { ok: false, motivo: mensajeCrear(error) };
    }
    const sesionId = sesion.id;
    // Sesión recién creada en el servidor: hay red hacia él. Enlaces directos solo con aparatos
    // de tu cuenta o de quien invitas (nunca con los de otras personas).
    const hayRedSupabase = true;
    const vivos = enlacesLocalesVivos();
    const { utiles } = enlacesDelChat(enlacesParaDecidir(vivos), invitados, yo.uid ?? null);
    const permitidos = new Set(utiles.map((u) => u.id));
    const decision = canalesParaLlamada({ hayRedSupabase, enlaces: vivos.filter((e) => permitidos.has(e.id)), tema: temaLlamada(sesionId) });
    const tipoCanal = tipoCanalDirecto(decision, hayRedSupabase);
    const extra = await extrasDeNeurona(o.neurona);
    const motor = new MotorLlamada({
        sesionId,
        yo,
        colgarAlQuedarSolo: true,
        iceServers: tipoCanal === "directo" ? [] : ice.iceServers,
        hayTurn: ice.turn && tipoCanal !== "directo",
        tema: temaLlamada(sesionId),
        resolverTema: () => resolverTemaSesion("llamada", sesionId, { fresco: true }),
        canalesDirectos: unirCanales(
            decision.enlaces.length > 0 ? () => decision.enlaces.map((e) => abrirCanalLlamadaPorEnlace(e, sesionId, clavePestana(yo.base))) : undefined,
            extra,
            decision.enlaces,
            sesionId,
            clavePestana(yo.base),
        ),
        vozDatos: extra?.voz,
    });
    await motor.prepararMedios({ audio: true, video: conVideo || !!o.pistaPantalla, stream: medios.stream });
    if (medios.aviso) motor.avisar(medios.aviso);
    let avisado = false;
    try {
        avisado = await o.avisar(sesionId);
    } catch {
        avisado = false;
    }
    if (!avisado) {
        pararStream(medios.stream);
        void terminarSesion(sesionId).catch(() => null);
        return { ok: false, motivo: "La neurona no recibió el aviso de la llamada (sin medio disponible ahora)." };
    }
    activar({
        sesionId,
        tipo: o.tipo,
        hiloId: null,
        titulo: o.titulo || TEXTO_TIPO[o.tipo].nombre,
        mensajeId: null,
        adjunto: null,
        esCreador: true,
        token: null,
        unoAUno: true,
        motor,
        minimizada: false,
    });
    motor.entrar();
    return { ok: true, sesionId };
}

/**
 * Entra en una llamada ya abierta (enlace, tarjeta del chat o timbre aceptado).
 * Devuelve un error en claro, o null si entró.
 */
export async function unirseALlamada(o: {
    sesionId: string;
    tipo: TipoLlamada;
    hiloId: string | null;
    titulo: string;
    identidad?: Identidad | null;
    token?: string | null;
    /** Stream de la vista previa (si la persona la probó). */
    stream?: MediaStream | null;
    microActivo?: boolean;
    camara?: boolean;
    unoAUno?: boolean;
    /** (LLA1108E) Neurona que llama: con ella se puede entrar sin internet (señalización y voz por el enlace de datos). */
    neurona?: string | null;
}): Promise<string | null> {
    const actual = llamadaEnCurso();
    if (actual) {
        if (actual.sesionId === o.sesionId) {
            minimizarLlamada(false);
            return null;
        }
        return "Ya estás en otra llamada. Cuelga antes de unirte a esta.";
    }
    if (!soportaLlamadas()) return (await motivoSinLlamadas(o.camara ?? o.tipo === "video")).motivo;
    const yo = o.identidad ?? (await miIdentidad());
    if (!yo) return "Inicia sesión (o entra con un enlace público) para unirte.";
    const conVideo = o.camara ?? o.tipo === "video";
    const [ice, tema] = await Promise.all([obtenerIceServidores(), resolverTemaSesion("llamada", o.sesionId, { token: o.token, fresco: true })]);
    // (LLA1108E) Sin internet no se puede preguntar al servidor qué canal toca: con la neurona que llama se entra igualmente
    // por el enlace de datos (antes se quedaba en «conectando» para siempre o decía que el enlace no era válido).
    if (!tema && !o.neurona) return "Este enlace de llamada no es válido.";
    const extra = await extrasDeNeurona(o.neurona);
    // (NEU1107A) Sin TURN la fuente ICE es «stun» aunque haya internet: eso no quiere decir que
    // falte la red (si no, con un enlace local se quitaba hasta el STUN y fallaba por internet).
    const hayRedSupabase = enLinea() || ice.fuente !== "stun";
    const enlaces = enlacesLocalesVivos();
    const decision = canalesParaLlamada({ hayRedSupabase, enlaces, tema });
    const tipoCanal = tipoCanalDirecto(decision, hayRedSupabase);
    const iceServidores = tipoCanal === "directo" ? [] : ice.iceServers;
    const motor = new MotorLlamada({
        sesionId: o.sesionId,
        yo,
        colgarAlQuedarSolo: !!o.unoAUno,
        iceServers: iceServidores,
        hayTurn: ice.turn && tipoCanal !== "directo",
        tema,
        resolverTema: () => resolverTemaSesion("llamada", o.sesionId, { token: o.token, fresco: true }),
        canalesDirectos: unirCanales(
            decision.enlaces.length > 0 ? () => decision.enlaces.map((e) => abrirCanalLlamadaPorEnlace(e, o.sesionId, clavePestana(yo.base))) : undefined,
            extra,
            decision.enlaces,
            o.sesionId,
            clavePestana(yo.base),
        ),
        vozDatos: extra?.voz,
    });
    if (o.stream) {
        await motor.prepararMedios({ audio: true, video: conVideo, microActivo: o.microActivo, stream: o.stream });
    } else {
        const r = await motor.prepararMedios({ audio: true, video: conVideo, microActivo: o.microActivo });
        if (!r.audio && r.error) motor.avisar(`${r.error} Entras sin micrófono: puedes escuchar y activarlo luego.`);
    }
    activar({
        sesionId: o.sesionId,
        tipo: o.tipo,
        hiloId: o.hiloId,
        titulo: o.titulo || TEXTO_TIPO[o.tipo].nombre,
        mensajeId: null,
        adjunto: null,
        esCreador: false,
        token: o.token ?? null,
        unoAUno: !!o.unoAUno,
        motor,
        minimizada: false,
    });
    motor.entrar();
    return null;
}

export async function aceptarTimbre(t: TimbreEntrante, opciones: { camara?: boolean } = {}): Promise<void> {
    quitarTimbre(t.sesionId);
    if (t.malla) {
        // (GRP1107A) Invitación de grupo por la malla: se entra por los enlaces, sin servidor.
        try {
            const g = await import("@/lib/llamadas/grupo-malla-motor");
            const r = await g.unirseAGrupoMalla(t, opciones);
            if (!r.ok) toast.error(r.motivo ?? "No se pudo entrar en la llamada por la malla.");
        } catch {
            toast.error("No se pudo entrar en la llamada por la malla.");
        }
        return;
    }
    const error = await unirseALlamada({
        sesionId: t.sesionId,
        tipo: t.tipo,
        hiloId: t.hiloId,
        titulo: t.tituloHilo ?? t.llamante.nombre,
        camara: opciones.camara ?? t.tipo === "video",
        unoAUno: t.tipoHilo === "dm",
        neurona: t.neurona ?? null,
    });
    if (error) toast.error(error);
}

/**
 * (LLA1108E) «Reintentar» tras una llamada que acabó sin audio: vuelve a llamar a la misma neurona (quien llamó).
 * Cierra la ventana de la llamada fallida y empieza otra con un timbre nuevo.
 */
export async function reintentarLlamadaSinChat(): Promise<{ ok: boolean; motivo?: string }> {
    const o = ultimaSinChat;
    if (!o) return { ok: false, motivo: "No hay una llamada que reintentar." };
    const a = leerLlamadas().activa;
    if (a) quitarActiva(a);
    const r = await empezarLlamadaSinChat(o);
    return { ok: r.ok, motivo: r.motivo };
}

/** Rechaza un timbre y se lo dice a quien llama (en un 1:1, su llamada se cierra sola). */
export async function rechazarTimbre(t: TimbreEntrante): Promise<void> {
    quitarTimbre(t.sesionId);
    if (t.malla) {
        // (GRP1107A) La respuesta vuelve por el enlace por el que llegó la invitación.
        try {
            const g = await import("@/lib/llamadas/grupo-malla-motor");
            await g.rechazarGrupoMalla(t);
        } catch {
            /* sin enlace: quien llama verá que no contestó */
        }
        return;
    }
    const [tema, yo] = await Promise.all([resolverTemaSesion("llamada", t.sesionId), miIdentidad()]);
    const canal = tema ? abrirCanalLlamada(t.sesionId, { tema }) : null;
    if (!canal) return;
    canal.enviar({ tipo: "rechazo", de: clavePestana(yo?.base ?? "anon"), uid: yo?.uid ?? null, nombre: yo?.nombre ?? "Alguien" });
    let soltado = false;
    const soltar = () => {
        if (soltado) return;
        soltado = true;
        canal.soltar();
    };
    if (canal.suscrito()) setTimeout(soltar, 800);
    else {
        const baja = canal.onSuscrito((ok) => {
            if (!ok) return;
            baja();
            setTimeout(soltar, 800);
        });
        setTimeout(soltar, 5000);
    }
}

/**
 * Tras cambiar el acceso de la llamada en curso (p. ej. crear o revocar su enlace público desde
 * «Invitar»), la llamada pregunta qué canal toca y avisa a los demás para que lo sumen.
 */
export function revisarCanalLlamada(): Promise<boolean> {
    const a = leerLlamadas().activa;
    if (!a || a.motor.cerrada) return Promise.resolve(false);
    olvidarTemaSesion("llamada", a.sesionId);
    return a.motor.revisarCanal(true);
}

export function colgarLlamada(motivo?: string) {
    const a = leerLlamadas().activa;
    if (!a) return;
    if (a.motor.cerrada) {
        quitarActiva(a);
        return;
    }
    a.motor.colgar(motivo);
}

/** Cierra la ventana de una llamada ya terminada (o llena/con error). */
export function cerrarVentanaLlamada() {
    const a = leerLlamadas().activa;
    if (!a) return;
    if (!a.motor.cerrada) a.motor.colgar();
    quitarActiva(a);
}

/* ───────────────────────────── Timbres entrantes ───────────────────────────── */

/**
 * Convierte un mensaje con llamada entrante en un timbre: nombre y foto de quien llama, tipo y
 * título del chat. Dos consultas pequeñas, solo cuando de verdad suena algo.
 */
export async function prepararTimbre(
    msg: Pick<DmMessage, "id" | "threadId" | "sender">,
    adjunto: AdjuntoLlamadaRegistro,
    silenciadoDe: (hiloId: string, tipoHilo: "dm" | "grupo") => boolean,
): Promise<TimbreEntrante | null> {
    if (!msg.sender) return null;
    let tipoHilo: "dm" | "grupo" = "dm";
    let tituloHilo: string | null = null;
    try {
        const { data } = await createClient().from("os_dm_threads").select("kind,title").eq("id", msg.threadId).maybeSingle();
        const fila = data as { kind?: string; title?: string | null } | null;
        if (fila?.kind === "group") tipoHilo = "grupo";
        if (fila?.title) tituloHilo = sanearNombre(fila.title, "");
    } catch {
        /* sin datos del hilo: se trata como 1:1 */
    }
    let nombre = "Alguien";
    let avatar: string | null = null;
    try {
        const perfiles = await fetchProfilesByIds([msg.sender]);
        const p = perfiles[msg.sender];
        if (p) {
            nombre = sanearNombre(p.displayName || p.username, "Alguien");
            avatar = urlAvatarSegura(p.avatarUrl);
        }
    } catch {
        /* sin perfil: nombre genérico */
    }
    let silenciado = false;
    try {
        silenciado = silenciadoDe(msg.threadId, tipoHilo);
    } catch {
        silenciado = false;
    }
    return {
        sesionId: adjunto.sesionId,
        tipo: adjunto.tipoLlamada,
        hiloId: msg.threadId,
        tipoHilo,
        tituloHilo: tipoHilo === "grupo" ? tituloHilo : null,
        mensajeId: msg.id,
        llamante: { uid: msg.sender, nombre, avatar },
        silenciado,
        llegada: Date.now(),
    };
}

export { agregarTimbre, quitarTimbre, minimizarLlamada };
