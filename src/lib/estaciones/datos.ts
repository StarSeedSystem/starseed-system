"use client";

/*
 * StarSeed OS · Estaciones (§6.2) — capa de datos del cliente sobre
 * `public.os_estaciones` y `os_estaciones_denuncias`.
 * Ninguna función lanza: ante fallo devuelven `[]`, `null` o
 * `{ ok: false, error }`. El cliente Supabase es el singleton del OS,
 * inyectable como último parámetro en las pruebas.
 */

import { createClient } from "@/utils/supabase/client";
import { detectarFormato } from "./formato";
import { validarEstacion } from "./tipos";
import type { BorradorEstacion, Estacion, TipoEstacion } from "./tipos";

export type ClienteSupabase = ReturnType<typeof createClient>;

export type ResultadoEstacion =
    | { ok: true; estacion: Estacion }
    | { ok: false; error: string };

export interface OpcionesListar {
    limite?: number;
    ambito?: string;
    tipo?: TipoEstacion;
}

const CLAVE_OCULTAS = "starseed.estaciones.ocultas.v1";
const MOTIVO_MAX = 300;

function resolverCliente(inyectado?: ClienteSupabase): ClienteSupabase | null {
    if (inyectado) return inyectado;
    if (typeof window === "undefined") return null;
    try { return createClient(); } catch { return null; }
}

async function usuarioEnSesion(
    supabase: ClienteSupabase,
): Promise<string | null> {
    try {
        const { data } = await supabase.auth.getUser();
        return data.user?.id ?? null;
    } catch {
        return null;
    }
}

/** Lista estaciones públicas (la RLS ya filtra los grupos). Nunca lanza. */
export async function listarEstaciones(
    opciones: OpcionesListar = {},
    clienteInyectado?: ClienteSupabase,
): Promise<Estacion[]> {
    const supabase = resolverCliente(clienteInyectado);
    if (!supabase) return [];
    try {
        let consulta = supabase
            .from("os_estaciones")
            .select("*")
            .order("updated_at", { ascending: false })
            .limit(Math.min(Math.max(opciones.limite ?? 50, 1), 100));
        if (opciones.tipo) consulta = consulta.eq("tipo", opciones.tipo);
        if (opciones.ambito) consulta = consulta.eq("entidad_ref", opciones.ambito);
        const { data, error } = await consulta;
        if (error || !Array.isArray(data)) return [];
        return data as Estacion[];
    } catch {
        return [];
    }
}

/** Una estación por id, o null si no existe o falla la red. */
export async function obtenerEstacion(
    id: string,
    clienteInyectado?: ClienteSupabase,
): Promise<Estacion | null> {
    const supabase = resolverCliente(clienteInyectado);
    if (!supabase || !id) return null;
    try {
        const { data, error } = await supabase
            .from("os_estaciones")
            .select("*")
            .eq("id", id)
            .maybeSingle();
        if (error || !data) return null;
        return data as Estacion;
    } catch {
        return null;
    }
}

