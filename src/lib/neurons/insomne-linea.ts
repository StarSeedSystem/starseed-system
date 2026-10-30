/* insomne-linea — texto de la línea insomne junto a «Mantener encendida» (puro).
 * Contrato: architecture/neurona-insomne.md §5. Solo lee el EstadoInsomne que
 * devuelve `GET /api/neuronas/insomne`; nada de disco, proceso ni claves.
 * Cuando falta Insomnia, la línea enlaza a su ficha (repo público) para que la
 * persona la instale ella misma: el OS nunca la instala ni ejecuta `pmset`. */
import type { EstadoInsomne } from "./insomne";

export const FICHA_INSOMNIA_URL = "https://github.com/krishhgg/Insomnia";

export interface LineaEstadoInsomne {
  /** Texto plano de la línea, en español. */
  texto: string;
  /** `true` cuando Insomnia falta y la línea termina con enlace a su ficha. */
  ficha: boolean;
}

/** ¿Dice la ruta que Insomnia está instalada y legible en esta Mac? */
export function insomniaInstalada(estado: EstadoInsomne): boolean {
  return estado.proveedor === "insomnia";
}

/** «13:45» desde un ISO 8601, en hora local; `null` si no se puede. */
export function horaInsomnia(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t)
    ? new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
    : null;
}

/**
 * La línea del estado, con los tres casos de la ficha: sesión activa («siempre
 * disponible hasta las HH:MM con Insomnia»), sin sesión, o Insomnia no
 * instalada (→ enlace a su ficha). Nunca finge: si no hay datos, se dice tal cual.
 */
export function lineaEstadoInsomne(estado: EstadoInsomne): LineaEstadoInsomne {
  if (insomniaInstalada(estado)) {
    if (estado.activo) {
      const hora = horaInsomnia(estado.hasta);
      return {
        texto: hora
          ? `sesión activa de Insomnia, siempre disponible hasta las ${hora}`
          : "sesión activa de Insomnia, siempre disponible",
        ficha: false,
      };
    }
    return { texto: "Insomnia instalada, sin sesión activa ahora mismo", ficha: false };
  }
  // Sin Insomnia (o en otra plataforma) se dice el motivo real de la ruta, sin
  // suponer que es una Mac: la ficha explica cómo tenerlo.
  const motivo = estado.motivo.trim();
  return { texto: motivo !== "" ? motivo : "Insomnia no está disponible en esta neurona", ficha: true };
}
