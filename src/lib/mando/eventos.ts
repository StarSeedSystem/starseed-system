// src/lib/mando/eventos.ts
// -----------------------------------------------------------------------------
// Latido en vivo del Centro de Mando (Ola 231): lectura de los eventos del
// enjambre desde la tabla pública `relevo_eventos` de Supabase y clasificación
// visual de cada evento para el panel.
//
// La tabla guarda columnas: id · t · quien · tipo · tarea · texto · datos. La
// publica el enjambre, Claude y Hermes con todo lo que hacen; el Centro de
// Mando los muestra en vivo (consulta + suscripción Realtime, ver el hook
// `useEventosRelevo` en `src/hooks/use-eventos-relevo.ts`).
//
// ⚠️ Este módulo es de CLIENTE (usa el singleton del navegador) y solo trae
// texto y metadatos, jamás claves ni rutas del disco. Los datos de `relevo_eventos`
// son públicos por RLS (política de selección para anon/authenticated).
// -----------------------------------------------------------------------------

import type { EventoRelevo } from "@/lib/mando/tipos";
import { createClient } from "@/utils/supabase/client";

/** Clasificación visual de un evento (color hex + icono Lucide + importancia). */
export interface ClasificacionEvento {
    color: string;
    icono: string;
    importante: boolean;
}

/** Forma cruda de una fila de `relevo_eventos` (tipado laxo del SDK de Supabase). */
interface FilaEvento {
    id?: string | number | null;
    t?: string | null;
    quien?: string | null;
    tipo?: string | null;
    tarea?: string | null;
    texto?: string | null;
    datos?: unknown;
}

/** Normaliza una fila cruda de Supabase a un `EventoRelevo` seguro (nunca `any`). */
function normalizar(fila: FilaEvento): EventoRelevo {
    return {
        id: String(fila.id ?? ""),
        t: String(fila.t ?? ""),
        quien: String(fila.quien ?? ""),
        tipo: String(fila.tipo ?? ""),
        tarea: String(fila.tarea ?? ""),
        texto: String(fila.texto ?? ""),
        datos: fila.datos,
    };
}

/**
 * Carga los eventos de relevo de la tabla pública `relevo_eventos`,
 * ordenados por `id` desc (los más recientes primero).
 *
 * @param desdeId si es mayor que 0, devuelve solo los eventos con `id >= desdeId`
 *                (útil para traer lo nuevo desde el último visto en el sondeo).
 * @param limite  máximo de eventos a devolver.
 */
export async function cargarEventos(desdeId = 0, limite = 200): Promise<EventoRelevo[]> {
    // SSR / cliente no hidratable: no hay tabla que consultar.
    if (typeof window === "undefined") return [];

    try {
        const supabase = createClient();
        // `gt`/`gte` frente a `desdeId` no es seguro con 0 (devuelve todo), por eso
        // solo aplicamos el filtro cuando hay un id real desde el que continuar.
        let consulta = supabase
            .from("relevo_eventos")
            .select("id, t, quien, tipo, tarea, texto, datos")
            .order("id", { ascending: false })
            .limit(limite);

        if (desdeId > 0) {
            consulta = consulta.gte("id", desdeId);
        }

        const { data, error } = await consulta;
        if (error) return [];
        if (!Array.isArray(data)) return [];

        return data.map((fila) => normalizar(fila as FilaEvento));
    } catch {
        // Si la consulta falla (p. ej. sin conexión), devolvemos vacío para que el
        // panel nunca se rompa; el sondeo del hook reintentará en el siguiente ciclo.
        return [];
    }
}

/**
 * Clasifica un evento de relevo para mostrarlo con su color, icono y énfasis
 * visual. Colores variados y distintos — no todo verde ni morado — para que el
 * panel se lea de un vistazo. Los tipos desconocidos recaen en un gris neutro.
 */
export function clasificar(e: EventoRelevo): ClasificacionEvento {
    switch (e.tipo) {
        case "arranque":
            return { color: "#64748b", icono: "power", importante: false };
        case "inicio":
            return { color: "#10b981", icono: "play", importante: false };
        case "aviso":
            return { color: "#f59e0b", icono: "triangle-alert", importante: true };
        case "commit":
            return { color: "#3b82f6", icono: "git-commit-horizontal", importante: false };
        case "sin_cambios":
            return { color: "#94a3b8", icono: "file-minus", importante: false };
        case "bloqueante":
            return { color: "#ef4444", icono: "shield-alert", importante: true };
        case "fallo":
            return { color: "#b91c1c", icono: "circle-x", importante: true };
        case "conflicto":
            return { color: "#ea580c", icono: "git-merge", importante: true };
        case "reintento":
            return { color: "#8b5cf6", icono: "rotate-cw", importante: false };
        case "verificado":
            return { color: "#22c55e", icono: "badge-check", importante: false };
        case "verificacion_fallida":
            return { color: "#dc2626", icono: "shield-x", importante: true };
        case "cola_terminada":
            return { color: "#14b8a6", icono: "check-check", importante: false };
        case "informe":
            return { color: "#0ea5e9", icono: "file-text", importante: false };
        default:
            return { color: "#94a3b8", icono: "circle", importante: false };
    }
}