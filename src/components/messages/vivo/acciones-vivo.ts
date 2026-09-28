"use client";

/**
 * Acciones de las apps en vivo (2026-09-28): lo que une la SESIÓN (`os_sesiones_vivas`, quién
 * puede entrar) con el RECURSO que sincroniza de verdad (hoy un `os_spaces`, ver
 * `catalogo-vivo.ts`). La sesión sola no abre nada: si una persona está invitada a la sesión
 * pero no al espacio, la pizarra no le carga. Por eso cada cambio de acceso se aplica a los dos.
 *
 * Todo devuelve mensajes en español y nunca lanza.
 */

import type { DmAttachment } from "@/lib/messages/dm";
import { createDm, listMembers, sendMessage } from "@/lib/messages/dm";
import type {
    AdjuntoVivo,
    ModoAcceso,
    PermisoVivo,
    SesionViva,
} from "@/lib/mensajeria/formato-tipos";
import {
    construirUrlPublica,
    crearEnlacePublico,
    crearSesion,
    esRutaInterna,
    esUuid,
    invitar,
    origenActual,
    revocarEnlacePublico,
    terminarSesion,
    tipoVivoDe,
} from "@/lib/mensajeria/sesiones-vivas";
import { createClient } from "@/utils/supabase/client";
import {
    entradaVivo,
    type EntradaCatalogoVivo,
    type OpcionesCrearVivo,
    type RecursoVivo,
} from "@/components/messages/vivo/catalogo-vivo";

// ───────────────────────────── Adjunto ─────────────────────────────

/** ¿Este adjunto es una app en vivo bien formada? */
export function esAdjuntoVivo(a: DmAttachment | null | undefined): a is AdjuntoVivo {
    if (!a || a.kind !== "vivo") return false;
    const v = a as Partial<AdjuntoVivo>;
    return esUuid(v.sesionId) && esRutaInterna(v.route) && tipoVivoDe(v.tipoVivo) !== null;
}

/** Título legible de una sesión (su título o el nombre del tipo). */
export function tituloDeSesion(s: Pick<SesionViva, "titulo" | "tipo">): string {
    return s.titulo?.trim() || entradaVivo(s.tipo)?.etiqueta || "App en vivo";
}

/** El adjunto que viaja en el mensaje. null si la sesión no es de una app en vivo o no tiene ruta. */
export function construirAdjuntoVivo(sesion: SesionViva): AdjuntoVivo | null {
    const tipoVivo = tipoVivoDe(sesion.tipo);
    if (!tipoVivo || !sesion.ruta) return null;
    return {
        kind: "vivo",
        tipoVivo,
        sesionId: sesion.id,
        route: sesion.ruta,
        name: tituloDeSesion(sesion),
        permiso: sesion.permiso,
    };
}

/** Texto plano del mensaje: «Pizarra: Plan del huerto». */
export function cuerpoMensajeVivo(entrada: Pick<EntradaCatalogoVivo, "etiqueta">, titulo: string): string {
    return `${entrada.etiqueta}: ${titulo}`;
}

// ───────────────────────────── Compartir ─────────────────────────────

export interface CompartirVivoInput {
    hiloId: string | null;
    entrada: EntradaCatalogoVivo;
    titulo: string;
    opciones?: OpcionesCrearVivo;
    /** Compartir un recurso que ya existe en vez de crear uno. */
    existente?: RecursoVivo | null;
    modo: ModoAcceso;
    permiso: PermisoVivo;
    invitados?: string[];
}

export type CompartirVivoResultado =
    | {
        ok: true;
        sesion: SesionViva;
        adjunto: AdjuntoVivo;
        body: string;
        urlPublica: string | null;
        /** Avisos no bloqueantes (p. ej. alguien quedó sin acceso al recurso). */
        avisos: string[];
    }
    | { ok: false; error: string };

function mensaje(e: unknown, generico: string): string {
    const m = (e as { message?: string } | null)?.message;
    return typeof m === "string" && m.trim() ? m : generico;
}

async function miembrosDelHilo(hiloId: string | null, excepto: string): Promise<string[]> {
    if (!hiloId) return [];
    const miembros = await listMembers(hiloId);
    return miembros.map((m) => m.userId).filter((u) => u && u !== excepto);
}

/**
 * Crea (o reutiliza) el recurso, abre la sesión, da acceso al recurso a quien corresponde y
 * devuelve el adjunto listo para `onEnviar`. Si la sesión no se puede abrir, el recurso recién
 * creado se borra (sin huérfanos).
 */
