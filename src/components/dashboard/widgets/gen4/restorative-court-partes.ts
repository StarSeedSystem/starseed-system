/**
 * Círculos de Paz · piezas PURAS (Ola 0929-C).
 *
 * Los casos son los REALES de mediación de la red (`src/lib/governance/political.ts`:
 * `MediationCase`, entity_state «gov:mediation-cases» con espejo local
 * `starseed.politics.mediation.v1`). Justicia restaurativa, nunca punitiva: el widget solo
 * enseña el camino del círculo (solicitud → facilitación → círculo → acuerdo) y deja pedir uno.
 */

export type Etapa = "solicitada" | "facilitador_asignado" | "en_circulo" | "acuerdo" | "sin_acuerdo";

export interface Caso {
    id: string;
    title: string;
    description: string;
    participants: string[];
    facilitator?: string | null;
    stage: Etapa;
    createdByLabel?: string;
    createdAt: string;
    updates: { byLabel?: string; note: string; at: string }[];
}

export const CLAVE_ESPEJO = "starseed.politics.mediation.v1";

export const ETAPAS: { id: Etapa; corto: string; largo: string; color: string }[] = [
    { id: "solicitada", corto: "Solicitada", largo: "Solicitud recibida", color: "#94a3b8" },
    { id: "facilitador_asignado", corto: "Facilitación", largo: "Facilitador asignado", color: "#FFBF00" },
    { id: "en_circulo", corto: "En círculo", largo: "En Círculo de Paz", color: "#23d5ab" },
    { id: "acuerdo", corto: "Acuerdo", largo: "Acuerdo alcanzado", color: "#10B981" },
];
const SIN_ACUERDO = { id: "sin_acuerdo" as const, corto: "Sin acuerdo", largo: "Sin acuerdo (se puede reabrir)", color: "#DC143C" };

export function etapaDe(e: Etapa) {
    return e === "sin_acuerdo" ? SIN_ACUERDO : ETAPAS.find((x) => x.id === e) ?? ETAPAS[0];
}

/** Paso del camino (0-3); «sin acuerdo» también cierra el camino. */
export function pasoDe(e: Etapa): number {
    return e === "sin_acuerdo" ? 3 : Math.max(0, ETAPAS.findIndex((x) => x.id === e));
}

export function abierto(c: Pick<Caso, "stage">): boolean {
    return c.stage !== "acuerdo" && c.stage !== "sin_acuerdo";
}

function esCaso(v: unknown): v is Caso {
    const c = v as Caso;
    return !!c && typeof c.id === "string" && typeof c.title === "string" && typeof c.stage === "string";
}

export function normalizarCasos(v: unknown): Caso[] {
    return (Array.isArray(v) ? v : []).filter(esCaso).map((c) => ({
        ...c,
        participants: Array.isArray(c.participants) ? c.participants.filter((p) => typeof p === "string") : [],
        updates: Array.isArray(c.updates) ? c.updates : [],
        description: typeof c.description === "string" ? c.description : "",
    }));
}

/** Abiertos primero (los más avanzados antes), luego cerrados; dentro, lo más reciente. */
export function ordenarCasos(cs: Caso[]): Caso[] {
    return [...cs].sort((a, b) =>
        Number(abierto(b)) - Number(abierto(a))
        || (abierto(a) ? pasoDe(b.stage) - pasoDe(a.stage) : 0)
        || Date.parse(b.createdAt || "0") - Date.parse(a.createdAt || "0"));
}

/** «Ana, Luis; Marta» → ["Ana", "Luis", "Marta"] (sin vacíos ni duplicados, máx. 12). */
export function participantesDe(texto: string): string[] {
    const out: string[] = [];
    for (const p of texto.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)) if (!out.includes(p) && out.length < 12) out.push(p.slice(0, 60));
    return out;
}

export function leerEspejo(): Caso[] {
    try { return normalizarCasos(JSON.parse(localStorage.getItem(CLAVE_ESPEJO) || "[]")); } catch { return []; }
}
