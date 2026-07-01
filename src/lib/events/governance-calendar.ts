"use client";

// ═══════════════════════════════════════════════════════════════════════════
// governance-calendar.ts — Superposición READ-ONLY de cierres de votación
// ---------------------------------------------------------------------------
// Lee (solo lectura) las propuestas ABIERTAS de gobernanza y las expone como
// `CalendarItem` de capa "politica" cuyo día es el CIERRE DE VOTACIÓN
// (`params.votingEndsAt`). Así el Sincrómetro puede mostrar "cuándo se cierra
// cada votación" sin tocar el módulo de gobernanza.
//
// Filosofía (idéntica al resto de capas de datos del SOSD):
//   · SSR-safe: en el servidor (sin `window`) devuelve [].
//   · Nunca lanza: cualquier fallo (sin red, sin tabla, RLS, sin sesión) → [].
//   · No inventa datos: si no hay propuestas legibles, devuelve [] (estado vacío
//     honesto en el calendario).
//
// La tabla `proposals` está en la publicación realtime `supabase_realtime`, con
// RLS: los clientes solo reciben lo que pueden leer. No escribimos nada aquí.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "@/utils/supabase/client";
import type { CalendarItem } from "@/contexts/calendar-context";

/** Forma laxa de una fila de `proposals` (solo lo que necesitamos leer). */
interface ProposalRow {
    id: string;
    title?: string | null;
    description?: string | null;
    status?: string | null;
    scope?: string | null;
    params?: { votingEndsAt?: string | null } | null;
    created_at?: string | null;
}

/** 'YYYY-MM-DD' (local) desde un ISO. Defensivo ante valores inválidos. */
function isoToLocalDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/** 'HH:MM' (local) desde un ISO. */
function isoToLocalTime(iso: string): string | undefined {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
}

/**
 * Lista los CIERRES DE VOTACIÓN de las propuestas abiertas como ítems de
 * calendario (capa "politica", marcados `sistema`/`sourceRef`). Solo lectura.
 * Devuelve [] ante cualquier problema — el calendario nunca deja de funcionar.
 */
export async function listVotingDeadlines(): Promise<CalendarItem[]> {
    if (typeof window === "undefined") return [];
    try {
        const supabase = createClient();
        // Solo propuestas abiertas; limitamos por prudencia. RLS filtra lo visible.
        const { data, error } = await supabase
            .from("proposals")
            .select("id, title, description, status, scope, params, created_at")
            .eq("status", "open")
            .limit(200);

        if (error || !Array.isArray(data)) return [];

        const items: CalendarItem[] = [];
        for (const raw of data as ProposalRow[]) {
            const endsAt = raw?.params?.votingEndsAt;
            if (!endsAt) continue; // sin cierre conocido → no se coloca en el calendario.
            const date = isoToLocalDate(endsAt);
            const time = isoToLocalTime(endsAt);
            items.push({
                id: `gov-deadline-${raw.id}`,
                title: `Cierre de votación · ${raw.title ?? "Propuesta"}`,
                description:
                    raw.description ??
                    "Fin del periodo de votación de esta propuesta de gobernanza.",
                date,
                time,
                layer: "politica",
                visibility: "red",
                // Enlace de origen para poder abrir la propuesta desde el detalle del día.
                sourceRef: `proposal:${raw.id}`,
                tags: ["gobernanza", "votación", "cierre"],
                aiHighlight: true,
                recurrence: "none",
            });
        }
        return items;
    } catch {
        return [];
    }
}
