/**
 * StarSeed XR · a quién y a dónde se refiere una frase («invita a Ana y a Luis», «este grupo», «la estación Cumbre»).
 * Devuelve las referencias o un FALLO con la pregunta exacta que hay que hacer. Nunca adivina.
 */
import { buscarEn, esDeictico, limpiar, porEnfoque, pregunta } from "./intenciones-ref";
import type { ContextoVoz, RefResuelta, ResultadoVoz, TipoRef } from "./intenciones-tipos";

export type Fallo = Extract<ResultadoVoz, { ok: false }>;
export const esFallo = (x: unknown): x is Fallo => typeof x === "object" && x !== null && "ok" in x;
export const fallo = (razon: Fallo["razon"], pregunta: string, sugerencias: string[] = [], candidatos?: RefResuelta[]): Fallo =>
    ({ ok: false, razon, pregunta, sugerencias, ...(candidatos ? { candidatos } : {}) });

const GENERICOS = /^(?:todos|todas|todo el mundo|todo mundo|ellos|ellas|la gente|cualquiera|alguien)$/;
const TIPO_GRUPO = /^(?:el |la |al |del )?(?:grupo|equipo|comunidad|colectivo)\b/;
const QUITA_PREP = /^(?:(?:a|al|para|con|de)\s+)+/;

/** Una sola referencia (persona, grupo, estación…) a partir de lo dicho. */
export function resolverUna(texto: string, ctx: ContextoVoz, tipos: TipoRef[], que: string): RefResuelta | Fallo {
    const t = limpiar(texto).replace(QUITA_PREP, "").trim();
    if (!t || GENERICOS.test(t)) return fallo("falta-dato", `¿${que === "grupo" ? "A qué grupo" : "A quién"} te refieres? Dime su nombre o señálalo.`, ctx.grupos.slice(0, 3).map((g) => g.nombre));
    const solo: TipoRef[] = TIPO_GRUPO.test(t) && tipos.includes("grupo") ? ["grupo"] : tipos;
    if (esDeictico(t)) {
        for (const tipo of tipos) {
            const e = porEnfoque(ctx, tipo);
            if (e) return e;
        }
        // «este grupo de amigos» sin nada señalado: aunque un nombre encaje, NO se elige solo (se ofrece y se pregunta).
        const d = buscarEn(solo, ctx, t);
        if (d.estado === "ninguno") return fallo("falta-dato", `No hay ${que} señalado. Míralo con el puntero y repite, o dime su nombre.`, []);
        const candidatos = d.estado === "exacto" ? [d.ref] : d.candidatos;
        return fallo("ambiguo", `No hay ${que} señalado. ${pregunta({ estado: "parcial", candidatos }, que, texto)}`, [], candidatos);
    }
    const b = buscarEn(solo, ctx, t);
    if (b.estado === "exacto") return b.ref;
    if (b.estado === "ninguno") return fallo("falta-dato", pregunta(b, que, texto), []);
    return fallo("ambiguo", pregunta(b, que, texto), [], b.candidatos);
}

/** Varias referencias separadas por «y», «e» o comas. Primero se prueba la frase entera (hay nombres con «y»). */
export function resolverVarias(texto: string, ctx: ContextoVoz, tipos: TipoRef[], que: string): RefResuelta[] | Fallo {
    const entero = limpiar(texto);
    if (esDeictico(entero.replace(QUITA_PREP, ""))) {
        const d = resolverUna(texto, ctx, tipos, que);
        return esFallo(d) ? d : [d];
    }
    const una = buscarEn(tipos, ctx, entero.replace(QUITA_PREP, ""));
    if (una.estado === "exacto") return [una.ref];
    const partes = entero.split(/\s*(?:,|;|\by\b|\be\b)\s+/).map((p) => p.trim()).filter(Boolean);
    if (!partes.length) return fallo("falta-dato", `¿${que === "grupo" ? "A qué grupo" : "A quién"}? Dime un nombre o señálalo.`, ctx.grupos.slice(0, 3).map((g) => g.nombre));
    const salida: RefResuelta[] = [];
    for (const p of partes) {
        const r = resolverUna(p, ctx, tipos, que);
        if (esFallo(r)) return r;
        if (!salida.some((x) => x.id === r.id && x.tipo === r.tipo)) salida.push(r);
    }
    return salida;
}
