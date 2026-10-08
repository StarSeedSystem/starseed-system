import { NextResponse } from "next/server";
import {
  permitePrivacidad,
  type AmbitoFicha,
  type PrivacidadConsulta,
} from "@/lib/network/capacidades-nodo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nodo candidato para una tarea, tal como lo consume `destino-bitnet.ts`. */
interface NodoCandidato {
  id: string;
  tipo: "local" | "vecino" | "nube";
  medio: string;
  url: string | null;
  vivo: boolean;
  tokS: number | null;
  ramLibreMb: number | null;
  latenciaMs: number | null;
  ambitos: AmbitoFicha[];
  t: number;
}

interface DispositivoPrefs {
  id?: string;
  platform?: string;
  lastSeen?: number;
}

function parsePrivacidad(v: string | null): PrivacidadConsulta {
  return v === "privada" || v === "publica" ? v : "ambito";
}

function esDispositivoValido(d: DispositivoPrefs): d is DispositivoPrefs & { id: string } {
  return typeof d?.id === "string" && d.id.length > 0;
}

const VENTANA_VIVO_MS = 10 * 60 * 1000;

/**
 * GET /api/astraura/nodos?tarea=&privacidad=
 * Sustituye a la inexistente /api/bitnet/candidatos (§7 del contrato de capas):
 * devuelve los candidatos para una tarea, YA filtrados por privacidad.
 * Lo privado solo sale a dispositivos de la cuenta y a servidores propios;
 * sin sesión solo se anuncia la nube pública. Las fichas vivas viajan por la
 * malla y el servidor de malla; aquí solo se lee el registro de la cuenta.
 */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const tarea = sp.get("tarea") ?? "";
    const privacidad = parsePrivacidad(sp.get("privacidad"));
    const ahora = Date.now();

    const nodos: NodoCandidato[] = [];

    const nube = process.env.ASTRAURA_CLOUD_URL;
    if (nube) {
      nodos.push({
        id: "nube-astraura",
        tipo: "nube",
        medio: "nube",
        url: nube,
        vivo: true,
        tokS: null,
        ramLibreMb: null,
        latenciaMs: null,
        ambitos: ["publico"],
        t: ahora,
      });
    }

    try {
      const { createClient } = await import("@/utils/supabase/server");
      const supa = await createClient();
      const {
        data: { user },
      } = await supa.auth.getUser();
      if (user) {
        const { data } = await supa
          .from("user_settings")
          .select("prefs")
          .eq("user_id", user.id)
          .maybeSingle();
        const prefs = (data?.prefs ?? {}) as { devices?: DispositivoPrefs[] };
        for (const d of prefs.devices ?? []) {
          if (!esDispositivoValido(d)) continue;
          const visto = typeof d.lastSeen === "number" ? d.lastSeen : 0;
          nodos.push({
            id: d.id,
            tipo: "vecino",
            medio: d.platform || "desconocido",
            url: null,
            vivo: visto > 0 && ahora - visto < VENTANA_VIVO_MS,
            tokS: null,
            ramLibreMb: null,
            latenciaMs: null,
            ambitos: ["propio", "cuenta"],
            t: visto,
          });
        }
      }
    } catch {
      // Sin sesión o sin tabla: se responde solo con lo público.
    }

    const visibles = nodos.filter((n) => permitePrivacidad(n.ambitos, privacidad));
    return NextResponse.json({ ok: true, tarea, privacidad, nodos: visibles });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

