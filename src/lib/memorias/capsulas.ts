// Cápsulas de memoria Memvid (MVD1027A, 2026-10-27) — módulo PURO: sin red, sin disco,
// sin procesos (contrato: architecture/memvid-capsulas.md; alcance: alcance-memoria.ts).
// Sin ticket de memvid.com cada archivo tira a 50 MB: no se roza, se reparte en partes.
import {
  alcanceVisiblePara,
  type ActorMemoria,
  type AlcanceMemoria,
} from "@/lib/nucleo/alcance-memoria";
export type TipoSujeto =
  | "perfil" | "personalidad" | "agente" | "bot" | "pagina" | "grupo"
  | "comunidad" | "cerebro" | "capa";
export interface SujetoMemoria {
  tipo: TipoSujeto;
  id: string;
  grupoId?: string; // Grupo al que sirve: agente/bot de grupo, cerebro o capa compartida
}
export interface CapsulaMemoria {
  nombre: string; // <tipo>-<id saneado>-<AAAA>T<1-4>[b,c…].mv2(e)
  sujeto: { tipo: TipoSujeto; id: string };
  alcance: AlcanceMemoria;
  cifrada: boolean; // Obligatoria (.mv2e) en cápsulas de alcance personal o perfil
  periodo: string; // Trimestre con formato «2026T4»
  parte: number; // Parte del trimestre: 1 la primera, 2 «b», 3 «c»…
}
export const LIMITE_CAPSULA_BYTES = 50 * 1024 * 1024;
export const ROTAR_EN_BYTES = 45 * 1024 * 1024;

export interface ContextoCapsulas {
  perfilId?: string;
  personalidadId?: string;
  agenteId?: string;
  paginaId?: string;
  grupoId?: string;
  cerebroId?: string;
}
const ALCANCE_FIJO: Partial<Record<TipoSujeto, AlcanceMemoria>> = {
  perfil: "perfil", grupo: "grupo", pagina: "publica", comunidad: "publica",
};
/** Alcance de la cápsula de un sujeto: vida propia (personal) salvo lo que es de otros. */
export function alcanceDe(sujeto: SujetoMemoria): AlcanceMemoria {
  if (sujeto.grupoId) return "grupo";
  return ALCANCE_FIJO[sujeto.tipo] ?? "personal";
}

/** Personal y perfil van SIEMPRE cifradas; grupo y pública, por elección. */
export function cifradaObligatoria(alcance: AlcanceMemoria): boolean {
  return alcance === "personal" || alcance === "perfil";
}

/** «Perfil Álex Café_2» → «perfil-alex-cafe-2»: solo [a-z0-9-], nunca vacío. */
export function saneaId(id: string): string {
  const limpio = id
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/(^-|-$)/g, "");
  if (!limpio) throw new Error("El id del sujeto queda vacío al sanearlo");
  return limpio;
}

/** Trimestre con formato «2026T4», en UTC para que no dependa de la zona del servidor. */
export function periodoDe(fecha: Date): string {
  return `${fecha.getUTCFullYear()}T${Math.floor(fecha.getUTCMonth() / 3) + 1}`;
}

/** Nombre de archivo de la cápsula: p. ej. «personalidad-aurora-2026T4b.mv2e». */
export function nombreCapsula(
  sujeto: SujetoMemoria, fecha: Date, parte = 1, cifrada?: boolean,
): string {
  if (!Number.isInteger(parte) || parte < 1 || parte > 26) {
    throw new Error("La parte de la cápsula debe ser un entero entre 1 y 26");
  }
  const letra = parte === 1 ? "" : String.fromCharCode(96 + parte);
  return `${sujeto.tipo}-${saneaId(sujeto.id)}-${periodoDe(fecha)}${letra}${
    cifrada ?? cifradaObligatoria(alcanceDe(sujeto)) ? ".mv2e" : ".mv2"}`;
}

/** La cápsula entera del sujeto en ese trimestre, con el cifrado por obligación. */
export function capsulaDe(
  sujeto: SujetoMemoria, fecha: Date, parte = 1, cifrada?: boolean,
): CapsulaMemoria {
  const alcance = alcanceDe(sujeto);
  const vaCifrada = cifrada ?? cifradaObligatoria(alcance);
  if (cifradaObligatoria(alcance) && !vaCifrada) {
    throw new Error("Una cápsula personal o de perfil tiene que ir cifrada (.mv2e)");
  }
  return {
    nombre: nombreCapsula(sujeto, fecha, parte, vaCifrada),
    sujeto: { tipo: sujeto.tipo, id: sujeto.id },
    alcance, cifrada: vaCifrada, periodo: periodoDe(fecha), parte,
  };
}

/** Se cierra esta parte y se abre la siguiente al llegar al giro, nunca al tope de 50 MB. */
export function necesitaNuevaParte(tamano: number): boolean {
  return tamano >= ROTAR_EN_BYTES;
}

/** Cápsulas del contexto, de lo más cercano (personalidad, agente, cerebro, perfil) a lo
 * más general (grupo, página), filtradas con lo que el actor puede ver: a un agente de
 * grupo o público jamás se le lista la cápsula personal o de perfil de nadie. */
export function capsulasParaContexto(
  contexto: ContextoCapsulas, actor: ActorMemoria, fecha: Date = new Date(),
): CapsulaMemoria[] {
  const orden: Array<[TipoSujeto, string | undefined]> = [
    ["personalidad", contexto.personalidadId],
    ["agente", contexto.agenteId],
    ["cerebro", contexto.cerebroId],
    ["perfil", contexto.perfilId],
    ["grupo", contexto.grupoId],
    ["pagina", contexto.paginaId],
  ];
  const permitidos = new Set(alcanceVisiblePara(actor));
  return orden
    .flatMap(([tipo, id]) =>
      typeof id === "string" && id.trim().length > 0 ? [capsulaDe({ tipo, id }, fecha)] : [])
    .filter((c) => permitidos.has(c.alcance));
}
