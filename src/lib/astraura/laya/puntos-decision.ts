// Catálogo de puntos de decisión de Laya en Astraura (architecture/laya-y-habilidades.md §4, Ola 1018L · LYS1018A).
// Datos + validación PURA: sin red, sin disco, sin reloj. Las preguntas usan la forma nativa de Laya/Jev
// (`Pregunta` de @/lib/jev/decisiones: noul, choice y score) y se validan con su mismo `construirPeticion`.
import { construirPeticion, type Pregunta } from "@/lib/jev/decisiones";
import type { Capa } from "@/lib/astraura/capas/catalogo";

export type PreguntaLaya = Pregunta;
export type MedioLaya = "a1" | "mac" | "navegador" | "malla";
/** Qué hacer si Laya no llega a tiempo o su `answer_confidence` queda bajo el umbral. */
export type SiDuda = "escalar" | "confirmar" | "regla" | "revisar";
/** «solo-propias»: el estado nunca sale de las neuronas de la persona ni de sus servidores propios. */
export type PrivacidadPunto = "puede-salir" | "solo-propias";
export type IdPuntoDecision = "reflejo.herramienta" | "plan.dificultad" | "respuesta.basta" | "basico.consenso"
  | "habilidad.elegir" | "publicar.moderar" | "privacidad.subir" | "voz.tono" | "video.intencion" | "enjambre.medio";

export interface PuntoDecision {
  readonly id: IdPuntoDecision;
  readonly capa: Capa;
  readonly preguntas: Readonly<Record<string, PreguntaLaya>>;
  readonly umbral: number; // sobre `answer_confidence` (calibrada), nunca sobre `confidence`
  readonly plazoMsPorMedio: Readonly<Record<MedioLaya, number>>; // tope de espera; el plazo aprendido lo afina (tarea B)
  readonly siDuda: SiDuda;
  readonly respaldo: string; // lo que pasa si duda, en palabras (columna «Si no llega a tiempo o duda» de §4)
  readonly privacidad: PrivacidadPunto;
  /** Choice cuyas opciones llegan con la llamada (herramientas, habilidades…): el catálogo solo trae «ninguna». */
  readonly abiertas?: readonly string[];
}
export const UMBRAL_POR_DEFECTO = 0.6;
export const PLAZO_MAX_MS = 30_000;
export const MEDIOS_LAYA: readonly MedioLaya[] = ["a1", "mac", "navegador", "malla"];
const CAPAS: Record<Capa, true> = { reflejo: true, memoria: true, palabra: true, razon: true, profunda: true, voz: true, adaptador: true };
/** Invariantes del contrato: moderar nunca publica si duda; la privacidad la deciden las reglas y no sale. */
const OBLIGADO: Partial<Record<IdPuntoDecision, Partial<Record<"siDuda" | "privacidad", string>>>> =
  { "publicar.moderar": { siDuda: "revisar" }, "privacidad.subir": { siDuda: "regla", privacidad: "solo-propias" } };
// Medido en el A1 (§2 y §8): 3 preguntas tardan 2–3,2 s en CPU; la malla suma el salto de red.
const RAPIDO = { a1: 3500, mac: 3000, navegador: 4000, malla: 5000 } as const;
const PUEDE_ESPERAR = { a1: 8000, mac: 8000, navegador: 10_000, malla: 12_000 } as const;
const noul = (instructions: string): PreguntaLaya => ({ type: "noul", instructions });
const choice = (instructions: string, criteria: Record<string, string>): PreguntaLaya => ({ type: "choice", instructions, criteria });
const abierta = (instructions: string, ninguna: string): PreguntaLaya => choice(instructions, { ninguna });
const punto = (p: Omit<PuntoDecision, "umbral" | "plazoMsPorMedio" | "privacidad"> & Partial<PuntoDecision>): PuntoDecision =>
  Object.freeze({ umbral: UMBRAL_POR_DEFECTO, plazoMsPorMedio: RAPIDO, privacidad: "solo-propias", ...p });

