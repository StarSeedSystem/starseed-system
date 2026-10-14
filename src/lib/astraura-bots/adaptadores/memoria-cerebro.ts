// Memoria del bot en los cerebros (BOT1011R · contrato architecture/astraura-bots.md §10).
//
// Adaptador inyectable: aplica los permisos del núcleo y delega en los cerebros
// y en la malla. Escritura real de referencia: `writeMemoryContentResilient` de
// `src/lib/brains/memory-offline.ts` (espejo optimista + cola offline del runtime
// de cerebros); transferencia real de referencia: `crearMotorArchivos().enviarArchivo`
// de `src/lib/network/archivos-malla.ts` (trozos con SHA-256). Nunca por LoRa y
// nunca se lanza nada: todo fallo vuelve como `{ ok: false, error }`.

import type { AlcanceMemoria } from "@/lib/nucleo/alcance-memoria";
import { puedeEscribirMemoria, puedeLeerMemoria } from "../permisos";
import {
  cuotaPara, planTransferencia, regular,
  type DestinoTransferencia, type Neurona, type RecuerdoBot, type TramoTransferencia,
} from "../memoria-bot";
import type { Bot, Medio } from "../tipos";

/** Recuerdo del bot tal como se guarda, con la cuenta propietaria (para `puedeLeerMemoria`). */
export interface RecuerdoEnCerebro extends RecuerdoBot {
  cuentaId: string;
}

/** Dependencias: TODO se inyecta (red, disco y reloj viven fuera de este módulo). */
export interface DepMemoriaCerebro {
  leer(botId: string): Promise<RecuerdoEnCerebro[]>;
  escribir(r: RecuerdoEnCerebro): Promise<boolean>;
  /** Borra SOLO del almacén del bot, jamás de los cerebros de la persona. */
  borrar(botId: string, ids: string[]): Promise<void>;
  origen(): Promise<Neurona>;
  destinos(bot: Bot): Promise<DestinoTransferencia[]>;
  /** Envía un tramo por la malla; `undefined` = esta neurona no tiene malla. */
  enviarPorMalla?: (
    tramo: TramoTransferencia, recuerdos: RecuerdoEnCerebro[],
  ) => Promise<{ ok: boolean; error?: string }>;
  ahora(): number;
}

export type ResultadoMemoria<T = undefined> =
  | ({ ok: true } & (T extends undefined ? Record<string, never> : { valor: T }))
  | { ok: false; error: string };

const fallo = (error: string): ResultadoMemoria<never> => ({ ok: false, error });

/** Deja un recuerdo al bot, solo si su alcance se lo permite (`puedeEscribirMemoria`). */
export async function recordar(
  bot: Bot, alcance: AlcanceMemoria, texto: string, dep: DepMemoriaCerebro,
): Promise<ResultadoMemoria<RecuerdoEnCerebro>> {
  try {
    if (!puedeEscribirMemoria(bot, alcance)) {
      return fallo(`«${bot.nombre}» no puede escribir en la memoria «${alcance}».`);
    }
    const recuerdo: RecuerdoEnCerebro = {
      id: `${bot.id}-${dep.ahora()}`, botId: bot.id, alcance, texto,
      origen: "bot", at: dep.ahora(), bytes: texto.length * 2, usos: 0,
      cuentaId: bot.dueno.cuentaId,
      ...(alcance === "grupo" ? { grupoId: bot.dueno.id } : {}),
    };
    return (await dep.escribir(recuerdo))
      ? { ok: true, valor: recuerdo }
      : fallo("El almacén del bot rechazó la escritura.");
  } catch {
    return fallo("No se pudo guardar el recuerdo.");
  }
}

/** Lee los recuerdos del bot filtrados por alcance y cuenta, y por la consulta si la hay. */
export async function recuerdos(
  bot: Bot, consulta: string, dep: DepMemoriaCerebro,
): Promise<ResultadoMemoria<RecuerdoEnCerebro[]>> {
  try {
    const visibles = (await dep.leer(bot.id)).filter((r) =>
      puedeLeerMemoria(bot, r.alcance, r.cuentaId));
    const q = consulta.trim().toLowerCase();
    const hallados = q === "" ? visibles : visibles.filter((r) => r.texto.toLowerCase().includes(q));
    return { ok: true, valor: hallados };
  } catch {
    return fallo("No se pudieron leer los recuerdos.");
  }
}

/** Aplica `regular` (BOT1011Q) y borra lo olvidado SOLO del almacén de ESTE bot. */
export async function regularAhora(
  bot: Bot, medio: Medio, dep: DepMemoriaCerebro,
): Promise<ResultadoMemoria<{ conservados: number; olvidados: string[] }>> {
  try {
    const { conservar, olvidar } = regular(await dep.leer(bot.id), cuotaPara(medio), dep.ahora());
    if (olvidar.length > 0) await dep.borrar(bot.id, olvidar.map((r) => r.id));
    return { ok: true, valor: { conservados: conservar.length, olvidados: olvidar.map((r) => r.id) } };
  } catch {
    return fallo("No se pudo regular la memoria del bot.");
  }
}

/** Transfiere recuerdos según `planTransferencia`, por la malla primero y nunca por LoRa. */
export async function transferir(
  bot: Bot, dep: DepMemoriaCerebro,
): Promise<ResultadoMemoria<{ enviados: number; tramos: number }>> {
  try {
    if (!dep.enviarPorMalla) return fallo("próximamente: esta neurona no tiene malla de archivos.");
    const lista = await dep.leer(bot.id);
    const plan = planTransferencia(lista, await dep.origen(), await dep.destinos(bot));
    let enviados = 0;
    for (const tramo of plan) {
      const recuerdosDelTramo = lista.filter((r) => tramo.ids.includes(r.id));
      const res = await dep.enviarPorMalla(tramo, recuerdosDelTramo);
      if (!res.ok) return fallo(res.error ?? "La malla no pudo enviar un tramo.");
      enviados += tramo.ids.length;
    }
    return { ok: true, valor: { enviados, tramos: plan.length } };
  } catch {
    return fallo("No se pudo transferir la memoria del bot.");
  }
}
