import type { NivelCalidad } from "@/lib/xr/tipos";

/** Solo los niveles altos pueden usar splats gaussianos. */
export function puedeUsarSplat(nivel: NivelCalidad): boolean {
  return nivel === "alta" || nivel === "maxima";
}

/** Puntos máximos de un splat según nivel. */
export function presupuestoSplat(nivel: NivelCalidad): number {
  if (nivel === "maxima") return 3_000_000;
  if (nivel === "alta") return 1_500_000;
  return 0;
}

/** Una URL segura: https, sin credenciales. */
export function urlSplatSegura(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.username || u.password) return false;
    return true;
  } catch {
    return false;
  }
}

export interface CargarSplatResultado {
  ok: boolean;
  mesh?: unknown;
  motivo?: string;
}

export interface CargarSplatOpciones {
  SplatMesh?: new (opts?: { url?: string }) => unknown;
}

/** Carga perezosa de @sparkjsdev/spark; nunca lanza. */
export async function cargarSplat(
  url: string,
  opciones?: CargarSplatOpciones,
): Promise<CargarSplatResultado> {
  try {
    if (!urlSplatSegura(url)) {
      return { ok: false, motivo: "URL no segura: debe ser https y sin credenciales." };
    }
    const contenido = await fetch(url, { method: "HEAD" });
    const tamañoStr = contenido.headers.get("content-length");
    if (tamañoStr) {
      const bytes = parseInt(tamañoStr, 10);
      if (!isNaN(bytes) && bytes > 60 * 1024 * 1024) {
        return { ok: false, motivo: "Archivo demasiado grande: excede 60 MB." };
      }
    }
    // Import perezoso del módulo de Spark dentro de la función.
    const sparkModule = await import("@sparkjsdev/spark");
    const SplatMeshClass = (opciones?.SplatMesh ?? sparkModule.SplatMesh) as new (opts?: { url?: string }) => unknown;
    const mesh = new SplatMeshClass({ url });
    return { ok: true, mesh };
  } catch (e) {
    return { ok: false, motivo: (e as Error)?.message || "Error al cargar el splat." };
  }
}
