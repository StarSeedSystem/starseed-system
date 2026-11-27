/**
 * Publicación de señales en el espectro (os_senales_publicas).
 * 
 * Reglas:
 * - Upsert por (owner_id, device_id, medio, banda, frecuencia).
 * - Borrado por (owner_id, device_id).
 * - owner_id siempre debe ser el uid actual.
 * - PERIODO_MS: mínimo 45s entre tandas.
 */

import { createClient } from "@/utils/supabase/client";
import { esFaltaDeEsquema } from "@/lib/mensajeria/sesiones-vivas";
import { esperaTrasFallos } from "./leer-senales";

const TABLA = "os_senales_publicas";
const PERIODO_MS = 45000;
let ultimaEjecucion = 0;
let esquemaAusente = false;
let proximoReintento = 0;
// Fallos seguidos (400, red…): cada uno alarga la espera, con tope, en vez de reintentar en bucle.
let fallosSeguidos = 0;
let esperaHastaMs = 0;

export interface FilaPublicable {
  device_id: string;
  capa: "publica" | "comunidad" | "privada";
  comunidad: string | null;
  medio: string;
  banda: string;
  frecuencia_khz: number;
  ancho_khz: number;
  fuerza_dbm: number;
  calidad: number;
  origen: "medida" | "declarada" | "estimada";
  zona: string | null;
  ficha: string | null;
  medido_en: string;
}

export async function publicarSenales(deps: {
  cliente?: ReturnType<typeof createClient>;
  uid: string | null;
  filas: FilaPublicable[];
  ahora: Date;
  deviceIdsAEliminar?: string[];
}): Promise<{ ok: boolean; publicadas: number; motivo?: string }> {
  if (!deps.uid) return { ok: false, publicadas: 0, motivo: "Sin sesión" };
  
  const ahoraMs = deps.ahora.getTime();
  if (esquemaAusente) {
    if (ahoraMs < proximoReintento) return { ok: false, publicadas: 0, motivo: "las señales públicas aún no están activadas en este servidor" };
    esquemaAusente = false;
  }

  if (fallosSeguidos > 0 && ahoraMs < esperaHastaMs) {
    return { ok: false, publicadas: 0, motivo: "En espera tras un fallo anterior" };
  }

  if (ahoraMs - ultimaEjecucion < PERIODO_MS) return { ok: false, publicadas: 0, motivo: "Demasiado pronto" };

  const supabase = deps.cliente ?? createClient();

  const fallar = (motivo: string): { ok: false; publicadas: 0; motivo: string } => {
    fallosSeguidos += 1;
    esperaHastaMs = ahoraMs + esperaTrasFallos(fallosSeguidos);
    return { ok: false, publicadas: 0, motivo };
  };

  try {
    if (deps.deviceIdsAEliminar && deps.deviceIdsAEliminar.length > 0) {
      for (const deviceId of deps.deviceIdsAEliminar) {
        const { error: delErr } = await supabase
          .from(TABLA)
          .delete()
          .eq("owner_id", deps.uid!)
          .eq("device_id", deviceId);
        if (delErr && !esFaltaDeEsquema(delErr)) {
          return fallar("Error al eliminar filas antiguas");
        }
      }
    }

    const propias = deps.filas.map(f => ({ ...f, owner_id: deps.uid! }));

    const { error: upsertErr } = await supabase.from(TABLA).upsert(propias, {
      onConflict: "owner_id,device_id,medio,banda,frecuencia_khz"
    });

    if (upsertErr) {
      if (esFaltaDeEsquema(upsertErr)) {
        esquemaAusente = true;
        proximoReintento = ahoraMs + 5 * 60000;
        return { ok: false, publicadas: 0, motivo: "las señales públicas aún no están activadas en este servidor" };
      }
      return fallar(upsertErr.message);
    }

    fallosSeguidos = 0;
    esperaHastaMs = 0;
    ultimaEjecucion = ahoraMs;
    return { ok: true, publicadas: propias.length };
  } catch (e: unknown) {
    return fallar(e instanceof Error ? e.message : "Error desconocido");
  }
}

export function reiniciarEstadoPublicar(): void {
  ultimaEjecucion = 0;
  esquemaAusente = false;
  proximoReintento = 0;
  fallosSeguidos = 0;
  esperaHastaMs = 0;
}