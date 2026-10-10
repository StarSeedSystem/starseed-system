"use client";

/**
 * GENESIS · HISTORIAL (2026-10-10)
 * ─────────────────────────────────────────────────────────────────────────────
 * Guarda cada operación (aplicada, deshecha, propuesta o fallida) con su
 * inverso en la tabla `genesis_operaciones` de la cuenta (RLS: la ve quien la
 * hizo y quien colabora en la entidad). Si la tabla aún no existe en la base
 * (migración 20261010130000 sin aplicar), se guarda en ESTE aparato y se dice
 * así en la interfaz: nunca se finge que viaja a la cuenta.
 */

import { createClient } from "@/utils/supabase/client";
import { ordenarRegistro, type Ambito, type EntradaGenesis, type EstadoEntrada, type Inverso, type Operacion } from "./operaciones";

const CLAVE_LOCAL = "starseed.genesis.registro.v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DondeSeGuarda = "cuenta" | "aparato";

function sinTabla(error: { code?: string; message?: string } | null | undefined): boolean {
    const code = error?.code ?? "";
    return code === "42P01" || code === "PGRST205" || code === "PGRST202" || /does not exist|schema cache/i.test(error?.message ?? "");
}

function leerLocal(): EntradaGenesis[] {
    try {
        const raw = window.localStorage.getItem(CLAVE_LOCAL);
        const lista = raw ? (JSON.parse(raw) as EntradaGenesis[]) : [];
        return Array.isArray(lista) ? lista : [];
    } catch {
        return [];
    }
}

function guardarLocal(lista: EntradaGenesis[]): void {
    try {
        window.localStorage.setItem(CLAVE_LOCAL, JSON.stringify(ordenarRegistro(lista, 100)));
    } catch {
        /* almacenamiento lleno o bloqueado */
    }
}

function mismaAmbito(e: EntradaGenesis, a: Ambito): boolean {
    if (a.tipo === "persona") return e.ambito.tipo === "persona";
    return e.ambito.tipo === "entidad" && e.ambito.entidad.id === a.entidad.id;
}

function aFila(e: EntradaGenesis): Record<string, unknown> {
    return {
        ...(UUID.test(e.id) ? { id: e.id } : {}),
        ambito: e.ambito.tipo,
        entidad_tipo: e.ambito.tipo === "entidad" ? e.ambito.entidad.tipo : null,
        entidad_id: e.ambito.tipo === "entidad" ? e.ambito.entidad.id : null,
        tipo: e.operacion.tipo,
        titulo: e.titulo.slice(0, 200),
        operacion: e.operacion,
        inverso: e.inverso,
        estado: e.estado,
        resultado: e.resultado.slice(0, 600),
        propuesta_id: e.propuestaId && UUID.test(e.propuestaId) ? e.propuestaId : null,
        creado_en: new Date(e.at).toISOString(),
        deshecho_en: e.deshechaEn ? new Date(e.deshechaEn).toISOString() : null,
    };
}

function deFila(f: Record<string, unknown>, ambito: Ambito): EntradaGenesis {
    return {
        id: String(f.id),
        at: Date.parse(String(f.creado_en)) || 0,
        ambito,
        operacion: f.operacion as Operacion,
        titulo: String(f.titulo ?? ""),
        estado: String(f.estado) as EstadoEntrada,
        inverso: (f.inverso as Inverso | null) ?? null,
        resultado: String(f.resultado ?? ""),
        ...(f.propuesta_id ? { propuestaId: String(f.propuesta_id) } : {}),
        ...(f.deshecho_en ? { deshechaEn: Date.parse(String(f.deshecho_en)) } : {}),
    };
}

/** Anota una entrada nueva. Devuelve dónde quedó. */
export async function anotar(e: EntradaGenesis): Promise<DondeSeGuarda> {
    try {
        const { error } = await createClient().from("genesis_operaciones").insert(aFila(e));
        if (!error) return "cuenta";
        if (!sinTabla(error)) console.warn("[genesis] no se pudo anotar en la cuenta:", error.message);
    } catch {
        /* sin red */
    }
    guardarLocal([e, ...leerLocal().filter((x) => x.id !== e.id)]);
    return "aparato";
}

/** Marca una entrada como deshecha (en la cuenta o en este aparato). */
export async function marcarDeshecha(e: EntradaGenesis, resultado: string, ahora = Date.now()): Promise<void> {
    const local = leerLocal();
    if (local.some((x) => x.id === e.id)) {
        guardarLocal(local.map((x) => (x.id === e.id ? { ...x, estado: "deshecha", deshechaEn: ahora, resultado } : x)));
        return;
    }
    try {
        await createClient()
            .from("genesis_operaciones")
            .update({ estado: "deshecha", deshecho_en: new Date(ahora).toISOString(), resultado: resultado.slice(0, 600) })
            .eq("id", e.id);
    } catch {
        /* sin red: la UI ya lo enseña deshecho; al volver se relee */
    }
}

/** Historial de un ámbito: lo de la cuenta y lo que quedó en este aparato. */
export async function leerHistorial(ambito: Ambito): Promise<{ entradas: EntradaGenesis[]; donde: DondeSeGuarda }> {
    const locales = leerLocal().filter((e) => mismaAmbito(e, ambito));
    try {
        const c = createClient();
        let q = c.from("genesis_operaciones").select("*").order("creado_en", { ascending: false }).limit(60);
        if (ambito.tipo === "persona") {
            const { data: s } = await c.auth.getSession();
            const uid = s.session?.user?.id;
            if (!uid) return { entradas: ordenarRegistro(locales), donde: "aparato" };
            q = q.eq("ambito", "persona").eq("account_id", uid);
        } else {
            q = q.eq("entidad_id", ambito.entidad.id);
        }
        const { data, error } = await q;
        if (error) return { entradas: ordenarRegistro(locales), donde: "aparato" };
        const remotas = ((data ?? []) as Record<string, unknown>[]).map((f) => deFila(f, ambito));
        const ids = new Set(remotas.map((r) => r.id));
        return { entradas: ordenarRegistro([...remotas, ...locales.filter((l) => !ids.has(l.id))]), donde: "cuenta" };
    } catch {
        return { entradas: ordenarRegistro(locales), donde: "aparato" };
    }
}
