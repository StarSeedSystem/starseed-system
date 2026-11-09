/*
 * acciones-timbre — «Ignorar», «Silenciar…» y «Deshacer» desde la tarjeta de la web (LLA1108F, 2026-11-09).
 * Contrato: architecture/llamadas-telefonia.md § 8.5.
 *
 * Una sola vía para la web, el teléfono y la ventana de escritorio: la política vive en silencio-llamadas.ts; esto
 * la aplica, avisa a la parte nativa (para el timbre y la ventana) y la espeja. Nunca lanza.
 */

import { claveParaAmbito, estaIgnorada, ignorarLlamada } from "./decision-timbre";
import { crearSilencio, depurar, poner, quitar, guardarSilencios, silenciosGuardados, type AmbitoSilencio, type DuracionSilencio } from "../silencio-llamadas";

export { estaIgnorada };

export interface QuienLlama {
  id: string;
  nombre: string;
  uid?: string;
  neurona?: string;
  chat?: string;
  medio?: string;
}

/** Pasa por el puente sin importarlo al cargar (este módulo se usa también en pruebas sin Tauri). */
async function nativo<T>(f: (p: import("./puente-llamada-nativa").PuenteLlamadaNativa) => Promise<T>): Promise<T | null> {
  try {
    const m = await import("./puente-llamada-nativa");
    const p = m.puenteLlamadaNativa();
    return p.disponible ? await f(p) : null;
  } catch {
    return null;
  }
}

/** «Ignorar»: la web calla y esconde la tarjeta; la parte nativa deja de sonar. Quien llama sigue oyendo el tono. */
export function ignorarEntrante(id: string): void {
  ignorarLlamada(id);
  void nativo((p) => p.ignorar(id));
}

/** Los ámbitos que se pueden ofrecer para esta llamada (solo los que se saben). */
export function ambitosPara(q: QuienLlama): AmbitoSilencio[] {
  return (["persona", "neurona", "chat", "medio", "todas"] as const).filter((a) => claveParaAmbito(a, q) !== null);
}

/** «Silenciar…»: guarda el silencio (queda espejado a lo nativo) e ignora esta llamada. Devuelve si se guardó. */
export function silenciarEntrante(q: QuienLlama, ambito: AmbitoSilencio, duracion: DuracionSilencio, ahora: number = Date.now()): boolean {
  const clave = claveParaAmbito(ambito, q);
  if (!clave) return false;
  const etiqueta = ambito === "todas" ? "Todas las llamadas" : ambito === "medio" ? clave : q.nombre;
  const s = crearSilencio({ ambito, clave, etiqueta, duracion, ahora });
  if (!s) return false;
  guardarSilencios(poner(silenciosGuardados(), s));
  ignorarEntrante(q.id);
  return true;
}

/** «Deshacer» / quitar de la lista de Ajustes. */
export function quitarSilencio(id: string, ahora: number = Date.now()): void {
  guardarSilencios(depurar(quitar(silenciosGuardados(), id, ahora), ahora));
}
