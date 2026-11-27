/*
 * almacenes — detección nativa de medios de almacenamiento (ALC1125B, 2026-11-25).
 * Contrato: architecture/almacenes-cerebros.md §1 (el almacén).
 *
 * Invoca el comando Tauri `almacenes_listar` que devuelve volúmenes con identidad
 * estable (UUID + serie), nunca la ruta de montaje. Puro: el `invoke` se inyecta.
 */

import type { Almacen, AlmacenesListarResultado } from "./tipos";

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

export const COMANDO_ALMACENES_LISTAR = "almacenes_listar";

/** `window.__TAURI__` mínimo que se usa aquí. */
export interface TauriConAlmacenes {
  core?: { invoke?: Invoke };
}

/** Valida lo que devuelve `almacenes_listar`. Pura. */
export function sanearAlmacenesListar(x: unknown): AlmacenesListarResultado | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;

  const almacenesRaw = o.almacenes;
  if (!Array.isArray(almacenesRaw)) return null;

  const almacenes: Almacen[] = [];
  for (const a of almacenesRaw) {
    if (!a || typeof a !== "object") continue;
    const al = a as Record<string, unknown>;

    const etiqueta = typeof al.etiqueta === "string" ? al.etiqueta : "";
    const uuid = typeof al.uuid === "string" ? al.uuid : "";
    const serie = typeof al.serie === "string" ? al.serie : "";
    const total_bytes = typeof al.total_bytes === "number" ? al.total_bytes : 0;
    const libre_bytes = typeof al.libre_bytes === "number" ? al.libre_bytes : 0;
    const punto_montaje = typeof al.punto_montaje === "string" ? al.punto_montaje : "";
    const es_disco_sistema = al.es_disco_sistema === true;
    const tipo = typeof al.tipo === "string" ? al.tipo : "desconocido";
    const plataforma = typeof al.plataforma === "string" ? al.plataforma : "";
    const motivo = typeof al.motivo === "string" ? al.motivo : null;

    // sistema_archivos puede ser string o { desconocido: string }
    let sistema_archivos: Almacen["sistema_archivos"] = { desconocido: "desconocido" };
    const fs = al.sistema_archivos;
    if (typeof fs === "string") {
      const fsLower = fs.toLowerCase();
      if (
        ["ext4", "btrfs", "xfs", "exfat", "fat32", "ntfs", "apfs", "hfs_plus", "smb", "nfs"].includes(fsLower)
      ) {
        sistema_archivos = fsLower as Almacen["sistema_archivos"];
      } else {
        sistema_archivos = { desconocido: fs };
      }
    } else if (fs && typeof fs === "object" && "desconocido" in fs) {
      const d = fs as Record<string, unknown>;
      if (typeof d.desconocido === "string") {
        sistema_archivos = { desconocido: d.desconocido };
      }
    }

    almacenes.push({
      etiqueta,
      uuid,
      serie,
      sistema_archivos,
      extraible: al.extraible === true,
      total_bytes,
      libre_bytes,
      punto_montaje,
      es_disco_sistema,
      tipo: tipo as Almacen["tipo"],
      plataforma,
      motivo,
    });
  }

  const plataforma = typeof o.plataforma === "string" ? o.plataforma : "";
  const motivo = typeof o.motivo === "string" ? o.motivo : null;

  return { almacenes, plataforma, motivo };
}

/** El `window.__TAURI__` de esta ventana (null fuera de la app nativa o en el servidor). */
export function tauriGlobal(): TauriConAlmacenes | null {
  if (typeof window === "undefined") return null;
  const t = (window as unknown as { __TAURI__?: TauriConAlmacenes }).__TAURI__;
  return t && typeof t === "object" ? t : null;
}

/** Lista todos los almacenes detectados en el sistema. Nunca lanza. */
export async function listarAlmacenes(
  tauri: TauriConAlmacenes | null = tauriGlobal(),
): Promise<{ ok: true; valor: AlmacenesListarResultado } | { ok: false; motivo: string }> {
  const invoke = tauri?.core?.invoke;
  if (typeof invoke !== "function") {
    return { ok: false, motivo: "Solo en la app nativa de StarSeed OS." };
  }
  try {
    const r = (await invoke(COMANDO_ALMACENES_LISTAR)) as unknown;
    const saneado = sanearAlmacenesListar(r);
    if (!saneado) return { ok: false, motivo: "Respuesta de almacenes_listar no válida." };
    return { ok: true, valor: saneado };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    return { ok: false, motivo };
  }
}