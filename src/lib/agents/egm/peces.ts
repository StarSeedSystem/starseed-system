/**
 * EGM · PECES — revisores sin contexto (Ola 1104R, contrato
 * `architecture/repos-libreria-1104.md` §2).
 *
 * El elefante (el agente con su cerebro) redacta; los peces revisan lo que
 * produce viendo SOLO el artefacto y su tipo. Este módulo es PURO: sin red,
 * sin disco, sin `node:*` — lo puede importar el cliente.
 * Las llamadas a modelos gratuitos las hace quien lo usa (`revisarConPeces`,
 * tarea de cableado); aquí vive la costura de decisión con su prueba:
 *
 *   · `promptDePez(artefacto, tipo)` → el prompt del revisor, que fija el
 *     formato de respuesta: una objeción por línea con su gravedad
 *     (`bloquea` · `importa` · `menor`).
 *   · `leerObjeciones(texto)` → `{ gravedad, texto }[]` tolerante: ignora las
 *     líneas sin gravedad (el ruido del modelo) y quita duplicados.
 *   · `veredicto(objeciones)` → `{ pasa, bloqueantes }`: pasa si no hay
 *     ninguna objeción `bloquea`.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────

export type GravedadPez = "bloquea" | "importa" | "menor";

export type TipoArtefacto = "respuesta" | "plan" | "ola" | "pagina" | "app";

export interface Objecion {
  gravedad: GravedadPez;
  texto: string;
}

export interface VeredictoPez {
  pasa: boolean;
  bloqueantes: string[];
}

// ── promptDePez ──────────────────────────────────────────────────────────────

const ENCABEZADOS: Record<TipoArtefacto, string> = {
  respuesta: "una respuesta larga",
  plan: "un plan",
  ola: "una ola de tareas",
  pagina: "una página",
  app: "una aplicación (app)",
};

/** Una sola vez, sin duplicados ni reordenar: la lista de gravedades válidas. */
const GRAVEDADES: readonly GravedadPez[] = ["bloquea", "importa", "menor"];

export function promptDePez(artefacto: string, tipo: TipoArtefacto): string {
  const encabezado = ENCABEZADOS[tipo];
  return [
    `Eres un pez de EGM: un revisor que NO tiene contexto. No sabes quién escribe ni por qué:`,
    `solo te entregan ${encabezado} (tipo: ${tipo}) para que lo critiques tal cual lo ves.`,
    "",
    "ARTEFACTO:",
    artefacto,
    "",
    "Contesta SOLO con tus objeciones, una objeción por línea. Cada línea empieza por la gravedad",
    "seguida de dos puntos y el motivo en una frase: «bloquea: …» (debe corregirse antes de",
    "usar el artefacto), «importa: …» (conviene corregirlo, no impide usarlo), «menor: …»",
    "(detalle de forma o estilo). Escribe una objeción única por línea, sin redundancias.",
    "Si no tienes ninguna objeción, responde solo: «sin objeciones».",
  ].join("\n");
}

// ── leerObjeciones ───────────────────────────────────────────────────────────

/** Normaliza una línea para deduplicular: minúsculas, sin espacios de más. */
function claveUnica(texto: string): string {
  return texto.toLowerCase().replace(/\s+/g, " ").trim();
}

export function leerObjeciones(texto: string): Objecion[] {
  const vistas = new Set<string>();
  const objeciones: Objecion[] = [];
  for (const linea of texto.split("\n")) {
    const limpio = linea.replace(/^[\s*•·—-]+/, "").trim();
    // «bloquea: texto», «BLOQUEA:» y variantes de modelo con viñetas delante.
    const demarcado = /^(bloquea|importa|menor)\b[:\-–]?\s*/i.exec(limpio);
    if (!demarcado) continue;
    const gravedad = demarcado[1].toLowerCase() as GravedadPez;
    const texto = limpio.slice(demarcado[0].length).trim();
    if (!texto) continue;
    const clave = claveUnica(`${gravedad}: ${texto}`);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    objeciones.push({ gravedad, texto });
  }
  return objeciones;
}

// ── veredicto ────────────────────────────────────────────────────────────────

export function veredicto(objeciones: Objecion[]): VeredictoPez {
  const bloqueantes = objeciones
    .filter((o) => o.gravedad === "bloquea")
    .map((o) => o.texto);
  return { pasa: bloqueantes.length === 0, bloqueantes };
}

