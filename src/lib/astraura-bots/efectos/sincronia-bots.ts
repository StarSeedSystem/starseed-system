"use client";

import { fusionarBots as fusionarNucleo } from "../fusionar-bots";
import type { Bot } from "../tipos";

/** Envoltorio que usan los adaptadores: los bots y su marca de actualización aparte. */
export interface EnvoltorioBots {
  bots: Bot[];
  actualizado: Record<string, number>;
}

/** Une dos envoltorios delegando la decisión en el núcleo puro `fusionar-bots`. */
export function fusionarBots(
  local: Readonly<EnvoltorioBots>,
  remoto: Readonly<EnvoltorioBots>
): EnvoltorioBots {
  const conMarca = (e: Readonly<EnvoltorioBots>) =>
    e.bots.map((b) => ({ ...b, actualizado: e.actualizado[b.id] ?? 0 }));
  const unidos = fusionarNucleo(conMarca(local), conMarca(remoto));
  const bots: Bot[] = [];
  const actualizado: Record<string, number> = {};
  for (const { actualizado: marca, ...bot } of unidos) {
    bots.push(bot);
    actualizado[bot.id] = marca;
  }
  return { bots, actualizado };
}

const CLAVE_ABIERTOS = "starseed.astraura.orbes-abiertos";

/** Orbes abiertas en esta neurona (se guardan solo aquí, nunca se sincronizan). */
export function abiertosEnEstaNeurona(): string[] {
  if (typeof window === "undefined") return [];
  try {
    migrarAbiertosDesdeAntigua();
    const bruto = window.localStorage.getItem(CLAVE_ABIERTOS);
    return bruto === null ? [] : Array.isArray(JSON.parse(bruto))
      ? JSON.parse(bruto) : [];
  } catch { return []; }
}

export function marcarAbierto(botId: string, abierto: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const abiertos = abiertosEnEstaNeurona();
    if (abierto) {
      if (!abiertos.includes(botId)) {
        window.localStorage.setItem(
          CLAVE_ABIERTOS,
          JSON.stringify([...abiertos, botId])
        );
      }
    } else {
      window.localStorage.setItem(
        CLAVE_ABIERTOS,
        JSON.stringify(abiertos.filter(id => id !== botId))
      );
    }
  } catch { /* best effort */ }
}

/** Migra los ids de la clave antigua `starseed.astraura.bots.abiertos.v1`. */
export function migrarAbiertosDesdeAntigua(): void {
  if (typeof window === "undefined") return;
  try {
    const antigua = window.localStorage.getItem("starseed.astraura.bots.abiertos.v1");
    if (antigua === null) return;
    const datos = JSON.parse(antigua);
    if (Array.isArray(datos) && datos.length > 0) {
      const actualBruto = window.localStorage.getItem(CLAVE_ABIERTOS);
      const actuales = actualBruto === null ? [] : (JSON.parse(actualBruto) || []);
      const combinados = Array.from(new Set([...actuales, ...datos])) as string[];
      window.localStorage.setItem(CLAVE_ABIERTOS, JSON.stringify(combinados));
    }
  } catch {
    // Si la clave antigua no existe o es ilegible, nada que migrar.
  }
}