/** Publica una estación (la escribe el dueño). Valida y detecta el formato. */
export async function publicarEstacion(
    borrador: BorradorEstacion,
    clienteInyectado?: ClienteSupabase,
): Promise<ResultadoEstacion> {
    const supabase = resolverCliente(clienteInyectado);
    if (!supabase) return { ok: false, error: "No hay cliente de base de datos disponible." };

    const veredicto = validarEstacion(borrador);
    if (!veredicto.ok) return { ok: false, error: veredicto.errores.join(" ") };

    const ownerId = await usuarioEnSesion(supabase);
    if (!ownerId) return { ok: false, error: "Entra con tu cuenta para publicar una estación." };

    const v = veredicto.estacion;
    const formato = detectarFormato(v.enlace, v.tipo).formato;
    try {
        const { data, error } = await supabase
            .from("os_estaciones")
            .insert({
                owner_id: ownerId,
                ambito_tipo: v.ambito_tipo ?? "persona",
                entidad_ref: v.ambito_tipo === "entidad" ? v.entidad_ref ?? null : null,
                titulo: v.titulo,
                descripcion: v.descripcion ?? "",
                tipo: v.tipo,
                fuente: v.fuente,
                enlace: v.enlace,
                formato,
                imagen: v.imagen ?? null,
                idioma: v.idioma ?? "es",
                categorias: v.categorias ?? [],
                licencia: v.licencia,
                visibilidad: v.visibilidad ?? "publica",
                empieza_en: v.empieza_en ?? null,
                termina_en: v.termina_en ?? null,
                en_malla: v.en_malla ?? false,
                pausada: false,
                espectadores: 0,
            })
            .select("*")
            .single();
        if (error || !data) {
            return { ok: false, error: error?.message || "No se pudo publicar la estación." };
        }
        return { ok: true, estacion: data as Estacion };
    } catch {
        return { ok: false, error: "No se pudo publicar la estación." };
    }
}

/**
 * Edita una estación (parche parcial). Valida el parche con `validarEstacion`
 * rellenando de momento los obligatorios ausentes, y solo escribe las claves
 * presentes. Si cambia el enlace o el tipo, recalcula el formato.
 */
export async function editarEstacion(
    id: string,
    parche: Partial<BorradorEstacion>,
    clienteInyectado?: ClienteSupabase,
): Promise<ResultadoEstacion> {
    const supabase = resolverCliente(clienteInyectado);
    if (!supabase) return { ok: false, error: "No hay cliente de base de datos disponible." };
    if (!id) return { ok: false, error: "Falta el id de la estación." };

    const borrador: BorradorEstacion = {
        titulo: parche.titulo ?? "borrador",
        tipo: parche.tipo ?? "mixto",
        fuente: parche.fuente ?? "enlace",
        enlace: parche.enlace ?? "https://ejemplo.com",
        licencia: parche.licencia ?? "cc0",
        descripcion: parche.descripcion,
        imagen: parche.imagen ?? undefined,
        idioma: parche.idioma,
        categorias: parche.categorias,
        visibilidad: parche.visibilidad,
        empieza_en: parche.empieza_en ?? undefined,
        termina_en: parche.termina_en ?? undefined,
        ambito_tipo: parche.ambito_tipo,
        entidad_ref: parche.entidad_ref ?? undefined,
    };
    const veredicto = validarEstacion(borrador);
    if (!veredicto.ok) return { ok: false, error: veredicto.errores.join(" ") };

    const v = veredicto.estacion;
    const cambios: Record<string, unknown> = {};
    if (parche.titulo !== undefined) cambios.titulo = v.titulo;
    if (parche.tipo !== undefined) cambios.tipo = v.tipo;
    if (parche.fuente !== undefined) cambios.fuente = v.fuente;
    if (parche.enlace !== undefined) cambios.enlace = v.enlace;
    if (parche.licencia !== undefined) cambios.licencia = v.licencia;
    if (parche.descripcion !== undefined) cambios.descripcion = v.descripcion;
    if (parche.imagen !== undefined) cambios.imagen = v.imagen ?? null;
    if (parche.idioma !== undefined) cambios.idioma = v.idioma;
    if (parche.categorias !== undefined) cambios.categorias = v.categorias;
    if (parche.visibilidad !== undefined) cambios.visibilidad = v.visibilidad;
    if (parche.empieza_en !== undefined) cambios.empieza_en = v.empieza_en ?? null;
    if (parche.termina_en !== undefined) cambios.termina_en = v.termina_en ?? null;
    if (parche.ambito_tipo !== undefined) cambios.ambito_tipo = v.ambito_tipo;
    if (parche.entidad_ref !== undefined) cambios.entidad_ref = v.entidad_ref ?? null;
    if (parche.enlace !== undefined || parche.tipo !== undefined) {
        cambios.formato = detectarFormato(v.enlace, v.tipo).formato;
    }
    if (Object.keys(cambios).length === 0) {
        return { ok: false, error: "No hay cambios que guardar." };
    }

    try {
        const { data, error } = await supabase
            .from("os_estaciones")
            .update(cambios)
            .eq("id", id)
            .select("*")
            .single();
        if (error || !data) {
            return { ok: false, error: error?.message || "No se pudo editar la estación." };
        }
        return { ok: true, estacion: data as Estacion };
    } catch {
        return { ok: false, error: "No se pudo editar la estación." };
    }
}