export async function compartirVivo(input: CompartirVivoInput): Promise<CompartirVivoResultado> {
    const { entrada } = input;
    if (!entrada.disponible || (!input.existente && !entrada.crear)) {
        return { ok: false, error: entrada.motivo ?? "Este tipo aún no se puede compartir en vivo." };
    }
    const titulo = input.titulo.trim().slice(0, 200) || input.existente?.titulo || entrada.etiqueta;

    let recurso: { refId: string; ruta: string };
    let creado = false;
    if (input.existente) {
        recurso = { refId: input.existente.refId, ruta: input.existente.ruta };
    } else {
        try {
            recurso = await entrada.crear!(titulo, input.opciones);
            creado = true;
        } catch (e) {
            return { ok: false, error: mensaje(e, `No se pudo crear ${entrada.etiqueta.toLowerCase()}.`) };
        }
    }

    // «invitados» = los del chat MÁS las personas elegidas (la RLS de la sesión siempre deja
    // entrar a los miembros del chat donde se compartió).
    const invitados = [...new Set((input.invitados ?? []).filter(esUuid))];
    const { sesion, error } = await crearSesion({
        tipo: `vivo:${entrada.tipo}`,
        hiloId: input.hiloId,
        titulo,
        refId: recurso.refId,
        ruta: recurso.ruta,
        acceso: { modo: input.modo, permiso: input.permiso },
        invitados: input.modo === "invitados" ? invitados : [],
    });
    if (!sesion) {
        if (creado && entrada.deshacerCreacion) {
            try {
                await entrada.deshacerCreacion(recurso.refId);
            } catch {
                /* best-effort */
            }
        }
        return { ok: false, error: error ?? "No se pudo abrir la sesión en vivo." };
    }

    const avisos: string[] = [];
    // Acceso al recurso: los del chat siempre (la RLS de la sesión ya les deja verla) y, en
    // «invitados», además las personas elegidas.
    if (entrada.concederAcceso) {
        const delChat = await miembrosDelHilo(input.hiloId, sesion.creador);
        const destinatarios = [...new Set([...delChat, ...sesion.invitados])].filter((u) => u !== sesion.creador);
        if (destinatarios.length > 0) {
            const concedidos = await entrada.concederAcceso(recurso.refId, destinatarios, sesion.permiso);
            const faltan = destinatarios.length - concedidos;
            if (faltan > 0) {
                avisos.push(
                    faltan === 1
                        ? "Una persona no recibió acceso todavía; puedes volver a invitarla desde la tarjeta."
                        : `${faltan} personas no recibieron acceso todavía; puedes volver a invitarlas desde la tarjeta.`,
                );
            }
        }
    }
    if (input.modo === "publico" && entrada.cambiarPublico) {
        const ok = await entrada.cambiarPublico(recurso.refId, true);
        if (!ok) avisos.push("El enlace público está creado, pero el contenido no quedó abierto a lectura pública.");
    }

    const adjunto = construirAdjuntoVivo(sesion);
    if (!adjunto) return { ok: false, error: "La sesión se abrió sin una app que abrir." };
    const urlPublica = input.modo === "publico" && sesion.tokenPublico
        ? construirUrlPublica(origenActual(), sesion, sesion.tokenPublico)
        : null;
    return { ok: true, sesion, adjunto, body: cuerpoMensajeVivo(entrada, titulo), urlPublica, avisos };
}

// ───────────────────────────── Invitar ─────────────────────────────

/** Máximo de mensajes directos de aviso por invitación (no inundar a nadie). */
export const MAX_AVISOS_DIRECTOS = 20;

/**
 * Manda la tarjeta de la sesión por mensaje directo a cada persona (hasta `MAX_AVISOS_DIRECTOS`).
 * Devuelve cuántos avisos salieron.
 */
export async function avisarPorMensaje(sesion: SesionViva, userIds: string[]): Promise<number> {
    const adjunto = construirAdjuntoVivo(sesion);
    if (!adjunto) return 0;
    const entrada = entradaVivo(sesion.tipo);
    const body = `Te invito a ${entrada ? entrada.etiqueta.toLowerCase() : "una app en vivo"}: ${tituloDeSesion(sesion)}`;
    let enviados = 0;
    for (const uid of [...new Set(userIds)].filter((u) => u !== sesion.creador).slice(0, MAX_AVISOS_DIRECTOS)) {
        try {
            const r = await createDm(uid);
            if (!r.ok || !r.thread) continue;
            const m = await sendMessage(r.thread.id, { body, attachments: [adjunto] });
            if (m) enviados += 1;
        } catch {
            /* sigue con la siguiente persona */
        }
    }
    return enviados;
}

