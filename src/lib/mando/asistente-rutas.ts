import type { ModeloParaRespaldo } from "./respaldo-chat";

export interface InformePasarela {
    t?: string;
    pasarelas?: Array<{ clave?: string; estado?: string }>;
}

export type Candidato = ModeloParaRespaldo | { id: string; proveedor?: string };

export function informeVigente(
    informe: InformePasarela | null | undefined,
    ahoraMs: number,
    maxMinutos = 30,
): boolean {
    if (!informe || !informe.t) return false;
    const t = informe.t.replace(" ", "T") + (informe.t.length <= 19 ? "Z" : "");
    const ms = Date.parse(t);
    if (!Number.isFinite(ms)) return false;
    const edadMin = (ahoraMs - ms) / 60000;
    return edadMin >= 0 && edadMin <= maxMinutos;
}

export function ordenarCandidatos<T extends Candidato>(
    candidatos: readonly T[],
    informe: InformePasarela | null | undefined,
    ahoraMs: number,
): T[] {
    if (!Array.isArray(candidatos) || candidatos.length === 0) return [];
    const vigente = informeVigente(informe, ahoraMs);
    if (!vigente) return [...candidatos];

    const estados: Record<string, string> = {};
    for (const f of (informe?.pasarelas ?? [])) {
        const k = (f?.clave || "").trim().toLowerCase();
        const e = (f?.estado || "").trim();
        if (k) estados[k] = e;
    }

    const malos = new Set(["sin_cupo", "sin_canal", "caida", "modelo_fuera"]);

    const provee = (c: T): string => {
        const cand = c as Candidato;
        const p = cand.proveedor;
        if (typeof p === "string" && p) return p.toLowerCase();
        const id = cand.id || "";
        const i = id.indexOf("/");
        return (i > 0 ? id.slice(0, i) : id).toLowerCase();
    };

    const esMalo = (p: string): boolean => malos.has(estados[p] || "");
    const esEscribe = (p: string): boolean => (estados[p] || "") === "escribe";

    const escriben: T[] = [];
    const desconocidos: T[] = [];

    for (const c of candidatos) {
        const p = provee(c);
        if (esMalo(p)) {
            // se descarta
        } else if (esEscribe(p)) {
            escriben.push(c);
        } else {
            desconocidos.push(c);
        }
    }

    const ordenados = [...escriben, ...desconocidos];
    if (ordenados.length === 0) return [...candidatos];
    return ordenados;
}
