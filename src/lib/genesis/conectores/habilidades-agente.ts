/**
 * GENESIS · HABILIDADES PARA AGENTES (Ola 1019G · GCA1019Wc)
 * ---------------------------------------------------------
 * Elige, para un papel o un director, las habilidades de la Biblioteca que le
 * sirven, y las entrega al tamaño que cabe en la capa del modelo elegido:
 * tarjeta (≤ 60 palabras, Needle/BitNet), resumen (≤ 250, Bonsai 1,7–4B) o
 * completa (razón, profunda y nube). Contrato: architecture/laya-y-habilidades.md.
 *
 * Módulo PURO: no toca red, reloj, disco ni Supabase. `ambito` solo se usa
 * para leer desactivaciones con prefijo (`cuenta:av-gen`, `*:av-gen`).
 */
import type { SkillCapability } from "@/ai/astraura/skills";

export type CapaModelo = "tarjeta" | "resumen" | "completa";

/** Rutas de `routing` que necesita cada papel o director. */
const RUTAS_POR_PAPEL: Record<string, Array<keyof NonNullable<SkillCapability["routing"]>>> = {
  escritor: ["preferStrong", "planning"],
  revisor: ["preferStrong", "vision"],
  director: ["preferStrong", "planning", "web", "vision"],
  chat: ["preferStrong", "web", "vision"],
  optimizador: ["preferStrong", "planning"],
  diseno: ["preferStrong", "vision"],
  produccion: ["preferStrong", "planning"],
  nube: ["web", "preferStrong"],
  medidores: ["planning", "preferStrong"],
  aprendizaje: ["preferStrong", "planning"],
  vision: ["vision"],
  voz: [],
  imagen: ["vision", "preferStrong"],
  codigo: ["preferStrong", "planning"],
};
/** Palabras de la etiqueta o el id que delatan que una habilidad es del papel. */
const ETIQUETAS_POR_PAPEL: Record<string, string[]> = {
  escritor: ["escrib", "redacc", "texto"],
  revisor: ["revis", "auditor", "calidad"],
  director: ["orquest", "planific", "director"],
  chat: ["chat", "convers"],
  optimizador: ["optimiz", "rendimiento"],
  diseno: ["diseno", "design", "estetica", "ui"],
  produccion: ["produccion", "flujo", "despliegue"],
  nube: ["nube", "cloud", "despliegue"],
  medidores: ["medidor", "medida", "potencia", "benchmark"],
  aprendizaje: ["aprend", "memoria"],
  vision: ["vision", "visual", "imagen"],
  voz: ["voz", "audio", "voice"],
  imagen: ["imagen", "visual", "dibujo"],
  codigo: ["codigo", "program", "desarrollo", "dev"],
};
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Traduce un id de modelo a la capa donde va a responder (medido o conocido). */
export function capaParaModelo(modelo: string): CapaModelo {
  const id = normalizar(modelo);
  if (/needle|bitnet|1\.58|reflejo/.test(id)) return "tarjeta";
  if (/bonsai|mini|small|tiny|nano|\b[1-8]b\b/.test(id)) return "resumen";
  return "completa";
}
function recortarTexto(texto: string, capa: CapaModelo): string {
  const limite = capa === "tarjeta" ? 60 : capa === "resumen" ? 250 : 0;
  if (limite === 0) return texto;
  const palabras = texto.split(/\s+/).filter(Boolean);
  if (palabras.length <= limite) return texto;
  return palabras.slice(0, limite).join(" ") + "...";
}
export type OpcionesHabilidades = {
  capacidades: SkillCapability[];
  /** Ids apagados: `av-gen`, `cuenta:av-gen` o `*:av-gen` (todos los ámbitos). */
  desactivadas: string[];
  /** Capa del modelo elegido; si falta, manda el cuarto argumento. */
  capa?: CapaModelo;
};
function relevoDesactivado(id: string, ambito: string, desactivadas: string[]): boolean {
  const sufijo = `:${id}`;
  return desactivadas.some((clave) => clave === id || clave === `*${sufijo}` ||
    clave === `${ambito}${sufijo}` || normalizar(clave) === `${normalizar(ambito)}${sufijo}`);
}
function coincideEtiqueta(etiqueta: string, palabra: string): boolean {
  const patron = palabra.length <= 3 ? new RegExp(`(^|[^a-z0-9])${palabra}([^a-z0-9]|$)`) : null;
  return patron ? patron.test(etiqueta) : etiqueta.includes(palabra);
}
function sirvePara(habilidad: SkillCapability, papelNormalizado: string): boolean {
  const rutas = RUTAS_POR_PAPEL[papelNormalizado] ?? ["preferStrong"];
  const routing = habilidad.routing;
  if (!routing) return true;
  const activas = (Object.keys(routing) as Array<keyof typeof routing>).filter(
    (clave) => routing[clave] === true
  );
  if (activas.length === 0) return true;
  if (activas.some((clave) => rutas.includes(clave))) return true;
  const etiqueta = normalizar(`${habilidad.id} ${habilidad.label}`);
  return (ETIQUETAS_POR_PAPEL[papelNormalizado] ?? []).some((palabra) =>
    coincideEtiqueta(etiqueta, palabra)
  );
}
/** Elige y recorta las habilidades que sirven a un papel o director. */
export function habilidadesPara(
  papel: string,
  ambito: string,
  opciones: OpcionesHabilidades,
  capaDeRespaldo: CapaModelo = "completa"
): SkillCapability[] {
  const capa = opciones.capa ?? capaDeRespaldo;
  const papelNormalizado = normalizar(papel);
  return opciones.capacidades
    .filter((habilidad) => !relevoDesactivado(habilidad.id, ambito, opciones.desactivadas))
    .filter((habilidad) => sirvePara(habilidad, papelNormalizado))
    .map((habilidad) => ({
      ...habilidad,
      systemPrompt: recortarTexto(habilidad.systemPrompt, capa),
    }));
}
