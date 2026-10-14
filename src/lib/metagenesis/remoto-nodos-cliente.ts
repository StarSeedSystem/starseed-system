"use client";

/*
 * MetaGenesis autónoma · lectura y órdenes desde el navegador de CUALQUIER neurona (OPA1011).
 * Lee el estado de los nodos en Supabase —tablas con RLS si la migración 20261011100000 está
 * aplicada; si no, el bus `relevo_eventos`— y manda órdenes: en tablas, una fila a nombre de la
 * cuenta (la RLS comprueba que es miembro); en el bus, por `/api/metagenesis/orden`, que
 * comprueba la cuenta y FIRMA en el servidor. No depende de `/api/mando/*` ni del túnel de la Mac.
 * Frugal con Supabase: en el bus, dos lecturas pequeñas por vuelta (lo nuevo desde el último id y
 * si hay foto nueva) y la foto entera solo cuando cambia. Nunca lanza. Lo puro: `remoto-nodos.ts`.
 */

import { createClient } from "@/utils/supabase/client";
import {
    elegirFuente,
    resumirBus,
    resumirTablas,
    validarArgs,
    esAccion,
    esDestino,
    type AccionOrden,
    type ArgsOrden,
    type EstadoAutonomo,
    type FilaBus,
    type FilasTablas,
} from "@/lib/metagenesis/remoto-nodos";

export type LecturaAutonoma = { ok: true; estado: EstadoAutonomo } | { ok: false; motivo: string };
export type EnvioOrden = { ok: true; clave: string; modo: "bus" | "tablas" } | { ok: false; motivo: string };

/** Tipos del bus que se leen en cada vuelta (la foto va aparte: es la única grande). */
const TIPOS_LIGEROS = "(mg_latido,mg_lider,mg_baja,mg_orden,mg_orden_hecha,mg_decision)";
const VENTANA_MS = 2 * 3600_000;
const REELEGIR_MS = 5 * 60_000; // 5 minutos

interface Cache {
    modo: "bus" | "tablas" | null;
    filas: Map<number, FilaBus>;
    ultimoId: number;
    foto: FilaBus | null;
    elegidoEn: number; // timestamp de la última elección de fuente
}

const cache: Cache = { modo: null, filas: new Map(), ultimoId: 0, foto: null, elegidoEn: 0 };

/** Solo para las pruebas. */
export function _reiniciarCache(): void {
    cache.modo = null;
    cache.filas.clear();
    cache.ultimoId = 0;
    cache.foto = null;
}

function sinTabla(error: { code?: string } | null | undefined): boolean {
    const c = error?.code ?? "";
    return c === "42P01" || c === "PGRST205" || c === "PGRST202";
}

async function leerTablas(ahora: number): Promise<LecturaAutonoma | null> {
    const sb = createClient();
    const arr = await sb.from("metagenesis_arriendo").select("lider,termino,expira,foto,foto_en").eq("id", 1).maybeSingle();
    if (arr.error) {
        if (sinTabla(arr.error)) return null;
        return { ok: false, motivo: arr.error.message || "No se pudo leer el arriendo." };
    }
    const [nodos, ordenes] = await Promise.all([
        sb.from("metagenesis_nodos").select("nodo,medio,modo,puntos,datos,ultimo_latido").order("ultimo_latido", { ascending: false }).limit(20),
        sb.from("metagenesis_ordenes").select("id,creada_en,accion,para,estado,resultado,tomada_por").order("id", { ascending: false }).limit(12),
    ]);
    const filas: FilasTablas = {
        arriendo: (arr.data as FilasTablas["arriendo"]) ?? null,
        nodos: ((nodos.data ?? []) as FilasTablas["nodos"]) ?? [],
        ordenes: ((ordenes.data ?? []) as FilasTablas["ordenes"]) ?? [],
    };
    return { ok: true, estado: resumirTablas(filas, ahora) };
}

