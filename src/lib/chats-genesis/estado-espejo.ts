/**
 * Chats de Genesis · ¿está viva la copia de la Mac? (GEN1113C, contrato §5.3 y §8).
 *
 * PURO. «En vivo» solo con un latido del espejo de 90 s o menos: a los 90 000 ms justos todavía es
 * vivo; a los 90 001, ya no. Un latido con la hora en el futuro (relojes desfasados) cuenta como de
 * ahora mismo. Sin latido, o con una hora que no se entiende, no hay nada vivo que decir.
 */

export const VIVO_MAX_MS = 90_000;

export function estadoEspejo(latido: { t: string } | null, ahora: number): { vivo: boolean; haceMs: number | null } {
    if (!latido || typeof latido.t !== "string" || !Number.isFinite(ahora)) return { vivo: false, haceMs: null };
    const en = Date.parse(latido.t);
    if (!Number.isFinite(en)) return { vivo: false, haceMs: null };
    const haceMs = Math.max(0, ahora - en);
    return { vivo: haceMs <= VIVO_MAX_MS, haceMs };
}
