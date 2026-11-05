// StarSeed OS — EGM · los peces, el revisor SIN contexto.
// Contrato: architecture/repos-libreria-1104.md §2. El elefante redacta con su cerebro; los
// peces solo ven el artefacto y su tipo y objetan con gravedad. Módulo PURO: sin red, sin
// disco y sin `node:*` (lo importa el cliente; CLAUDE.md, trampa 11).

/** Las tres gravedades de una objeción, de la más dura a la más leve. */
export const GRAVEDADES = ["bloquea", "importa", "menor"] as const;

export type Gravedad = (typeof GRAVEDADES)[number];

/** Los artefactos que un pez sabe revisar. «página» se acepta con tilde. */
export const TIPOS_ARTEFACTO = ["respuesta", "plan", "ola", "pagina", "app"] as const;

export type TipoArtefacto =
  | (typeof TIPOS_ARTEFACTO)[number]
  | "página";

export interface Objecion {
  gravedad: Gravedad;
  texto: string;
}

export interface Veredicto {
  /** true solo si no hay ninguna objeción de gravedad `bloquea`. */
  pasa: boolean;
  bloqueantes: number;
}

const ETIQUETAS_TIPO: Readonly<Record<TipoArtefacto, string>> = {
  respuesta: "respuesta de un agente",
  plan: "plan de trabajo",
  ola: "ola del enjambre (tareas pequeñas con puertas)",
  pagina: "página web",
  página: "página web",
  app: "aplicación",
};

/** Prompt de un revisor que NO ve contexto: solo el artefacto y su tipo. */
export function promptDePez(artefacto: string, tipo: TipoArtefacto): string {
  const cuerpo = artefacto.trim().length > 0 ? artefacto.trim() : "(sin contenido)";
  return [
    "Eres un revisor «pez» de EGM: miras un artefacto con ojos frescos y sin contexto.",
    "",
    "LO QUE NO TIENES: no conoces la conversación, el cerebro, las memorias, el historial ni a la",
    "persona. Solo ves el artefacto y su tipo. No supongas intenciones ni datos que no estén escritos.",
    `TIPO DE ARTEFACTO: ${ETIQUETAS_TIPO[tipo]}.`,
    "",
    "TU TAREA: señalar solo lo que un lector sin contexto no puede aprobar o entender tal como está.",
    "Responde UNA objeción por línea, sin introducción, sin conclusiones y sin repetir el artefacto.",
    "Cada línea empieza por la gravedad y un separador:",
    "  bloquea · no se puede aprobar ni publicar así",
    "  importa · debería corregirse antes de dar por bueno el artefacto",
    "  menor · detalle de estilo o precisión que no impide aprobarlo",
    "Ejemplo: bloquea · afirma un dato sin fuente y sin forma de comprobarlo",
    "Si no hay nada que objetar, escribe exactamente: sin objeciones",
    "",
    "No inventes contexto que no esté en el artefacto; si falta un dato decisivo, dilo como objeción.",
    "No propongas reescribirlo entero: señala el problema y qué falta. Escribe en español.",
    "",
    "ARTEFACTO:",
    cuerpo,
  ].join("\n");
}

const RE_GRAVEDAD = /^(bloquea(?:nte)?|importa(?:nte)?|menor(?:es)?)\b/i;

/** Quita viñetas, numeración, casillas y énfasis que el modelo pone delante. */
function limpiarInicio(linea: string): string {
  let s = linea.trim();
  for (let i = 0; i < 2; i++) {
    s = s.replace(/^(?:[-*+•·>]|\d+[.)])\s+/, "").trim();
    s = s.replace(/^\[[ xX]?\]\s*/, "").trim();
  }
  return s.replace(/^(?:\*\*|__|\*|_|\[|\(|«|")\s*(?=(?:bloquea|importa|menor))/i, "");
}

function gravedadDe(palabra: string): Gravedad {
  const p = palabra.toLowerCase();
  if (p.startsWith("bloquea")) return "bloquea";
  if (p.startsWith("importa")) return "importa";
  return "menor";
}

/** Quita el separador y la decoración que quedan entre la gravedad y el texto. */
function limpiarResto(resto: string): string {
  return resto
    .replace(/^[\s:·|,\-–—\])}>*_»"]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lee objeciones de la respuesta de un modelo, tolerando ruido y duplicados. */
export function leerObjeciones(texto: string): Objecion[] {
  const vistas = new Set<string>();
  const salida: Objecion[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const limpia = limpiarInicio(linea);
    const m = RE_GRAVEDAD.exec(limpia);
    if (!m || !m[1]) continue;
    const gravedad = gravedadDe(m[1]);
    const resto = limpiarResto(limpia.slice(m[0].length));
    if (resto.length === 0) continue;
    const clave = `${gravedad}:${resto.toLowerCase()}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push({ gravedad, texto: resto });
  }
  return salida;
}

/** Veredicto de un conjunto de objeciones: pasa si no hay `bloquea`. */
export function veredicto(objeciones: readonly Objecion[]): Veredicto {
  const bloqueantes = objeciones.reduce(
    (total, objecion) => total + (objecion.gravedad === "bloquea" ? 1 : 0),
    0,
  );
  return { pasa: bloqueantes === 0, bloqueantes };
}
