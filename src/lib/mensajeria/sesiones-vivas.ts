"use client";

/**
 * Sesiones vivas (2026-09-28) — la capa de datos de las «apps en vivo» y las llamadas que se
 * comparten en un chat (`os_sesiones_vivas`, migración 20260928120000).
 *
 * Una sesión es el PASE a algo que ya sincroniza por su cuenta (una pizarra o un escritorio
 * compartidos en `os_spaces`, una llamada…): dice quién puede entrar (los del chat, invitados
 * concretos o cualquiera con el enlace público), con qué permiso, y si sigue abierta. La app en
 * sí no vive aquí: vive en su `ruta`.
 *
 * Enlaces:
 *   · privado  `/vivo/<id>`           — hay que tener cuenta y ser del chat o invitado (RLS).
 *   · público  `/vivo/<id>?t=<token>` — cualquiera; entra por la RPC `unirse_sesion_publica`,
 *                                        que nunca devuelve el token.
 *   · llamadas usan `/llamada/<id>` con las mismas reglas.
 *
 * La migración puede no estar aplicada todavía en la base viva: toda llamada que choque con una
 * tabla o función que no existe devuelve `MENSAJE_SIN_DESPLEGAR` (sin lanzar, sin reintentar en
 * bucle — se recuerda en memoria el resto de la visita).
 *
 * Presencia: el recuento «N en la sesión» usa un canal de presencia PRIVADO de Supabase
 * (`vivo:<id>`, o `vivo:<id>:<token>` con enlace público; uno por tema y pestaña, compartido por
 * quien lo necesite). Quien está DENTRO de la app se anuncia (`usePresenciaEnSesion`); las
 * tarjetas solo escuchan, y solo mientras se ven.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { clasificarErrorCanal, MAX_RECHAZOS_CANAL } from "@/lib/llamadas/temas";
import {
    marcarTemaDenegado,
    prepararAuthRealtime,
    resolverTemaSesion,
    temaDenegadoReciente,
    tokenDeLaUrl,
} from "@/lib/llamadas/resolver-tema";
import type {
    AccesoVivo,
    ModoAcceso,
    PermisoVivo,
    SesionViva,
    SesionesVivasApi,
    TipoVivo,
} from "@/lib/mensajeria/formato-tipos";

// ───────────────────────────── Constantes ─────────────────────────────

export const TABLA_SESIONES_VIVAS = "os_sesiones_vivas";
export const RPC_UNIRSE_SESION_PUBLICA = "unirse_sesion_publica";
export const MENSAJE_SIN_DESPLEGAR = "Las sesiones en vivo aún no están activadas en este servidor";
export const MENSAJE_SIN_CUENTA = "Inicia sesión para compartir en vivo.";
export const MENSAJE_ENLACE_INVALIDO = "Este enlace no es válido.";
/** Evento de ventana tras cualquier cambio hecho desde esta pestaña (detail: { id }). */
export const EVENTO_SESIONES_VIVAS = "starseed:sesiones-vivas";

const MODOS: readonly ModoAcceso[] = ["chat", "invitados", "publico"];
const PERMISOS: readonly PermisoVivo[] = ["ver", "comentar", "editar"];
const TIPOS_VIVO: readonly TipoVivo[] = [
    "sala", "pizarra", "documento", "presentacion", "tabla", "navegador",
    "juego", "programa", "escritorio", "dashboard", "escena3d", "xr",
];
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esUuid(v: unknown): v is string {
    return typeof v === "string" && RE_UUID.test(v);
}

/**
 * Ruta interna del OS: empieza por «/» pero NO por «//» ni «/\\» (eso sería una URL de otro
 * sitio con el esquema implícito: `router.push("//evil.example")` saldría del OS).
 */
export function esRutaInterna(v: unknown): v is string {
    return typeof v === "string" && /^\/(?![\/\\])/.test(v) && !/[\u0000-\u001f]/.test(v);
}

// ───────────────────────────── Errores ─────────────────────────────

/** Recuerda (el resto de la visita) que la migración no está aplicada: nada de reintentos en bucle. */
let esquemaAusente = false;

