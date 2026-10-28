// Malla de cápsulas Memvid (MVD1027B, 2026-10-27) — módulo PURO: sin red, sin disco,
// sin procesos. Contrato: architecture/memvid-capsulas.md §3 («un escritor por cápsula»)
// y apps-en-la-malla.md (servidor de cerebro). Repite la regla del cerrojo: never dos —
// escribe solo la neurona con el arriendo del sujeto; las demás leen réplicas selladas.
import type { CapsulaMemoria } from "@/lib/memorias/capsulas";
import { cifradaObligatoria } from "@/lib/memorias/capsulas";

/** Neurona de la malla, con lo que la bolsa ya mide (apps-en-la-malla.md §3). */
export interface NeuronaMalla {
  id: string;
  cuentaId: string;
  /** Sirve como servidor de cerebro (primera candidata al arriendo). */
  esServidorCerebro?: boolean;
  /** Estabilidad medida, de 0 a 1: latido continuo, sin caídas. */
  estabilidad: number;
  presenciaViva: boolean;
}

/** Arriendo de un sujeto a una neurona: el contrato de escritor único de esa cápsula. */
export interface ArriendoCapsula {
  sujeto: { tipo: string; id: string };
  neuronaId: string;
  /** Vence en epoch ms; pasado, cuenta como sin arriendo. */
  caduca: number;
}

/** Última réplica sellada que la neurona guardó de esta cápsula. */
export interface CopiaReplica {
  /** Sello de lectura: se abre solo con open_read_only, nunca en escritura. */
  sellada: boolean;
  cifrada: boolean;
  tamanoBytes: number;
  at: number;
}

/** Cada 15 min se mira si cambió el tamaño para mandar un sello nuevo. */
export const INTERVALO_REPLICA_MS = 15 * 60 * 1000;

/** Qué hacer con esta cápsula: escribirla (solo escritor), leer la réplica o pedirla. */
export type AccionCapsula = "escribir" | "leer-replica" | "pedir-al-escritor";

const mismoSujeto = (a: ArriendoCapsula, c: CapsulaMemoria): boolean =>
  a.sujeto.tipo === c.sujeto.tipo && a.sujeto.id === c.sujeto.id;
const porArriendo = (a: ArriendoCapsula, ahora: number): boolean => a.caduca > ahora;

/**
 * Quién escribe esta cápsula: la neurona con el arriendo vigente del sujeto (del disco
 * ninguna absolutamente); sin arriendo, la de más estabilidad con presencia viva — el
 * servidor de cerebro por delante. Devuelve UNA sola nunca dos, y null si no hay nadie.
 */
export function escritorDe(
  capsula: CapsulaMemoria,
  neuronas: NeuronaMalla[],
  arriendos: ArriendoCapsula[],
  ahora: number = Date.now(),
): NeuronaMalla | null {
  const vivas = neuronas.filter((n) => n.presenciaViva);
  if (vivas.length === 0) return null;
  const porId = new Map(vivas.map((n) => [n.id, n]));
  const arrendada = arriendos
    .filter((a) => mismoSujeto(a, capsula) && porArriendo(a, ahora) && porId.has(a.neuronaId))
    .map((a) => porId.get(a.neuronaId) as NeuronaMalla)
    .sort((x, y) => y.estabilidad - x.estabilidad)[0];
  if (arrendada) return arrendada;
  return [...vivas].sort((x, y) =>
    (y.esServidorCerebro ? 1 : 0) - (x.esServidorCerebro ? 1 : 0) ||
    y.estabilidad - x.estabilidad ||
    (x.id < y.id ? -1 : 1) // Desempate determinista: sin él jamás dos escritores
  )[0];
}

/**
 * Qué hace esta neurona con la cápsula: «escribir» si es la escritora designada,
 * «leer-replica» si ya guarda la copia sellada y «pedir-al-escritor» si no. Una cápsula
 * de alcance personal o perfil no llega a otra cuenta: null, como si no existiera.
 */
export function accionPara(
  neurona: NeuronaMalla,
  capsula: CapsulaMemoria,
  escritor: NeuronaMalla | null,
  opciones?: { cuentaCapsula?: string; replicaViva?: boolean },
): AccionCapsula | null {
  if (
    cifradaObligatoria(capsula.alcance) &&
    opciones?.cuentaCapsula !== undefined &&
    neurona.cuentaId !== opciones.cuentaCapsula
  ) return null;
  if (escritor && escritor.id === neurona.id) return "escribir";
  if (opciones?.replicaViva) return "leer-replica";
  return "pedir-al-escritor";
}

/**
 * Toca mandar un sello nuevo (open_read_only, solo lectura y verifica) cuando cambió el
 * tamaño y ya toca la ronda de cada 15 min; también si la copia guardada perdió su sello
 * o viajó sin el cifrado que su alcance exige. Personal y perfil solo a la misma cuenta.
 */
export function debeReplicar(
  capsula: CapsulaMemoria,
  neurona: NeuronaMalla,
  ultimaCopia: CopiaReplica | null,
  opciones?: { cuentaCapsula?: string; tamanoActual?: number; ahora?: number },
): boolean {
  if (
    cifradaObligatoria(capsula.alcance) &&
    opciones?.cuentaCapsula !== undefined &&
    neurona.cuentaId !== opciones.cuentaCapsula
  ) return false;
  if (!ultimaCopia) return true;
  if (!ultimaCopia.sellada) return true;
  if (ultimaCopia.cifrada !== capsula.cifrada) return true;
  const vence = (opciones?.ahora ?? Date.now()) - ultimaCopia.at >= INTERVALO_REPLICA_MS;
  if (!vence) return false;
  if (opciones?.tamanoActual === undefined) return true; // Sin medida, sello nuevo por ronda
  return ultimaCopia.tamanoBytes !== opciones.tamanoActual;
}
