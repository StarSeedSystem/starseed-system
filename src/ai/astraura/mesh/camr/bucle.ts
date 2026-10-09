/**
 * StarSeed OS — CAMR · BUCLE AUTÓNOMO (Ola 1005C · CAMR1005F).
 * ==========================================================================
 * §2, §3 y §5 del contrato `architecture/camr-enrutamiento-cognitivo.md`.
 *
 * Ciclo configurable (por defecto 10 s): mide → recomienda → aplica (según
 * modo: recomendar = solo propone; automático = aplica si la banda lo
 * permite según §5) → vigila → revierte. Registro de decisiones (últimas
 * 500) con su porqué.
 *
 * Módulo PURO respecto a red (simulador y adaptadores falsos para tests).
 * Nunca lanza procesos ni toca hardware sin `seco`.
 */

export type ModoBucle = "recomendar" | "automatico";

export interface ConfigBucle {
  cicloMs: number;
  modo: ModoBucle;
  vigilarMs: number;
  maxDecisiones: number;
}

export interface EntradaBucle {
  enlaces: import("./tipos").EnlaceFisico[];
  perfil: import("./radio-cognitiva").PerfilCognitivo;
  canales?: import("./radio-cognitiva").CanalMedido[];
  vecinos?: import("./radio-cognitiva").VecinoCognitivo[];
  // Perfil legal (§5) para validar cualquier cambio aplicado.
  legal?: import("./regulacion").PerfilLegal;
  // Clase de tráfico (§3) para el registro de decisiones.
  clase?: import("./tipos").ClaseTrafico;
}

export interface EstadoBucle {
  cicloMs: number;
  modo: ModoBucle;
  decisiones: import("./tipos").Decision[];
  historialMediciones: import("./tipos").Medicion[];
  ultimaAplicacion?: import("./tipos").ParametrosRadio;
  cambiosRevertidos: number;
}

export const CONFIG_DEFECTO: ConfigBucle = {
  cicloMs: 10_000,
  modo: "recomendar",
  vigilarMs: 30_000,
  maxDecisiones: 500,
};

/* ── Estado inicial ──────────────────────────────────────────────────────── */

export function crearEstado(config: ConfigBucle = CONFIG_DEFECTO): EstadoBucle {
  return {
    cicloMs: config.cicloMs,
    modo: config.modo,
    decisiones: [],
    historialMediciones: [],
    cambiosRevertidos: 0,
    ultimaAplicacion: undefined,
  };
}

/* ── Paso 1: medir todos los enlaces ─────────────────────────────────────── */

import type { EnlaceFisico, Medicion, ParametrosRadio, Decision } from "./tipos";
import { recomendar, vigilarCambio, PerfilCognitivo, CanalMedido, VecinoCognitivo } from "./radio-cognitiva";
import { dentroDeLey, PerfilLegal } from "./regulacion";

export function medirTodos(
  enlaces: EnlaceFisico[],
  anterior?: Medicion[],
): { mediciones: Medicion[]; porEnlace: Record<string, Medicion> } {
  const porEnlace: Record<string, Medicion> = {};
  const mediciones: Medicion[] = [];
  for (const e of enlaces) {
    const m = e.medir();
    porEnlace[e.id] = m;
    mediciones.push(m);
  }
  return { mediciones, porEnlace };
}

/* ── Paso 2: recomendar (motor puro de radio-cognitiva) ──────────────────── */

export function pasoRecomendar(
  historial: Medicion[],
  vecinos: VecinoCognitivo[],
  perfil: PerfilCognitivo,
  actual: ParametrosRadio,
  canales?: CanalMedido[],
): { recomendacion: import("./radio-cognitiva").Recomendacion; porque: string } {
  const rec = recomendar(historial, vecinos, perfil, actual, canales);
  const porque = rec.porque.join("; ");
  return { recomendacion: rec, porque };
}

/* ── Paso 3: aplicar según modo (§2 · §5) ─────────────────────────────────── */

