import { NextResponse } from "next/server";
import { ASTRAURA_158_PROXY_BASE } from "@/ai/astraura/free-catalog";
import { destinoNube } from "@/lib/astraura/destino-nube";
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

/** Backend de Astraura de ESTA máquina (solo en la Mac en modo ligero, nunca en Vercel). */
const LOCAL_BASE = "http://127.0.0.1:8000";

/**
 * (2026-10-09) Sonda del Astraura de esta máquina: `/api/ping` (vivo y latencia) y `/api/cola`
 * (RAM libre que ve el turnero). Antes este nodo no salía NUNCA: en la Mac la lista venía
 * vacía con el backend y el BitNet respondiendo.
 */
async function sondaLocal(ahora: number): Promise<NodoCandidato | null> {
  if (process.env.STARSEED_LOCAL !== "1") return null;
  const t0 = Date.now();
  try {
    const ping = await fetch(`${LOCAL_BASE}/api/ping`, { signal: AbortSignal.timeout(1500), cache: "no-store" });
    const latenciaMs = Date.now() - t0;
    const vivo = ping.ok && ((await ping.json().catch(() => ({}))) as { vivo?: boolean }).vivo !== false;
    let ramLibreMb: number | null = null;
    try {
      const cola = await fetch(`${LOCAL_BASE}/api/cola`, { signal: AbortSignal.timeout(1500), cache: "no-store" });
      const c = (await cola.json()) as { ram_libre_mb?: unknown };
      ramLibreMb = typeof c.ram_libre_mb === "number" ? Math.round(c.ram_libre_mb) : null;
    } catch {
      /* sin cola: la RAM se queda sin medir */
    }
    return {
      id: "local-astraura", tipo: "local", medio: "este equipo", url: LOCAL_BASE, vivo,
      tokS: null, ramLibreMb, latenciaMs, ambitos: ["propio"], t: ahora,
    };
  } catch {
    return {
      id: "local-astraura", tipo: "local", medio: "este equipo", url: LOCAL_BASE, vivo: false,
      tokS: null, ramLibreMb: null, latenciaMs: null, ambitos: ["propio"], t: ahora,
    };
  }
}

/**
 * GET /api/astraura/nodos?tarea=&privacidad=
 * Sustituye a la inexistente /api/bitnet/candidatos (§7 del contrato de capas).
 * Todo nodo dice la verdad de su salud: el local y la nube se sondean; nada sale «vivo» fijo.
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

    const local = await sondaLocal(ahora);
    if (local) nodos.push(local);

    // (2026-10-09) La nube se MIDE: antes salía `ASTRAURA_CLOUD_URL` con `vivo: true` fijo, y en
    // producción esa dirección es una fachada cuyo backend (Cloud Run, sin facturación desde el
    // 25-09) responde 500. `destinoNube()` sondea en paralelo env, servidor fijo y el túnel
    // publicado de la neurona, y devuelve el primero sano. Se ofrece por el proxy del OS (misma
    // procedencia), nunca la URL cruda del túnel.
    const nube = await destinoNube();
    nodos.push({
      id: "nube-astraura",
      tipo: "nube",
      medio: nube ? (nube.via === "tunel" ? "túnel de una neurona" : nube.via === "fijo" ? "servidor fijo" : "nube propia") : "nube",
      url: nube ? ASTRAURA_158_PROXY_BASE : null,
      vivo: Boolean(nube),
      tokS: null,
      ramLibreMb: null,
      latenciaMs: nube ? nube.latenciaMs : null,
      ambitos: ["publico"],
      t: ahora,
    });

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

