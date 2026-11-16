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
import { falloDe } from "@/lib/network/bucle-fondo"; // Reusando el patrón

const TABLA = "os_senales_publicas";
const PERIODO_MS = 45000;
let ultimaEjecucion = 0;
let esquemaAusente = false;
let proximoReintento = 0;

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
    zona: string;
    ficha: string | null;
    medido_en: string;
}

export async function publicarSenales(deps: {
    cliente?: ReturnType<typeof createClient>;
    uid: string | null;
    filas: FilaPublicable[];
    ahora: Date;
}): Promise<{ ok: boolean; publicadas: number; motivo?: string }> {
    if (!deps.uid) return { ok: false, publicadas: 0, motivo: "Sin sesión" };
    
    const ahora = deps.ahora.getTime();
    if (esquemaAusente) {
        if (ahora < proximoReintento) return { ok: false, publicadas: 0, motivo: "las señales públicas aún no están activadas en este servidor" };
        esquemaAusente = false;
    }

    if (ahora - ultimaEjecucion < PERIODO_MS) return { ok: false, publicadas: 0, motivo: "Demasiado pronto" };

    const supabase = deps.cliente ?? createClient();
    
    try {
        // Filtrar solo filas propias (deberían venir filtradas, pero asegurar)
        const propias = deps.filas.map(f => ({ ...f, owner_id: deps.uid! }));

        // 1. Upsert
        const { error: upsertErr } = await supabase.from(TABLA).upsert(propias, {
            onConflict: "owner_id,device_id,medio,banda,frecuencia_khz"
        });

        if (upsertErr) {
            if (esFaltaDeEsquema(upsertErr)) {
                esquemaAusente = true;
                proximoReintento = ahora + 5 * 60000;
                return { ok: false, publicadas: 0, motivo: "las señales públicas aún no están activadas en este servidor" };
            }
            return { ok: false, publicadas: 0, motivo: upsertErr.message };
        }

        ultimaEjecucion = ahora;
        return { ok: true, publicadas: propias.length };
    } catch (e: any) {
        return { ok: false, publicadas: 0, motivo: e.message };
    }
}