async function leerBus(ahora: number): Promise<LecturaAutonoma> {
    const sb = createClient();
    let q = sb.from("relevo_eventos").select("id,t,tipo,datos").filter("tipo", "in", TIPOS_LIGEROS);
    q = cache.ultimoId
        ? q.gt("id", cache.ultimoId).order("id", { ascending: true }).limit(200)
        : q.gte("t", new Date(ahora - 30 * 60_000).toISOString()).order("id", { ascending: false }).limit(200);
    let fq = sb.from("relevo_eventos").select("id,t,tipo,datos").eq("tipo", "mg_foto").order("id", { ascending: false }).limit(1);
    if (cache.foto) fq = fq.gt("id", cache.foto.id);
    const [nuevas, foto] = await Promise.all([q, fq]);
    if (nuevas.error) return { ok: false, motivo: nuevas.error.message || "No se pudo leer el bus." };
    for (const f of (nuevas.data ?? []) as FilaBus[]) {
        cache.filas.set(f.id, f);
        cache.ultimoId = Math.max(cache.ultimoId, f.id);
    }
    const fotoNueva = ((foto.data ?? []) as FilaBus[])[0];
    if (fotoNueva) cache.foto = fotoNueva;
    // Ventana: 2 h (los reclamos de mando se guardan siempre: son pocos y deciden quién dirige).
    for (const [id, f] of cache.filas) {
        if (f.tipo !== "mg_lider" && Date.parse(f.t) < ahora - VENTANA_MS) cache.filas.delete(id);
    }
    const filas = [...cache.filas.values()];
    if (cache.foto) filas.push(cache.foto);
    return { ok: true, estado: resumirBus(filas, ahora) };
}

/** El estado de MetaGenesis tal como lo publican sus nodos. */
export async function leerEstadoAutonomo(ahora = Date.now()): Promise<LecturaAutonoma> {
    try {
        // ¿Es hora de reelegir la fuente? (cada REELEGIR_MS ms)
        const debeReeleer = ahora - cache.elegidoEn >= REELEGIR_MS;
        
        if (debeReeleer) {
            // Leer ambas fuentes para decidir
            const [tResultado, bResultado] = await Promise.all([
                leerTablas(ahora),
                leerBus(ahora)
            ]);
            
            // Elegir fuente basada en cuál tiene más nodos vivos
            const modoElegido = elegirFuente(
                (tResultado && tResultado.ok) ? tResultado.estado : null,
                (bResultado && bResultado.ok) ? bResultado.estado : null
            );
            
            // Actualizar caché
            cache.modo = modoElegido;
            cache.elegidoEn = ahora;
            
            // Devolver el resultado de la fuente elegida
                return modoElegido === "tablas" && tResultado !== null ? tResultado : bResultado;
        }
        
        // No es hora de reelegir, usar la caché actual con una sola lectura
        if (cache.modo !== "bus") {
            const t = await leerTablas(ahora);
            if (t && !t.ok) return t;
            if (t?.ok && cache.modo === "tablas") return t;
            if (t?.ok) {
                // Primera lectura: tablas solo si alguien late en ellas
                const b = await leerBus(ahora);
                cache.modo = elegirFuente(t.estado, b.ok ? b.estado : null);
                // Nota: No actualizamos elegidoEn aquí porque no es una reevaluación completa
                return cache.modo === "tablas" ? t : b;
            }
            cache.modo = "bus";
        }
        return await leerBus(ahora);
    } catch (e) {
        return { ok: false, motivo: e instanceof Error ? e.message : "sin red" };
    }
}

/** Manda una orden al líder (o a un medio/nodo concreto). */
export async function enviarOrden(accion: AccionOrden, para = "lider", args: ArgsOrden = {}): Promise<EnvioOrden> {
    if (!esAccion(accion)) return { ok: false, motivo: "Acción no admitida." };
    if (!esDestino(para)) return { ok: false, motivo: "Destino no válido." };
    const mal = validarArgs(accion, args);
    if (mal) return { ok: false, motivo: mal };
    try {
        const sb = createClient();
        if (cache.modo === "tablas") {
            const { data, error } = await sb.from("metagenesis_ordenes").insert({ accion, args, para }).select("id").single();
            if (error) {
                const c = (error as { code?: string }).code ?? "";
                if (c === "42501") return { ok: false, motivo: "Solo los miembros de MetaGenesis pueden mandar órdenes." };
                if (c === "54000") return { ok: false, motivo: "Demasiadas órdenes en una hora: espera un poco." };
                return { ok: false, motivo: error.message || "No se pudo guardar la orden." };
            }
            return { ok: true, clave: String((data as { id: number }).id), modo: "tablas" };
        }
        const { data: sesion } = await sb.auth.getSession();
        const token = sesion?.session?.access_token;
        if (!token) return { ok: false, motivo: "Entra con tu cuenta para mandar órdenes." };
        const r = await fetch("/api/metagenesis/orden", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ accion, para, args }),
            cache: "no-store",
        });
        const cuerpo = (await r.json().catch(() => ({}))) as { ok?: boolean; nonce?: string; error?: string };
        if (!r.ok || !cuerpo.ok || !cuerpo.nonce) return { ok: false, motivo: cuerpo.error || `El servidor contestó ${r.status}.` };
        return { ok: true, clave: cuerpo.nonce, modo: "bus" };
    } catch (e) {
        return { ok: false, motivo: e instanceof Error ? e.message : "sin red" };
    }
}
