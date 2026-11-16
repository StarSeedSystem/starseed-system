"use client";

/**
 * Carga de perfil para la ventana del rito (IMG · catch silencioso en carga).
 * ----------------------------------------------------------------------------
 * La ventana de perfil cargaba su estado con un catch SILENCIOSO, sin mirar el
 * `error` de la consulta y sin tope de tiempo: si la consulta colgaba, el
 * usuario quedaba fijo en «Cargando tu perfil…» para siempre — y el rito nunca
 * deja al usuario en bucle. La decisión (pura) vive aquí; la ventana solo
 * consume el resultado y deja rastro en consola si la carga falló.
 */

/** Campos del formulario que alimentan la ventana, ya normalizados. */
export interface PerfilCargado {
  nombre: string;
  handle: string;
  bio: string;
  avatar: string;
  portada: string;
  /** Forma y encuadre de la foto (Adenda 219); null si no hay. */
  marco: unknown;
  /** Avatar 3D (Adenda 219); null si no trae url. */
  avatar3d: unknown;
}

/** Desenlace de la carga, para que la ventana sepa qué enseñar. */
export type CargaPerfilResultado =
  | { estado: "cargado"; perfil: PerfilCargado }
  | { estado: "vacio" }
  | { estado: "error"; motivo: string };

/** Tope de la carga inicial: pasados 6 s se edita igual desde cero. */
export const TOPE_CARGA_PERFIL_MS = 6000;

/** Corre una promesa con tope de tiempo; devuelve null si no responde o falla. */
export function conTope<T>(p: Promise<T>, ms = TOPE_CARGA_PERFIL_MS): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((resolver) => setTimeout(() => resolver(null), ms)),
  ]);
}

/** Texto legible o vacío: nada de basura no textual en el formulario. */
function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Fila de `profiles` → campos del formulario, con vacíos por defecto. */
export function normalizarPerfil(data: unknown): PerfilCargado {
  const p = (data ?? {}) as Record<string, unknown>;
  const bruto3d = p.avatar_3d;
  const conUrl =
    bruto3d !== null && typeof bruto3d === "object" &&
    "url" in bruto3d && typeof (bruto3d as { url: unknown }).url === "string";
  return {
    nombre: texto(p.display_name),
    handle: texto(p.handle),
    bio: texto(p.bio),
    avatar: texto(p.avatar_url),
    portada: texto(p.cover_url),
    marco: p.avatar_marco ?? null,
    avatar3d: conUrl ? bruto3d : null,
  };
}

/** Clasifica el desenlace de una consulta de perfil (fila, error). */
export function clasificarCarga(data: unknown, error: unknown): CargaPerfilResultado {
  if (error) return { estado: "error", motivo: "No se pudo leer tu perfil." };
  if (!data) return { estado: "vacio" };
  return { estado: "cargado", perfil: normalizarPerfil(data) };
}
