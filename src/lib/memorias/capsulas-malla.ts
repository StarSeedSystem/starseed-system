// Cápsulas de memoria Memvid — lógica de malla (MVD1027B) — módulo PURO: sin red,
// sin disco, sin procesos. Contrato: architecture/memvid-capsulas.md §3-4.
import { type AlcanceMemoria } from "@/lib/nucleo/alcance-memoria";
import { type CapsulaMemoria } from "./capsulas";

export interface NeuronaMalla {
  id: string;
  cuentaId: string;
  estabilidad: number; // 0..1 (medida de tiempo online continuado)
  presenciaViva: boolean; // latido < 3 min
  esServidorCerebro: boolean; // true si es el servidor de cerebro del sujeto
}

export interface ArriendoSujeto {
  sujetoTipo: string;
  sujetoId: string;
  neuronaId: string;
  concedidoEn: number; // timestamp ms
  expiraEn: number; // timestamp ms
}

export type AccionMalla = "escribir" | "leer-replica" | "pedir-al-escritor";

/**
 * Devuelve la neurona que escribe la cápsula: la que tiene el arriendo del sujeto
 * (servidor de cerebro). Si no hay arriendo vigente, la de más estabilidad y
 * presencia viva. Nunca devuelve dos.
 */
export function escritorDe(
  capsula: CapsulaMemoria,
  neuronas: NeuronaMalla[],
  arriendos: ArriendoSujeto[],
  ahora: number = Date.now(),
): NeuronaMalla | null {
  // TODO
  return null;
}

/**
 * Qué acción puede hacer una neurona con una cápsula:
 * - "escribir": es la escritora designada
 * - "leer-replica": puede leer la réplica sellada (open_read_only)
 * - "pedir-al-escritor": debe enviar la escritura por la malla al escritor
 */
export function accionPara(
  neurona: NeuronaMalla,
  capsula: CapsulaMemoria,
  arriendos: ArriendoSujeto[],
  ahora: number = Date.now(),
): AccionMalla {
  // TODO
  return "pedir-al-escritor";
}

/**
 * Decide si hay que replicar la cápsula a una neurona:
 * - copia sellada (solo lectura) cada 15 min si cambió el tamaño
 * - cápsula personal/perfil: solo viaja cifrada y solo a neuronas de la misma cuenta
 */
export function debeReplicar(
  capsula: CapsulaMemoria,
  neurona: NeuronaMalla,
  ultimaCopia: { tamano: number; timestamp: number } | null,
  ahora: number = Date.now(),
): boolean {
  // TODO
  return false;
}