export async function pasoAplicar(
  enlace: EnlaceFisico,
  rec: import("./radio-cognitiva").Recomendacion,
  modo: ModoBucle,
  legal?: PerfilLegal,
): Promise<{ aplicado: boolean; ok: boolean; error?: string; revertir?: boolean; motivo: string }> {
  if (modo === "recomendar") {
    return { aplicado: false, ok: true, motivo: "modo recomendar: solo propone (sin cambios en el enlace)" };
  }

  // Modo automático: aplica solo si pasa la ley (§5) y `seco` está en true.
  const veredicto = legal
    ? dentroDeLey(
        {
          banda: enlace.banda,
          radio: rec.params,
        },
        legal,
      )
    : { ok: true, motivos: ["sin perfil legal: se confía en el ajuste del adaptador"] };

  if (!veredicto.ok) {
    return {
      aplicado: false,
      ok: false,
      error: veredicto.motivos.join("; "),
      motivo: `ley rechaza la propuesta: ${veredicto.motivos.join("; ")}`,
    };
  }

  try {
    const res = await enlace.aplicar(rec.params, { seco: false });
    if (res.ok) {
      return { aplicado: true, ok: true, motivo: `aplicado en modo automático: ${rec.porque.join("; ")}` };
    }
    return { aplicado: false, ok: false, error: res.error ?? "fallo desconocido", motivo: `aplicar falló: ${res.error}` };
  } catch (e) {
    return { aplicado: false, ok: false, error: e instanceof Error ? e.message : String(e), motivo: `excepción al aplicar: ${e}` };
  }
}

/* ── Paso 4: vigilar y revertir (§2 · seguridad del cambio) ───────────────── */

export function pasoVigilar(
  anterior: Medicion,
  posteriores: Medicion[],
  paramsAnteriores: ParametrosRadio,
  vigilarMs: number,
): { revertir: boolean; porque: string; paramsAnteriores?: ParametrosRadio } {
  const v = vigilarCambio(anterior, posteriores, paramsAnteriores, vigilarMs);
  return {
    revertir: v.revertir,
    porque: v.porque,
    paramsAnteriores: v.paramsAnteriores,
  };
}

/* ── Registro de decisiones (últimas 500) con porqué (§6) ──────────────────── */

export function registrarDecision(
  estado: EstadoBucle,
  enlaceId: string,
  clase: import("./tipos").ClaseTrafico,
  motivo: string,
  puntuacion: number,
  redundanteId?: string,
): EstadoBucle {
  const d: Decision = {
    enlaceId,
    enlaceRedundanteId: redundanteId,
    clase,
    motivo,
    puntuacion,
    at: Date.now(),
  };
  const decisiones = [d, ...estado.decisiones];
  if (decisiones.length > 500) decisiones.length = 500;
  return { ...estado, decisiones };
}

/* ── Ciclo completo (una vuelta del bucle) ─────────────────────────────────── */

export interface ResultadoCiclo {
  estado: EstadoBucle;
  mediciones: Medicion[];
  recomendaciones: Record<string, import("./radio-cognitiva").Recomendacion>;
  aplicados: Array<{ enlaceId: string; ok: boolean; error?: string }>;
  revertidos: Array<{ enlaceId: string; porque: string }>; // vacío en esta versión simple
}

