/**
 * Bots/dots de Astraura · COMPUTADORA (BOT1011K).
 * Contrato: architecture/astraura-bots.md §7.
 *
 * Módulo puro: sin React, sin red, sin `node:*`, sin reloj.
 */
import { Bot, esInvitado } from "./tipos";


export type MedioComputadora = "a1" | "neurona" | "actions";

export interface PermisosComputadora {
  navegador: boolean;
  archivos: boolean;
  terminal: boolean;
  red: "lista" | "defecto" | "nada";
}

export const PERMISOS_COMPUTADORA_DEFECTO: PermisosComputadora = {
  navegador: false,
  archivos: false,
  terminal: false,
  red: "lista",
};

/**
 * Elige el medio de computadora para un bot según disponibilidad y necesidad.
 * Orden de preferencia: a1 → neurona → actions.
 * `actions` nunca para trabajo interactivo.
 * Un invitado nunca tiene computadora.
 * @param bot - El bot para el cual se elige la computadora.
 * @param disponibles - Array de medios disponibles, cada uno con su medio, si está libre y si es interactivo.
 * @param necesita - Objeto que indica si se necesita interactividad.
 * @returns Un objeto con el medio elegido o un motivo si no se puede asignar ninguna computadora.
 */
export function elegirComputadora(
  bot: Bot,
  disponibles: { medio: MedioComputadora; libre: boolean; interactivo: boolean }[],
  necesita: { interactivo: boolean }
): { medio: MedioComputadora } | { motivo: string } {
  if (esInvitado(bot)) {
    return { motivo: "Un invitado nunca tiene computadora." };
  }

  const ordenPreferencia: MedioComputadora[] = ["a1", "neurona", "actions"];
  for (const medio of ordenPreferencia) {
    const disponible = disponibles.find(
      d => d.medio === medio && d.libre && (medio !== "actions" || !necesita.interactivo)
    );
    if (disponible) {
      return { medio };
    }
  }

  return { motivo: "No hay medio de computadora disponible que satisfaga las condiciones." };
}

/**
 * Verifica si se tiene permiso para ejecutar una orden en la computadora del bot.
 * @param permisos - Los permisos de computadora del bot.
 * @param orden - La orden a ejecutar (string).
 * @returns Un objeto que indica si se permite la ejecución y un motivo en caso de denial.
 */
export function permisoParaOrden(
  permisos: PermisosComputadora,
  orden: string
): { ok: boolean; motivo?: string } {
  const ordenLower = orden.toLowerCase().trim();

  // Órdenes prohibidas siempre
  if (
    ordenLower.includes("docker") ||
    ordenLower.includes("sudo") ||
    ordenLower.includes("ssh") ||
    ordenLower.includes("/proc/") ||
    ordenLower.includes(".env")
  ) {
    return { ok: false, motivo: "Orden prohibida por motivos de seguridad." };
  }

  // Si la orden no está vacía, se asume que se ejecuta en la terminal
  if (orden.trim() !== "") {
    if (!permisos.terminal) {
      return { ok: false, motivo: "Se requiere permiso de terminal para ejecutar órdenes." };
    }
  }

  // Órdenes que requieren red
  const primerosPalabras = orden.trim().split(/\s+/)[0].toLowerCase();
  if (
    primerosPalabras === "curl" ||
    primerosPalabras === "wget" ||
    (primerosPalabras === "git" && orden.trim().startsWith("git clone"))
  ) {
    if (permisos.red === "nada") {
      return { ok: false, motivo: "Se requiere permiso de red para esta orden." };
    }
  }

  return { ok: true };
}