export const PUNTOS_DECISION: readonly PuntoDecision[] = Object.freeze([
  punto({ id: "reflejo.herramienta", capa: "reflejo", siDuda: "escalar", respaldo: "Jev remoto o el modelo grande", abiertas: ["herramienta"],
    preguntas: { herramienta: abierta("Elige la herramienta más adecuada para resolver la consulta", "Ninguna herramienta: basta con conversar") } }),
  punto({ id: "plan.dificultad", capa: "reflejo", siDuda: "regla", respaldo: "Las reglas de classifyTask y estimateDifficulty",
    preguntas: { dificultad: { type: "score", instructions: "¿Qué dificultad tiene lo que se pide?", criteria: ["baja", "media", "alta"] },
      basta_pequeno: noul("¿Basta un modelo pequeño para responder bien a esto?") } }),
  punto({ id: "respuesta.basta", capa: "palabra", siDuda: "escalar", respaldo: "Subir a la capa siguiente del plan",
    preguntas: { basta: noul("¿La respuesta resuelve por completo lo que se pidió?") } }),
  punto({ id: "basico.consenso", capa: "reflejo", siDuda: "regla", respaldo: "Lo que decida la regla determinista", abiertas: ["decision"],
    preguntas: { decision: abierta("Elige la opción correcta (la misma pregunta que al modelo de 1,58 bits)", "Ninguna encaja: decide la regla") } }),
  punto({ id: "habilidad.elegir", capa: "reflejo", siDuda: "regla", respaldo: "Ninguna habilidad", abiertas: ["habilidad"],
    preguntas: { habilidad: abierta("¿Qué habilidad conviene aplicar a esta tarea?", "Ninguna habilidad: responder sin aplicar ninguna") } }),
  punto({ id: "publicar.moderar", capa: "reflejo", siDuda: "revisar", respaldo: "Revisar (nunca publicar)", privacidad: "puede-salir",
    plazoMsPorMedio: PUEDE_ESPERAR, preguntas: { accion: choice("¿Qué se hace con esta publicación?", { publicar: "Cumple las normas: se publica",
      revisar: "Hay dudas: la revisa una persona", rechazar: "Incumple claramente las normas: no se publica" }) } }),
  punto({ id: "privacidad.subir", capa: "reflejo", siDuda: "regla", umbral: 0.5, respaldo: "Mandan las reglas y lo que marque la persona: Laya solo sube",
    preguntas: { privado: noul("¿Contiene datos privados (contacto, dinero, salud, ubicación o identidad)?") } }),
  punto({ id: "voz.tono", capa: "voz", siDuda: "regla", respaldo: "El tono y la emoción por defecto de la voz",
    preguntas: { tono: choice("¿Con qué tono conviene decir esta respuesta en voz alta?", { neutro: "Neutro e informativo",
      calido: "Cálido y cercano", alegre: "Alegre y animado", serio: "Serio y formal", sereno: "Sereno y pausado" }), emocion: choice(
      "¿Qué emoción transmite el texto?", { neutra: "Ninguna en especial", alegria: "Alegría", tristeza: "Tristeza", calma: "Calma" }) } }),
  punto({ id: "video.intencion", capa: "reflejo", siDuda: "regla", respaldo: "La intención y el formato por defecto de video.componer",
    plazoMsPorMedio: PUEDE_ESPERAR, preguntas: { intencion: choice("¿Qué intención tiene el vídeo que se quiere componer?", {
      explicar: "Explicar una idea o un proceso", anunciar: "Anunciar algo nuevo", contar: "Contar una historia", resumir: "Resumir algo largo" }),
    formato: choice("¿Qué formato encaja mejor?", { horizontal: "Horizontal 16:9", vertical: "Vertical 9:16", cuadrado: "Cuadrado 1:1" }) } }),
  punto({ id: "enjambre.medio", capa: "reflejo", siDuda: "regla", respaldo: "El orden determinista del enrutador", privacidad: "puede-salir",
    plazoMsPorMedio: PUEDE_ESPERAR, abiertas: ["medio"], preguntas: { medio: abierta("¿Qué medio y escritor encajan con esta tarea?", "Ninguno destaca") } }),
]);

export const puntoDecision = (id: string, puntos = PUNTOS_DECISION): PuntoDecision | null => puntos.find((p) => p.id === id) ?? null;

