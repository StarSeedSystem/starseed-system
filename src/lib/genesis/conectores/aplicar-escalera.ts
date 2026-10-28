/**
 * GENESIS · PUENTE CON EL ENRUTADOR DE ASTRAURA (Ola 1019G · GCA1019G)
 * ─────────────────────────────────────────────────────────────────────────────
 * Adaptador PURO entre la escalera de Genesis (`elegirCandidatos`) y el
 * enrutador de Astraura (`rankCandidates`): traduce el peldaño elegido al
 * ORDEN de preferencia del enrutador y reparte esa misma lista en la cadena
 * por papel del enjambre (`PapelRuta`). No toca la lógica del enrutador: solo
 * reordena sus candidatos reales y nunca inventa fuentes, modelos ni límites.
 *
 * Aquí no hay red, reloj, disco ni Supabase, y jamás se lee ni se devuelve el
 * valor de una clave. Lo privado se queda donde la escalera ya lo dejó: los
 * candidatos prohibidos no llegan a la preferencia.
 */

import type { RankCandidatesOptions, RouteCandidate } from "@/ai/astraura/router";
import type { PapelRuta } from "@/lib/mando/enrutamiento";
import type { OpcionCatalogo, Papel } from "./catalogo-opciones";
import type { Candidato, Preferencias } from "./escalera";

/** Papel del catálogo de Genesis → papel de la cadena del enjambre. */
const PAPEL_A_RUTA: Record<Papel, PapelRuta> = {
    escritor: "escritor",
    revisor: "revisor",
    código: "escritor",
    chat: "director",
    visión: "director",
    voz: "director",
    imagen: "director",
};

export interface EntradaAplicarEscalera {
    /** Salida de `elegirCandidatos`, ya filtrada y ordenada por peldaño. */
    candidatos: readonly Candidato[];
    /** Candidatos REALES de `rankCandidates`: se reordenan, no se fabrican. */
    delEnrutador: readonly RouteCandidate[];
    /** Catálogo del ámbito, para repartir la cadena por papel. */
    catalogo: readonly OpcionCatalogo[];
    /** Preferencias del ámbito: el pago solo se abre con su permiso. */
    preferencias: Preferencias;
}

export interface ResultadoAplicarEscalera {
    /** Ids elegidos, del peldaño más alto al más bajo. */
    orden: string[];
    /** Candidatos del enrutador en ese mismo orden; los prohibidos no aparecen. */
    preferencia: RouteCandidate[];
    /** Cadena por papel del enjambre, de mejor a peor candidato. */
    cadenas: Record<PapelRuta, string[]>;
    /** Opciones aditivas para `rankCandidates`: sin permiso, el pago se niega. */
    opciones: RankCandidatesOptions;
}

/** Ids de la escalera en orden de preferencia (peldaño ascendente). */
export function ordenDePreferencia(candidatos: readonly Candidato[]): string[] {
    return candidatos.map((c) => c.candidatoId);
}

/**
 * Reordena la salida REAL de `rankCandidates` según la escalera. Solo pasan los
 * ids que la escalera eligió: uno prohibido o descartado desaparece aunque el
 * enrutador lo hubiera propuesto. Se conserva el orden interno del enrutador
 * cuando una misma fuente entra con varios modelos.
 */
export function preferenciaDelEnrutador(
    delEnrutador: readonly RouteCandidate[],
    candidatos: readonly Candidato[],
): RouteCandidate[] {
    const posicion = new Map<string, number>();
    candidatos.forEach((c, i) => {
        if (!posicion.has(c.candidatoId)) posicion.set(c.candidatoId, i);
    });
    return delEnrutador
        .map((rc, i) => ({
            rc,
            i,
            pos: posicion.get(rc.source.id) ?? posicion.get(rc.model.id),
        }))
        .filter((x): x is { rc: RouteCandidate; i: number; pos: number } => x.pos !== undefined)
        .sort((a, b) => a.pos - b.pos || a.i - b.i)
        .map((x) => x.rc);
}

/** Cadena por papel del enjambre, sin repetir ids dentro de un mismo papel. */
export function cadenasPorPapel(
    candidatos: readonly Candidato[],
    catalogo: readonly OpcionCatalogo[],
): Record<PapelRuta, string[]> {
    const porId = new Map(catalogo.map((o) => [o.id, o]));
    const cadenas: Record<PapelRuta, string[]> = { escritor: [], revisor: [], director: [] };
    for (const c of candidatos) {
        const opcion = porId.get(c.candidatoId);
        if (!opcion) continue; // sin ficha en el catálogo no se adivina su papel
        const papeles = new Set(opcion.papeles.map((p) => PAPEL_A_RUTA[p]));
        for (const papel of papeles) {
            if (!cadenas[papel].includes(c.candidatoId)) cadenas[papel].push(c.candidatoId);
        }
    }
    return cadenas;
}

/**
 * Opciones para `rankCandidates`: si el ámbito no permite pago, se niega igual
 * que una personalidad que no gasta. Con permiso no se opina (`undefined`) y
 * manda la cuenta, como hasta ahora.
 */
export function opcionesDeRanking(preferencias: Preferencias): RankCandidatesOptions {
    return preferencias.permitirPago ? {} : { personaAllowsPaid: false };
}

/** Aplica la escalera completa: orden, preferencia real, cadenas y opciones. */
export function aplicarEscalera(e: EntradaAplicarEscalera): ResultadoAplicarEscalera {
    return {
        orden: ordenDePreferencia(e.candidatos),
        preferencia: preferenciaDelEnrutador(e.delEnrutador, e.candidatos),
        cadenas: cadenasPorPapel(e.candidatos, e.catalogo),
        opciones: opcionesDeRanking(e.preferencias),
    };
}
