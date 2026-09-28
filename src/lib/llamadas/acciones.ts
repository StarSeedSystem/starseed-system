"use client";

/**
 * Acciones de llamada: empezar desde un chat, aceptar/rechazar un timbre, unirse por enlace o
 * desde la tarjeta, y colgar. Todas empiezan por un gesto de la persona (un botón), que es
 * cuando se piden micro y cámara.
 */
import { toast } from "sonner";
import { sendMessage, type DmMessage } from "@/lib/messages/dm";
import { crearSesion, terminarSesion } from "@/lib/mensajeria/sesiones-vivas";
import type { TipoLlamada } from "@/lib/mensajeria/formato-tipos";
import { fetchProfilesByIds } from "@/lib/social/os-profiles";
import { createClient } from "@/utils/supabase/client";
import { MotorLlamada } from "@/lib/llamadas/motor";
import { obtenerMedios, pararStream, soportaLlamadas } from "@/lib/llamadas/medios";
import { clavePestana, miIdentidad, type Identidad } from "@/lib/llamadas/identidad";
import { crearAdjuntoLlamada, ESPERA_RESPUESTA_MS } from "@/lib/llamadas/adjunto";
import { TEXTO_TIPO } from "@/lib/llamadas/formato";
import { clasificarErrorSesion, MENSAJE_SESION } from "@/lib/llamadas/errores";
import { registrarFinLlamada } from "@/lib/llamadas/registro";
import { abrirCanalLlamada } from "@/lib/llamadas/senalizacion";
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
        if (a.esCreador && s.fase === "terminada") {
            if (a.mensajeId && a.adjunto) {
                void registrarFinLlamada(a.mensajeId, a.adjunto, { fin: new Date(), duracionMs: res.duracionMs, contestada: res.contestada });
            }
            if (res.otrosDentro === 0) void terminarSesion(a.sesionId).catch(() => null);
        }
        // «Llena» y «error» esperan a que la persona lea el motivo y cierre.
        if (s.fase === "terminada") setTimeout(() => quitarActiva(a), PAUSA_RESUMEN_MS);
    });
}

function mensajeCrear(error: string | null): string {
    const clase = clasificarErrorSesion(error, null);
    if (clase === "no-desplegada") return MENSAJE_SESION["no-desplegada"].titulo + ". " + MENSAJE_SESION["no-desplegada"].detalle;
    if (clase === "prohibida") return "No tienes permiso para abrir una llamada en este chat.";
    return "No se pudo abrir la llamada. Revisa tu conexión y vuelve a intentarlo.";
}

/** Empieza una llamada en un chat: sesión → aviso en el chat → ventana de llamada. */
export async function empezarLlamada(o: { hiloId: string; tipo: TipoLlamada; titulo: string; miembros: string[] }): Promise<boolean> {
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
        toast.error("Este navegador no permite llamadas: hace falta una conexión segura (https) y un navegador actual.");
        return false;
    }
    const yo = await miIdentidad();
    if (!yo) {
        toast.error("Inicia sesión para llamar.");
        return false;
    }
    const conVideo = o.tipo === "video";
    const medios = await obtenerMedios({ audio: true, video: conVideo });
    if (!medios.stream) {
        toast.error(medios.error ?? "No se pudo usar el micrófono.");
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
        toast.error(mensajeCrear(error));
        return false;
    }
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
    const motor = new MotorLlamada({ sesionId: sesion.id, yo, colgarAlQuedarSolo: unoAUno });
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
}): Promise<string | null> {
    const actual = llamadaEnCurso();
    if (actual) {
        if (actual.sesionId === o.sesionId) {
            minimizarLlamada(false);
            return null;
        }
        return "Ya estás en otra llamada. Cuelga antes de unirte a esta.";
    }
    if (!soportaLlamadas()) return "Este navegador no permite llamadas: hace falta una conexión segura (https) y un navegador actual.";
    const yo = o.identidad ?? (await miIdentidad());
    if (!yo) return "Inicia sesión (o entra con un enlace público) para unirte.";
    const conVideo = o.camara ?? o.tipo === "video";
    const motor = new MotorLlamada({ sesionId: o.sesionId, yo, colgarAlQuedarSolo: !!o.unoAUno });
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
    const error = await unirseALlamada({
        sesionId: t.sesionId,
        tipo: t.tipo,
        hiloId: t.hiloId,
        titulo: t.tituloHilo ?? t.llamante.nombre,
        camara: opciones.camara ?? t.tipo === "video",
        unoAUno: t.tipoHilo === "dm",
    });
    if (error) toast.error(error);
}

/** Rechaza un timbre y se lo dice a quien llama (en un 1:1, su llamada se cierra sola). */
export async function rechazarTimbre(t: TimbreEntrante): Promise<void> {
    quitarTimbre(t.sesionId);
    const canal = abrirCanalLlamada(t.sesionId);
    if (!canal) return;
    const yo = await miIdentidad();
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