/** Preguntas del punto con las opciones de la llamada en una pregunta abierta; «ninguna» se conserva. No toca el catálogo. */
export function conOpciones(p: PuntoDecision, pregunta: string, opciones: Record<string, string>): Record<string, PreguntaLaya> {
  const base = p.preguntas[pregunta];
  if (!base || base.type !== "choice" || !p.abiertas?.includes(pregunta)) throw new Error(`«${p.id}» no tiene la pregunta abierta «${pregunta}»`);
  return { ...p.preguntas, [pregunta]: { ...base, criteria: { ...opciones, ninguna: base.criteria.ninguna } } };
}

export type Paso = { accion: "decidir"; confianza: number } | { accion: SiDuda; motivo: string };
/** Qué hacer con una respuesta de Laya: decide con `answer_confidence` (calibrada); `confidence` no cuenta. */
export function queHacer(p: PuntoDecision, respuesta: { answer_confidence?: unknown } | null): Paso {
  if (!respuesta) return { accion: p.siDuda, motivo: `Laya no llegó a tiempo: ${p.respaldo}` };
  const c = respuesta.answer_confidence;
  if (typeof c !== "number" || !Number.isFinite(c)) return { accion: p.siDuda, motivo: `Laya no dio answer_confidence: ${p.respaldo}` };
  if (c < p.umbral) return { accion: p.siDuda, motivo: `Laya duda (${c.toFixed(2)} < ${p.umbral}): ${p.respaldo}` };
  return { accion: "decidir", confianza: c };
}

/** Problemas del catálogo en palabras; lista vacía = válido. */
export function validarPuntos(puntos: readonly PuntoDecision[] = PUNTOS_DECISION): string[] {
  const fallos: string[] = [], vistos = new Set<string>();
  for (const p of puntos) {
    const f = (m: string) => fallos.push(`«${p.id}»: ${m}`);
    if (!/^[a-z]+\.[a-z]+$/.test(p.id)) f("el id debe tener la forma «zona.qué»");
    if (vistos.has(p.id)) f("id repetido"); else vistos.add(p.id);
    if (!Object.prototype.hasOwnProperty.call(CAPAS, p.capa)) f(`capa desconocida «${p.capa}»`);
    if (typeof p.umbral !== "number" || !(p.umbral >= 0 && p.umbral <= 1)) f("el umbral debe estar entre 0 y 1");
    const malos = MEDIOS_LAYA.filter((m) => { const ms: unknown = p.plazoMsPorMedio?.[m];
      return !(typeof ms === "number" && Number.isInteger(ms) && ms >= 1 && ms <= PLAZO_MAX_MS); });
    if (malos.length) f(`plazo de ${malos.join(", ")} fuera de 1–${PLAZO_MAX_MS} ms`);
    if (!["escalar", "confirmar", "regla", "revisar"].includes(p.siDuda)) f(`siDuda desconocido «${p.siDuda}»`);
    if (!["puede-salir", "solo-propias"].includes(p.privacidad)) f(`privacidad desconocida «${p.privacidad}»`);
    if (typeof p.respaldo !== "string" || !p.respaldo.trim()) f("falta el respaldo (qué pasa si duda)");
    for (const [k, v] of Object.entries(OBLIGADO[p.id] ?? {})) if (p[k as "siDuda" | "privacidad"] !== v) f(`${k} debe ser «${v}»`);
    try { construirPeticion(null, { ...p.preguntas }); } catch (e) { f(e instanceof Error ? e.message : String(e)); continue; }
    for (const [nombre, q] of Object.entries(p.preguntas)) {
      const esAbierta = p.abiertas?.includes(nombre) ?? false;
      if (q.type === "choice" && !esAbierta && Object.keys(q.criteria).length < 2) f(`la choice «${nombre}» necesita 2 opciones o más`);
      if (esAbierta && (q.type !== "choice" || !q.criteria.ninguna)) f(`la pregunta abierta «${nombre}» debe ser choice con «ninguna»`);
      if (q.type === "score" && (q.criteria.length < 2 || new Set(q.criteria).size !== q.criteria.length))
        f(`el score «${nombre}» necesita 2 niveles distintos o más`);
    }
    for (const a of p.abiertas ?? []) if (!p.preguntas[a]) f(`la abierta «${a}» no está entre las preguntas`);
  }
  return fallos;
}
