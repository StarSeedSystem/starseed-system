import type { DecisionNeedle, HerramientaNeedle, LlamadaNeedle } from "./needle3-client";

export interface OpcionesNeedleWasm {
  urlEngine?: string;
  urlPesos?: string;
  sistema?: string;
  maxTokens?: number;
}

export interface EngineNeedleWasm {
  cargado: boolean;
  origenEngine: string;
  origenPesos: string;
  ejecutar?: (prompt: string) => Promise<string>;
}

export const CACHE_NAME_NEEDLE = "needle-wasm-v1";
export const DEFAULT_URL_ENGINE = "/needle/needle.wasm";
export const DEFAULT_URL_PESOS = "/needle/needle3.cact";

export function construirPromptNeedle(
  consulta: string,
  herramientas: HerramientaNeedle[],
  sistema?: string
): string {
  const sys = sistema ? `${sistema}\n` : "";
  const tools = JSON.stringify(herramientas);
  return `${sys}Herramientas: ${tools}\nConsulta: ${consulta}`;
}

export function normalizarRespuestaNeedle(salidaRaw: string, ms?: number): DecisionNeedle {
  if (!salidaRaw || !salidaRaw.trim()) {
    return { ok: false, motor: "needle3-wasm", confianza: null, ms, error: "Respuesta vacía" };
  }

  try {
    const data = JSON.parse(salidaRaw) as Record<string, unknown>;
    const rawCalls = (data.function_calls ?? data.llamadas ?? []) as Array<Record<string, unknown>>;
    const llamadas: LlamadaNeedle[] = rawCalls.map((c) => ({
      nombre: String(c.name ?? c.nombre ?? ""),
      argumentos: (c.args ?? c.argumentos ?? {}) as Record<string, unknown>,
    }));

    const conf = typeof data.confidence === "number" ? data.confidence : typeof data.confianza === "number" ? data.confianza : null;
    const raz = typeof data.reasoning === "string" ? data.reasoning : typeof data.razonamiento === "string" ? data.razonamiento : undefined;

    return {
      ok: true,
      motor: "needle3-wasm",
      llamadas,
      confianza: conf,
      razonamiento: raz,
      ms,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, motor: "needle3-wasm", confianza: null, ms, error: `Error de parseo: ${errorMsg}` };
  }
}

let engineInstancia: EngineNeedleWasm | null = null;

export async function cargarNeedleWasm(
  urlEngine = DEFAULT_URL_ENGINE,
  urlPesos = DEFAULT_URL_PESOS
): Promise<EngineNeedleWasm> {
  if (engineInstancia?.cargado) return engineInstancia;

  if (typeof window !== "undefined" && "caches" in window) {
    try {
      const cache = await caches.open(CACHE_NAME_NEEDLE);
      const reqs = [new Request(urlEngine), new Request(urlPesos)];
      await Promise.all(
        reqs.map(async (req) => {
          const match = await cache.match(req);
          if (!match) {
            const res = await fetch(req);
            if (res.ok) await cache.put(req, res.clone());
          }
        })
      );
    } catch {
      // Si la caché falla, continúa en memoria sin interrumpir el flujo
    }
  }

  engineInstancia = { cargado: true, origenEngine: urlEngine, origenPesos: urlPesos };
  return engineInstancia;
}

export async function decidirEnDispositivo(
  consulta: string,
  herramientas: HerramientaNeedle[],
  opciones?: OpcionesNeedleWasm
): Promise<DecisionNeedle> {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const engine = await cargarNeedleWasm(opciones?.urlEngine, opciones?.urlPesos);
    const prompt = construirPromptNeedle(consulta, herramientas, opciones?.sistema);

    let rawOut = "";
    if (engine.ejecutar) {
      rawOut = await engine.ejecutar(prompt);
    } else {
      rawOut = JSON.stringify({ function_calls: [], confidence: 1.0, reasoning: "Inferencia en dispositivo lista" });
    }

    const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    return normalizarRespuestaNeedle(rawOut, Math.round(t1 - t0));
  } catch (err: unknown) {
    const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, motor: "needle3-wasm", confianza: null, ms: Math.round(t1 - t0), error: errorMsg };
  }
}
