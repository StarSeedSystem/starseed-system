import { astraura158Endpoint, type Astraura158Target } from "./astraura-158-client";
import { CAMPOS_PERMITIDOS, type TipoAccionUi } from "./ui-acciones";
import { decidirEnDispositivo } from "./needle-wasm";
console.log("Imported decidirEnDispositivo from needle-wasm");

let ultimaFalloDispositivo: number | null = null;
const TIEMPO_RECUPERACION_MS = 10 * 60 * 1000; // 10 minutes

export function reiniciarNeedleDispositivo() {
  ultimaFalloDispositivo = null;
}

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
  origen?: 'dispositivo' | 'servidor';
}

export type ZonaConfianza = "ejecutar" | "confirmar" | "escalar";

export interface OpcionesNeedle {
  sistema?: string;
  max_pasos?: number;
  transporte?: typeof fetch;
  enDispositivo?: boolean;
  timeoutDispositivoMs?: number;
}

export const UMBRAL_EJECUTAR = 0.6;
export const UMBRAL_CONFIRMAR = 0.4;

export function zonaDeConfianza(d: DecisionNeedle): ZonaConfianza {
  if (!d.ok || typeof d.confianza !== "number" || d.confianza === null) return "escalar";
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
// If we are in the browser and device is not disabled, try device first
    const enDispositivo = opciones?.enDispositivo !== false;
    const usarDispositivo =
      typeof window !== "undefined" &&
      enDispositivo &&
      (ultimaFalloDispositivo === null || Date.now() - ultimaFalloDispositivo > TIEMPO_RECUPERACION_MS);

  if (usarDispositivo) {
    const timeoutMs = opciones?.timeoutDispositivoMs ?? 2500;
    try {
      const dispositivoPromise = decidirEnDispositivo(
        consulta,
        herramientas,
        { sistema: opciones?.sistema }
      );
      const timeoutPromise = new Promise<DecisionNeedle>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), timeoutMs)
      );
      const resultado = await Promise.race([dispositivoPromise, timeoutPromise]);
      
      // Check if the device decision is valid (not escalar and has calls or confidence)
      const zona = zonaDeConfianza(resultado);
      if ((resultado.llamadas && resultado.llamadas.length > 0) || zona !== "escalar") {
        // Mark as device decision
        return { ...resultado, origen: "dispositivo" };
      }
      // If not valid, fall through to server
    } catch (err) {
      // Device failed: record failure and fall through to server
      ultimaFalloDispositivo = Date.now();
    }
  }

  // Server fallback (original logic)
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
       // Un fallo del servidor nunca se enmascara como decisión local:
       // la respuesta HTTP no-ok se devuelve tal cual.
       return { ok: false, confianza: null, error: `HTTP ${res.status}`, origen: "servidor" };
     }
    const resultado = (await res.json()) as DecisionNeedle;
    return { ...resultado, origen: "servidor" };
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    if (target === "local" && !opciones?.transporte) {
      // La decisión en dispositivo solo se usa cuando el servidor local
      // está caído (error de red o timeout), nunca ante un error HTTP.
      // `await` + try interno: si falla, se devuelve ok:false, nunca se rechaza.
try {
         const resultado = await decidirEnDispositivo(consulta, herramientas, { sistema: opciones?.sistema });
         return { ...resultado, origen: "dispositivo" };
       } catch (errLocal: unknown) {
         const msgLocal = errLocal instanceof Error ? errLocal.message : String(errLocal);
         return { ok: false, confianza: null, error: msgLocal };
       }
    }
    return { ok: false, confianza: null, error: /abort/i.test(msg) ? "Tiempo de espera agotado (8s)" : msg, origen: "servidor" };
  }
}

const DESCRIPCIONES_UI: Record<TipoAccionUi, string> = {
  apariencia: "Acción de UI para cambiar la apariencia del sistema",
  fondo: "Acción de UI para cambiar el fondo visual",
  tipografia: "Acción de UI para ajustar la tipografía y fuentes",
  distribucion: "Acción de UI para cambiar la distribución del lienzo",
  preset: "Acción de UI para aplicar el preset visual",
  movimiento: "Acción de UI para ajustar animaciones y movimiento",
  restaurar: "Acción de UI para restaurar los valores por defecto",
};

export function catalogoDeAccionesOS(): HerramientaNeedle[] {
  const tipos = Object.keys(CAMPOS_PERMITIDOS) as TipoAccionUi[];
  return tipos.map((t) => ({
    name: t,
    description: DESCRIPCIONES_UI[t] ?? `Acción de UI ${t}`,
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
