// «Variantes sin filtros»: textos de la confirmación y disponibilidad por perfil (MOD1110B · 2026-11-10).
// Contrato: architecture/modelos-recomendados.md §10. Módulo PURO.

/** Lo que el perfil de la persona pueda declarar sobre su edad. Hoy StarSeed OS NO guarda nada de esto. */
export interface DatosEdadPersona {
  esMenor?: boolean | null;
  controlParental?: boolean | null;
  edad?: number | null;
}

/**
 * GANCHO ABIERTO (ver contrato §10, «Menores»). Se buscó en el repositorio (2026-11-10) un campo de edad, de menor o de
 * control parental en el perfil de la cuenta y NO existe (lo único con «cumpleaños» son las fichas de contactos). Hasta
 * que exista, esta función devuelve `null` y el interruptor queda disponible para todos. Cuando el perfil declare edad,
 * basta con devolverla aquí: `variantesDisponibles` ya bloquea el interruptor.
 */
export function datosEdadDelPerfil(): DatosEdadPersona | null {
  return null;
}

export interface DisponibilidadVariantes {
  disponible: boolean;
  /** Una frase para mostrar cuando no está disponible. */
  motivo: string | null;
}

export const EDAD_MINIMA_VARIANTES = 18;

/** ¿Puede este perfil ver el interruptor de variantes sin filtros? Menor, control parental o edad < 18 ⇒ no. */
export function variantesDisponibles(persona: DatosEdadPersona | null | undefined = datosEdadDelPerfil()): DisponibilidadVariantes {
  const p = persona ?? {};
  const menor = p.esMenor === true || (typeof p.edad === "number" && Number.isFinite(p.edad) && p.edad < EDAD_MINIMA_VARIANTES);
  if (menor) return { disponible: false, motivo: "Las variantes sin filtros no están disponibles en perfiles de menores de edad." };
  if (p.controlParental === true) return { disponible: false, motivo: "Las variantes sin filtros no están disponibles con el control parental activado." };
  return { disponible: true, motivo: null };
}

export const TITULO_CONFIRMACION_SIN_FILTROS = "Mostrar variantes sin filtros";

/** La explicación única que se enseña antes de encender el interruptor. */
export const EXPLICACION_SIN_FILTROS: readonly string[] = [
  "Qué son: modelos abiertos a los que un tercero de la comunidad (no el editor del modelo) les quitó los rechazos con una técnica llamada «abliteration». Son otra versión del mismo modelo.",
  "Su calidad no está medida: nadie las evaluó, y la puntuación que ves es la del modelo original, rotulada así. Algunas pierden el uso de herramientas y por eso no se ofrecen para código y agentes ni para bots.",
  "Responden cosas que la versión del editor rechaza. Lo que hagas con esas respuestas es responsabilidad tuya.",
  "Nunca se eligen solas: solo aparecen en la Biblioteca (Modelos de IA), las eliges tú a mano y solo se usan en tus conversaciones privadas en tu neurona. Jamás con otras personas (bots, dots, grupos, comunidades, páginas), ni en capas públicas, segundo plano o aprendizaje colectivo, ni se sirven a otra cuenta por la malla.",
  "Puedes apagarlo cuando quieras: se esconden y cualquier elección tuya vuelve a «Automático».",
];
