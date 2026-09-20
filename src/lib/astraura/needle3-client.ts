import { astraura158Endpoint, type Astraura158Target } from "./astraura-158-client";

export interface LlamadaNeedle {
  nombre: string;
  argumentos: Record<string, unknown>;
}

export interface HerramientaNeedle {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface DecisionNeedle {
  ok: boolean;
  motor?: string;
  tipo?: string;
  llamadas?: LlamadaNeedle[];
  confianza: number | null;
  razonamiento?: string;
  ms?: number;
  prefill_tps?: number;
  decode_tps?: number;
  ram_pico_mb?: number;
  error?: string;
}

export type ZonaConfianza = "ejecutar" | "confirmar" | "escalar";

export interface OpcionesNeedle {
  sistema?: string;
  max_pasos?: number;
  transporte?: typeof fetch;
}

export const UMBRAL_EJECUTAR = 0.6;
export const UMBRAL_CONFIRMAR = 0.4;

export function zonaDeConfianza(d: DecisionNeedle): ZonaConfianza {
  if (!d.ok || typeof d.confianza !== "number" || d.confianza === null) {
    return "escalar";
  }
  if (d.confianza >= UMBRAL_EJECUTAR) {
    return Array.isArray(d.llamadas) && d.llamadas.length > 0 ? "ejecutar" : "escalar";
  }
  return d.confianza >= UMBRAL_CONFIRMAR ? "confirmar" : "escalar";
}

export async function decidirConNeedle(
  target: Astraura158Target,
  consulta: string,
  herramientas: HerramientaNeedle[],
  opciones?: OpcionesNeedle
): Promise<DecisionNeedle> {
  const fetchFn = opciones?.transporte ?? fetch;
  const endpoint = astraura158Endpoint(target);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetchFn(`${endpoint}/api/needle/decidir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consulta,
        herramientas,
        sistema: opciones?.sistema,
        max_pasos: opciones?.max_pasos,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, confianza: null, error: `HTTP ${res.status}` };
    }
    return (await res.json()) as DecisionNeedle;
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    const esAbort = /abort/i.test(msg);
    return {
      ok: false,
      confianza: null,
      error: esAbort ? "Tiempo de espera agotado (8s)" : msg,
    };
  }
}

const ACCIONES_UI: Array<{ name: string; desc: string }> = [
  { name: "apariencia", desc: "Acción de UI para cambiar la apariencia del sistema" },
  { name: "fondo", desc: "Acción de UI para cambiar el fondo visual" },
  { name: "tipografia", desc: "Acción de UI para ajustar la tipografía y fuentes" },
  { name: "distribucion", desc: "Acción de UI para cambiar la distribución del lienzo" },
  { name: "preset", desc: "Acción de UI para aplicar el preset visual" },
  { name: "movimiento", desc: "Acción de UI para ajustar animaciones y movimiento" },
  { name: "restaurar", desc: "Acción de UI para restaurar los valores por defecto" },
];

export function catalogoDeAccionesOS(): HerramientaNeedle[] {
  return ACCIONES_UI.map((a) => ({
    name: a.name,
    description: a.desc,
    parameters: {
      type: "object",
      properties: {
        ambito: { type: "string", enum: ["cuenta", "perfil", "pagina"] },
        motivo: { type: "string" },
        parche: { type: "object" },
      },
      required: ["ambito", "motivo"],
    },
  }));
}
