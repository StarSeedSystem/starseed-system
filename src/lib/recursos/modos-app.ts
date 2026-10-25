// Modos de ejecución de las apps en la malla (architecture/apps-en-la-malla.md §5, tarea N · Ola 1017A)
// PURO: sin node:*, sin red, sin disco y sin reloj propio. La bolsa (oferta.ts) ya preparó
// lo prestable y visible; comoAbrir solo decide el modo y explica por qué, siempre con
// valores medidos («sin medir» nunca se inventa, §3).

import type { OfertaNeurona } from "./oferta";

/** Las cinco formas de abrir una app desde cualquier neurona (§5). */
export type ModoEjecucion = "local" | "por-bandas" | "montada" | "transmitida" | "ramificada";

/** Qué necesita una app para ejecutarse en una neurona (solo valores medidos, §3). */
export interface RequisitosApp {
  /** RAM libre que pide la app, en MB. */
  ramMb?: number;
  /** Si pide una GPU presente. */
  gpu?: boolean;
  /** Motores locales que pide (imagen, voz, oído, palabra, transcodificar…). */
  motores?: string[];
  /** Manifiesto del volumen por bandas del que vive la app (§7): web/WASM o nativa fuera del disco. */
  volumen?: string;
}

/** Lo que la bolsa alimenta a comoAbrir: candidatas prestables y visibles, ya de su cuenta. */
export interface PlanMalla {
  /** Ofertas de neuronas o servidores que pueden acoger algo de la app (§2, §4). */
  candidatas: OfertaNeurona[];
  /** Tope de latencia (ms) para tiempo real; sin tope vale cualquier latencia medida. */
  latenciaTopeMs?: number;
}

/** La decisión del lanzador: qué modo, en qué destino y por qué. */
export interface DecisionModo {
  modo: ModoEjecucion;
  /** El nodo local, «volumen:<id>», «malla» o el id del anfitrión. */
  destino: string;
  motivo: string;
}

/**
 * Estructura mínima de una app del catálogo (StarseedApp de launcher-types): los
 * campos opcionales `ejecucion` y `requisitos`, cuando no llegan, equivalen a no pedir.
 */
export interface AppModos {
  id: string;
  /** Sin campo = ["local"], como hoy en el catálogo. */
  ejecucion?: ModoEjecucion[];
  requisitos?: RequisitosApp;
}
// (las reglas de decisión viven en comoAbrir, más abajo)

// ── Reglas de decisión (§4 reglas 2, 6 y 7 · §5) ────────────────

/**
 * Decide cómo abrir la app en esta neurona con los recursos del plan de la bolsa.
 * Orden: local si cabe → por-bandas (web/WASM con volumen) → montada (nativa
 * fuera del disco por la pasarela) → transmitida (otra neurona la tiene prestada
 * y la latencia sirve) → ramificada (solo falta cálculo) · suelo: local con aviso.
 * Nunca devuelve «nada» (§4 regla 7).
 */
