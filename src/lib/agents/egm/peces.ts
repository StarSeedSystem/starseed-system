/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — EGM · PECES (revisores sin contexto, TS puro)
 * ---------------------------------------------------------------------------
 * Contrato: architecture/repos-libreria-1104.md §2. Un elefante con contexto
 * redacta el artefacto; cada pez es un revisor que NO ve nada más que el
 * artefacto y su tipo, y contesta una objeción por línea con su gravedad
 * (bloquea · importa · menor). Módulo puro: sin red, sin disco, sin `node:*`,
 * importable desde cliente y servidor.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type TipoArtefacto = "respuesta" | "plan" | "ola" | "página" | "app";

export type Gravedad = "bloquea" | "importa" | "menor";

export interface Objecion {
  gravedad: Gravedad;
  texto: string;
}

export interface Veredicto {
  pasa: boolean;
  bloqueantes: Objecion[];
}

/** Lo que el prompt llama a cada artefacto, en español. */
const NOMBRE_DE_TIPO: Record<TipoArtefacto, string> = {
  respuesta: "una respuesta larga del agente",
  plan: "un plan de trabajo",
  ola: "una ola de tareas del enjambre",
  página: "una página del OS",
  app: "una aplicación",
};

/**
 * PROMPT del pez: solo sabe qué es el artefacto (su tipo) y lo que lee.
 * Ordena una objeción por línea empezando por la gravedad, para que
 * `leerObjeciones` pueda leer la salida de cualquier modelo gratuito.
 */
export function promptDePez(artefacto: string, tipo: TipoArtefacto): string {
  return [
    "Eres un pez: un revisor que NO ve ningún contexto previo, ni conversación,",
    "ni elecciones anteriores, ni porqué se escribió esto. Solo tienes lo que",
    `ves aquí: ${NOMBRE_DE_TIPO[tipo]}. Júzgaló por sí mismo.`,
    "",
    `(${NOMBRE_DE_TIPO[tipo]})`,
    artefacto,
    "",
    "Busca lo que dejaría mal un resultado: afirmaciones sin fundamento, pasos",
    "que no se pueden cumplir, contradicciones dentro del propio texto.",
    "Contesta SOLO con tus objeciones, UNA POR LÍNEA, empezando cada línea por",
    "su gravedad en minúscula, después un separador (·, :, |) y el problema:",
    "  bloquea · <lo que rompe la entrega, no se puede aprobar así>",
    "  importa · <fallo real, corregible antes de construir>",
    "  menor · <detalle de forma o estilo>",
    "Sin saludos, sin resumen, sin nada más. Si no ves nada digno de objeción,",
    "no escribas ninguna línea.",
  ].join("\n");
}

/** Una línea con gravedad permitida al principio: `bloquea · texto`, `- IMPORTA: …`, `1. menor · …`. */
const LINEA_OBJECION =
  /^\s*(?:[-*•]|\d+[.)]\s*)*\s*[[(]?\s*(bloquea|importa|menor)\b\s*[)\]]?\s*[|·:–—-]?\s*(.+)$/i;

/** Clave de duplicado: minúsculas, espacios de uno y sin puntuación al final. */
function claveDuplicado(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.¡!¿?]+$/, "")
    .trim();
}

export function leerObjeciones(texto: string): Objecion[] {
  const vistas = new Map<string, Objecion>();
  for (const linea of texto.split("\n")) {
    const pareja = LINEA_OBJECION.exec(linea);
    if (!pareja) continue;
    const gravedad = pareja[1].toLowerCase() as Gravedad;
    const textoObjecion = pareja[2].trim();
    if (!textoObjecion) continue;
    const clave = claveDuplicado(textoObjecion);
    if (vistas.has(clave)) continue;
    vistas.set(clave, { gravedad, texto: textoObjecion });
  }
  return [...vistas.values()];
}

/** Pasa si ninguna objeción bloquea; lista las bloqueantes como quedó. */
export function veredicto(objeciones: readonly Objecion[]): Veredicto {
  const bloqueantes = objeciones.filter((o) => o.gravedad === "bloquea");
  return { pasa: bloqueantes.length === 0, bloqueantes };
}
