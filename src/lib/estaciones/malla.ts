import type { Estacion, TipoEstacion } from "./tipos";

/** Faro de estación que viaja por la malla (tipo `post`): solo campos permitidos. */
export interface FaroEstacion {
  id: string;
  kind: "estacion";
  name: string;
  category: TipoEstacion;
  media_url: string;
}

export const MAX_BYTES_FARO = 200;
const MAX_NOMBRE = 48;
const MAX_ENLACE = 120;

type UploadPublic = (env: Record<string, unknown>) => Promise<unknown>;
type EnqueueMeshSync = (item: Record<string, unknown>) => void;
export interface DependenciasMalla {
  uploadPublic?: UploadPublic;
  enqueueMeshSync?: EnqueueMeshSync;
}

function enlaceDelFaro(e: Estacion): string {
  return e.enlace.length <= MAX_ENLACE ? e.enlace : `/estaciones/${e.id}`;
}

/** Construye el faro (≤ 200 bytes en JSON UTF-8); recorta el nombre si hace falta. */
export function faroDeEstacion(e: Estacion): FaroEstacion {
  const faro: FaroEstacion = {
    id: e.id,
    kind: "estacion",
    name: e.titulo.trim().slice(0, MAX_NOMBRE),
    category: e.tipo,
    media_url: enlaceDelFaro(e),
  };
  while (bytesDeFaro(faro) > MAX_BYTES_FARO && faro.name.length > 0) {
    faro.name = faro.name.slice(0, faro.name.length - 1);
  }
  if (bytesDeFaro(faro) > MAX_BYTES_FARO) {
    faro.media_url = `/estaciones/${e.id}`;
  }
  return faro;
}

export function bytesDeFaro(f: FaroEstacion): number {
  return new TextEncoder().encode(JSON.stringify(f)).length;
}

/** Emite el faro por el relé de servidor y por la radio; un fallo no impide el otro. */
export async function anunciarEnMalla(
  e: Estacion,
  deps: DependenciasMalla = {},
): Promise<{ servidor: boolean; radio: boolean }> {
  const faro = faroDeEstacion(e);
  const oid = `estacion:${e.id}`;
  let servidor = false;
  let radio = false;
  try {
    const up =
      deps.uploadPublic ??
      ((await import("@/ai/astraura/mesh/server-relay")).uploadPublic as unknown as UploadPublic);
    const res = await up({ cls: "P2", ptype: "post", body: faro, oid });
    servidor = !res || typeof res !== "object" || (res as { ok?: boolean }).ok !== false;
  } catch {
    servidor = false;
  }
  try {
    const enc =
      deps.enqueueMeshSync ??
      ((await import("@/ai/astraura/mesh/sync")).enqueueMeshSync as unknown as EnqueueMeshSync);
    enc({ type: "post", cls: "P2", body: faro });
    radio = true;
  } catch {
    radio = false;
  }
  return { servidor, radio };
}

export type EstacionOida = Pick<Estacion, "id" | "titulo" | "tipo" | "enlace"> & { oidaPorMalla: true };

function enlaceSeguro(v: unknown): v is string {
  return (
    typeof v === "string" &&
    (v.startsWith("https://") || (v.startsWith("/") && !v.startsWith("//")))
  );
}

/** Saca estaciones de los faros del feed público; descarta basura y duplicados por id. */
export function estacionesDeFaros(items: Array<{ body: unknown } | unknown>): EstacionOida[] {
  const vistas = new Set<string>();
  const salida: EstacionOida[] = [];
  for (const item of items ?? []) {
    const envuelto = item && typeof item === "object" && "body" in (item as Record<string, unknown>)
      ? (item as { body: unknown }).body
      : item;
    const f = envuelto as Partial<FaroEstacion> | null;
    if (!f || typeof f !== "object") continue;
    if (f.kind !== "estacion" || typeof f.id !== "string" || !f.id) continue;
    if (typeof f.name !== "string" || !enlaceSeguro(f.media_url)) continue;
    if (vistas.has(f.id)) continue;
    vistas.add(f.id);
    salida.push({
      id: f.id,
      titulo: f.name,
      tipo: (f.category ?? "mixto") as TipoEstacion,
      enlace: f.media_url,
      oidaPorMalla: true,
    });
  }
  return salida;
}