export function comoAbrir(app: AppModos, neurona: OfertaNeurona, plan: PlanMalla): DecisionModo {
  const modos = app.ejecucion ?? ["local"];
  const req = app.requisitos ?? {};
  const faltas = faltasDeNeurona(req, neurona.computo);
  const hayVolumenLocal = req.volumen !== undefined && neurona.almacen.volumenes.includes(req.volumen);
  const cabeLocal = faltas.length === 0 && (req.volumen === undefined || hayVolumenLocal);

  if (modos.includes("local") && cabeLocal) {
    return {
      modo: "local",
      destino: neurona.nodoId,
      motivo: "La neurona cubre los requisitos medidos de la app.",
    };
  }

  if (req.volumen !== undefined) {
    const fuentes = plan.candidatas.filter((c) => c.almacen.volumenes.includes(req.volumen));
    if (modos.includes("por-bandas") && fuentes.length > 0) {
      return {
        modo: "por-bandas",
        destino: `volumen:${req.volumen}`,
        motivo: `La app vive en el volumen por bandas (§7): se baja lo que se usa desde «${fuentes[0].nodoId}» (${fuentes.length} fuente${fuentes.length === 1 ? "" : "s"}) y queda en la caché del medio.`,
      };
    }
    if (modos.includes("montada") && fuentes.length > 0) {
      return {
        modo: "montada",
        destino: `volumen:${req.volumen}`,
        motivo: `App nativa fuera del disco: el volumen «${fuentes[0].nodoId}» se ve como un disco del sistema por la pasarela local (${fuentes.length} fuente${fuentes.length === 1 ? "" : "s"}, §7).`,
      };
    }
  }

  const anfitriones = prepararAnfitriones(app.id, neurona, plan);
  if (modos.includes("transmitida") && anfitriones.length > 0) {
    return {
      modo: "transmitida",
      destino: anfitriones[0].oferta.nodoId,
      motivo: `La app corre en «${anfitriones[0].oferta.nodoId}» y la ventana llega por WebRTC con ${anfitriones[0].latenciaMs} ms medidos (§9).`,
    };
  }

  const mallaConComputo = plan.candidatas.some(
    (c) => c.computo.ramLibreMb > 0 || c.computo.motores.length > 0
  );
  const soloFaltaCalculo = faltas.length > 0 && req.volumen === undefined;
  if (modos.includes("ramificada") && soloFaltaCalculo && mallaConComputo) {
    return {
      modo: "ramificada",
      destino: "malla",
      motivo: `La interfaz corre aquí y el cálculo que falta (${faltas.join("; ")}) se reparte en la malla (§5).`,
    };
  }

  return suelo(req, faltas, hayVolumenLocal, modos, neurona);
}

// ── Helpers puros ───────────────────────────────────────────────

/** Anfitriones para «transmitida»: la tienen prestada y la latencia medida sirve (§9). */
function prepararAnfitriones(
  appId: string,
  neurona: OfertaNeurona,
  plan: PlanMalla
): { oferta: OfertaNeurona; latenciaMs: number }[] {
  const pares: { oferta: OfertaNeurona; latenciaMs: number }[] = [];
  for (const candidata of plan.candidatas) {
    if (!candidata.apps.some((a) => a.id === appId)) continue;
    const latencia = neurona.enlaces.latenciaMs?.[candidata.nodoId];
    // Sin latencia medida no sirve para transmitida (§3: lo no medido no se inventa).
    if (latencia === undefined) continue;
    if (plan.latenciaTopeMs !== undefined && latencia > plan.latenciaTopeMs) continue;
    pares.push({ oferta: candidata, latenciaMs: latencia });
  }
  return pares.sort((a, b) => a.latenciaMs - b.latenciaMs);
}

/** Suelo: nunca «nada» (§4 regla 7): abre en local avisando de lo que falta. */
function suelo(
  req: RequisitosApp,
  faltas: string[],
  hayVolumenLocal: boolean,
  modos: ModoEjecucion[],
  neurona: OfertaNeurona
): DecisionModo {
  const avisos = [...faltas];
  if (req.volumen !== undefined && !hayVolumenLocal) {
    avisos.push(`el volumen «${req.volumen}» no está en la malla`);
  }
  const detalle =
    avisos.length > 0 ? avisos.join("; ") : "sin recursos prestados en el plan";
  const motivo = modos.includes("local")
    ? `Suelo: abre aquí avisando de lo que falta: ${detalle}.`
    : `Suelo: la app no admite otro modo, se abre en local avisando: ${detalle}.`;
  return { modo: "local", destino: neurona.nodoId, motivo };
}

// ── Requisitos y helpers puros ──────────────────────────────────

/** ¿Qué le falta a esta neurona para cumplir los requisitos? Vacío = cabe. */
export function faltasDeNeurona(req: RequisitosApp, computo: OfertaNeurona["computo"]): string[] {
  const faltas: string[] = [];
  if (req.ramMb !== undefined && computo.ramLibreMb < req.ramMb) {
    faltas.push(`faltan ${req.ramMb - computo.ramLibreMb} MB de RAM`);
  }
  if (req.gpu && !computo.gpu) {
    faltas.push("falta GPU");
  }
  for (const motor of req.motores ?? []) {
    if (!computo.motores.includes(motor)) faltas.push(`falta el motor «${motor}»`);
  }
  return faltas;
}
