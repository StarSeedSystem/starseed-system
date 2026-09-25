/**
 * ¿Esta instancia abre el Mando del PROYECTO? Lo decide `/api/mando/acceso` (la misma
 * regla que `guardianMando`). Ante cualquier duda —sin red, respuesta rara—, no.
 * Vive fuera de las páginas porque una página de Next solo puede exportar lo suyo.
 */
export async function preguntarAcceso(senal?: AbortSignal): Promise<boolean> {
    try {
        const r = await fetch("/api/mando/acceso", { cache: "no-store", signal: senal });
        const j = (await r.json().catch(() => null)) as unknown;
        return r.ok && !!j && typeof j === "object" && (j as { proyecto?: unknown }).proyecto === true;
    } catch {
        return false;
    }
}
