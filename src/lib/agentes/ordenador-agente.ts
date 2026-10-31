// Estado del agente como carpeta con diario por ámbito y backend por la forma
// del trabajo (Ola 1025R, tarea CFC1025B).
//
// Es un PATRÓN sobre datos, no un conector: no llama a Cloudflare ni a nadie.
// Lo privado se queda en la neurona; el ordenador de fuera solo entra si el
// ámbito permite pago y la persona ya tiene su cuenta.
//
// Módulo PURO: sin red, sin disco y sin reloj (el tiempo entra por parámetro).

import type { AlcanceMemoria } from "@/lib/nucleo/alcance-memoria";

/** Qué clase de trabajo va a hacer el agente. */
export type FormaTrabajo = "archivos-y-datos" | "codigo-js" | "linux-completo";

/** Dónde se ejecuta ese trabajo. */
export type BackendOrdenador = "aislado-shell" | "aislado-js" | "contenedor";

/**
 * La carpeta de estado de un agente, como datos. La salida de red de cada
 * backend se fija en `none`: es una regla, no una opción de la persona.
 */
export const PLAN_ESTADO = {
  memoria: "memoria.md",
  notas: "notas/",
  resultados: "resultados/",
  diario: "diario.jsonl",
  red: "none",
} as const;

/** Una operación del diario, append-only y reconstruible. */
export interface EntradaDiario {
  t: number;
  op: "leer" | "escribir" | "editar" | "listar" | "ejecutar";
  ruta: string;
  bytes?: number;
}

/**
 * Deja el id en minúsculas, dígitos y guiones. Quita puntos, barras y todo lo
 * que no sea seguro para un nombre de carpeta; si no queda nada, es un error.
 */
function sanearId(agenteId: string): string {
  const limpio = agenteId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (limpio.length === 0) {
    throw new Error("El id del agente está vacío o no tiene ningún carácter válido.");
  }
  return limpio;
}

/** La ruta del diario siempre es relativa a la carpeta de estado. */
function validarRutaRelativa(ruta: string): void {
  if (ruta.startsWith("/")) {
    throw new Error("La ruta del diario no puede ser absoluta: debe ser relativa a la carpeta de estado.");
  }
  if (ruta.includes("..")) {
    throw new Error("La ruta del diario no puede contener «..»: no se sale de la carpeta de estado.");
  }
  if (ruta.includes("\\")) {
    throw new Error("La ruta del diario usa barras invertidas; usa barras normales.");
  }
}

/** Devuelve la carpeta de estado del agente dentro de su ámbito. */
export function carpetaDeEstado(agenteId: string, alcance: AlcanceMemoria): string {
  const id = sanearId(agenteId);
  return `agentes/${id}/${alcance}/`;
}

/** Serializa una entrada del diario como una sola línea JSON. */
export function lineaDiario(entrada: EntradaDiario): string {
  validarRutaRelativa(entrada.ruta);
  return JSON.stringify(entrada);
}

/** Elige el backend por la forma del trabajo, nunca por el contexto. */
export function elegirBackend(
  forma: FormaTrabajo,
  ctx: { privado: boolean; permitePago: boolean; cuentaCloudflare: boolean },
): { backend: BackendOrdenador | null; motivo: string } {
  if (ctx.privado) {
    return { backend: null, motivo: "lo privado se queda en la neurona" };
  }
  if (!ctx.permitePago) {
    return {
      backend: null,
      motivo: "Cloudflare Computer pide el plan Workers Paid: el ámbito no permite pago",
    };
  }
  if (!ctx.cuentaCloudflare) {
    return {
      backend: null,
      motivo: "falta la cuenta de Cloudflare de la persona (el OS no abre cuentas)",
    };
  }
  if (forma === "archivos-y-datos") {
    return {
      backend: "aislado-shell",
      motivo: "archivos y datos: shell aislado, sin red y sin tocar la neurona",
    };
  }
  if (forma === "codigo-js") {
    return {
      backend: "aislado-js",
      motivo: "código JavaScript: módulos ECMAScript en un Worker aislado",
    };
  }
  return {
    backend: "contenedor",
    motivo: "Linux completo: contenedor, lo más pesado y de pago, solo si hace falta",
  };
}
