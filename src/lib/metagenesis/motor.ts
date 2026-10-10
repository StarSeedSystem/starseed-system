"use client";

/*
 * motor — dónde está el motor de MetaGenesis y cómo hablarle desde otra neurona (2026-10-10).
 * Lee la fila única de `metagenesis_motor` (RLS: solo miembros; migración 20261010100000),
 * da el token de la sesión (renovado cuando caduca) y sondea el motor con él. Nunca lanza.
 * La URL del túnel no se imprime ni se guarda: vive en memoria mientras la página está abierta.
 * Lo puro está en `remoto.ts`. SOP: architecture/metagenesis-remoto-tunel.md
 */

import { createClient } from "@/utils/supabase/client";
import { veredictoSonda, type FilaMotor, type LecturaMotor, type SondaMotor } from "@/lib/metagenesis/remoto";

/** La fila del motor tal como la ve esta cuenta (null si no hay fila o no es miembro). */
export async function leerMotor(): Promise<LecturaMotor> {
    try {
        const { data, error } = await createClient()
            .from("metagenesis_motor")
            .select("url,encendido,ultimo_latido,arrancado_en,maquina,motivo")
            .eq("id", 1)
            .maybeSingle();
        if (error) {
            const code = (error as { code?: string }).code ?? "";
            if (code === "42P01" || code === "PGRST205") {
                return { ok: false, sinTabla: true, motivo: "La base de datos aún no tiene la tabla del motor de MetaGenesis." };
            }
            return { ok: false, motivo: error.message || "No se pudo leer dónde está el motor." };
        }
        return { ok: true, fila: (data as FilaMotor | null) ?? null };
    } catch (e) {
        return { ok: false, motivo: e instanceof Error ? e.message : "sin red" };
    }
}

interface SesionMinima {
    access_token: string;
    expires_at?: number;
}

interface AuthMinima {
    getSession: () => Promise<{ data: { session: SesionMinima | null } }>;
    refreshSession: () => Promise<{ data: { session: SesionMinima | null } }>;
}

/**
 * Proveedor de token con memoria: reusa el token hasta un minuto antes de que caduque;
 * `forzar` pide uno nuevo (tras un 401 del motor). Puro respecto a Supabase (recibe su `auth`).
 */
export function crearProveedorToken(auth: AuthMinima, ahora: () => number = () => Date.now()) {
    let guardado: SesionMinima | null = null;
    return async (forzar = false): Promise<string | null> => {
        try {
            const vigente = guardado && (!guardado.expires_at || guardado.expires_at * 1000 - ahora() > 60_000);
            if (!forzar && vigente && guardado) return guardado.access_token;
            const { data } = forzar ? await auth.refreshSession() : await auth.getSession();
            guardado = data.session ?? null;
            return guardado?.access_token ?? null;
        } catch {
            guardado = null;
            return null;
        }
    };
}

/** El proveedor de token de la sesión de esta pestaña. */
export function proveedorTokenDeLaSesion() {
    return crearProveedorToken(createClient().auth as unknown as AuthMinima);
}

/**
 * Sondea `GET <base>/api/mando/latido` con el token, sin cookies ni cola. 200 = el motor contesta
 * y acepta esta cuenta; 401/403 = contesta pero rechaza; 404 = ahí no hay motor; red = no llega.
 */
export async function sondearMotor(
    base: string,
    token: string | null,
    fetchImpl: typeof fetch,
    topeMs = 8000,
): Promise<SondaMotor> {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), topeMs);
    try {
        const mismoOrigen = typeof window !== "undefined" && base === window.location.origin;
        const r = await fetchImpl(`${base}/api/mando/latido`, {
            cache: "no-store",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            credentials: mismoOrigen ? "same-origin" : "omit",
            signal: control.signal,
        });
        return veredictoSonda(r.status);
    } catch {
        return veredictoSonda(null);
    } finally {
        clearTimeout(reloj);
    }
}