/** Solo para pruebas: olvida que el esquema faltaba. */
export function reiniciarEstadoSesionesParaTests(): void {
    esquemaAusente = false;
    cacheSesiones.clear();
    for (const c of canales.values()) {
        try {
            c.cliente.removeChannel(c.canal);
        } catch {
            /* noop */
        }
    }
    canales.clear();
}

/** ¿El error dice «esa tabla / columna / función no existe» (servidor sin la migración)? */
export function esFaltaDeEsquema(error: unknown): boolean {
    const e = error as { code?: string; message?: string; details?: string } | null | undefined;
    if (!e) return false;
    const code = String(e.code ?? "");
    if (["42P01", "42883", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(code)) return true;
    const msg = `${e.message ?? ""} ${e.details ?? ""}`.toLowerCase();
    return (
        msg.includes("does not exist") ||
        msg.includes("could not find the table") ||
        msg.includes("could not find the function") ||
        msg.includes("schema cache")
    );
}

function mensajeDeError(error: unknown, generico: string): string {
    if (esFaltaDeEsquema(error)) {
        esquemaAusente = true;
        return MENSAJE_SIN_DESPLEGAR;
    }
    const e = error as { code?: string; message?: string } | null | undefined;
    if (e?.code === "42501") return "No tienes permiso para hacer esto en esta sesión.";
    if (e?.code === "22P02") return MENSAJE_ENLACE_INVALIDO;
    return generico;
}

// ───────────────────────────── Tokens y enlaces ─────────────────────────────

/** Bytes → base64url sin relleno (RFC 4648 §5). */
export function bytesABase64Url(bytes: Uint8Array): string {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Token del enlace público: 32 bytes aleatorios de `crypto.getRandomValues`, en base64url (43 caracteres). */
export function generarTokenPublico(): string {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    return bytesABase64Url(bytes);
}

export function esTipoLlamada(tipo: string | null | undefined): boolean {
    return typeof tipo === "string" && tipo.startsWith("llamada:");
}

/** «vivo:pizarra» o «pizarra» → «pizarra»; cualquier otra cosa → null. */
export function tipoVivoDe(tipo: string | null | undefined): TipoVivo | null {
    if (typeof tipo !== "string") return null;
    const base = tipo.startsWith("vivo:") ? tipo.slice(5) : tipo;
    return (TIPOS_VIVO as readonly string[]).includes(base) ? (base as TipoVivo) : null;
}

/** Enlace privado (ruta relativa): `/vivo/<id>` o `/llamada/<id>`. */
export function enlacePrivado(sesion: Pick<SesionViva, "id" | "tipo">): string {
    const id = encodeURIComponent(sesion.id);
    return esTipoLlamada(sesion.tipo) ? `/llamada/${id}` : `/vivo/${id}`;
}

/** URL pública absoluta: `${origin}/vivo/<id>?t=<token>` (o `/llamada/…`). */
export function construirUrlPublica(origin: string, sesion: Pick<SesionViva, "id" | "tipo">, token: string): string {
    const base = (origin || "").replace(/\/+$/, "");
    return `${base}${enlacePrivado(sesion)}?t=${encodeURIComponent(token)}`;
}

/** Origen actual (vacío fuera del navegador). */
export function origenActual(): string {
    return typeof window !== "undefined" && window.location ? window.location.origin : "";
}

/** Una ruta interna → URL absoluta para copiar. */
export function urlAbsoluta(ruta: string): string {
    return `${origenActual()}${ruta}`;
}

/** Añade `sesion=<id>` a una ruta interna, respete o no ya una query. */
export function rutaConSesion(ruta: string, sesionId: string): string {
    const [sinHash, hash] = ruta.split("#", 2);
    const sep = sinHash.includes("?") ? "&" : "?";
    return `${sinHash}${sep}sesion=${encodeURIComponent(sesionId)}${hash !== undefined ? `#${hash}` : ""}`;
}

// ───────────────────────────── Filas ─────────────────────────────

function texto(v: unknown): string | null {
    return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Fila snake_case (tabla o RPC) → `SesionViva`. El token del enlace público solo se conserva
 * para quien creó la sesión: aunque la RLS se lo sirva a los miembros del chat, no sale de aquí.
 */
export function filaASesion(row: Record<string, unknown>, miUid: string | null): SesionViva {
    const creador = String(row.creador ?? "");
    const modo = MODOS.includes(row.modo as ModoAcceso) ? (row.modo as ModoAcceso) : "chat";
    const permiso = PERMISOS.includes(row.permiso as PermisoVivo) ? (row.permiso as PermisoVivo) : "editar";
    const invitados = Array.isArray(row.invitados)
        ? [...new Set((row.invitados as unknown[]).filter(esUuid))]
        : [];
    return {
        id: String(row.id ?? ""),
        tipo: typeof row.tipo === "string" ? row.tipo : "",
        hiloId: texto(row.hilo_id),
        creador,
        titulo: texto(row.titulo),
        refId: texto(row.ref_id),
        ruta: esRutaInterna(row.ruta) ? row.ruta : null,
        modo,
        permiso,
        invitados,
        tokenPublico: miUid && miUid === creador ? texto(row.token_publico) : null,
        estado: row.estado === "terminada" ? "terminada" : "activa",
        creada: typeof row.creada === "string" ? row.creada : new Date(0).toISOString(),
        caduca: texto(row.caduca),
    };
}

/** ¿Se puede entrar todavía? (activa y sin caducar). */
export function sesionVigente(s: Pick<SesionViva, "estado" | "caduca">, ahora: Date = new Date()): boolean {
    if (s.estado !== "activa") return false;
    if (!s.caduca) return true;
    const t = Date.parse(s.caduca);
    return Number.isNaN(t) || t > ahora.getTime();
}

// ───────────────────────────── Cliente y cuenta ─────────────────────────────

function cliente() {
    return createClient();
}

/** uid de la sesión local (sin ir a la red). */
export async function miUid(): Promise<string | null> {
    try {
        const { data } = await cliente().auth.getSession();
        return data?.session?.user?.id ?? null;
    } catch {
        return null;
    }
}

function avisarCambio(id: string): void {
    cacheSesiones.delete(id);
    if (typeof window === "undefined") return;
    try {
        window.dispatchEvent(new CustomEvent(EVENTO_SESIONES_VIVAS, { detail: { id } }));
    } catch {
        /* noop */
    }
}

// ───────────────────────────── API (SesionesVivasApi) ─────────────────────────────

export const crearSesion: SesionesVivasApi["crearSesion"] = async (input) => {
    if (esquemaAusente) return { sesion: null, error: MENSAJE_SIN_DESPLEGAR };
    const uid = await miUid();
    if (!uid) return { sesion: null, error: MENSAJE_SIN_CUENTA };
    const tipo = (input.tipo ?? "").trim();
    if (!tipo || tipo.length > 40) return { sesion: null, error: "Tipo de sesión no válido." };

    const invitados = [...new Set((input.invitados ?? []).filter(esUuid))].filter((u) => u !== uid);
    const modo: ModoAcceso = input.acceso?.modo && MODOS.includes(input.acceso.modo)
        ? input.acceso.modo
        : invitados.length > 0 ? "invitados" : "chat";
    const permiso: PermisoVivo = input.acceso?.permiso && PERMISOS.includes(input.acceso.permiso)
        ? input.acceso.permiso
        : "editar";
    const titulo = (input.titulo ?? "").trim().slice(0, 200) || null;
    const ruta = esRutaInterna(input.ruta) ? input.ruta : null;
    const token = modo === "publico" ? generarTokenPublico() : null;

    try {
        const { data, error } = await cliente()
            .from(TABLA_SESIONES_VIVAS)
            .insert({
                tipo,
                hilo_id: input.hiloId ?? null,
                creador: uid,
                titulo,
                ref_id: input.refId ?? null,
                ruta,
                modo,
                permiso,
                invitados,
                token_publico: token,
            })
            .select("*")
            .single();
        if (error || !data) {
            return { sesion: null, error: mensajeDeError(error, "No se pudo abrir la sesión en vivo.") };
        }
        const sesion = filaASesion(data as Record<string, unknown>, uid);
        avisarCambio(sesion.id);
        return { sesion, error: null };
    } catch (e) {
        return { sesion: null, error: mensajeDeError(e, "No se pudo abrir la sesión en vivo.") };
    }
};

export const obtenerSesion: SesionesVivasApi["obtenerSesion"] = async (id, token) => {
    if (!esUuid(id)) return { sesion: null, error: MENSAJE_ENLACE_INVALIDO };
    if (esquemaAusente) return { sesion: null, error: MENSAJE_SIN_DESPLEGAR };
    const uid = await miUid();
    try {
        if (token) {
            const { data, error } = await cliente().rpc(RPC_UNIRSE_SESION_PUBLICA, { _id: id, _token: token });
            if (error) return { sesion: null, error: mensajeDeError(error, "No se pudo abrir el enlace.") };
            const fila = Array.isArray(data) ? data[0] : data;
            if (!fila || typeof fila !== "object") return { sesion: null, error: null };
            return { sesion: filaASesion(fila as Record<string, unknown>, uid), error: null };
        }
        const { data, error } = await cliente()
            .from(TABLA_SESIONES_VIVAS)
            .select("*")
            .eq("id", id)
            .maybeSingle();
        if (error) return { sesion: null, error: mensajeDeError(error, "No se pudo leer la sesión.") };
        if (!data) return { sesion: null, error: null };
        return { sesion: filaASesion(data as Record<string, unknown>, uid), error: null };
    } catch (e) {
        return { sesion: null, error: mensajeDeError(e, "No se pudo leer la sesión.") };
    }
};

async function leerCampos(id: string): Promise<{ fila: Record<string, unknown> | null; error: string | null }> {
    const { data, error } = await cliente()
        .from(TABLA_SESIONES_VIVAS)
        .select("id, tipo, modo, invitados, creador")
        .eq("id", id)
        .maybeSingle();
    if (error) return { fila: null, error: mensajeDeError(error, "No se pudo leer la sesión.") };
    if (!data) return { fila: null, error: "No encuentro esa sesión (o no es tuya)." };
    return { fila: data as Record<string, unknown>, error: null };
}

export const invitar: SesionesVivasApi["invitar"] = async (id, userIds) => {
    if (!esUuid(id)) return MENSAJE_ENLACE_INVALIDO;
    if (esquemaAusente) return MENSAJE_SIN_DESPLEGAR;
    const nuevos = [...new Set((userIds ?? []).filter(esUuid))];
    if (nuevos.length === 0) return "Elige al menos a una persona.";
    try {
        const { fila, error } = await leerCampos(id);
        if (!fila) return error;
        const creador = String(fila.creador ?? "");
        const actuales = Array.isArray(fila.invitados) ? (fila.invitados as unknown[]).filter(esUuid) : [];
        const invitados = [...new Set([...actuales, ...nuevos])].filter((u) => u !== creador);
        const modoActual = MODOS.includes(fila.modo as ModoAcceso) ? (fila.modo as ModoAcceso) : "chat";
        const modo: ModoAcceso = modoActual === "chat" ? "invitados" : modoActual;
        const { data: hecho, error: e2 } = await cliente()
            .from(TABLA_SESIONES_VIVAS)
            .update({ invitados, modo })
            .eq("id", id)
            .select("id")
            .maybeSingle();
        if (e2) return mensajeDeError(e2, "No se pudo invitar.");
        if (!hecho) return "Solo quien abrió la sesión puede invitar a más personas.";
        avisarCambio(id);
        return null;
    } catch (e) {
        return mensajeDeError(e, "No se pudo invitar.");
    }
};

export const crearEnlacePublico: SesionesVivasApi["crearEnlacePublico"] = async (id, permiso) => {
    if (!esUuid(id)) return { url: null, error: MENSAJE_ENLACE_INVALIDO };
    if (esquemaAusente) return { url: null, error: MENSAJE_SIN_DESPLEGAR };
    const token = generarTokenPublico();
    const cambios: Record<string, unknown> = { token_publico: token, modo: "publico" };
    if (permiso && PERMISOS.includes(permiso)) cambios.permiso = permiso;
    try {
        const { data, error } = await cliente()
            .from(TABLA_SESIONES_VIVAS)
            .update(cambios)
            .eq("id", id)
            .select("id, tipo")
            .maybeSingle();
        if (error) return { url: null, error: mensajeDeError(error, "No se pudo crear el enlace público.") };
        if (!data) return { url: null, error: "Solo quien abrió la sesión puede crear su enlace público." };
        const fila = data as { id: string; tipo: string };
        avisarCambio(id);
        return { url: construirUrlPublica(origenActual(), { id: fila.id, tipo: fila.tipo }, token), error: null };
    } catch (e) {
        return { url: null, error: mensajeDeError(e, "No se pudo crear el enlace público.") };
    }
};

export const revocarEnlacePublico: SesionesVivasApi["revocarEnlacePublico"] = async (id) => {
    if (!esUuid(id)) return MENSAJE_ENLACE_INVALIDO;
    if (esquemaAusente) return MENSAJE_SIN_DESPLEGAR;
    try {
        const { fila, error } = await leerCampos(id);
        if (!fila) return error;
        const invitados = Array.isArray(fila.invitados) ? (fila.invitados as unknown[]).filter(esUuid) : [];
        const { data: hecho, error: e2 } = await cliente()
            .from(TABLA_SESIONES_VIVAS)
            .update({ token_publico: null, modo: invitados.length > 0 ? "invitados" : "chat" })
            .eq("id", id)
            .select("id")
            .maybeSingle();
        if (e2) return mensajeDeError(e2, "No se pudo desactivar el enlace público.");
        if (!hecho) return "Solo quien abrió la sesión puede desactivar su enlace público.";
        avisarCambio(id);
        return null;
    } catch (e) {
        return mensajeDeError(e, "No se pudo desactivar el enlace público.");
    }
};

export const terminarSesion: SesionesVivasApi["terminarSesion"] = async (id) => {
    if (!esUuid(id)) return MENSAJE_ENLACE_INVALIDO;
    if (esquemaAusente) return MENSAJE_SIN_DESPLEGAR;
    try {
        const { data, error } = await cliente()
            .from(TABLA_SESIONES_VIVAS)
            .update({ estado: "terminada", token_publico: null })
            .eq("id", id)
            .select("id")
            .maybeSingle();
        if (error) return mensajeDeError(error, "No se pudo terminar la sesión.");
        if (!data) return "Solo quien abrió la sesión puede terminarla.";
        avisarCambio(id);
        return null;
    } catch (e) {
        return mensajeDeError(e, "No se pudo terminar la sesión.");
    }
};

/** La API completa como objeto (misma implementación que los exports con nombre). */
export const sesionesVivas: SesionesVivasApi = {
    crearSesion,
    obtenerSesion,
    invitar,
    crearEnlacePublico,
    revocarEnlacePublico,
    terminarSesion,
    enlacePrivado,
};

/** Acceso por defecto de una sesión nueva. */
export const ACCESO_POR_DEFECTO: AccesoVivo = { modo: "chat", permiso: "editar" };

// ───────────────────────────── Lectura cacheada (tarjetas) ─────────────────────────────

/**
 * Un chat puede tener muchas tarjetas de la misma sesión: se lee una vez por sesión y se
 * comparte durante un minuto (o hasta que esta pestaña la cambie).
 */
const TTL_CACHE_MS = 60_000;
const cacheSesiones = new Map<string, { t: number; p: Promise<{ sesion: SesionViva | null; error: string | null }> }>();

export function leerSesionCacheada(id: string): Promise<{ sesion: SesionViva | null; error: string | null }> {
    const ahora = Date.now();
    const hit = cacheSesiones.get(id);
    if (hit && ahora - hit.t < TTL_CACHE_MS) return hit.p;
    const p = obtenerSesion(id);
    cacheSesiones.set(id, { t: ahora, p });
    return p;
}

/** Una sesión por id, releída cuando esta pestaña la cambia. */
export function useSesionViva(id: string | null): {
    sesion: SesionViva | null;
    error: string | null;
    listo: boolean;
    recargar: () => void;
} {
    const [estado, setEstado] = useState<{ sesion: SesionViva | null; error: string | null; listo: boolean }>({
        sesion: null,
        error: null,
        listo: !id,
    });
    const [vuelta, setVuelta] = useState(0);

    useEffect(() => {
        if (!id) {
            setEstado({ sesion: null, error: null, listo: true });
            return;
        }
        let vivo = true;
        void leerSesionCacheada(id).then((r) => {
            if (vivo) setEstado({ sesion: r.sesion, error: r.error, listo: true });
        });
        return () => {
            vivo = false;
        };
    }, [id, vuelta]);

    useEffect(() => {
        if (!id || typeof window === "undefined") return;
        const alCambiar = (e: Event) => {
            const detalle = (e as CustomEvent<{ id?: string }>).detail;
            if (!detalle?.id || detalle.id === id) setVuelta((v) => v + 1);
        };
        window.addEventListener(EVENTO_SESIONES_VIVAS, alCambiar);
        return () => window.removeEventListener(EVENTO_SESIONES_VIVAS, alCambiar);
    }, [id]);

    const recargar = useCallback(() => {
        if (id) cacheSesiones.delete(id);
        setVuelta((v) => v + 1);
    }, [id]);

    return { ...estado, recargar };
}

/**
 * Sesiones de un hilo (las más recientes primero). `os_sesiones_vivas` no está en la
 * publicación realtime: se relee al montar, al cambiar de hilo y cuando esta pestaña crea o
 * cambia una sesión. Sin la migración devuelve `[]` y `listo: true`, sin reintentar.
 */
export function useSesionesDelHilo(hiloId: string | null): { sesiones: SesionViva[]; listo: boolean } {
    const [sesiones, setSesiones] = useState<SesionViva[]>([]);
    const [listo, setListo] = useState(false);
    const [vuelta, setVuelta] = useState(0);
    const hiloRef = useRef(hiloId);
    hiloRef.current = hiloId;

    useEffect(() => {
        if (!hiloId || !esUuid(hiloId) || esquemaAusente) {
            setSesiones([]);
            setListo(true);
            return;
        }
        let vivo = true;
        setListo(false);
        void (async () => {
            try {
                const uid = await miUid();
                const { data, error } = await cliente()
                    .from(TABLA_SESIONES_VIVAS)
                    .select("*")
                    .eq("hilo_id", hiloId)
                    .order("creada", { ascending: false })
                    .limit(100);
                if (!vivo) return;
                if (error) {
                    if (esFaltaDeEsquema(error)) esquemaAusente = true;
                    setSesiones([]);
                } else {
                    setSesiones(
                        (Array.isArray(data) ? data : []).map((r) => filaASesion(r as Record<string, unknown>, uid)),
                    );
                }
            } catch {
                if (vivo) setSesiones([]);
            } finally {
                if (vivo) setListo(true);
            }
        })();
        return () => {
            vivo = false;
        };
    }, [hiloId, vuelta]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const alCambiar = () => {
            if (hiloRef.current) setVuelta((v) => v + 1);
        };
        window.addEventListener(EVENTO_SESIONES_VIVAS, alCambiar);
        return () => window.removeEventListener(EVENTO_SESIONES_VIVAS, alCambiar);
    }, []);

    return { sesiones, listo };
}

// ───────────────────────────── Presencia `vivo:<id>` (canal PRIVADO) ─────────────────────────────
//
// Desde 2026-09-28 (L1) el canal de presencia es PRIVADO (Realtime Authorization, migración
// 20260928130000_l1-llamadas.sql): `vivo:<id>` para el creador, los invitados y los miembros del
// chat, o `vivo:<id>:<token>` mientras la sesión tenga enlace público (ver
// `@/lib/llamadas/temas`). Si el servidor no deja entrar (política sin aplicar, sin permiso),
// el contador queda en «no se sabe» (null) y no se reintenta en bucle; nunca se cae a un canal
// público.

type ClienteSupabase = ReturnType<typeof createClient>;
type CanalRealtime = ReturnType<ClienteSupabase["channel"]>;

interface EntradaCanal {
    cliente: ClienteSupabase;
    canal: CanalRealtime;
    tema: string;
    refs: number;
    anuncios: number;
    suscrito: boolean;
    anunciado: boolean;
    denegado: boolean;
    retirado: boolean;
    rechazos: number;
    uid: string | null;
    oyentes: Set<(n: number | null) => void>;
    presentes: number;
}

/** Un canal por TEMA y pestaña (realtime-js reutiliza el mismo objeto para el mismo tema). */
const canales = new Map<string, EntradaCanal>();
const claveTab = (() => {
    try {
        return globalThis.crypto?.randomUUID?.() ?? `tab-${Math.random().toString(36).slice(2)}`;
    } catch {
        return `tab-${Math.random().toString(36).slice(2)}`;
    }
})();

/** Personas distintas presentes (una persona con dos pestañas cuenta una vez). */
export function contarPresentes(estado: Record<string, unknown[]>): number {
    const quienes = new Set<string>();
    for (const [clave, metas] of Object.entries(estado ?? {})) {
        const lista = Array.isArray(metas) ? metas : [];
        if (lista.length === 0) continue;
        const uid = (lista[0] as { uid?: unknown })?.uid;
        quienes.add(typeof uid === "string" && uid ? uid : clave);
    }
    return quienes.size;
}

function sincronizarAnuncio(e: EntradaCanal): void {
    if (!e.suscrito || e.denegado) return;
    if (e.anuncios > 0 && !e.anunciado) {
        e.anunciado = true;
        void e.canal.track({ uid: e.uid, desde: new Date().toISOString() }).catch(() => {
            e.anunciado = false;
        });
    } else if (e.anuncios === 0 && e.anunciado) {
        e.anunciado = false;
        void e.canal.untrack().catch(() => {});
    }
}

function retirarCanal(e: EntradaCanal): void {
    if (e.retirado) return;
    e.retirado = true;
    try {
        void Promise.resolve(e.cliente.removeChannel(e.canal)).catch(() => undefined);
    } catch {
        /* noop */
    }
}

/** El servidor no deja entrar: se para, se recuerda un rato y los contadores pasan a «no se sabe». */
function denegarEntrada(e: EntradaCanal): void {
    e.denegado = true;
    e.suscrito = false;
    e.anunciado = false;
    marcarTemaDenegado(e.tema);
    retirarCanal(e);
    for (const f of e.oyentes) f(null);
}

function tomarCanal(tema: string): EntradaCanal | null {
    const hit = canales.get(tema);
    if (hit) {
        hit.refs += 1;
        return hit;
    }
    if (temaDenegadoReciente(tema)) return null;
    try {
        const cli = cliente();
        const canal = cli.channel(tema, { config: { private: true, presence: { key: claveTab } } });
        const entrada: EntradaCanal = {
            cliente: cli,
            canal,
            tema,
            refs: 1,
            anuncios: 0,
            suscrito: false,
            anunciado: false,
            denegado: false,
            retirado: false,
            rechazos: 0,
            uid: null,
            oyentes: new Set(),
            presentes: 0,
        };
        canal.on("presence", { event: "sync" }, () => {
            try {
                entrada.presentes = contarPresentes(canal.presenceState() as Record<string, unknown[]>);
            } catch {
                entrada.presentes = 0;
            }
            for (const f of entrada.oyentes) f(entrada.presentes);
        });
        const suscribir = () => {
            // Si se soltó mientras se preparaba el JWT del socket, ya no se suscribe.
            if (canales.get(tema) !== entrada || entrada.retirado) return;
            try {
                canal.subscribe((estado: string, err?: unknown) => {
                    if (canales.get(tema) !== entrada || entrada.retirado) return;
                    if (estado === "SUBSCRIBED") {
                        entrada.suscrito = true;
                        entrada.rechazos = 0;
                        sincronizarAnuncio(entrada);
                        return;
                    }
                    if (estado === "CHANNEL_ERROR") {
                        const clase = clasificarErrorCanal(err);
                        if (clase === "denegado" || (clase === "rechazado" && ++entrada.rechazos >= MAX_RECHAZOS_CANAL)) {
                            denegarEntrada(entrada);
                            return;
                        }
                    }
                    if (estado === "CLOSED" || estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") {
                        entrada.suscrito = false;
                        entrada.anunciado = false;
                    }
                });
            } catch {
                /* canal a medio cerrar: la próxima toma lo recrea */
            }
        };
        canales.set(tema, entrada);
        const auth = prepararAuthRealtime(cli);
        if (auth) void auth.then(suscribir);
        else suscribir();
        void miUid().then((u) => {
            entrada.uid = u;
        });
        return entrada;
    } catch {
        return null;
    }
}

function soltarCanal(entrada: EntradaCanal): void {
    entrada.refs -= 1;
    if (entrada.refs > 0) return;
    if (canales.get(entrada.tema) === entrada) canales.delete(entrada.tema);
    retirarCanal(entrada);
}

/**
 * El tema privado que toca a esta sesión (null mientras se resuelve o si no aplica). Se vuelve
 * a preguntar cuando esta pestaña cambia la sesión (p. ej. crea o revoca su enlace público).
 */
function useTemaVivo(sesionId: string | null, activo: boolean, token?: string | null): string | null {
    const [tema, setTema] = useState<string | null>(null);
    const [vuelta, setVuelta] = useState(0);
    useEffect(() => {
        if (!sesionId || !activo || !esUuid(sesionId)) {
            setTema(null);
            return;
        }
        let vivo = true;
        const t = token ?? tokenDeLaUrl(sesionId);
        void resolverTemaSesion("vivo", sesionId, { token: t, fresco: vuelta > 0 }).then((r) => {
            if (vivo) setTema(r);
        });
        return () => {
            vivo = false;
        };
    }, [sesionId, activo, token, vuelta]);
    useEffect(() => {
        if (!sesionId || !activo || typeof window === "undefined") return;
        const alCambiar = (e: Event) => {
            const detalle = (e as CustomEvent<{ id?: string }>).detail;
            if (!detalle?.id || detalle.id === sesionId) setVuelta((v) => v + 1);
        };
        window.addEventListener(EVENTO_SESIONES_VIVAS, alCambiar);
        return () => window.removeEventListener(EVENTO_SESIONES_VIVAS, alCambiar);
    }, [sesionId, activo]);
    return tema;
}

/**
 * Cuántas personas hay DENTRO de la sesión ahora. Solo escucha (no se anuncia) y solo mientras
 * `activo` (p. ej. la tarjeta está a la vista): fuera de pantalla no gasta tráfico. `null` =
 * aún no se sabe (o inactivo, o el servidor no deja mirar). `token`: el del enlace público si
 * se llegó por él (si no se pasa, se lee de la URL de `/vivo/<id>?t=…`).
 */
export function usePresentesSesion(sesionId: string | null, activo: boolean, token?: string | null): number | null {
    const [n, setN] = useState<number | null>(null);
    const tema = useTemaVivo(sesionId, activo, token);
    useEffect(() => {
        if (!tema) {
            setN(null);
            return;
        }
        const entrada = tomarCanal(tema);
        if (!entrada) {
            setN(null);
            return;
        }
        const oyente = (v: number | null) => setN(v);
        entrada.oyentes.add(oyente);
        setN(entrada.suscrito && !entrada.denegado ? entrada.presentes : null);
        return () => {
            entrada.oyentes.delete(oyente);
            soltarCanal(entrada);
        };
    }, [tema]);
    return n;
}

/** Anuncia a esta pestaña como presente en la sesión mientras el componente esté montado. */
export function usePresenciaEnSesion(sesionId: string | null, token?: string | null): void {
    const tema = useTemaVivo(sesionId, true, token);
    useEffect(() => {
        if (!tema) return;
        const entrada = tomarCanal(tema);
        if (!entrada) return;
        entrada.anuncios += 1;
        sincronizarAnuncio(entrada);
        return () => {
            entrada.anuncios -= 1;
            sincronizarAnuncio(entrada);
            soltarCanal(entrada);
        };
    }, [tema]);
}
