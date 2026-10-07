/**
 * ÍNDICE DE COLAS ARCHIVADAS (2026-10-03) — PURO
 * ─────────────────────────────────────────────────────────────────────────────
 * `higiene_colas.py` saca de `olas/` las colas cerradas y las copias `cola-auto-*`
 * viejas a `starseed_memory_root/colas-fuente/` (el servidor de Genesis leía 747 colas
 * en cada petición y murió por falta de memoria). Pero las colas eran también el
 * único sitio donde vivía el título de algunas tareas viejas, y `integradas` solo
 * cuenta ids «conocidos» (progreso + colas): al moverlas, la pastilla bajó de 467 a
 * 458 sin que main perdiera nada. La higiene deja un índice pequeño
 * (`colas-fuente/indice.json`, id → título/ola/cola, sin prompts) y Genesis lo funde
 * en sus títulos: lo vivo manda, lo archivado solo rellena huecos.
 */

export interface EntradaIndice {
    titulo: string;
    ola?: string;
    cola?: string;
}

/** PURA: el índice tal cual venga del disco → id → entrada (ignora lo que no encaja). */
export function parsearIndice(crudo: unknown): Record<string, EntradaIndice> {
    const fuera: Record<string, EntradaIndice> = {};
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return fuera;
    const tareas = (crudo as { tareas?: unknown }).tareas;
    if (!tareas || typeof tareas !== "object" || Array.isArray(tareas)) return fuera;
    for (const [id, v] of Object.entries(tareas as Record<string, unknown>)) {
        if (!id || !v || typeof v !== "object") continue;
        const d = v as Record<string, unknown>;
        const titulo = typeof d.titulo === "string" ? d.titulo : "";
        fuera[id] = {
            titulo,
            ...(typeof d.ola === "string" && d.ola ? { ola: d.ola } : {}),
            ...(typeof d.cola === "string" && d.cola ? { cola: d.cola } : {}),
        };
    }
    return fuera;
}

/** PURA: funde el índice en `titulos` SIN pisar lo que ya venía de las colas vivas. */
export function fundirTitulosArchivados(
    titulos: Record<string, string>,
    indice: Record<string, EntradaIndice>,
): Record<string, string> {
    const fuera = { ...titulos };
    for (const [id, e] of Object.entries(indice)) {
        if (!(id in fuera)) fuera[id] = e.titulo;
    }
    return fuera;
}
