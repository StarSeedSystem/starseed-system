// src/lib/modelos/preferencias-capas.ts

/**
 * Capas de conciencia y contexto de uso para preferencias de modelos.
 * Las preferencias se heredan: sistema › comunidad › grupo › persona › neurona.
 * Cada capa puede influir en las clases de licencia permitidas.
 * El contexto determina si el uso personal está permitido.
 */

export type Licencias = "libre" | "personal" | "condicionada" | "desconocida";

export interface CapasPrefs {
  sistema?: Licencias;
  comunidad?: Licencias;
  grupo?: Licencias;
  persona?: Licencias;
  neurona?: Licencias;
}

export type Contexto = "personal" | "grupo" | "comunidad" | "publico";

export interface ResultadoPreferencias {
  /** Clases de licencia permitidas después de aplicar todas las capas y el contexto. */
  licenciaPermitida: Licencias[];
  /** Indica si el uso personal está permitido en el contexto dado. */
  permiteUsoPersonal: boolean;
}

/**
 * Calcula las preferencias efectivas de licencias de modelo basado en las capas de conciencia y el contexto.
 *
 * @param capas - Las preferencias de cada capa (opcional). Las capas no especificadas no imponen restricciones adicionales.
 * @param contexto - El contexto de uso: personal, grupo, comunidad o publico.
 * @returns Las clases de licencia permitidas y si se permite uso personal.
 */
export function preferenciasEfectivas(
  capas: CapasPrefs,
  contexto: Contexto
): ResultadoPreferencias {
  // Comenzamos con un conjunto que siempre incluye libre (piso mínimo establecido por el sistema)
  const permitidas = new Set<Licencias>(["libre"]);

  // Capa comunidad: si especifica condicionada, entonces se permite condicionada
  if (capas.comunidad === "condicionada") {
    permitidas.add("condicionada");
  }

  // Capa grupo: si especifica condicionada, entonces se permite condicionada
  if (capas.grupo === "condicionada") {
    permitidas.add("condicionada");
  }

  // Capa persona: si especifica personal y el contexto es personal, entonces se permite personal
  if (capas.persona === "personal" && contexto === "personal") {
    permitidas.add("personal");
  }

  // Capa neurona: si se especifica, entonces filtra las licencias no-libre para mantener solo aquellas que coincidan con la preferencia de la neurona
  // (libre nunca se elimina porque es el piso mínimo)
  if (capas.neurona !== undefined) {
    const neuronaValor = capas.neurona;
    // Iteramos sobre una copia porque vamos a modificar el set
    for (const licencia of Array.from(permitidas)) {
      if (licencia !== "libre" && licencia !== neuronaValor) {
        permitidas.delete(licencia);
      }
    }
  }

  // Convertimos el set a un array, ordenado de manera consistente (por ejemplo, por orden de restrictividad)
  // Ordenamos de menos restrictiva a más restrictiva: libre, condicionada, personal, desconocida
  // Pero desconocida nunca debería estar en el set porque nunca la agregamos y la neurona solo puede dejarla si coincide exactamente.
  const licenciaPermitidaArray: Licencias[] = Array.from(permitidas).sort((a, b) => {
    const orden: Record<Licencias, number> = {
      libre: 0,
      condicionada: 1,
      personal: 2,
      desconocida: 3,
    };
    return orden[a] - orden[b];
  });

  // Determinamos si se permite uso personal: si la licencia personal está en el conjunto permitido
  const permiteUsoPersonal = permitidas.has("personal");

  return {
    licenciaPermitida: licenciaPermitidaArray,
    permiteUsoPersonal,
  };
}