/**
 * EGM · Peces: el revisor sin contexto (Ola 1104R).
 *
 * Contrato: `architecture/repos-libreria-1104.md` §2. Un «elefante» con todo el
 * contexto redacta; los «peces» solo ven el artefacto y devuelven objeciones con
 * gravedad (`bloquea` · `importa` · `menor`). Este módulo es PURO: no lee disco,
 * no llama a red y no conoce claves; por eso lo puede importar el cliente.
 */

export type TipoArtefacto = "respuesta" | "plan" | "ola" | "página" | "app";
export type Gravedad = "bloquea" | "importa" | "menor";

export interface Objecion {
  gravedad: Gravedad;
  texto: string;
}

export interface Veredicto {
  pasa: boolean;
  bloqueantes: number;
}

/**
 * Devuelve el prompt de un pez: revisa SOLO el artefacto y su tipo, sin ver el
 * cerebro, la conversación ni ninguna memoria. Una objeción por línea.
 */
export function promptDePez(artefacto: string, tipo: TipoArtefacto): string {
  return [
    "Eres un pez: un revisor fresco que trabaja sin contexto.",
    "No ves el cerebro, la conversación, las memorias ni las intenciones del autor.",
    `Solo tienes el artefacto de tipo «${tipo}» y lo juzgas por lo que dice.`,
    "",
    "Devuelve únicamente objeciones, una objeción por línea, con este formato:",
    "  gravedad: objeción",
    "donde la gravedad es una de: bloquea · importa · menor.",
    "- bloquea: el artefacto no puede aprobarse ni publicarse así.",
    "- importa: hay un fallo real que debería corregirse antes de seguir.",
    "- menor: detalle de forma, estilo o redacción.",
    "Si no encuentras nada que objetar, escribe exactamente: sin objeciones.",
    "",
    `Artefacto (${tipo}):`,
    "-----",
    artefacto,
    "-----",
  ].join("\n");
}

const NIVELES: Record<Gravedad, number> = { menor: 0, importa: 1, bloquea: 2 };

/** Marca de gravedad al inicio de la línea, tolerando viñetas, números y negritas. */
const MARCA = /^[^A-Za-z0-9]*?(?:\d+\s*[.)]\s*)?(?:gravedad\s*[:·—–-]\s*)?(bloquea|importa|menor)(?![A-Za-z0-9])/i;

function normalizar(texto: string): string {
  return texto.trim().toLocaleLowerCase("es").replace(/\s+/g, " ");
}

/** Quita los cierres de la marca y el separador («:», «—», «·»…) que la siguen. */
function limpiarResto(resto: string): string {
  let texto = resto;
  let anterior = "";
  while (texto !== anterior) {
    anterior = texto;
    texto = texto
      .replace(/^[*_\]]+/, "")
      .replace(/^\s+/, "")
      .replace(/^[:.·—–-]\s*/, "")
      .replace(/^\s+/, "");
  }
  return texto.trim();
}

/** Lee objeciones de la respuesta de un pez con tolerancia a ruido y formato. */
export function leerObjeciones(texto: string): Objecion[] {
  const porTexto = new Map<string, Objecion>();
  for (const linea of texto.split(/\r?\n/)) {
    const marca = MARCA.exec(linea);
    if (!marca) continue;

    const contenido = limpiarResto(linea.slice(marca[0].length));
    if (!contenido) continue;

    const gravedad = marca[1].toLowerCase() as Gravedad;
    const clave = normalizar(contenido);
    const previa = porTexto.get(clave);
    if (!previa) {
      porTexto.set(clave, { gravedad, texto: contenido });
    } else if (NIVELES[gravedad] > NIVELES[previa.gravedad]) {
      porTexto.set(clave, { gravedad, texto: previa.texto });
    }
  }
  return [...porTexto.values()];
}

/** Un artefacto pasa si ningún pez levantó una objeción `bloquea`. */
export function veredicto(objeciones: Objecion[]): Veredicto {
  const bloqueantes = objeciones.filter((o) => o.gravedad === "bloquea").length;
  return { pasa: bloqueantes === 0, bloqueantes };
}
