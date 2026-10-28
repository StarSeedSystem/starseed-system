/**
 * GENESIS · PUENTE DE LA ESCALERA CON EL ENRUTADOR DE ASTRAURA (Ola 1019G).
 * Módulo PURO: sin red, sin disco, sin reloj. Convierte la SALIDA de
 * `elegirCandidatos` (escalera.ts) en el orden de preferencia que entiende
 * `rankCandidates` (tipos `RouteCandidate` y `RankCandidatesOptions` de
 * src/ai/astraura/router.ts) y en la cadena por papel del enjambre (`PapelRuta`).
 * Solo traduce: doble puerta de prohibición y veto de pago de la personalidad.
 */
import type { RouteCandidate, RankCandidatesOptions } from "@/ai/astraura/router";
import type { CatalogSource, CatalogModel, SourceTier } from "@/ai/astraura/free-catalog";
import type { ProviderId } from "@/ai/providers/types";
import type { PapelRuta } from "@/lib/mando/enrutamiento";
import type { OpcionCatalogo, Papel, Privacidad } from "./catalogo-opciones";
import type { Candidato } from "./escalera";

/** Un eslabón de la cadena por papel del enjambre, con sitio empezando por 1. */
export interface EslabonEscalera {
    id: string;
    peldano: Candidato["peldano"];
    posicion: number;
    papel: PapelRuta;
    motivo: string;
}
/** Salida completa del puente. */
export interface SalidaEscalera {
    rutas: RouteCandidate[];
    cadena: EslabonEscalera[];
}
/** Entrada: la salida de `elegirCandidatos`, con doble puerta de prohibición
 * (`prohibidos`) y las opciones del ranking de Astraura (`opciones`). */
export interface EntradaEscalera {
    candidatas: Candidato[];
    catalogo: OpcionCatalogo[];
    papel: PapelRuta;
    prohibidos?: readonly string[];
    opciones?: RankCandidatesOptions;
}
/** Papel del catálogo que sirve a cada papel de la cadena del enjambre
 * (los generales de chat son quienes dirigen, como ya hace `enrutamiento.ts`). */
const PAPELES_CATALOGO_POR_ROL: Record<PapelRuta, Papel> = {
    escritor: "escritor",
    revisor: "revisor",
    director: "chat",
};
/** Peldaño 1 → 9, peldaño 6 → 4: el orden de la escalera, en la escala del ranking. */
const PUNTAJE_MESA = 10;

/** Id del proveedor de Astraura que sirve esta opción (lo más honesto por nombre). */
function proveedorDe(id: string): ProviderId {
    if (id.includes("astraura-158")) return "astraura-158";
    if (id.includes("ollama")) return "ollama";
    if (id.includes("openrouter")) return "openrouter";
    if (id.includes("groq")) return "groq";
    if (id.includes("nvidia")) return "nvidia";
    return "openai-compatible";
}
/** ¿Local, de clave gratuita o de pago? Del dato verificado, nunca inventado. */
function tierDe(op: OpcionCatalogo): SourceTier {
    if (op.privacidad === "local") return "local";
    return op.gratis !== null ? "free-key" : "paid";
}
function aPrivacidadAstraura(p: Privacidad): "local" | "browser" | "cloud" {
    if (p === "local") return "local";
    if (p === "nube-sin-retencion") return "browser";
    return "cloud";
}
function modeloDe(op: OpcionCatalogo): CatalogModel {
    return { id: op.id, label: op.nombre, strengths: [], quality: 0, note: "sin medir: no hay datos del vigía" };
}
/** Traduce una opción del catálogo Genesis a la `CatalogSource` de Astraura, conservando el motivo. */
function vistaDeOrigen(op: OpcionCatalogo, cand: Candidato, modelo: CatalogModel): CatalogSource {
    return {
        id: op.id, label: op.nombre, tier: tierDe(op), providerId: proveedorDe(op.id),
        baseUrl: "", requiresKey: op.requiereCuenta, getKeyUrl: op.enlaceClave ?? undefined,
        models: [modelo], limits: op.gratis?.nota ?? "", why: cand.motivo,
        privacy: aPrivacidadAstraura(op.privacidad), weight: 1,
    };
}

export function aplicarEscalera(entrada: EntradaEscalera): SalidaEscalera {
    const { candidatas, catalogo, papel, prohibidos, opciones } = entrada;
    const porId = new Map(catalogo.map((op) => [op.id, op]));
    const vetadas = new Set(prohibidos ?? []);
    const papelCatalogo = PAPELES_CATALOGO_POR_ROL[papel];
    const peldanoPorId = new Map(candidatas.map((c) => [c.candidatoId, c.peldano]));
    const rutas: RouteCandidate[] = [];
    for (const cand of candidatas) {
        if (vetadas.has(cand.candidatoId)) continue;
        const op = porId.get(cand.candidatoId);
        if (!op) continue;
        // El veto de pago de la personalidad solo PUEDE negar, nunca aflojar.
        if (opciones?.personaAllowsPaid === false && op.gratis === null) continue;
        const modelo = modeloDe(op);
        const aptaParaElPapel = op.papeles.includes(papelCatalogo);
        const prioridadLocal = cand.peldano === 1 && op.privacidad === "local";
        rutas.push({
            source: vistaDeOrigen(op, cand, modelo),
            model: modelo,
            score: PUNTAJE_MESA - cand.peldano + (aptaParaElPapel ? 0.5 : 0),
            reason: `${cand.motivo} · peldaño ${cand.peldano}`,
            fromUser: false,
            ...(prioridadLocal ? { local158Priority: true } : {}),
        });
    }
    rutas.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const d = (peldanoPorId.get(a.source.id) ?? 9) - (peldanoPorId.get(b.source.id) ?? 9);
        return d !== 0 ? d : a.source.id.localeCompare(b.source.id);
    });
    return {
        rutas,
        cadena: rutas.map((r, i) => ({
            id: r.source.id,
            peldano: peldanoPorId.get(r.source.id) ?? 6,
            posicion: i + 1,
            papel,
            motivo: r.reason,
        })),
    };
}
