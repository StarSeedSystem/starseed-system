"use client";
/**
 * Recursos comunes REALES (paquete B · Ola 0929): los que la comunidad administra en el Área
 * Política → Ejecutivo (`loadCommonsResources`: entity_state con espejo local si la nube no
 * responde). Una lectura compartida por Patrimonio común y Huella regenerativa.
 */
export type Estado = "Disponible" | "En uso" | "Mantenimiento";
export interface RecursoComun { id: string; name: string; type: string; status: Estado; assignedTo?: string | null; assignedLabel?: string | null; notes?: string; updatedAt: string }
export interface DatosProcomun { lista: RecursoComun[]; copiaLocal: boolean }

export const COLOR_ESTADO_RECURSO: Record<Estado, string> = { Disponible: "#10b981", "En uso": "#f59e0b", Mantenimiento: "#64748b" };
export const CLAVE_PROCOMUN = "procomun.v1";

export async function cargarProcomun(): Promise<DatosProcomun> {
    const { loadCommonsResources } = await import("@/lib/governance/political");
    const r = await loadCommonsResources();
    return { lista: (r.list as RecursoComun[]).filter((x) => x && x.id && x.name), copiaLocal: r.degraded };
}

/** Recursos por tipo: total, libres, en uso y en mantenimiento. PURO. */
export function porTipo(lista: RecursoComun[]): { tipo: string; total: number; libres: number; enUso: number; mant: number }[] {
    const m = new Map<string, { tipo: string; total: number; libres: number; enUso: number; mant: number }>();
    for (const r of lista) {
        const t = r.type?.trim() || "Otros";
        const g = m.get(t) ?? { tipo: t, total: 0, libres: 0, enUso: 0, mant: 0 };
        g.total += 1;
        if (r.status === "Disponible") g.libres += 1; else if (r.status === "En uso") g.enUso += 1; else g.mant += 1;
        m.set(t, g);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total || a.tipo.localeCompare(b.tipo, "es"));
}

