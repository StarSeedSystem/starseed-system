// El estado de un agente como carpeta y su ordenador elegido por la FORMA del trabajo
// (Ola 1025R · CFC1025B). Patrón prestado de Cloudflare Computer sin depender de él:
// memoria, notas, resultados y diario append-only por ámbito. Módulo PURO: sin red,
// sin disco, sin procesos y sin reloj (el tiempo entra por `t`). Lo de fuera es DATO.

import type { AlcanceMemoria } from "@/lib/nucleo/alcance-memoria";

/** Qué forma tiene el trabajo que el agente va a hacer. */
export type FormaTrabajo = "archivos-y-datos" | "codigo-js" | "linux-completo";

/** Qué backend de ejecución le corresponde a cada forma de trabajo. */
export type BackendOrdenador = "aislado-shell" | "aislado-js" | "contenedor";

/** La carpeta de estado de un agente, como datos. La salida de red es una regla: `none`. */
export const PLAN_ESTADO = {
  memoria: "memoria.md",
  notas: "notas/",
  resultados: "resultados/",
  diario: "diario.jsonl",
  red: "none",
} as const;

/** Las operaciones que quedan registradas en el diario del agente. */
export type OperacionDiario = "leer" | "escribir" | "editar" | "listar" | "ejecutar";

export interface EntradaDiario {
  t: number;
  op: OperacionDiario;
  ruta: string;
  bytes?: number;
}

export interface ContextoOrdenador {
  privado: boolean;
  permitePago: boolean;
  cuentaCloudflare: boolean;
}

export interface DecisionOrdenador {
  backend: BackendOrdenador | null;
  motivo: string;
}

/** Deja un id en minúsculas, dígitos y guiones; lanza si no queda nada usable. */
function sanearId(agenteId: string): string {
  const limpio = String(agenteId ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (limpio.length === 0) {
    throw new Error("El identificador del agente está vacío o no deja nada usable al sanearlo.");
  }
  return limpio;
}

/** Carpeta de estado del agente para un ámbito: `agentes/<id>/<alcance>/`. */
export function carpetaDeEstado(agenteId: string, alcance: AlcanceMemoria): string {
  return `agentes/${sanearId(agenteId)}/${alcance}/`;
}

/** Lanza si la ruta no es relativa a la carpeta de estado del agente. */
function comprobarRuta(ruta: string): void {
  if (typeof ruta !== "string" || ruta.trim().length === 0) {
    throw new Error("La ruta del diario no puede estar vacía: debe ser relativa a la carpeta de estado.");
  }
  if (ruta.startsWith("/")) {
    throw new Error("La ruta del diario no puede ser absoluta: debe ser relativa a la carpeta de estado.");
  }
  if (ruta.includes("..")) {
    throw new Error("La ruta del diario no puede contener «..»: se sale de la carpeta de estado.");
  }
  if (ruta.includes("\\")) {
    throw new Error("La ruta del diario no puede llevar barra invertida: usa rutas relativas con «/».");
  }
}

/** Una entrada del diario como una sola línea JSON, sin saltos de línea. */
export function lineaDiario(e: EntradaDiario): string {
  comprobarRuta(e.ruta);
  return JSON.stringify({ t: e.t, op: e.op, ruta: e.ruta, ...(e.bytes === undefined ? {} : { bytes: e.bytes }) });
}

// Todos los motivos nombran la salida de red: es una regla fija, no una opción.
const MOTIVOS: Record<FormaTrabajo, string> = {
  "archivos-y-datos": "archivos y datos se resuelven en un shell aislado; la salida de red queda en none",
  "codigo-js": "el código JavaScript corre en un módulo aislado; la salida de red queda en none",
  "linux-completo": "hace falta un Linux completo, así que va el contenedor, el backend más pesado; la salida de red queda en none",
};

const BACKENDS: Record<FormaTrabajo, BackendOrdenador> = {
  "archivos-y-datos": "aislado-shell",
  "codigo-js": "aislado-js",
  "linux-completo": "contenedor",
};

/**
 * Elige el backend por la forma del trabajo. El orden de las negativas manda: lo
 * privado no sale de la neurona aunque haya cuenta y pago; sin pago no hay nada de
 * Cloudflare Computer; sin cuenta de la persona tampoco, porque el OS no abre cuentas.
 */
export function elegirBackend(forma: FormaTrabajo, ctx: ContextoOrdenador): DecisionOrdenador {
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
  return { backend: BACKENDS[forma], motivo: MOTIVOS[forma] };
}
