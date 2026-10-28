// Cápsulas de memoria en la malla (MVD1027B, 2026-10-27) — módulo PURO: sin red, sin
// disco, sin procesos (contrato: architecture/memvid-capsulas.md §3; alcance:
// alcance-memoria.ts; servidor de cerebro: architecture/apps-en-la-malla.md).
//
// Un escritor por cápsula: escribe solo la neurona con el arriendo del sujeto (el
// servidor de cerebro); sin arriendo, la de más estabilidad con presencia viva. Nunca
// dos escritores: el cerrojo de Memvid (MV007) también lo exige.
import { type CapsulaMemoria } from "./capsulas";

/** Neurona de la malla tal como la ve el reparto de cápsulas. */
export interface NeuronaMalla {
  id: string;
  cuentaId: string;
  /** Declarado como servidor de cerebro (apps-en-la-malla.md). Preferencia, no permiso. */
  esServidorCerebro: boolean;
  /** Estabilidad medida (latidos, racha): gana la mayor, a igualdad gana el id menor. */
  estabilidad: number;
  /** Viva ahora mismo: una neurona dormida no escribe ni guarda réplicas. */
  presenciaViva: boolean;
}

/** Arriendo del sujeto de una cápsula, tal como llega del bus o de la puerta. */
export interface ArriendoSujeto {
  neuronaId: string;
  sujeto: { tipo: CapsulaMemoria["sujeto"]["tipo"]; id: string };
  /** Milisegundos absolutos; caducado no cuenta. */
  caducaEn: number;
}

/** Qué hacer con la cápsula desde esta neurona. */
export type AccionCapsula = "escribir" | "leer-replica" | "pedir-al-escritor";

/** Última copia sellada que ya tiene la neurona (tamaño con el que se selló, en bytes). */
export interface UltimaCopia {
  bytes: number;
  selladaEn: number;
}

/** Réplicas selladas cada 15 min, comprobadas al pasar el intervalo. */
export const INTERVALO_REPLICA_MS = 15 * 60 * 1000;

/** Cápsula en la malla: la de `capsulas.ts` más la cuenta dueña y el tamaño conocido
 * (del `GET /estado` del servidor de cápsulas), por si toca sellar otra réplica. */
export type CapsulaMalla = CapsulaMemoria & { cuentaId: string; estado?: { bytes: number } };

/** Quiénes son candidatos a escritor: para esta cápsula, con las reglas de alcance. */
export function candidatosEscritor(
  capsula: CapsulaMalla,
  neuronas: NeuronaMalla[],
): NeuronaMalla[] {
  const privada = capsula.alcance === "personal" || capsula.alcance === "perfil";
  return neuronas.filter(
    (n) => n.presenciaViva && (!privada || n.cuentaId === capsula.cuentaId),
  );
}

/**
 * La única neurona que escribe en la cápsula: la del arriendo vivo del sujeto; sin
 * arriendo, la de más estabilidad con presencia viva (a igualdad, el id menor, para que
 * dos nodos que calculan a la vez elijan lo mismo). Devuelve null si no hay ninguna.
 */
export function escritorDe(
  capsula: CapsulaMalla,
  neuronas: NeuronaMalla[],
  arriendos: ArriendoSujeto[],
  ahora: number = Date.now(),
): NeuronaMalla | null {
  const vivos = arriendos
    .filter((a) => a.caducaEn > ahora && a.sujeto.tipo === capsula.sujeto.tipo
      && a.sujeto.id === capsula.sujeto.id)
    .sort((a, b) => (b.caducaEn - a.caducaEn) || (a.neuronaId < b.neuronaId ? -1 : 1));
  if (vivos.length > 0) {
    return neuronas.find((n) => n.id === vivos[0].neuronaId && n.presenciaViva) ?? null;
  }
  return (
    candidatosEscritor(capsula, neuronas)
      .sort((a, b) => (b.estabilidad - a.estabilidad) || (a.id < b.id ? -1 : 1))[0] ?? null
  );
}

/**
 * Qué hacer con la cápsula desde esta neurona. Si ella es la del arriendo, «escribir»
 * (con la original, donde vive el cerrojo). Si no, una réplica sellada ya sirve para
 * leer; solo cuando todavía no la tiene va a por ella al escritor. Sin escritor,
 * nadie decide escribir por su cuenta: «pedir-al-escritor» y que la malla asiente.
 */
export function accionPara(
  neurona: NeuronaMalla,
  escritor: NeuronaMalla | null,
  tieneReplica: boolean,
): AccionCapsula {
  if (escritor !== null && neurona.id === escritor.id) return "escribir";
  return tieneReplica ? "leer-replica" : "pedir-al-escritor";
}

/**
 * ¿Le toca a esta neurona sellar una copia de la cápsula? Sí la primera vez, y después
 * cada 15 min, y solo si el tamaño cambió desde la última copia (el contenido de una
 * cápsula es «solo añadir», así el tamaño basta para saber que hay algo nuevo).
 * Una cápsula de alcance personal o perfil solo viaja cifrada y solo a neuronas de la
 * misma cuenta: a un extraño, nunca.
 */
export function debeReplicar(
  capsula: CapsulaMalla,
  neurona: NeuronaMalla,
  ultimaCopia: UltimaCopia | null,
  ahora: number = Date.now(),
): boolean {
  const privada = capsula.alcance === "personal" || capsula.alcance === "perfil";
  if (privada && (!capsula.cifrada || neurona.cuentaId !== capsula.cuentaId)) return false;
  if (ultimaCopia === null) return true;
  const vencida = ahora - ultimaCopia.selladaEn >= INTERVALO_REPLICA_MS;
  return vencida && ultimaCopia.bytes !== capsula.estado?.bytes;
}
