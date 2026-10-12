import type { UiSpec } from "../nucleo/ui-spec";
import { pareceCodigo, validarUiSpec } from "../nucleo/ui-spec";

/** Capa normalizada sin metadatos de identidad o tiempo. */
export type CapaNormalizada = {
  forma: "resaltar" | "nota" | "flecha" | "widget";
  objetivo?: string;
  texto?: string;
  uiSpec?: UiSpec;
};

/** Capa completa con id y timestamp. */
export type Capa = CapaNormalizada & {
  id: string;
  timestamp: number;
};

/**
 * Normaliza una capa a partir de los argumentos proporcionados.
 * Devuelve entweder la capa normalizada o un objeto con problemas.
 */
export function normalizarCapa(args: unknown): CapaNormalizada | { problemas: string[] } {
  const problemas: string[] = [];

  if (!args || typeof args !== "object") {
    problemas.push("Los argumentos deben ser un objeto");
    return { problemas };
  }

  const { forma, objetivo, texto, uiSpec } = args as {
    forma?: string;
    objetivo?: string;
    texto?: string;
    uiSpec?: unknown;
  };

  // Validar forma
  if (!forma || !(forma === "resaltar" || forma === "nota" || forma === "flecha" || forma === "widget")) {
    problemas.push('La forma debe ser "resaltar", "nota", "flecha" o "widget"');
  }

  // Validar objetivo (opcional, pero si se proporciona debe ser string)
  if (objetivo !== undefined && typeof objetivo !== "string") {
    problemas.push("El objetivo debe essere una cadena de texto");
  }

  // Validar texto (opcional)
  if (texto !== undefined) {
    if (typeof texto !== "string") {
      problemas.push("El texto debe essere una cadena de texto");
    } else {
      if (texto.length > 280) {
        problemas.push("El texto no debe exceder los 280 caracteres");
      }
      if (pareceCodigo(texto)) {
        problemas.push("El texto no debe contener código");
      }
    }
  }

  // Validar uiSpec (solo para widget)
  if (forma === "widget") {
    if (uiSpec === undefined) {
      problemas.push("El widget requiere una uiSpec");
    } else {
      const { spec, problemas: uiSpecProblemas } = validarUiSpec(uiSpec);
      if (!spec || uiSpecProblemas.length > 0) {
        problemas.push("La uiSpec del widget es inválida");
        // También podemos añadir los problemas específicos de la uiSpec
        problemas.push(...uiSpecProblemas);
      }
    }
  } else {
    // Si no es widget, uiSpec debe estar undefined
    if (uiSpec !== undefined) {
      problemas.push("Solo el widget puede tener uiSpec");
    }
  }

  if (problemas.length > 0) {
    return { problemas };
  }

  return {
    forma: forma as "resaltar" | "nota" | "flecha" | "widget",
    objetivo,
    texto,
    uiSpec: uiSpec as UiSpec | undefined,
  };
}

/**
 * Crea una capa completa a partir de una capa normalizada, asignando id y timestamp.
 */
export function crearCapa(normalizada: CapaNormalizada): Capa {
  return {
    ...normalizada,
    id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
    timestamp: Date.now(),
  };
}

/**
 * Apila una nueva capa sobre las existentes, manteniendo un máximo de 8 capas.
 * Descarta la capa más antigua cuando se supera el límite.
 */
export function apilar(capas: Capa[], nueva: Capa): Capa[] {
  const copia = [...capas];
  copia.push(nueva);
  if (copia.length > 8) {
    copia.shift(); // elimina el más antiguo (el primero)
  }
  return copia;
}

/**
 * Elimina una capa del array por su id.
 */
export function retirarPorId(capas: Capa[], id: string): Capa[] {
  return capas.filter(capa => capa.id !== id);
}