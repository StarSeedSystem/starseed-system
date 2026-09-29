"use client";
/**
 * Identidad soberana (Ola 0929-C): la sesión de este navegador (sin red: la caché de sesión del
 * guardián de consumo) y las facetas públicas de la cuenta (`os_account_profiles`), leídas UNA
 * vez y compartidas 15 min entre instancias, solo con el widget a la vista. No se abre ninguna
 * suscripción en vivo: el perfil activo es local (`starseed.profile.active.v1`) y se cambia aquí
 * mismo con su evento.
 */
import * as React from "react";
import { createClient } from "@/utils/supabase/client";
import { usuarioActual } from "@/lib/consumo/usuario";
import { ACTIVE_PROFILE_KEY, PROFILE_ACTIVE_EVENT, activeProfileId, setActiveProfile } from "@/lib/profiles/profiles";
import { useCompartido, type EstadoCompartido } from "./recurso";

export interface SesionLocal {
    id: string;
    correo: string | null;
    proveedor: string | null;
    alta: string | null;
}

export interface Faceta {
    id: string;
    nombre: string;
    handle: string | null;
    visibilidad: "public" | "private" | "contacts";
    principal: boolean;
    tipo: string;
}

/** «alexbordon@gmail.com» → «al…on@gmail.com». */
export function enmascararCorreo(correo: string | null | undefined): string {
    if (!correo || !correo.includes("@")) return "";
    const [u, d] = correo.split("@");
    if (u.length <= 3) return `${u[0]}…@${d}`;
    return `${u.slice(0, 2)}…${u.slice(-2)}@${d}`;
}

export function nombreProveedor(p: string | null | undefined): string {
    const m: Record<string, string> = { google: "Google", email: "correo", github: "GitHub", apple: "Apple", anonymous: "invitado" };
    return p ? m[p] ?? p : "correo";
}

export function etiquetaVisibilidad(v: Faceta["visibilidad"]): string {
    return v === "public" ? "pública" : v === "contacts" ? "solo contactos" : "privada";
}

export function mapearFaceta(row: Record<string, unknown>): Faceta {
    const v = row.visibility;
    return {
        id: String(row.id),
        nombre: typeof row.name === "string" && row.name ? row.name : "Sin nombre",
        handle: typeof row.handle === "string" && row.handle ? row.handle : null,
        visibilidad: v === "private" || v === "contacts" ? v : "public",
        principal: row.is_default === true,
        tipo: typeof row.kind === "string" ? row.kind : "personal",
    };
}

/** Sesión local (sin red). `listo` = ya se sabe si hay o no. */
export function useSesionLocal(): { listo: boolean; sesion: SesionLocal | null } {
    const [estado, setEstado] = React.useState<{ listo: boolean; sesion: SesionLocal | null }>({ listo: false, sesion: null });
    React.useEffect(() => {
        let vivo = true;
        void usuarioActual().then((u) => {
            if (!vivo) return;
            setEstado({
                listo: true,
                sesion: u ? { id: u.id, correo: u.email ?? null, proveedor: (u.app_metadata as { provider?: string } | undefined)?.provider ?? null, alta: u.created_at ?? null } : null,
            });
        }).catch(() => { if (vivo) setEstado({ listo: true, sesion: null }); });
        return () => { vivo = false; };
    }, []);
    return estado;
}

export const TTL_PERFILES_MS = 15 * 60_000;

async function cargarFacetas(uid: string): Promise<Faceta[]> {
    const { data, error } = await createClient()
        .from("os_account_profiles")
        .select("id, handle, name, kind, visibility, is_default")
        .eq("account", uid)
        .order("is_default", { ascending: false })
        .limit(12);
    if (error) throw new Error(error.message || "La fuente no respondió");
    return Array.isArray(data) ? (data as Record<string, unknown>[]).map(mapearFaceta) : [];
}

export function useFacetas(uid: string | null, activo: boolean): EstadoCompartido<Faceta[]> {
    return useCompartido<Faceta[]>(uid ? `facetas:${uid}` : null, TTL_PERFILES_MS, () => cargarFacetas(uid!), activo);
}

/** Perfil activo de ESTE dispositivo (local) y cómo cambiarlo. */
export function usePerfilActivo(): { activo: string | null; usar: (id: string) => void } {
    const [activo, setActivo] = React.useState<string | null>(null);
    React.useEffect(() => {
        const leer = () => setActivo(activeProfileId());
        leer();
        const alm = (e: StorageEvent) => { if (e.key === ACTIVE_PROFILE_KEY) leer(); };
        window.addEventListener(PROFILE_ACTIVE_EVENT, leer);
        window.addEventListener("storage", alm);
        return () => { window.removeEventListener(PROFILE_ACTIVE_EVENT, leer); window.removeEventListener("storage", alm); };
    }, []);
    return { activo, usar: React.useCallback((id: string) => { setActiveProfile(id); setActivo(id); }, []) };
}
