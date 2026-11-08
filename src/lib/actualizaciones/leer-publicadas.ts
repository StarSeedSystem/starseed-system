/**
 * ════════════════════════════════════════════════════════════════════════════
 * (ACT1108B · 2026-11-08) Leer las versiones publicadas SIN depender de una sola ruta.
 * Contrato: architecture/centro-versiones-1105.md §9.
 *
 *   1. `/api/os/versiones` (el servidor ya lee GitHub con ruta directa + API y lo cachea);
 *   2. si eso falla (la app nativa sirve la web en local y esa ruta puede no existir, o el servidor no
 *      llega a GitHub): GitHub directo desde esta app — la lista por `api.github.com` y los manifiestos
 *      del canal de pruebas por directa → API (`rutas-github.ts`).
 * Todo con `fetch` inyectable (se prueba sin red). Nunca lanza.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { desdeReleases, type ReleaseGithub, type VersionPublicada } from "@/lib/version/versiones-publicadas";
import {
  canalPruebasDesdeApi,
  sanearCanalPruebas,
  URL_MANIFIESTO_PRUEBAS,
  URL_MANIFIESTO_PRUEBAS_ANDROID,
  type CanalPruebas,
} from "./canal-pruebas";
import { leerJsonConRutas } from "./rutas-github";

export const URL_API_VERSIONES = "/api/os/versiones";
const URL_RELEASES_GITHUB = "https://api.github.com/repos/StarSeedSystem/starseed-system/releases?per_page=20";

export interface Publicadas {
  versiones: VersionPublicada[];
  canalPruebas: CanalPruebas | null;
  /** El canal de pruebas NO se pudo leer (≠ «aún no hay ninguna prueba»). Texto técnico para `describirError`. */
  canalPruebasError: string | null;
  via: "servidor" | "github";
}

export type ResultadoPublicadas = { ok: true; datos: Publicadas } | { ok: false; motivo: string };

export interface OpcionesPublicadas {
  fetch?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  aviso?: (texto: string) => void;
}

async function delServidor(f: typeof fetch): Promise<{ datos: Publicadas } | { motivo: string }> {
  try {
    const res = await f(URL_API_VERSIONES, { cache: "no-store" });
    if (!res.ok) return { motivo: `HTTP ${res.status}` };
    const j = (await res.json()) as { versiones?: VersionPublicada[]; canalPruebas?: unknown; canalPruebasError?: unknown };
    const versiones = Array.isArray(j?.versiones) ? j.versiones : [];
    return {
      datos: {
        versiones,
        canalPruebas: canalPruebasDesdeApi(j?.canalPruebas),
        canalPruebasError: typeof j?.canalPruebasError === "string" && j.canalPruebasError ? j.canalPruebasError : null,
        via: "servidor",
      },
    };
  } catch (e) {
    return { motivo: e instanceof Error ? e.message : "sin conexión" };
  }
}

async function deGithub(f: typeof fetch, o: OpcionesPublicadas): Promise<{ datos: Publicadas } | { motivo: string }> {
  let lista: unknown = null;
  let motivo = "";
  try {
    const res = await f(URL_RELEASES_GITHUB, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
    if (res.ok) lista = await res.json();
    else motivo = `HTTP ${res.status}`;
  } catch (e) {
    motivo = e instanceof Error ? e.message : "sin conexión";
  }
  const versiones = Array.isArray(lista) ? desdeReleases(lista as ReleaseGithub[]) : [];
  const op = { fetch: f, esperar: o.esperar, aviso: o.aviso ? (t: string) => o.aviso?.(t) : undefined, maxIntentos: 2 };
  const [esc, and] = await Promise.all([leerJsonConRutas(URL_MANIFIESTO_PRUEBAS, op), leerJsonConRutas(URL_MANIFIESTO_PRUEBAS_ANDROID, op)]);
  const canalPruebas = sanearCanalPruebas(esc.ok ? esc.valor : null, and.ok ? and.valor : null);
  const falloPruebas = [esc, and].find((r) => !r.ok && !r.noExiste);
  if (versiones.length === 0 && !canalPruebas) return { motivo: motivo || (falloPruebas && !falloPruebas.ok ? falloPruebas.motivo : "") || "sin respuesta de GitHub" };
  return {
    datos: {
      versiones,
      canalPruebas,
      canalPruebasError: canalPruebas ? null : falloPruebas && !falloPruebas.ok ? falloPruebas.motivo : null,
      via: "github",
    },
  };
}

/** Lee lo publicado: servidor y, si falla, GitHub directo. Pura salvo `fetch`. */
export async function leerPublicadas(o: OpcionesPublicadas = {}): Promise<ResultadoPublicadas> {
  const f = o.fetch ?? fetch;
  const a = await delServidor(f);
  if ("datos" in a && (a.datos.versiones.length > 0 || a.datos.canalPruebas)) return { ok: true, datos: a.datos };
  const b = await deGithub(f, o);
  if ("datos" in b) return { ok: true, datos: b.datos };
  return { ok: false, motivo: "motivo" in a ? a.motivo : b.motivo };
}
