/**
 * StarSeed OS — EGM · los peces: revisores SIN contexto
 * ---------------------------------------------------------------------------
 * Patrón Elephant-Goldfish (google/elephant-goldfish-model, Apache-2.0):
 * un «elefante» con todo el contexto (el cerebro del perfil) redacta y uno o
 * varios «peces», que NO ven ese contexto, solo el artefacto y su tipo, lo
 * revisan. Cada pez devuelve una objeción por línea con su gravedad
 * (`bloquea` · `importa` · `menor`). Una persona (o el elefante) resuelve.
 *
 * Contrato: architecture/repos-libreria-1104.md §2.
 * Módulo PURO: sin `node:*`, sin red, sin disco ni claves. Lo importa el
 * cliente (Astraura y la Protomolécula antes de una respuesta o creación).
 * ---------------------------------------------------------------------------
 */

/** Artefactos que un pez puede revisar (los del contrato §2). */
export type TipoArtefacto = "respuesta" | "plan" | "ola" | "pagina" | "app";

/** Gravedad de una objeción: solo `bloquea` impide pasar. */
export type Gravedad = "bloquea" | "importa" | "menor";

/** Una objeción ya leída del texto de un pez. */
export interface Objecion {
  gravedad: Gravedad;
  texto: string;
}

/** Resultado de juzgar un conjunto de objeciones. */
export interface Veredicto {
  pasa: boolean;
  bloqueantes: Objecion[];
}

/** Qué se le pide al pez según el artefacto que revisa. */
const TIPO_DE_ARTEFACTO: Record<TipoArtefacto, string> = {
  respuesta: "una respuesta larga que se entregará a una persona",
  plan: "un plan de trabajo",
  ola: "una ola de tareas del enjambre",
  pagina: "una página publicada",
  app: "una aplicación",
};
/** Devuelve el prompt de un revisor que solo ve el artefacto y su tipo. */
export function promptDePez(
  artefacto: string,
  tipo: TipoArtefacto,
): string {
  return [
    "Eres un revisor «pez»: no tienes contexto, memoria ni conversación previa.",
    `Solo puedes juzgar el artefacto que aparece abajo (tipo: ${tipo}): ${TIPO_DE_ARTEFACTO[tipo]}.`,
    "No supongas nada que no esté escrito en él.",
    "",
    "Devuelve SOLO objeciones, una por línea, con este formato exacto:",
    "bloquea: <qué impide usar el artefacto tal como está>",
    "importa: <qué debería corregirse antes de usarlo>",
    "menor: <detalle opcional de estilo, precisión o redacción>",
    "",
    "Reglas:",
    "- Una objeción por línea; sin listas anidadas ni párrafos.",
    "- Usa «bloquea» solo si el artefacto no puede usarse así; «importa» si debe corregirse; «menor» si es cosmético.",
    "- No repitas objeciones ni inventes contexto que no esté en el artefacto.",
    "- Si no ves ninguna objeción, escribe: sin objeciones",
    "",
    `Artefacto (${tipo}):`,
    "---",
    artefacto,
    "---",
  ].join("\n");
}

/**
 * Una línea con gravedad: admite viñetas, numeración, corchetes, negritas,
 * cursivas, mayúsculas, «Gravedad:» y dos puntos o raya tras la gravedad.
 */
const LINEA_CON_GRAVEDAD =
  /^\s*(?:[-*•]\s*)?(?:\d+[.)]\s*)?(?:\[|[*_]{1,2})?\s*(?:gravedad\s*[:=]\s*)?(?:\[|[*_]{1,2})?\s*(bloquea|importa|menor)(?![a-z0-9áéíóúñ])[\s*_\]]*[:：.,;–—-]?\s*(.*)$/i;

/** Quita adornos de markdown/espacios sobrantes sin tocar el contenido. */
function normalizar(texto: string): string {
  return texto
    .replace(/^[\s*_`]+/, "")
    .replace(/[\s*_`]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clave para no repetir la misma objeción (gravedad + texto normalizado). */
function claveDe(objecion: Objecion): string {
  const texto = normalizar(objecion.texto).toLowerCase().replace(/[.;,]+$/, "");
  return `${objecion.gravedad}|${texto}`;
}

/** Lee el texto de un pez y devuelve sus objeciones (tolerante y sin duplicados). */
export function leerObjeciones(texto: string): Objecion[] {
  const vistas = new Set<string>();
  const objeciones: Objecion[] = [];

  for (const linea of texto.split(/\r?\n/)) {
    const coincidencia = LINEA_CON_GRAVEDAD.exec(linea);
    if (!coincidencia) continue;

    const gravedad = coincidencia[1].toLowerCase() as Gravedad;
    const contenido = normalizar(coincidencia[2]);
    if (!contenido) continue;

    const objecion: Objecion = { gravedad, texto: contenido };
    const clave = claveDe(objecion);
    if (vistas.has(clave)) continue;

    vistas.add(clave);
    objeciones.push(objecion);
  }

  return objeciones;
}

/** Pasa si no hay ninguna objeción `bloquea`. */
export function veredicto(objeciones: readonly Objecion[]): Veredicto {
  const bloqueantes = objeciones.filter((o) => o.gravedad === "bloquea");
  return { pasa: bloqueantes.length === 0, bloqueantes };
}