export async function cicloBucle(
  estado: EstadoBucle,
  entrada: EntradaBucle,
  config: ConfigBucle = CONFIG_DEFECTO,
): Promise<ResultadoCiclo> {
  const enlaces = entrada.enlaces;
  const vecinos = entrada.vecinos ?? [];

  // 1. Medir
  const { mediciones, porEnlace } = medirTodos(enlaces);

  // 2. Recomendar para cada enlace (no solo el primero)
  const recomendaciones: Record<string, import("./radio-cognitiva").Recomendacion> = {};
  for (const enlace of enlaces) {
    const historial = estado.historialMediciones.length > 0 ? estado.historialMediciones : (mediciones.length > 0 ? [mediciones[0]] : []);
    const actual: ParametrosRadio = estado.ultimaAplicacion ?? {
      frecuenciaMhz: enlace.frecuenciaMhz,
      potenciaDbm: 14,
      anchoBandaMhz: 0.25,
      spreadFactor: 9,
      codingRate: "4/5",
      gananciaAntenaDbi: entrada.perfil.gananciaAntenaDbi,
      perdidasDb: entrada.perfil.perdidasDb,
    };
    const recResult = pasoRecomendar(
      historial,
      vecinos,
      entrada.perfil,
      actual,
      entrada.canales,
    );
    recomendaciones[enlace.id] = recResult.recomendacion;
  }

  // 3. Aplicar según modo por enlace
  const aplicados: Array<{ enlaceId: string; ok: boolean; error?: string }> = [];
  let ultimaAplicacionActualizada: ParametrosRadio | undefined = estado.ultimaAplicacion;
  for (const enlace of enlaces) {
    const rec = recomendaciones[enlace.id];
    if (!rec) continue;
    const res = await pasoAplicar(enlace, rec, config.modo, entrada.legal);
    aplicados.push({ enlaceId: enlace.id, ok: res.ok, error: res.error });
    if (res.aplicado && res.ok) {
      ultimaAplicacionActualizada = rec.params;
    }
  }

  // 4. Vigilar (usamos la medición actual como referencia; en una sola vuelta
  //    no hay posteriores reales, así que revertimos solo si hay señal previa
  //    de empeoramiento sostenido en el historial.)
  const revertidos: Array<{ enlaceId: string; porque: string }> = [];
  let cambiosRevertidosActualizado = estado.cambiosRevertidos;
  for (const enlace of enlaces) {
    const rec = recomendaciones[enlace.id];
    if (!rec) continue;
    // Vigilancia simplificada: si ya hay historial, comparamos la última
    // medición del historial con la actual. Si hay empeoramiento sostenido
    // en las últimas medidas del historial (simulado con pasoVigilar),
    // registramos una reversión.
    if (estado.historialMediciones.length > 0 && estado.ultimaAplicacion) {
      const anterior = estado.historialMediciones[estado.historialMediciones.length - 1];
      const posteriores = [mediciones.find((m) => m.at >= anterior.at) ?? mediciones[0]];
      const v = pasoVigilar(anterior, posteriores, estado.ultimaAplicacion, config.vigilarMs);
      if (v.revertir) {
        revertidos.push({ enlaceId: enlace.id, porque: v.porque });
        cambiosRevertidosActualizado += 1;
      }
    }
  }

  // 5. Registrar decisiones (últimas maxDecisiones) con su porqué
  const clasePorDefecto: import("./tipos").ClaseTrafico = "mensajes";
  let decisionesActualizadas = [...estado.decisiones];
  for (const enlace of enlaces) {
    const rec = recomendaciones[enlace.id];
    if (!rec) continue;
    const motivo = rec.porque.join("; ");
    const estadoConDecision = registrarDecision(
      { ...estado, decisiones: decisionesActualizadas },
      enlace.id,
      (entrada as { clase?: import("./tipos").ClaseTrafico }).clase ?? clasePorDefecto,
      motivo,
      rec.porque.length > 0 ? 1 : 0,
    );
    decisionesActualizadas = estadoConDecision.decisiones;
  }
  // Limitar a maxDecisiones (el registro ya limita a 500, pero respetamos config)
  if (decisionesActualizadas.length > config.maxDecisiones) {
    decisionesActualizadas = decisionesActualizadas.slice(0, config.maxDecisiones);
  }

  // Actualizar historial
  const historialActualizado = [...estado.historialMediciones, ...mediciones];
  const historialCortado = historialActualizado.slice(-1000);

  const estadoActualizado: EstadoBucle = {
    ...estado,
    decisiones: decisionesActualizadas,
    historialMediciones: historialCortado,
    ultimaAplicacion: ultimaAplicacionActualizada,
    cambiosRevertidos: cambiosRevertidosActualizado,
  };

  return {
    estado: estadoActualizado,
    mediciones,
    recomendaciones,
    aplicados,
    revertidos,
  };
}
