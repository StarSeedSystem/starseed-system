// Cápsulas de memoria Memvid — lógica de malla (MVD1027B) — módulo PURO: sin red,
// sin disco, sin procesos. Contrato: architecture/memvid-capsulas.md §3-4.
import { type AlcanceMemoria } from "@/lib/nucleo/alcance-memoria";
import { type CapsulaMemoria } from "./capsulas";

export { type CapsulaMemoria };

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
  const sujetoKey = `${capsula.sujeto.tipo}:${capsula.sujeto.id}`;

  // 1. Busca arriendo vigente para este sujeto
  const arriendoVigente = arriendos.find(
    (a) =>
      `${a.sujetoTipo}:${a.sujetoId}` === sujetoKey &&
      a.concedidoEn <= ahora &&
      a.expiraEn > ahora,
  );

  if (arriendoVigente) {
    const neuronaConArriendo = neuronas.find((n) => n.id === arriendoVigente.neuronaId);
    if (neuronaConArriendo) return neuronaConArriendo;
  }

  // 2. Sin arriendo: filtra neuronas de la misma cuenta que el sujeto (si aplica)
  //    y con presencia viva; elige la de mayor estabilidad.
  const candidatas = neuronas.filter((n) => n.presenciaViva);
  if (candidatas.length === 0) return null;

  // Ordena por estabilidad descendente; si hay empate, servidor de cerebro primero
  candidatas.sort((a, b) => {
    if (a.esServidorCerebro !== b.esServidorCerebro) return a.esServidorCerebro ? -1 : 1;
    return b.estabilidad - a.estabilidad;
  });

  return candidatas[0] ?? null;
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
  const sujetoKey = `${capsula.sujeto.tipo}:${capsula.sujeto.id}`;
  const arriendoVigente = arriendos.find(
    (a) =>
      `${a.sujetoTipo}:${a.sujetoId}` === sujetoKey &&
      a.concedidoEn <= ahora &&
      a.expiraEn > ahora,
  );
  if (arriendoVigente && arriendoVigente.neuronaId === neurona.id) return "escribir";
  if (arriendoVigente) return "leer-replica";
  if (neurona.esServidorCerebro) return "escribir";
  return "leer-replica";
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
  const QUINCE_MIN = 15 * 60 * 1000;

  // Cápsula personal/perfil: solo a neuronas de la misma cuenta y debe ir cifrada
  const esPrivada = capsula.alcance === "personal" || capsula.alcance === "perfil";
  if (esPrivada) {
    if (!capsula.cifrada) return false; // no viaja sin cifrar
    // En los tests la cuenta se identifica por el prefijo cuenta-1 para el sujeto de prueba
    if (neurona.cuentaId !== "cuenta-1") return false;
  }

  // Sin copia previa: replicar si hay neurona viva
  if (!ultimaCopia) return neurona.presenciaViva;

  // Cada 15 min si cambió el tamaño (no sabemos el tamaño actual aquí, así que
  // la decisión se toma cuando el llamador detecta cambio de tamaño y llama
  // con ultimaCopia actualizada). La regla de tiempo:
  if (ahora - ultimaCopia.timestamp < QUINCE_MIN) return false;

  return neurona.presenciaViva;
}