/**
 * Consejo · piezas PURAS (Ola 0929-C).
 *
 * Los cinco consejeros son los REALES del Consejo de Aurora (`src/lib/aurora/council.ts`,
 * `COUNCIL_PERSPECTIVES`): aquí va solo su ficha ligera (id, nombre, color y fundamento) para
 * dibujarlos sin cargar el enrutador de IA hasta que de verdad se convoca al Consejo.
 * El último informe se guarda resumido en local para verlo al volver.
 */

export type Veredicto = "a_favor" | "en_contra" | "con_enmiendas" | "indeterminado";

export interface Consejero { id: string; nombre: string; corto: string; color: string; fundamento: string }

export const CONSEJEROS: Consejero[] = [
    { id: "ontocratico", nombre: "Consejero Ontocrático", corto: "Ontocracia", color: "#DC143C", fundamento: "Ontocracia: el Gobierno del Ser" },
    { id: "ecologico", nombre: "Consejero Ecológico", corto: "Oikos", color: "#10B981", fundamento: "Oikos: el hogar común" },
    { id: "abundancia", nombre: "Consejero de la Abundancia", corto: "Abundancia", color: "#FFBF00", fundamento: "Comunismo de Abundancia (post-escasez)" },
    { id: "simbiotico", nombre: "Consejero Simbiótico", corto: "Simbiosis", color: "#007FFF", fundamento: "Ciberdelia y Evolución Simbiótica" },
    { id: "empatico", nombre: "Consejera Empática", corto: "Empatía", color: "#B24BF3", fundamento: "Progresismo empático y justicia restaurativa" },
];

export const TEXTO_VEREDICTO: Record<Veredicto, string> = {
    a_favor: "A favor",
    en_contra: "En contra",
    con_enmiendas: "Con enmiendas",
    indeterminado: "Sin veredicto claro",
};

export const COLOR_VEREDICTO: Record<Veredicto, string> = {
    a_favor: "#10B981",
    con_enmiendas: "#FFBF00",
    en_contra: "#DC143C",
    indeterminado: "#94a3b8",
};

export interface DictamenResumido { id: string; ok: boolean; veredicto: Veredicto; fuente?: string }

export interface InformeResumido {
    tema: string;
    en: number;
    ms: number;
    dictamenes: DictamenResumido[];
    sintesis: { ok: boolean; veredicto: Veredicto; texto: string } | null;
    fuenteUnica: boolean;
    fuentes: string[];
    fallidos: number;
}

export const CLAVE_INFORME = "starseed.consejo.ultimo.v1";

/** Reduce el informe completo (`CouncilReport`) a lo que el widget necesita guardar. */
export function resumirInforme(r: {
    topic: string; at: number; ms: number;
    opinions: Array<{ perspective: { id: string }; ok: boolean; verdict: Veredicto; sourceLabel?: string }>;
    synthesis: { ok: boolean; verdict: Veredicto; text: string } | null;
    singleSource: boolean; sourcesUsed: string[]; failed: number;
}): InformeResumido {
    return {
        tema: r.topic,
        en: r.at,
        ms: r.ms,
        dictamenes: r.opinions.map((o) => ({ id: o.perspective.id, ok: o.ok, veredicto: o.ok ? o.verdict : "indeterminado", fuente: o.sourceLabel })),
        sintesis: r.synthesis ? { ok: r.synthesis.ok, veredicto: r.synthesis.verdict, texto: (r.synthesis.text || "").slice(0, 900) } : null,
        fuenteUnica: r.singleSource,
        fuentes: r.sourcesUsed.slice(0, 6),
        fallidos: r.failed,
    };
}

export function leerInforme(): InformeResumido | null {
    try {
        const j = JSON.parse(localStorage.getItem(CLAVE_INFORME) || "null");
        return j && typeof j.tema === "string" && Array.isArray(j.dictamenes) ? j : null;
    } catch { return null; }
}

export function guardarInforme(i: InformeResumido) {
    try { localStorage.setItem(CLAVE_INFORME, JSON.stringify(i)); } catch { /* sin almacén: vale en memoria */ }
}

/** Primera frase útil de la síntesis (sin marcas de formato). */
export function resumenSintesis(texto: string, max = 220): string {
    const limpio = texto.replace(/[#*_>`]/g, "").replace(/\s+/g, " ").trim();
    return limpio.length > max ? `${limpio.slice(0, max - 1).trimEnd()}…` : limpio;
}