export interface ResultadoInvitar {
    error: string | null;
    /** Cuántas personas recibieron acceso al recurso (null si el tipo no tiene recurso propio). */
    concedidos: number | null;
    avisados: number;
}

/** Invita a la sesión Y al recurso; opcionalmente avisa por mensaje directo. */
export async function invitarASesion(
    sesion: SesionViva,
    userIds: string[],
    opciones: { avisar?: boolean } = {},
): Promise<ResultadoInvitar> {
    const ids = [...new Set(userIds.filter(esUuid))].filter((u) => u !== sesion.creador);
    if (ids.length === 0) return { error: "Elige al menos a una persona.", concedidos: null, avisados: 0 };
    const error = await invitar(sesion.id, ids);
    if (error) return { error, concedidos: null, avisados: 0 };
    const entrada = entradaVivo(sesion.tipo);
    let concedidos: number | null = null;
    if (entrada?.concederAcceso && sesion.refId) {
        concedidos = await entrada.concederAcceso(sesion.refId, ids, sesion.permiso);
    }
    const avisados = opciones.avisar ? await avisarPorMensaje({ ...sesion, invitados: [...sesion.invitados, ...ids] }, ids) : 0;
    return { error: null, concedidos, avisados };
}

/** Personas de un grupo (os_memberships, sin solicitudes pendientes). Máx. 500. */
export async function miembrosDeGrupo(slug: string): Promise<string[]> {
    if (!slug) return [];
    try {
        const { data, error } = await createClient()
            .from("os_memberships")
            .select("user_id")
            .eq("group_slug", slug)
            .neq("role", "pending")
            .limit(500);
        if (error || !Array.isArray(data)) return [];
        return [...new Set((data as { user_id?: string }[]).map((r) => r.user_id).filter(esUuid))];
    } catch {
        return [];
    }
}

// ───────────────────────────── Enlace público y fin ─────────────────────────────

export async function activarEnlacePublico(
    sesion: SesionViva,
    permiso: PermisoVivo,
): Promise<{ url: string | null; error: string | null; aviso: string | null }> {
    const r = await crearEnlacePublico(sesion.id, permiso);
    if (!r.url) return { url: null, error: r.error ?? "No se pudo crear el enlace público.", aviso: null };
    const entrada = entradaVivo(sesion.tipo);
    let aviso: string | null = null;
    if (entrada?.cambiarPublico && sesion.refId) {
        const ok = await entrada.cambiarPublico(sesion.refId, true);
        if (!ok) aviso = "El enlace existe, pero el contenido no quedó abierto a lectura pública.";
    }
    return { url: r.url, error: null, aviso };
}

export async function desactivarEnlacePublico(sesion: SesionViva): Promise<string | null> {
    const error = await revocarEnlacePublico(sesion.id);
    if (error) return error;
    const entrada = entradaVivo(sesion.tipo);
    if (entrada?.cambiarPublico && sesion.refId) await entrada.cambiarPublico(sesion.refId, false);
    return null;
}

export async function terminarVivo(sesion: SesionViva): Promise<string | null> {
    const error = await terminarSesion(sesion.id);
    if (error) return error;
    const entrada = entradaVivo(sesion.tipo);
    if (sesion.modo === "publico" && entrada?.cambiarPublico && sesion.refId) {
        await entrada.cambiarPublico(sesion.refId, false);
    }
    return null;
}

/**
 * Quien entró al chat DESPUÉS de compartir no tiene acceso al recurso. Al abrir la tarjeta, su
 * creador lo reparte a los miembros actuales (una vez por sesión y visita).
 */
const sincronizadas = new Set<string>();
export async function sincronizarAccesoDelChat(sesion: SesionViva): Promise<void> {
    if (!sesion.hiloId || !sesion.refId) return;
    if (sincronizadas.has(sesion.id)) return;
    const entrada = entradaVivo(sesion.tipo);
    if (!entrada?.concederAcceso) return;
    sincronizadas.add(sesion.id);
    try {
        const destinatarios = await miembrosDelHilo(sesion.hiloId, sesion.creador);
        if (destinatarios.length > 0) await entrada.concederAcceso(sesion.refId, destinatarios, sesion.permiso);
    } catch {
        sincronizadas.delete(sesion.id);
    }
}

// ───────────────────────────── Portapapeles ─────────────────────────────

export async function copiarAlPortapapeles(texto: string): Promise<boolean> {
    try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(texto);
            return true;
        }
    } catch {
        /* cae al método antiguo */
    }
    try {
        if (typeof document === "undefined") return false;
        const area = document.createElement("textarea");
        area.value = texto;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(area);
        return ok;
    } catch {
        return false;
    }
}