/** Pone `ultimo_latido = ahora` (el dueño, mientras emite). Nunca lanza. */
export async function latirEstacion(
    id: string,
    espectadores?: number,
    clienteInyectado?: ClienteSupabase,
): Promise<boolean> {
    const supabase = resolverCliente(clienteInyectado);
    if (!supabase || !id) return false;
    const ahora = new Date().toISOString();
    const cambios: Record<string, unknown> = { ultimo_latido: ahora };
    if (typeof espectadores === "number" && espectadores >= 0) {
        cambios.espectadores = Math.floor(espectadores);
    }
    try {
        const { error } = await supabase.from("os_estaciones").update(cambios).eq("id", id);
        return !error;
    } catch {
        return false;
    }
}

/** Pausa o reanuda una estación. */
export async function pausarEstacion(
    id: string,
    pausada: boolean,
    clienteInyectado?: ClienteSupabase,
): Promise<boolean> {
    const supabase = resolverCliente(clienteInyectado);
    if (!supabase || !id) return false;
    try {
        const { error } = await supabase
            .from("os_estaciones")
            .update({ pausada })
            .eq("id", id);
        return !error;
    } catch {
        return false;
    }
}

/** Termina una emisión (`termina_en = ahora`). */
export async function terminarEstacion(
    id: string,
    clienteInyectado?: ClienteSupabase,
): Promise<boolean> {
    const supabase = resolverCliente(clienteInyectado);
    if (!supabase || !id) return false;
    try {
        const { error } = await supabase
            .from("os_estaciones")
            .update({ termina_en: new Date().toISOString() })
            .eq("id", id);
        return !error;
    } catch {
        return false;
    }
}

/** Registra la propia denuncia (motivo ≤ 300 caracteres). Requiere sesión. */
export async function denunciarEstacion(
    id: string,
    motivo: string,
    clienteInyectado?: ClienteSupabase,
): Promise<boolean> {
    const supabase = resolverCliente(clienteInyectado);
    if (!supabase || !id) return false;
    const autorId = await usuarioEnSesion(supabase);
    if (!autorId) return false;
    try {
        const { error } = await supabase.from("os_estaciones_denuncias").insert({
            estacion_id: id,
            autor_id: autorId,
            motivo: motivo.trim().slice(0, MOTIVO_MAX),
        });
        return !error;
    } catch {
        return false;
    }
}

/** Estaciones que esta persona ha ocultado solo para sí (localStorage). */
export function ocultasLocales(): Set<string> {
    const vacio = new Set<string>();
    try {
        if (typeof localStorage === "undefined") return vacio;
        const bruto = localStorage.getItem(CLAVE_OCULTAS);
        if (!bruto) return vacio;
        const lista = JSON.parse(bruto) as unknown;
        if (!Array.isArray(lista)) return vacio;
        return new Set(lista.filter((v): v is string => typeof v === "string"));
    } catch {
        return vacio;
    }
}

/** Oculta localmente una estación (no se borra nada del servidor). */
export function ocultarLocal(id: string): void {
    try {
        if (typeof localStorage === "undefined" || !id) return;
        const set = ocultasLocales();
        set.add(id);
        localStorage.setItem(CLAVE_OCULTAS, JSON.stringify(Array.from(set)));
    } catch {
        /* sin almacenamiento: se omite en silencio */
    }
}
