/**
 * Habilidades de la Biblioteca para los agentes de Genesis y PoliGenesis
 * (Ola 1019G · tarea W, SOP architecture/genesis-conectores-abiertos.md §6 y
 * architecture/laya-y-habilidades.md §5).
 *
 * Cada agente de Genesis/PoliGenesis recibe como candidatos una lista de
 * SkillCapability de `src/ai/astraura/skills.ts`: concretamente las que SIRVEN
 * para su **papel** (escritor, revisor, chat, visión, voz, imagen, código)
 * o para su **director** (chat, optimizador, diseno, produccion, nube,
 * medidores, aprendizaje) — eligiendo por su `routing` y por las PALABRAS de
 * su etiqueta legible (con acentos normalizados).
 *
 * Antes de inyectarla en el cerebro del agente, el `systemPrompt` se entrega
 * en el TAMAÑO que pide la capa del modelo elegido: `tarjeta` (≤ 60 palabras,
 * para Needle y BitNet), `resumen` (≤ 250, para Bonsai 1,7–4 B) o `completa`
 * (el texto íntegro, para razón, profunda y nube). Fuente de los tamaños:
 * `architecture/laya-y-habilidades.md` §5.
 *
 * MÓDULO PURO de servidor: sin red, sin reloj, sin almacenamiento. Importa
 * SOLO tipos (el único uso de `ambito`, hoy, es el contrato del mando: las
 * claves y permisos que limitan qué puede usar cada ámbito van por la bóveda,
 * `boveda-servidor.ts`, y nunca por este catálogo).
 */
import type { SkillCapability } from "@/ai/astraura/skills";
import type { Papel } from "./catalogo-opciones";
import type { Director } from "./asignaciones";

/** Tamaño de entrega del `systemPrompt` según la capa del modelo elegido. */
export type CapaModelo = "tarjeta" | "resumen" | "completa";

/** Clave válida: cualquier papel del catálogo de opciones o director posible. */
export type PapelODirector = Papel | Director;

/** Parámetros según el contrato del mando. `capa` va según el modelo elegido. */
export interface OpcionesHabilidades {
  capacidades: SkillCapability[];
  desactivadas: string[];
  capa?: CapaModelo;
}

/** Tope de palabras por capa (del SOP §5: 60, 250, íntegra). */
const TOPES: Record<CapaModelo, number> = {
  tarjeta: 60,
  resumen: 250,
  completa: Number.POSITIVE_INFINITY,
};

/** Quita acentos y pasa a minúsculas para comparar claves y etiquetas. */
function normalizar(texto: string): string {
  return texto.toLowerCase().replace(/[\u0300-\u036f]/g, "");
}

/** Recorta el texto a ≤ `tope` palabras (sin media palabra); si cabe, intacto. */
export function recortarPorCapa(texto: string, capa: CapaModelo): string {
  const tope = TOPES[capa];
  const palabras = texto.split(/\s+/).filter(Boolean);
  if (palabras.length <= tope) return texto;
  return palabras.slice(0, tope).join(" ") + "…";
}

/**
 * Palabras (ya sin acentos) de la ETIQUETA que delatan de qué sirve cada
 * habilidad: aparte del `routing`, que solo marca el peso del modelo, la
 * etiqueta dice a QUÉ papel o director le es útil. Papeles enrutados a peso
 * (escritor, revisor) juzgan solo por `routing`.
 */
const ETIQUETAS: Record<PapelODirector, string[]> = {
  escritor: [],
  revisor: [],
  chat: ["chat", "conversacion", "asistente"],
  "visión": ["vision", "visual", "imagen", "foto"],
  voz: ["voz", "audio", "habla", "kokoro", "omnivoice", "sintesis"],
  imagen: ["imagen", "audiovisual", "foto", "dibujo", "generacion", "avatar"],
  "código": ["codigo", "desarrollo", "ingenieria", "diagnostico", "tdd", "programar"],
  optimizador: ["optimi", "rendimiento", "enrut", "router", "presupuesto"],
  diseno: ["diseno", "ui", "estetica", "interfaz", "taste", "penpot", "pizarra"],
  produccion: ["audiovisual", "video", "produccion", "creacion", "lienzo"],
  nube: ["nube", "despliegue", "self-host", "paas", "contenedor", "container", "deploy"],
  medidores: ["telemetria", "observabilidad", "medidores", "monitor", "medicion"],
  aprendizaje: ["aprendizaje", "ensenar", "teach", "lecciones", "cuestionario"],
};

/**
 * ¿La habilidad remite por `routing` a este papel o director? Los papeles con
 * peso se llevan a los modelos fuertes; los directores de oficio (diseno,
 * produccion…) se llevan a las habilidades por etiqueta, no por peso.
 */
function cumpleRouting(routing: SkillCapability["routing"], clave: PapelODirector): boolean {
  const fuerte = routing?.preferStrong === true;
  const web = routing?.web === true;
  const visual = routing?.vision === true;
  const plan = routing?.planning === true;
  switch (clave) {
    case "escritor":
      return fuerte || web || plan;
    case "revisor":
      return fuerte;
    case "chat":
      return fuerte || web || plan;
    case "visión":
      return visual;
    case "código":
      return fuerte || plan || web;
    case "optimizador":
      return plan;
    /* voz, imagen y los directores de oficio no se eligen por peso. */
    default:
      return false;
  }
}

/** ¿El vocabulario de la etiqueta delata que la habilidad sirve a la clave? */
function sirvePorEtiqueta(habilidad: SkillCapability, clave: PapelODirector): boolean {
  const vocabulario = ETIQUETAS[clave];
  if (vocabulario.length === 0 || !habilidad.label) return false;
  const etiqueta = normalizar(habilidad.label);
  return vocabulario.some((palabra) => etiqueta.includes(palabra));
}

/** ¿Esta habilidad es de utilidad para este papel o director? */
function sirve(habilidad: SkillCapability, clave: PapelODirector): boolean {
  /* El chat recibe además lo que ya funciona de serie para todas las cuentas. */
  if (clave === "chat" && habilidad.defaultOn) return true;
  if (sirvePorEtiqueta(habilidad, clave)) return true;
  return cumpleRouting(habilidad.routing, clave);
}

/**
 * Elige las habilidades útiles para un papel o director, en el tamaño de la
 * capa del modelo elegido. Cada elegida sale como COPIA (no se muta el
 * manifiesto), con su `systemPrompt` ya del tamaño pedido.
 */
export function habilidadesPara(
  clave: PapelODirector,
  ambito: string,
  opciones: OpcionesHabilidades
): SkillCapability[] {
  void ambito;
  const { capacidades, desactivadas, capa = "completa" } = opciones;
  const quedan = new Set(desactivadas);
  return capacidades
    .filter((h) => !quedan.has(h.id))
    .filter((h) => sirve(h, clave))
    .map((h) => ({ ...h, systemPrompt: recortarPorCapa(h.systemPrompt, capa) }));
}

