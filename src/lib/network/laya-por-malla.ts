/*
 * laya-por-malla (Ola 1018L · tarea G) — manejador del relé
 * `capacidad.decision.laya.*`: una neurona pide decisiones tipadas de Laya y el
 * anfitrión las reenvía a SU servidor local (POST /v1/systemone, 127.0.0.1:4470,
 * el mismo que `decision-hibrida.ts`). Contrato: architecture/laya-y-habilidades.md §4.
 * Puro: fetch, reloj y admisión inyectables; las pruebas corren sin red.
 */

export const LAYA_MALLA_NS = "capacidad.decision.laya.";
export const LAYA_MALLA_MAX_PREGUNTAS = 20; // tope de preguntas por petición
export const LAYA_MALLA_MAX_TOKENS = 8_192; // tope de tokens estimados (ventana de laya-multilingual)
export const LAYA_MALLA_URL_DEFECTO = "http://127.0.0.1:4470/v1/systemone"; // servidor local de Laya
const LAYA_MALLA_TIMEOUT_MS = 30_000; // Laya en CPU tarda segundos; nunca bloquea la primera palabra

export type TipoPreguntaLaya = "choice" | "score" | "noul";

export interface PreguntaLayaMalla {
  type: TipoPreguntaLaya; instructions?: string; criteria?: Record<string, string>;
}

/* `cuentaId` manda en la admisión; `privado` lo declara quien pide. */
export interface PeticionLayaMalla {
  cuentaId: string; estado: string; preguntas: Record<string, PreguntaLayaMalla>; privado?: boolean;
}

/* Respuesta de Laya con su forma real (choice/probabilities/answer_confidence, score, noul). */
export interface RespuestaPreguntaLaya {
  choice?: string; score?: number; noul?: number | boolean;
  probabilities?: Record<string, number> | number[]; answer_confidence?: number;
}

export interface ReglasAdmisionLaya { mismaCuenta: boolean; privado: boolean; presta: boolean }

export type ResultadoLayaMalla =
  | { ok: true; respuestas: Record<string, RespuestaPreguntaLaya>; ms: number }
  | { ok: false; motivo: string };

/** ~4 caracteres por token (suficiente para frenar peticiones enormes). */
export function estimarTokensLaya(texto: string): number {
  return Math.max(1, Math.ceil(texto.length / 4));
}

/** Tokens estimados de la petición: estado + instrucciones + criterios. Pura. */
export function tokensEstimadosPeticionLaya(p: PeticionLayaMalla): number {
  const partes: string[] = [p.estado];
  for (const q of Object.values(p.preguntas)) {
    if (q.instructions) partes.push(q.instructions);
    for (const v of Object.values(q.criteria ?? {})) partes.push(v);
  }
  return partes.reduce((n, t) => n + estimarTokensLaya(t), 0);
}

/* Admisión (§4): de la misma cuenta SIEMPRE; de otras solo si el estado no es privado (lo privado
 * no sale de las neuronas de la persona) y el anfitrión presta la capacidad. */
export function admiteLayaMalla(r: ReglasAdmisionLaya): { ok: boolean; motivo: string } {
  if (r.mismaCuenta) return { ok: true, motivo: "petición de la misma cuenta" };
  if (r.privado) return { ok: false, motivo: "Rechazo: el estado es privado y no sale de las neuronas de su dueño." };
  if (!r.presta) return { ok: false, motivo: "Rechazo: esta neurona no presta Laya a otras cuentas." };
  return { ok: true, motivo: "petición de otra cuenta admitida (presta capacidad)" };
}

function esObjeto(x: unknown): x is Record<string, unknown> { return !!x && typeof x === "object" && !Array.isArray(x); }
/** Guard puro: cuenta, estado, ≥1 pregunta tipada, ≤20 preguntas y ≤8.192 tokens estimados. */
export function validarPeticionLayaMalla(
  x: unknown,
): { ok: true; peticion: PeticionLayaMalla } | { ok: false; motivo: string } {
  if (!esObjeto(x) || typeof x.cuentaId !== "string" || !x.cuentaId)
    return { ok: false, motivo: "Rechazo: falta el id de cuenta del que pide." };
  if (typeof x.estado !== "string" || !x.estado.trim())
    return { ok: false, motivo: "Rechazo: el estado a decidir es obligatorio." };
  if (!esObjeto(x.preguntas) || Object.keys(x.preguntas).length === 0)
    return { ok: false, motivo: "Rechazo: falta al menos una pregunta." };
  if (Object.keys(x.preguntas).length > LAYA_MALLA_MAX_PREGUNTAS)
    return { ok: false, motivo: `Rechazo: máximo ${LAYA_MALLA_MAX_PREGUNTAS} preguntas por petición.` };
  for (const [nombre, q] of Object.entries(x.preguntas)) {
    const tipo = esObjeto(q) ? q.type : undefined;
    if (tipo !== "choice" && tipo !== "score" && tipo !== "noul")
      return { ok: false, motivo: `Rechazo: la pregunta «${nombre}» no es choice, score ni noul.` };
  }
  const peticion = x as unknown as PeticionLayaMalla;
  const tokens = tokensEstimadosPeticionLaya(peticion);
  if (tokens > LAYA_MALLA_MAX_TOKENS)
    return { ok: false, motivo: `Rechazo: ${tokens} tokens estimados supera el tope de ${LAYA_MALLA_MAX_TOKENS}.` };
  return { ok: true, peticion };
}

export interface DepsLayaMalla {
  transporte?: typeof fetch; url?: string; ahora?: () => number;
}

/* Manejador del relé: valida, admite y reenvía al servidor local de Laya;
 * devuelve { respuestas, ms } o un rechazo legible (ok:false, motivo). */
export async function manejarPeticionLayaMalla(
  x: unknown, admision: ReglasAdmisionLaya, deps: DepsLayaMalla = {},
): Promise<ResultadoLayaMalla> {
  const v = validarPeticionLayaMalla(x);
  if (!v.ok) return { ok: false, motivo: v.motivo };
  const a = admiteLayaMalla(admision);
  if (!a.ok) return { ok: false, motivo: a.motivo };
  const t0 = deps.ahora?.() ?? Date.now();
  try {
    const res = await (deps.transporte ?? fetch)(deps.url ?? LAYA_MALLA_URL_DEFECTO, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: v.peticion.estado, questions: v.peticion.preguntas }),
      signal: AbortSignal.timeout(LAYA_MALLA_TIMEOUT_MS),
    });
    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => null)) as { motivo?: string; error?: string } | null;
      const motivo = cuerpo?.motivo ?? cuerpo?.error ?? `el servidor local respondió ${res.status}`;
      return { ok: false, motivo: `Rechazo: Laya no está disponible (${motivo}).` };
    }
    const datos = (await res.json()) as { answers?: Record<string, RespuestaPreguntaLaya>; ms?: number };
    if (!esObjeto(datos.answers)) return { ok: false, motivo: "Rechazo: el servidor local de Laya no devolvió respuestas." };
    const ms = typeof datos.ms === "number" && Number.isFinite(datos.ms) ? datos.ms : (deps.ahora?.() ?? Date.now()) - t0;
    return { ok: true, respuestas: datos.answers, ms };
  } catch (e) {
    const causa = e instanceof Error ? e.message : "desconocido";
    return { ok: false, motivo: `Rechazo: no se pudo hablar con el servidor local de Laya (${causa}).` };
  }
}
