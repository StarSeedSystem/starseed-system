// Reglas de ámbito de la libreta de ejemplos (architecture/jev-entrena-laya.md §5, JLA1116A).
// Qué es cada ámbito, quién puede leer su libreta y qué puede salir de ella. PURA: sin red, sin
// disco, sin reloj. «La fábrica» es el desarrollo del OS (decisiones del enjambre); su libreta
// vive fuera del repo y no sale a informes ni al repo.

export type AmbitoLibreta = "personal" | "pagina" | "grupo" | "colectivo" | "fabrica";

/** Quién intenta leer la libreta. */
export type LectorLibreta =
  | "persona"         // la persona dueña
  | "agente-personal" // agentes personales de la persona
  | "entidad"         // la entidad que gobierna la página o el grupo
  | "agente-entidad"  // agentes que la entidad designa
  | "alex"            // el desarrollo del OS (fábrica)
  | "cualquiera";     // cualquiera con acceso al ámbito colectivo

/** El dato MÁS privado que contiene el ejemplo: «público» = sin texto privado. */
export type AlcanceEjemplo = "personal" | "de-entidad" | "publico";

export interface EjemploLibreta {
  id: string;
  alcance: AlcanceEjemplo;
  /** La entidad del ámbito aprobó que este ejemplo salga (solo página/grupo). */
  aprobadoPorEntidad?: boolean;
}

export interface VeredictoSalida {
  sale: boolean;
  motivo: string;
}

/** Quién lee cada ámbito, tal cual la tabla de §5. */
export const QUIEN_LEE: Record<AmbitoLibreta, readonly LectorLibreta[]> = {
  personal: ["persona", "agente-personal"],
  pagina: ["entidad", "agente-entidad"],
  grupo: ["entidad", "agente-entidad"],
  colectivo: ["persona", "agente-personal", "entidad", "agente-entidad", "alex", "cualquiera"],
  fabrica: ["alex"],
};

export function puedeLeer(ambito: AmbitoLibreta, quien: LectorLibreta): boolean {
  return QUIEN_LEE[ambito].includes(quien);
}

/**
 * ¿Puede salir un ejemplo de la libreta de ese ámbito? Por defecto NADA sale:
 * · personal: solo con la elección explícita de la persona (`eleccion`).
 * · página/grupo: solo si la entidad lo aprobó; un ejemplo personal nunca sale por decisión ajena.
 * · colectivo: solo ejemplos públicos, sin texto privado.
 * · fábrica: nunca sale, ni al repo ni a informes.
 */
export function puedeSalir(ambito: AmbitoLibreta, ejemplo: EjemploLibreta, eleccion?: boolean): VeredictoSalida {
  switch (ambito) {
    case "personal":
      if (eleccion !== true) return { sale: false, motivo: "No sale sin la elección explícita de la persona." };
      return { sale: true, motivo: "Sale porque la persona lo eligió." };
    case "pagina":
    case "grupo":
      if (ejemplo.alcance === "personal") {
        return { sale: false, motivo: "Un ejemplo personal no sale por decisión de otra entidad." };
      }
      if (ejemplo.aprobadoPorEntidad !== true) {
        return { sale: false, motivo: "Solo sale por decisión de la entidad del ámbito." };
      }
      return { sale: true, motivo: "Sale porque la entidad del ámbito lo aprobó." };
    case "colectivo":
      if (ejemplo.alcance !== "publico") {
        return { sale: false, motivo: "El colectivo solo admite ejemplos públicos, sin texto privado." };
      }
      return { sale: true, motivo: "Es público: sale al colectivo." };
    case "fabrica":
      return { sale: false, motivo: "La fábrica nunca sale: ni al repo ni a informes." };
  }
}

/**
 * Comprueba que los ejemplos que alimentarían un adaptador del ámbito dado no contienen ninguno
 * personal: un adaptador de página o colectivo es un archivo que otros cargan y lo que aprendió
 * se puede recitar, así que no puede haber visto ejemplos personales. Los rechaza y explica;
 * no filtra en silencio. En los demás ámbitos la regla de §5 no ata y devuelve ok.
 */
export function soloPublicoParaAdaptador(
  ejemplos: readonly EjemploLibreta[],
  ambito: AmbitoLibreta,
): { ok: boolean; rechazados: { id: string; motivo: string }[] } {
  if (ambito !== "pagina" && ambito !== "colectivo") return { ok: true, rechazados: [] };
  const rechazados = (ejemplos ?? [])
    .filter((e) => e.alcance === "personal")
    .map((e) => ({ id: e.id, motivo: "Ejemplo personal: un adaptador de página o colectivo no puede haberlo visto." }));
  return { ok: rechazados.length === 0, rechazados };
}
